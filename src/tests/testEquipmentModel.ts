import assert from 'node:assert/strict';
import { calculateCostMatrixSummary, calculateFinancialSummary } from '../engine/financeEngine';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { BENCHMARK_LEGACY_SPECS, BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateTotalBatteryCapacityKWh, calculateTotalDCCapacityKWp, calculateTotalInverterPowerKW, calculateTotalPanelCount, getProjectBatteries, getProjectInverters, getProjectPanels } from '../utils/equipmentSpecsUtils';
import {
  DEFAULT_UNIT_PRICE_USD, LEGACY_MIRROR_FIELDS, describeEquipment, editEquipment, equipmentTotals, migrateLegacySpecs, readEquipment, type EquipmentSpecs,
} from '../../shared/equipment';
import type { InverterItemSpec, PanelItemSpec, LegacyProjectSpecs } from '../types';

// Fixture heredada (solo espejo): el módulo sigue leyéndola y migrándola.
const base = BENCHMARK_LEGACY_SPECS;
const mirrorKeys = (specs: object) => LEGACY_MIRROR_FIELDS.filter((key) => key in specs);
const noMirror = (specs: LegacyProjectSpecs): LegacyProjectSpecs => {
  const copy: Record<string, unknown> = { ...specs };
  for (const key of LEGACY_MIRROR_FIELDS) delete copy[key];
  return copy as unknown as LegacyProjectSpecs;
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

  const sparse = { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined } as unknown as LegacyProjectSpecs;
  const defaults = readEquipment(sparse);
  assert.equal(defaults.panels[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.panel, 'legacy without price uses the cost-matrix default');
  assert.equal(defaults.inverters[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.inverter);
  assert.equal(defaults.batteries[0].unitPriceUSD, DEFAULT_UNIT_PRICE_USD.battery);

  const groups = { ...noMirror(base), panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2)], batteries: [{ id: 'b1', brandModel: 'Bat', capacityKWh: 10, count: 2 }] } as LegacyProjectSpecs;
  const fromGroups = readEquipment(groups);
  assert.equal(fromGroups.panels, groups.panels, 'groups only: returned as saved');
  assert.equal(fromGroups.panels.length, 2);
  assert.equal(fromGroups.batteries.length, 1);

  const mixed = { ...base, panels: [panel('a', 600, 10)] } as LegacyProjectSpecs;
  const m = readEquipment(mixed);
  assert.equal(m.panels[0].id, 'a', 'mixed: saved groups win over mirror fields');
  assert.equal(m.panels[0].count, 10);
  assert.equal(m.inverters[0].count, 2, 'mixed: kinds without groups derive from the mirror');

  const noBattery = readEquipment({ ...base, hasBattery: false } as LegacyProjectSpecs);
  assert.deepEqual(noBattery.batteries, [], 'hasBattery false: no batteries even with leftover battery fields');
  const noBatteryGroups = readEquipment({ ...groups, hasBattery: false });
  assert.deepEqual(noBatteryGroups.batteries, [], 'hasBattery false hides saved battery groups, like the engine');
}

// 2. migrateLegacySpecs: groups built, mirror removed, idempotent, no data loss.
{
  const fixtures: Record<string, LegacyProjectSpecs> = {
    benchmark: base,
    noBattery: { ...base, hasBattery: false, batteryCount: 0 },
    sparse: { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined } as unknown as LegacyProjectSpecs,
    supplier: { ...base, selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95, supplierPriceId: 'sp1' }, battery: { supplierName: 'Dist B', priceUSD: 1800 } } },
    multi: { ...base, panels: [panel('a', 600, 10), panel('b', 700, 5)] },
    groupsOnly: { ...noMirror(base), panels: [panel('a', 600, 10)], inverters: [inverter('i', 10, 1)] } as LegacyProjectSpecs,
  };
  for (const [name, specs] of Object.entries(fixtures)) {
    const once = migrateLegacySpecs(specs);
    assert.deepEqual(mirrorKeys(once), [], `${name}: no mirror field survives`);
    assert.ok(!('selectedSupplierInfo' in once), `${name}: supplier mirror removed`);
    assert.deepEqual(migrateLegacySpecs(once), once, `${name}: idempotent`);
    assert.deepEqual(readEquipment(once), readEquipment(specs), `${name}: reading is unchanged by migrating`);
    assert.equal(once.hasBattery, specs.hasBattery, `${name}: system parameters stay`);
    assert.equal(once.panelEfficiency, specs.panelEfficiency);
    assert.equal(once.annualDegradation, specs.annualDegradation);
  }
  const noBattery = migrateLegacySpecs(fixtures.noBattery);
  assert.equal(noBattery.batteries?.length, 1, 'hasBattery false: leftover battery data is kept in a group');
  assert.deepEqual(readEquipment(noBattery).batteries, [], 'and stays hidden while hasBattery is false');
  assert.equal(migrateLegacySpecs({ ...noMirror(base), hasBattery: false } as LegacyProjectSpecs).batteries, undefined, 'no battery data, no battery group');

  const dormant = migrateLegacySpecs({ ...noMirror(base), hasBattery: false, batteryDOD: 70, batteryEfficiencyPct: 88 } as LegacyProjectSpecs);
  assert.deepEqual([dormant.batteries?.[0].dodPct, dormant.batteries?.[0].efficiencyPct], [70, 88], 'hasBattery false: a customized DOD/efficiency alone keeps the battery group');

  // Migración invariante: con grupos guardados el espejo solo se borra; nada se traslada a los grupos.
  const unpriced = migrateLegacySpecs({
    ...base,
    panels: [panel('a', 600, 10, { unitPriceUSD: undefined }), panel('b', 700, 5, { unitPriceUSD: undefined })],
    selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95, supplierPriceId: 'sp1' } },
  });
  assert.equal(unpriced.panels![0].unitPriceUSD, undefined, 'a group without price stays without price (the engine counts it as 0)');
  assert.equal(unpriced.panels![0].weightKilos, undefined, 'weight is not carried');
  assert.equal(unpriced.panels![0].selectedSupplierInfo, undefined, 'supplier is not carried');
  assert.equal(unpriced.panels![0].count, 10, 'group quantity wins over the mirror');
  const dod = migrateLegacySpecs<EquipmentSpecs>({ ...base, batteries: [{ id: 'b', brandModel: 'B', capacityKWh: 10, count: 1 }] });
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
  const addBattery = editEquipment({ ...noMirror(base), hasBattery: true } as LegacyProjectSpecs, 'battery', { type: 'add', item: { id: 'x', brandModel: 'X', capacityKWh: 5, count: 1 } });
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
  const multi = { ...base, panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2), inverter('j', 5, 1)] } as LegacyProjectSpecs;
  const mt = equipmentTotals(readEquipment(multi));
  assert.equal(mt.panelCount, 15);
  assert.equal(mt.capacityKWp, calculateTotalDCCapacityKWp(multi));
  assert.equal(mt.inverterKW, 25);
  assert.equal(mt.inverterCount, 3);
  assert.deepEqual(mt.modelCount, { panel: 2, inverter: 2, battery: 1 });
  assert.equal(mt.equipmentCostUSD, calculateCostMatrixSummary(multi, mt.capacityKWp).equipmentCostUSD);
  const none = equipmentTotals(readEquipment({ ...base, hasBattery: false } as LegacyProjectSpecs));
  assert.equal(none.batteryNominalKWh, 0);
  assert.equal(none.batteryCount, 0);
}

// 6. Migración invariante: ningún resultado visible cambia (matriz de costos, motor financiero y energía).
{
  const fixtures: Record<string, LegacyProjectSpecs> = {
    reference: base,
    legacyOnly: { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined, panelWeightKilos: undefined } as unknown as LegacyProjectSpecs,
    groupsOnly: { ...noMirror(base), panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2)], batteries: [{ id: 'b1', brandModel: 'Bat', capacityKWh: 10, count: 2, unitPriceUSD: 900 }] } as LegacyProjectSpecs,
    mixedGroupWithoutPrice: { ...base, panels: [panel('a', 600, 10, { unitPriceUSD: undefined })], selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95 } } },
    multiGroup: { ...base, panels: [panel('a', 600, 10), panel('b', 700, 5)], inverters: [inverter('i', 10, 2), inverter('j', 5, 1)], batteries: [{ id: 'b1', brandModel: 'Bat', capacityKWh: 5, count: 4, dodPct: 80 }, { id: 'b2', brandModel: 'Bat2', capacityKWh: 16, count: 1, efficiencyPct: 95 }] },
    batteryOffWithLeftovers: { ...base, hasBattery: false, batteryCount: 2, batteryDOD: 70 },
    batteryOffWithGroups: { ...base, hasBattery: false, batteries: [{ id: 'b1', brandModel: 'Bat', capacityKWh: 10, count: 2, unitPriceUSD: 900 }] },
  };
  const modes = ['legacy', 'self_consumption'] as const;
  for (const [name, specs] of Object.entries(fixtures)) {
    const migrated = migrateLegacySpecs(specs);
    assert.deepEqual(mirrorKeys(migrated), [], `${name}: mirror removed`);
    assert.deepEqual(readEquipment(migrated), readEquipment(specs), `${name}: readEquipment before == after`);
    const kwp = calculateTotalDCCapacityKWp(specs);
    assert.deepEqual(equipmentTotals(readEquipment(migrated)), equipmentTotals(readEquipment(specs)), `${name}: totals`);
    assert.deepEqual(calculateCostMatrixSummary(migrated, kwp), calculateCostMatrixSummary(specs, kwp), `${name}: cost matrix`);
    assert.equal(calculateTotalDCCapacityKWp(migrated), kwp, `${name}: kWp`);
    for (const mode of modes) {
      const run = (s: LegacyProjectSpecs) => calculateFinancialSummary(BENCHMARK_PROJECT.client.province, s, BENCHMARK_PROJECT.rates, BENCHMARK_PROJECT.financials, BENCHMARK_PROJECT.monthlyConsumption, undefined, mode);
      assert.deepEqual(run(migrated), run(specs), `${name}/${mode}: financial summary (price, cost, energy, indicators)`);
    }
    const produce = (s: LegacyProjectSpecs) => calculateMonthlySolarProduction(BENCHMARK_PROJECT.client.province, s, BENCHMARK_PROJECT.monthlyConsumption, BENCHMARK_PROJECT.rates.energyCostPerKWh, BENCHMARK_PROJECT.rates.gridExportFeePct);
    assert.deepEqual(produce(migrated), produce(specs), `${name}: monthly production`);
  }
}

// 7. Migración invariante con respaldo del espejo: hasta 2.7.0, con grupos de batería de capacidad total 0 el motor financiero
// calculaba la energía útil y la autonomía con `batteryCapacityKWh`, `batteryDOD` y `batteryEfficiencyPct` del espejo (los del
// grupo se ignoraban). Como el espejo se borra, esos valores pasan al primer grupo.
// Fuente de los valores esperados: el motor de la etiqueta v2.7.0 (extraído del repositorio) ejecutado sobre estas mismas
// fixtures (caso de referencia, modo legacy, mismas tarifas y consumo). Comprobación a mano: 16 kWh × 80 % × 90 % = 11,52 ⇒ 11,5;
// 20 × 70 % × 85 % = 11,9; 16 × 90 % × 90 % = 12,96 ⇒ 13; 10 × 2 × 90 % × 90 % = 16,2.
// Excepción (ADR 0002, decisión (b)): los tres casos con cantidad 0 esperan 0 kWh y 0 h. 2.7.0 daba 11,5 kWh y 2,6 h porque
// con un banco de 0 kWh el motor financiero recurría a la capacidad del primer grupo; ahora «Sí batería» con 0 kWh es sin almacenamiento.
{
  const bat = (extra: Record<string, unknown> = {}) => ({ id: 'b', brandModel: 'Bat', capacityKWh: 10, count: 1, unitPriceUSD: 900, ...extra });
  const cases: { name: string; patch: Record<string, unknown>; usable: number; autonomy: number; first?: Record<string, unknown> }[] = [
    { name: 'capacidad 0 + espejo 16 kWh al 80 %', patch: { batteryCapacityKWh: 16, batteryCount: 1, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 })] }, usable: 11.5, autonomy: 2.6, first: { capacityKWh: 16, dodPct: 80, efficiencyPct: undefined } },
    { name: 'grupo sin DOD ni eficiencia + espejo con valores', patch: { batteryCapacityKWh: 20, batteryDOD: 70, batteryEfficiencyPct: 85, batteries: [bat({ capacityKWh: 0 })] }, usable: 11.9, autonomy: 2.6, first: { capacityKWh: 20, dodPct: 70, efficiencyPct: 85 } },
    { name: 'DOD y eficiencia propios del grupo se ignoraban con capacidad 0', patch: { batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0, dodPct: 60, efficiencyPct: 70 })] }, usable: 11.5, autonomy: 2.6, first: { capacityKWh: 16, dodPct: 80, efficiencyPct: 90 } },
    { name: 'espejo sin DOD: default 90 % aunque el grupo traiga 60 %', patch: { batteryCapacityKWh: 16, batteryDOD: undefined, batteries: [bat({ capacityKWh: 0, dodPct: 60 })] }, usable: 13, autonomy: 2.9, first: { capacityKWh: 16, dodPct: 90 } },
    { name: 'capacidad 0 con 2 unidades: capacidad × cantidad sigue siendo la del espejo', patch: { batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0, count: 2 })] }, usable: 11.5, autonomy: 2.6, first: { capacityKWh: 8, count: 2 } },
    { name: 'cantidad 0 con otra capacidad: manda la del espejo', patch: { batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 10, count: 0 })] }, usable: 0, autonomy: 0, first: { capacityKWh: 16, count: 0 } },
    { name: 'capacidad 0 y cantidad 0', patch: { batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0, count: 0 })] }, usable: 0, autonomy: 0, first: { capacityKWh: 16, count: 0 } },
    { name: 'varios grupos en 0: solo el primero', patch: { batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 }), bat({ id: 'b2', capacityKWh: 0, count: 2 })] }, usable: 11.5, autonomy: 2.6, first: { capacityKWh: 16 } },
    { name: 'lista de grupos vacía y cantidad 0: se deriva del espejo', patch: { batteryCapacityKWh: 16, batteryCount: 0, batteryDOD: 80, batteries: [] }, usable: 0, autonomy: 0, first: { capacityKWh: 16, count: 0, dodPct: 80 } },
    { name: 'control: capacidad total > 0, el espejo no se leía', patch: { batteryCapacityKWh: 16, batteryDOD: 70, batteryEfficiencyPct: 80, batteries: [bat({ capacityKWh: 10, count: 2 })] }, usable: 16.2, autonomy: 3.6, first: { capacityKWh: 10, count: 2, dodPct: undefined, efficiencyPct: undefined } },
    { name: 'batería apagada', patch: { hasBattery: false, batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 })] }, usable: 0, autonomy: 0 },
  ];
  const summary = (s: LegacyProjectSpecs, mode: 'legacy' | 'self_consumption' = 'legacy') => calculateFinancialSummary(BENCHMARK_PROJECT.client.province, s, BENCHMARK_PROJECT.rates, BENCHMARK_PROJECT.financials, BENCHMARK_PROJECT.monthlyConsumption, undefined, mode);
  for (const { name, patch, usable, autonomy, first } of cases) {
    const specs = { ...base, ...patch } as LegacyProjectSpecs;
    const migrated = migrateLegacySpecs(specs);
    assert.deepEqual(mirrorKeys(migrated), [], `${name}: mirror removed`);
    assert.deepEqual(migrateLegacySpecs(migrated), migrated, `${name}: idempotent`);
    assert.deepEqual(readEquipment(migrated), readEquipment(specs), `${name}: readEquipment before == after migrating`);
    for (const [label, s] of [['before', specs], ['after', migrated]] as const) {
      const result = summary(s);
      assert.equal(result.batteryUsableKWh, usable, `${name}: usable kWh ${label} migrating equals v2.7.0`);
      assert.equal(result.batteryBackupAutonomyHours, autonomy, `${name}: autonomy ${label} migrating equals v2.7.0`);
    }
    if (first) {
      const group = migrated.batteries![0] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(first)) assert.equal(group[key], value, `${name}: first group ${key}`);
    }
    // Lo demás no se traslada: cantidad y precio quedan como estaban en el grupo, y el costo y la inversión no cambian.
    const untouched = migrateLegacySpecs({ ...specs, batteryCapacityKWh: undefined }); // mismo resto, sin respaldo que trasladar
    const kwp = calculateTotalDCCapacityKWp(specs);
    assert.equal(calculateCostMatrixSummary(migrated, kwp).equipmentCostUSD, calculateCostMatrixSummary(untouched, kwp).equipmentCostUSD, `${name}: equipment cost unchanged`);
    if (specs.batteries?.length) assert.deepEqual(migrated.batteries!.map((b) => [b.count, b.unitPriceUSD]), specs.batteries.map((b) => [b.count, b.unitPriceUSD]).map(([count, price], i) => [i === 0 && first?.count !== undefined ? first.count : count, price]), `${name}: counts and prices untouched`);
    assert.equal(summary(migrated).contractPriceUSD, summary(untouched).contractPriceUSD, `${name}: price unchanged`);
  }

  // Sin capacidad de respaldo en el espejo no hay nada que trasladar: el grupo queda tal cual.
  for (const mirrorKWh of [undefined, 0, -4]) {
    const groups = [bat({ capacityKWh: 0 })];
    const migrated = migrateLegacySpecs({ ...base, batteryCapacityKWh: mirrorKWh, batteries: groups } as LegacyProjectSpecs);
    assert.deepEqual(migrated.batteries, groups, `mirror capacity ${String(mirrorKWh)}: nothing to carry`);
  }
  const positive = { ...base, batteryCapacityKWh: 16, batteries: [bat({ capacityKWh: 10, count: 2 })] } as LegacyProjectSpecs;
  assert.equal(migrateLegacySpecs(positive).batteries, positive.batteries, 'positive group capacity: the same array, the mirror was never read');

  // Batería apagada con el respaldo guardado: sigue oculta, y al reactivarla da lo que daba 2.7.0 (11,5 kWh útiles).
  const dormant = migrateLegacySpecs({ ...base, hasBattery: false, batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 })] } as LegacyProjectSpecs);
  assert.deepEqual(readEquipment(dormant).batteries, [], 'hasBattery false: still hidden');
  assert.equal(summary({ ...dormant, hasBattery: true }).batteryUsableKWh, 11.5, 'reactivating the battery gives what 2.7.0 gave');

  // Editar otra cosa también migra con el respaldo.
  const edited = editEquipment({ ...base, batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 })] } as LegacyProjectSpecs, 'panel', { type: 'update', index: 0, patch: { count: 30 } });
  assert.equal(summary(edited).batteryUsableKWh, 11.5, 'editEquipment keeps the usable energy');

  // Efecto conocido (ADR 0001): con la capacidad trasladada el banco ya no vale 0 en la proyección física (opcional, desactivada por defecto).
  const physical = (s: LegacyProjectSpecs) => calculateMonthlySolarProduction(BENCHMARK_PROJECT.client.province, s, BENCHMARK_PROJECT.monthlyConsumption, BENCHMARK_PROJECT.rates.energyCostPerKWh, BENCHMARK_PROJECT.rates.gridExportFeePct, undefined, undefined, undefined, 'self_consumption');
  const carried = { ...base, batteryCapacityKWh: 16, batteryDOD: 80, batteries: [bat({ capacityKWh: 0 })] } as LegacyProjectSpecs;
  assert.ok(physical(migrateLegacySpecs(carried)).some((m) => (m.batteryContributionKWh ?? 0) > 0), 'physical mode: the carried capacity now dispatches');
  assert.deepEqual(physical(migrateLegacySpecs(carried)).map((m) => m.productionKWh), physical(migrateLegacySpecs({ ...carried, batteryCapacityKWh: undefined })).map((m) => m.productionKWh), 'production is unchanged');
}

console.log('Equipment model: reading, migration, editing, description and totals verified.');
