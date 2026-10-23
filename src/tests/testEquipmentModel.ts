import assert from 'node:assert/strict';
import { calculateCostMatrixSummary } from '../engine/financeEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateTotalBatteryCapacityKWh, calculateTotalDCCapacityKWp, calculateTotalInverterPowerKW, calculateTotalPanelCount, getProjectBatteries, getProjectInverters, getProjectPanels } from '../utils/equipmentSpecsUtils';
import {
  DEFAULT_UNIT_PRICE_USD, LEGACY_MIRROR_FIELDS, describeEquipment, editEquipment, equipmentTotals, migrateLegacySpecs, readEquipment,
} from '../../shared/equipment';
import type { InverterItemSpec, PanelItemSpec, SystemSpecs } from '../types';

const base = BENCHMARK_PROJECT.specs;
const mirrorKeys = (specs: object) => LEGACY_MIRROR_FIELDS.filter((key) => key in specs);
const noMirror = (specs: SystemSpecs): SystemSpecs => {
  const copy: Record<string, unknown> = { ...specs };
  for (const key of LEGACY_MIRROR_FIELDS) delete copy[key];
  return copy as unknown as SystemSpecs;
};
const panel = (id: string, powerW: number, count: number, extra: Partial<PanelItemSpec> = {}): PanelItemSpec => ({ id, brandModel: `Panel ${id}`, powerW, count, unitPriceUSD: 100, ...extra });
const inverter = (id: string, powerKW: number, count: number): InverterItemSpec => ({ id, brandModel: `Inv ${id}`, powerKW, count, unitPriceUSD: 1000 });

// 1. readEquipment: legacy only, groups only, mixed, multi-group, battery gating.
{
  const legacy = readEquipment(base);
  assert.equal(legacy.panels.length, 1, 'legacy: one derived panel group');
  assert.deepEqual(legacy.panels[0], getProjectPanels(base)[0], 'legacy: panel group equals the historical derivation');
  assert.deepEqual(legacy.inverters, getProjectInverters(base));
  assert.deepEqual(legacy.batteries, getProjectBatteries(base));
  assert.equal(legacy.panels[0].count, 38);
  assert.equal(legacy.panels[0].unitPriceUSD, 103.32);

  const sparse = { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined } as unknown as SystemSpecs;
  const defaults = readEquipment(sparse);
  assert.equal(defaults.panels[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.panel, 'legacy without price uses the cost-matrix default');
  assert.equal(defaults.inverters[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.inverter);
  assert.equal(defaults.batteries[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.battery);

  const groups = { ...noMirror(base), panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2)], batteries: [{ id: 'b1', brandModel: 'Bat', capacityKWh: 10, count: 2 }] } as SystemSpecs;
  const fromGroups = readEquipment(groups);
  assert.equal(fromGroups.panels, groups.panels, 'groups only: returned as saved');
  assert.equal(fromGroups.panels.length, 2);
  assert.equal(fromGroups.batteries.length, 1);

  const mixed = { ...base, panels: [panel('a', 600, 10)] } as SystemSpecs;
  const m = readEquipment(mixed);
  assert.equal(m.panels[0].id, 'a', 'mixed: saved groups win over mirror fields');
  assert.equal(m.panels[0].count, 10);
  assert.equal(m.inverters[0].count, 2, 'mixed: kinds without groups derive from the mirror');

  const noBattery = readEquipment({ ...base, hasBattery: false } as SystemSpecs);
  assert.deepEqual(noBattery.batteries, [], 'hasBattery false: no batteries even with leftover battery fields');
  const noBatteryGroups = readEquipment({ ...groups, hasBattery: false });
  assert.deepEqual(noBatteryGroups.batteries, [], 'hasBattery false hides saved battery groups, like the engine');
}

// 2. migrateLegacySpecs: groups built, mirror removed, idempotent, no data loss.
{
  const fixtures: Record<string, SystemSpecs> = {
    benchmark: base,
    noBattery: { ...base, hasBattery: false, batteryCount: 0 },
    sparse: { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined } as unknown as SystemSpecs,
    supplier: { ...base, selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95, supplierPriceId: 'sp1' }, battery: { supplierName: 'Dist B', priceUSD: 1800 } } },
    multi: { ...base, panels: [panel('a', 600, 10), panel('b', 700, 5)] },
    groupsOnly: { ...noMirror(base), panels: [panel('a', 600, 10)], inverters: [inverter('i', 10, 1)] } as SystemSpecs,
  };
  for (const [name, specs] of Object.entries(fixtures)) {
    const once = migrateLegacySpecs(specs);
    assert.deepEqual(mirrorKeys(once), [], `${name}: no mirror field survives`);
    assert.ok(!('selectedSupplierInfo' in once), `${name}: supplier mirror removed`);
    assert.deepEqual(migrateLegacySpecs(once), once, `${name}: idempotent`);
    if (name !== 'multi') assert.deepEqual(readEquipment(once), readEquipment(specs), `${name}: reading is unchanged by migrating (multi carries the weight the group lacked)`);
    assert.equal(once.hasBattery, specs.hasBattery, `${name}: system parameters stay`);
    assert.equal(once.panelEfficiency, specs.panelEfficiency);
    assert.equal(once.annualDegradation, specs.annualDegradation);
  }
  const noBattery = migrateLegacySpecs(fixtures.noBattery);
  assert.equal(noBattery.batteries?.length, 1, 'hasBattery false: leftover battery data is kept in a group');
  assert.deepEqual(readEquipment(noBattery).batteries, [], 'and stays hidden while hasBattery is false');
  assert.equal(migrateLegacySpecs({ ...noMirror(base), hasBattery: false } as SystemSpecs).batteries, undefined, 'no battery data, no battery group');

  // Data the group lacks is carried from the mirror into the first group; data the group has is never overwritten.
  const carried = migrateLegacySpecs({
    ...base,
    panels: [panel('a', 600, 10, { unitPriceUSD: undefined }), panel('b', 700, 5, { unitPriceUSD: undefined })],
    selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95, supplierPriceId: 'sp1' } },
  });
  assert.equal(carried.panels![0].unitPriceUSD, 103.32, 'price carried into the first group');
  assert.equal(carried.panels![0].weightKilos, base.panelWeightKilos, 'weight carried');
  assert.equal(carried.panels![0].selectedSupplierInfo?.supplierName, 'Dist', 'supplier carried');
  assert.equal(carried.panels![1].unitPriceUSD, undefined, 'other groups are not touched');
  assert.equal(carried.panels![0].count, 10, 'group quantity wins over the mirror');
  const kept = migrateLegacySpecs({ ...base, panels: [panel('a', 600, 10, { unitPriceUSD: 77 })] });
  assert.equal(kept.panels![0].unitPriceUSD, 77, 'group price wins over the mirror');
  const dod = migrateLegacySpecs({ ...base, batteries: [{ id: 'b', brandModel: 'B', capacityKWh: 10, count: 1 }] });
  assert.equal(dod.batteries![0].dodPct, undefined, 'a stale scalar DOD is not inherited by the group (the engine ignores it)');
  const already = migrateLegacySpecs(fixtures.groupsOnly);
  assert.equal(migrateLegacySpecs(already), already, 'nothing to migrate returns the same object');
}

// 3. editEquipment: add / update / remove, never writes the mirror and clears it.
{
  let specs = editEquipment(base, 'panel', { type: 'update', index: 0, patch: { count: 30, unitPriceUSD: 99 } });
  assert.equal(specs.panels![0].count, 30);
  assert.equal(specs.panels![0].unitPriceUSD, 99);
  assert.deepEqual(mirrorKeys(specs), [], 'update: no mirror');
  assert.equal(specs.inverters![0].count, 2, 'update: untouched kinds are materialized, not lost');
  assert.equal(specs.batteries![0].count, 3);
  specs = editEquipment(specs, 'panel', { type: 'add', item: panel('p2', 630, 10) });
  assert.deepEqual(specs.panels!.map((p) => p.id), ['primary-panel', 'p2']);
  assert.deepEqual(mirrorKeys(specs), [], 'add: no mirror');
  specs = editEquipment(specs, 'panel', { type: 'remove', index: 0 });
  assert.deepEqual(specs.panels!.map((p) => p.id), ['p2'], 'remove promotes the next group');
  assert.deepEqual(mirrorKeys(specs), [], 'remove: no mirror');
  assert.equal(editEquipment(specs, 'panel', { type: 'remove', index: 0 }), specs, 'the last group is never removed');
  assert.equal(editEquipment(specs, 'panel', { type: 'update', index: 5, patch: { count: 1 } }), specs, 'out-of-range update is a no-op');
  assert.equal(editEquipment(specs, 'panel', { type: 'remove', index: 5 }), specs);
  const supplier = editEquipment(base, 'battery', { type: 'update', index: 0, patch: { dodPct: 85, selectedSupplierInfo: { supplierName: 'S', priceUSD: 1 } } });
  assert.equal(supplier.batteries![0].dodPct, 85);
  assert.ok(!('selectedSupplierInfo' in supplier), 'supplier lives in the group only');
  assert.equal(supplier.batteries![0].selectedSupplierInfo?.supplierName, 'S');
  const addBattery = editEquipment({ ...noMirror(base), hasBattery: true } as SystemSpecs, 'battery', { type: 'add', item: { id: 'x', brandModel: 'X', capacityKWh: 5, count: 1 } });
  assert.equal(addBattery.batteries!.length, 2, 'a project without battery groups gets the default one materialized before the add');
  const original = JSON.stringify(base);
  editEquipment(base, 'panel', { type: 'update', index: 0, patch: { count: 1 } });
  assert.equal(JSON.stringify(base), original, 'inputs are never mutated');
}

// 4. describeEquipment.
{
  const eq = (panels: PanelItemSpec[]) => ({ panels, inverters: [] as InverterItemSpec[], batteries: [] });
  assert.equal(describeEquipment(eq([panel('a', 600, 10)]), 'panel'), 'Panel a');
  assert.equal(describeEquipment(eq([panel('a', 600, 10), panel('b', 700, 20)]), 'panel'), 'Panel b y 1 modelo más', 'main = most total power');
  assert.equal(describeEquipment(eq([panel('a', 600, 10), panel('b', 700, 20), panel('c', 100, 1)]), 'panel'), 'Panel b y 2 modelos más');
  assert.equal(describeEquipment(eq([panel('a', 600, 10), panel('b', 300, 20)]), 'panel'), 'Panel a y 1 modelo más', 'tie: the first one');
  assert.equal(describeEquipment(eq([panel('a', 600, 10), panel('b', 600, 10, { brandModel: ' PANEL a ' })]), 'panel'), 'Panel a', 'same model twice is one model');
  assert.equal(describeEquipment(eq([panel('a', 600, 10, { brandModel: '' })]), 'panel'), 'Módulos Monocristalinos Tier-1 TOPCon');
  assert.equal(describeEquipment({ panels: [], inverters: [{ ...inverter('i', 5, 1), brandModel: '  ' }], batteries: [] }, 'inverter'), 'Inversor Solar On-Grid / Híbrido');
  assert.equal(describeEquipment({ panels: [], inverters: [], batteries: [{ id: 'b', brandModel: '', capacityKWh: 5, count: 1 }] }, 'battery'), 'Banco de Baterías de Litio LiFePO4');
  assert.equal(describeEquipment({ panels: [], inverters: [], batteries: [] }, 'battery'), '', 'no groups, no text');
  assert.equal(describeEquipment(eq([panel('a', 600, 10, { brandModel: '' })]), 'panel', { fallback: 'Módulos' }), 'Módulos');
  const bat = { panels: [], inverters: [], batteries: [{ id: 'a', brandModel: 'A', capacityKWh: 5, count: 4 }, { id: 'b', brandModel: 'B', capacityKWh: 16, count: 1 }] };
  assert.equal(describeEquipment(bat, 'battery'), 'A y 1 modelo más', 'batteries weigh count × capacity');
}

// 5. equipmentTotals against what the engine computes today.
{
  const t = equipmentTotals(readEquipment(base));
  assert.equal(t.panelCount, calculateTotalPanelCount(base));
  assert.equal(t.capacityKWp, calculateTotalDCCapacityKWp(base));
  assert.equal(t.capacityKWp, 23.56);
  assert.equal(t.inverterKW, calculateTotalInverterPowerKW(base));
  assert.equal(t.batteryNominalKWh, calculateTotalBatteryCapacityKWh(base));
  const matrix = calculateCostMatrixSummary(base, t.capacityKWp);
  assert.equal(t.equipmentCostUSD, matrix.equipmentCostUSD, 'cost equals the cost matrix equipment cost');
  assert.equal(calculateCostMatrixSummary(migrateLegacySpecs(base), t.capacityKWp).equipmentCostUSD, t.equipmentCostUSD, 'migrating keeps the cost');
  const multi = { ...base, panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2), inverter('j', 5, 1)] } as SystemSpecs;
  const mt = equipmentTotals(readEquipment(multi));
  assert.equal(mt.panelCount, 15);
  assert.equal(mt.capacityKWp, calculateTotalDCCapacityKWp(multi));
  assert.equal(mt.inverterKW, 25);
  assert.equal(mt.inverterCount, 3);
  assert.deepEqual(mt.modelCount, { panel: 2, inverter: 2, battery: 1 });
  assert.equal(mt.equipmentCostUSD, calculateCostMatrixSummary(multi, mt.capacityKWp).equipmentCostUSD);
  const none = equipmentTotals(readEquipment({ ...base, hasBattery: false } as SystemSpecs));
  assert.equal(none.batteryNominalKWh, 0);
  assert.equal(none.batteryCount, 0);
}

console.log('Equipment model: reading, migration, editing, description and totals verified.');
