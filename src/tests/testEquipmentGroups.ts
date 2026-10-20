import assert from 'node:assert/strict';
import { calculateFinancialSummary } from '../engine/financeEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { withEquipmentGroups, editEquipmentGroup, normalizeEquipmentEdit } from '../utils/equipmentGroups';
import type { SystemSpecs } from '../types';

// 1. Migrating legacy single-model specs into groups never changes engine results.
const base = BENCHMARK_PROJECT.specs;
const fixtures: Record<string, SystemSpecs> = {
  benchmark: base,
  noBattery: { ...base, hasBattery: false, batteryCount: 0 },
  sparse: { ...base, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined, batteryDOD: undefined, panelWeightKilos: undefined, inverterCount: undefined, batteryCount: undefined } as unknown as SystemSpecs,
  directWatt: { ...base, pricingMode: 'direct_watt', isDetailed: false },
  supplier: { ...base, selectedSupplierInfo: { panel: { supplierName: 'Dist', priceUSD: 95, supplierPriceId: 'sp1' }, battery: { supplierName: 'Dist B', priceUSD: 1800 } } },
};
for (const [name, specs] of Object.entries(fixtures)) {
  for (const mode of ['legacy', 'self_consumption'] as const) {
    const run = (s: SystemSpecs) => calculateFinancialSummary(BENCHMARK_PROJECT.client.province, s, BENCHMARK_PROJECT.rates, BENCHMARK_PROJECT.financials, BENCHMARK_PROJECT.monthlyConsumption, undefined, mode);
    const migrated = withEquipmentGroups(specs);
    assert.ok(migrated.panels?.length && migrated.inverters?.length, `${name}: groups materialized`);
    assert.equal(migrated.batteries?.length ?? 0, specs.hasBattery ? 1 : 0, `${name}: battery group only when the project has a battery`);
    assert.deepEqual(run(migrated), run(specs), `${name}/${mode}: migration keeps engine results`);
    assert.deepEqual(withEquipmentGroups(migrated), migrated, `${name}: migration is idempotent`);
  }
}

// 2. Group edits keep the legacy fields as a mirror of the first group (read by 2.6.0 clients and old viewers).
const single = withEquipmentGroups(base);
let next = { ...single, ...editEquipmentGroup(single, 'panel', { type: 'update', index: 0, patch: { count: 30, unitPriceUSD: 99 } }) };
assert.equal(next.panels![0].count, 30);
assert.equal(next.panelCount, 30);
assert.equal(next.panelUnitPriceUSD, 99);
next = { ...next, ...editEquipmentGroup(next, 'panel', { type: 'add', item: { id: 'p2', brandModel: 'JA 630', powerW: 630, count: 10, unitPriceUSD: 105 } }) };
assert.equal(next.panels!.length, 2);
assert.equal(next.panelBrandModel, single.panelBrandModel, 'Adding a group keeps the first group as the legacy mirror');
next = { ...next, ...editEquipmentGroup(next, 'panel', { type: 'remove', index: 0 }) };
assert.deepEqual(next.panels!.map(p => p.id), ['p2'], 'Removing the first group promotes the next one');
assert.equal(next.panelBrandModel, 'JA 630');
assert.equal(next.panelPowerW, 630);
assert.equal(next.panelCount, 10);
assert.deepEqual(editEquipmentGroup(next, 'panel', { type: 'remove', index: 0 }), {}, 'The last group cannot be removed');
const withBattery = withEquipmentGroups(base);
const batteryEdit = editEquipmentGroup(withBattery, 'battery', { type: 'update', index: 0, patch: { capacityKWh: 5.12, count: 4 } });
assert.equal(batteryEdit.batteryCapacityKWh, 5.12);
assert.equal(batteryEdit.batteryCount, 4);
assert.equal(batteryEdit.batteryDOD, undefined, 'System-level battery parameters stay owned by the legacy fields');

// 3. Store edits: legacy field edits reach the single group; list edits refresh the mirror.
const merged = normalizeEquipmentEdit(single, { panelCount: 44, panelBrandModel: 'Canadian 615' });
assert.equal(merged.panels![0].count, 44);
assert.equal(merged.panels![0].brandModel, 'Canadian 615');
const multi = { ...single, ...editEquipmentGroup(single, 'inverter', { type: 'add', item: { id: 'i2', brandModel: 'Lux 5K', powerKW: 5, count: 1 } }) };
const ignored = normalizeEquipmentEdit(multi, { inverterCount: 9 });
assert.equal(ignored.inverters![0].count, multi.inverters![0].count, 'With several groups the engine reads the groups, so a legacy edit cannot silently rewrite one');
assert.equal(ignored.inverterCount, multi.inverters![0].count, 'and the mirror stays consistent with the first group');
const untouched = normalizeEquipmentEdit(base, { pricePerWattUSD: 1.2 });
assert.equal(untouched.panels, base.panels, 'Edits that do not touch equipment do not migrate the project');

// 4. Store: equipment edits migrate the active project; auto-sizing keeps working on the migrated group.
const { useSimulationStore } = await import('../store/useSimulationStore');
const store = () => useSimulationStore.getState();
store().createNewProject({ name: 'Grupos', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
assert.equal(store().getActiveProject().specs.panels, undefined, 'A new project is not migrated until its equipment is edited');
store().updateSpecs({ panelBrandModel: 'Canadian 615', panelPowerW: 615 });
let specs = store().getActiveProject().specs;
assert.equal(specs.panels?.length, 1);
assert.equal(specs.panels![0].brandModel, 'Canadian 615');
assert.equal(specs.panels![0].powerW, 615);
store().updateSpecs({ autoCalculatePanels: true });
store().updateAllMonthlyConsumption(2500);
specs = store().getActiveProject().specs;
assert.equal(specs.panels![0].count, specs.panelCount, 'Auto-sizing writes the group and its mirror');
const summary = store().getFinancialSummary();
assert.equal(summary.systemCapacityKWp, Math.round(specs.panelCount * 615 / 10) / 100, 'The engine sizes the system from the auto-sized group');

// 5. Loading never migrates: hydration leaves legacy projects byte-identical, so sync has nothing new to push.
const { hydrateSimulationStore } = await import('../store/persistence/hydrateSimulationStore');
const legacyProject = { ...structuredClone(BENCHMARK_PROJECT), id: 'legacy-synced', version: 7, baseVersion: 7, syncStatus: 'synced' as const };
delete legacyProject.financials.customITBISSavedUSD; // hydration already strips stale overrides; this case isolates equipment
const persisted: any = { ...store(), projects: [structuredClone(legacyProject)] };
hydrateSimulationStore(persisted);
assert.deepEqual(persisted.projects[0], legacyProject, 'Hydration does not touch equipment or sync metadata');

// 6. Regressions reported in review (PR #16).
const { calculateRecommendedPanelCount } = await import('../engine/solarEngine');
const fresh = (name: string) => {
  store().createNewProject({ name, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
  store().updateSpecs({ autoCalculatePanels: true });
  store().updateAllMonthlyConsumption(2500);
  return store().getActiveProject();
};
const recommendedFor = (powerW: number) => {
  const p = store().getActiveProject();
  return calculateRecommendedPanelCount(p.client.province, p.monthlyConsumption, powerW, p.rates.targetCoveragePct ?? 95, p.specs.systemLosses ?? 25, p.client.customMonthlyHSP).recommendedPanelCount;
};
// 6a. Changing the panel model on a legacy auto-sized project keeps the recommendation.
fresh('Auto legado');
store().updateSpecs({ panelBrandModel: 'Panel 400', panelPowerW: 400 });
specs = store().getActiveProject().specs;
assert.equal(specs.autoCalculatePanels, true);
assert.equal(specs.panelCount, recommendedFor(400), 'Legacy auto-sizing recomputes for the new wattage');
assert.equal(specs.panels![0].count, specs.panelCount);
// 6b. Editing the primary group's wattage is not a manual quantity override.
store().updateSpecs(editEquipmentGroup(store().getActiveProject().specs, 'panel', { type: 'update', index: 0, patch: { powerW: 600 } }));
specs = store().getActiveProject().specs;
assert.equal(specs.autoCalculatePanels, true, 'A wattage edit keeps automatic sizing on');
assert.equal(specs.panels![0].count, recommendedFor(600));
assert.deepEqual(Object.keys(editEquipmentGroup(specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Otro' } })).sort(), ['panelBrandModel', 'panels'], 'Only changed mirror fields are patched');
// 6c. A new supplier selection reaches the group; clearing it also clears the group.
store().updateSpecs({ panelUnitPriceUSD: 100, selectedSupplierInfo: { panel: { supplierName: 'Viejo', priceUSD: 100, supplierPriceId: 'old' } } });
store().updateSpecs({ panelUnitPriceUSD: 80, selectedSupplierInfo: { panel: { supplierName: 'Nuevo', priceUSD: 80, supplierPriceId: 'new' } } });
specs = store().getActiveProject().specs;
assert.equal(specs.selectedSupplierInfo?.panel?.supplierPriceId, 'new');
assert.equal(specs.panels![0].selectedSupplierInfo?.supplierPriceId, 'new');
assert.equal(specs.panels![0].unitPriceUSD, 80);
store().updateSpecs({ selectedSupplierInfo: {} });
specs = store().getActiveProject().specs;
assert.equal(specs.selectedSupplierInfo?.panel, undefined, 'A cleared supplier is not restored from the group');
assert.equal(specs.panels![0].selectedSupplierInfo, undefined);
console.log('Equipment groups: migration parity, group edits and legacy mirror passed.');
