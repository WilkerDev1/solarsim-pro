import assert from 'node:assert/strict';
import { calculateFinancialSummary } from '../engine/financeEngine';
import { BENCHMARK_LEGACY_SPECS, BENCHMARK_PROJECT } from '../engine/referenceCase';
import { editEquipmentGroup, normalizeEquipmentEdit } from '../utils/equipmentGroups';
import { LEGACY_MIRROR_FIELDS, migrateLegacySpecs } from '../../shared/equipment';
import type { SystemSpecs } from '../types';

// 1. Migrating legacy single-model specs into groups never changes engine results (the mirror is dropped).
const base = BENCHMARK_LEGACY_SPECS;
const mirrorKeys = (specs: object) => [...LEGACY_MIRROR_FIELDS, 'selectedSupplierInfo'].filter((key) => key in specs);
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
    const migrated = migrateLegacySpecs(specs);
    assert.ok(migrated.panels?.length && migrated.inverters?.length, `${name}: groups materialized`);
    assert.deepEqual(mirrorKeys(migrated), [], `${name}: no mirror after migrating`);
    assert.deepEqual(run(migrated), run(specs), `${name}/${mode}: migration keeps engine results`);
    assert.equal(migrateLegacySpecs(migrated), migrated, `${name}: migration is idempotent`);
  }
}

// 2. Group edits are lists only: no mirror fields are written, and the edited specs carry none.
const single = migrateLegacySpecs(base);
let next = normalizeEquipmentEdit(single, editEquipmentGroup(single, 'panel', { type: 'update', index: 0, patch: { count: 30, unitPriceUSD: 99 } }));
assert.equal(next.panels![0].count, 30);
assert.equal(next.panels![0].unitPriceUSD, 99);
assert.deepEqual(Object.keys(editEquipmentGroup(single, 'panel', { type: 'update', index: 0, patch: { count: 30 } })), ['panels'], 'a group edit patches only its list');
assert.deepEqual(mirrorKeys(next), []);
next = normalizeEquipmentEdit(next, editEquipmentGroup(next, 'panel', { type: 'add', item: { id: 'p2', brandModel: 'JA 630', powerW: 630, count: 10, unitPriceUSD: 105 } }));
assert.equal(next.panels!.length, 2);
next = normalizeEquipmentEdit(next, editEquipmentGroup(next, 'panel', { type: 'remove', index: 0 }));
assert.deepEqual(next.panels!.map(p => p.id), ['p2'], 'Removing the first group promotes the next one');
assert.deepEqual(editEquipmentGroup(next, 'panel', { type: 'remove', index: 0 }), {}, 'The last group cannot be removed');
assert.deepEqual(mirrorKeys(next), []);
const batteryEdit = editEquipmentGroup(single, 'battery', { type: 'update', index: 0, patch: { capacityKWh: 5.12, count: 4 } });
assert.equal(batteryEdit.batteries![0].capacityKWh, 5.12);
assert.equal(batteryEdit.batteries![0].count, 4);
assert.equal(batteryEdit.batteries![0].dodPct, single.batteries![0].dodPct, 'DOD y eficiencia son del grupo');

// 3. Legacy-field patches (assistant, imports) reach the single group and never rewrite the mirror.
const merged = normalizeEquipmentEdit(single, { panelCount: 44, panelBrandModel: 'Canadian 615' });
assert.equal(merged.panels![0].count, 44);
assert.equal(merged.panels![0].brandModel, 'Canadian 615');
assert.deepEqual(mirrorKeys(merged), []);
const legacyMerged = normalizeEquipmentEdit(base, { panelCount: 44 });
assert.equal(legacyMerged.panels![0].count, 44);
assert.equal(legacyMerged.inverters![0].count, 2, 'an unmigrated project migrates on its first equipment edit');
assert.deepEqual(mirrorKeys(legacyMerged), []);
const multi = normalizeEquipmentEdit(single, editEquipmentGroup(single, 'inverter', { type: 'add', item: { id: 'i2', brandModel: 'Lux 5K', powerKW: 5, count: 1 } }));
const ignored = normalizeEquipmentEdit(multi, { inverterCount: 9 });
assert.equal(ignored.inverters![0].count, multi.inverters![0].count, 'With several groups the engine reads the groups, so a legacy edit cannot silently rewrite one');
assert.deepEqual(mirrorKeys(ignored), []);
const untouched = normalizeEquipmentEdit(single, { pricePerWattUSD: 1.2 });
assert.equal(untouched.panels, single.panels, 'Edits that do not touch equipment leave the groups alone');

// 4. Store: equipment edits migrate the active project; auto-sizing keeps working on the migrated group.
const { useSimulationStore } = await import('../store/useSimulationStore');
const store = () => useSimulationStore.getState();
store().createNewProject({ name: 'Grupos', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
assert.ok(store().getActiveProject().specs.panels?.length, 'A new project is born with groups and no mirror');
assert.deepEqual(mirrorKeys(store().getActiveProject().specs), []);
store().updateSpecs({ panelBrandModel: 'Canadian 615', panelPowerW: 615 });
let specs = store().getActiveProject().specs;
assert.equal(specs.panels?.length, 1);
assert.equal(specs.panels![0].brandModel, 'Canadian 615');
assert.equal(specs.panels![0].powerW, 615);
store().updateSpecs({ autoCalculatePanels: true });
store().updateAllMonthlyConsumption(2500);
specs = store().getActiveProject().specs;
assert.deepEqual(mirrorKeys(specs), [], 'Auto-sizing writes the group only');
const summary = store().getFinancialSummary();
assert.equal(summary.systemCapacityKWp, Math.round(specs.panels![0].count * 615 / 10) / 100, 'The engine sizes the system from the auto-sized group');

// 5. Loading migrates legacy projects once: groups only, same results, idempotent.
const { hydrateSimulationStore } = await import('../store/persistence/hydrateSimulationStore');
const legacyProject = { ...structuredClone(BENCHMARK_PROJECT), specs: { ...BENCHMARK_LEGACY_SPECS }, id: 'legacy-synced', version: 7, baseVersion: 7, syncStatus: 'synced' as const };
delete legacyProject.financials.customITBISSavedUSD; // hydration already strips stale overrides; this case isolates equipment
const persisted: any = { ...store(), projects: [structuredClone(legacyProject)] };
hydrateSimulationStore(persisted);
assert.deepEqual(persisted.projects[0].specs, migrateLegacySpecs(legacyProject.specs), 'Hydration migrates the equipment to groups');
assert.deepEqual(mirrorKeys(persisted.projects[0].specs), []);
assert.equal(persisted.projects[0].version, 7, 'Hydration does not touch sync metadata');
const hydrated = persisted.projects[0];
hydrateSimulationStore(persisted);
assert.equal(persisted.projects[0], hydrated, 'A second hydration changes nothing');

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
assert.equal(specs.panels![0].count, recommendedFor(400), 'Legacy auto-sizing recomputes for the new wattage');
// 6b. Editing the primary group's wattage is not a manual quantity override.
store().updateSpecs(editEquipmentGroup(store().getActiveProject().specs, 'panel', { type: 'update', index: 0, patch: { powerW: 600 } }));
specs = store().getActiveProject().specs;
assert.equal(specs.autoCalculatePanels, true, 'A wattage edit keeps automatic sizing on');
assert.equal(specs.panels![0].count, recommendedFor(600));
assert.deepEqual(Object.keys(editEquipmentGroup(specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Otro' } })).sort(), ['panels'], 'Only the list is patched');
// 6c. A new supplier selection reaches the group; clearing it also clears the group.
store().updateSpecs({ panelUnitPriceUSD: 100, selectedSupplierInfo: { panel: { supplierName: 'Viejo', priceUSD: 100, supplierPriceId: 'old' } } });
store().updateSpecs({ panelUnitPriceUSD: 80, selectedSupplierInfo: { panel: { supplierName: 'Nuevo', priceUSD: 80, supplierPriceId: 'new' } } });
specs = store().getActiveProject().specs;
assert.equal('selectedSupplierInfo' in specs, false, 'The supplier lives in the group');
assert.equal(specs.panels![0].selectedSupplierInfo?.supplierPriceId, 'new');
assert.equal(specs.panels![0].unitPriceUSD, 80);
store().updateSpecs({ selectedSupplierInfo: {} });
specs = store().getActiveProject().specs;
assert.equal(specs.panels![0].selectedSupplierInfo, undefined, 'A cleared supplier is cleared in the group');
// 7. Catalog identity: groups remember the catalog item they came from (datasheets, previews, audits).
{
  const { resolveGroupCatalogItem, selectCatalogEquipment } = await import('../utils/equipmentGroups');
  const entry = (id: string, displayName: string, type: 'panel' | 'inverter' | 'battery' = 'panel', extra: Record<string, unknown> = {}) =>
    ({ id, displayName, type, brand: 'QA', modelSeries: 'QA', createdAt: '2026-10-21', updatedAt: '2026-10-21', ...extra }) as any;
  const catalog = [entry('cat-a', 'QA 600', 'panel', { powerW: 600 }), entry('cat-b', 'QA 620', 'panel', { powerW: 620 }), entry('cat-b2', 'QA 620', 'panel'),
    entry('cat-i', 'QA 8K', 'inverter', { powerKW: 8 }), entry('cat-bat', 'QA 16 kWh', 'battery', { capacityKWh: 16 })];
  assert.equal(resolveGroupCatalogItem({ id: 'g', catalogItemId: 'cat-a', brandModel: 'Nombre editado' }, 'panel', catalog)?.id, 'cat-a', 'catalogItemId wins over the name');
  assert.equal(resolveGroupCatalogItem({ id: 'cat-i', brandModel: 'Otro nombre' }, 'inverter', catalog)?.id, 'cat-i', 'AI proposals use the catalog id as group id');
  assert.equal(resolveGroupCatalogItem({ id: 'g', brandModel: 'QA 600' }, 'panel', catalog)?.id, 'cat-a', 'Unique exact name');
  assert.equal(resolveGroupCatalogItem({ id: 'g', brandModel: 'QA 620' }, 'panel', catalog), null, 'Ambiguous names are never guessed');
  assert.equal(resolveGroupCatalogItem({ id: 'g', brandModel: 'QA 8K' }, 'panel', catalog), null, 'Type must match');
  assert.equal(resolveGroupCatalogItem({ id: 'g', catalogItemId: 'cat-i', brandModel: 'QA 600' }, 'panel', catalog)?.id, 'cat-a', 'A catalog id of another type is ignored');
  assert.equal(resolveGroupCatalogItem({ id: 'g', catalogItemId: 'deleted', brandModel: 'QA 600' }, 'panel', catalog)?.id, 'cat-a', 'A removed catalog item falls back to the name');

  // Selecting on an unmigrated project migrates it (first edit) and records the catalog id.
  const legacy = structuredClone(BENCHMARK_LEGACY_SPECS);
  const patch = selectCatalogEquipment(legacy, 'panel', 0, catalog[0], { unitPriceUSD: 91 });
  assert.equal(patch.panels?.[0].catalogItemId, 'cat-a');
  assert.equal(patch.panels?.[0].brandModel, 'QA 600');
  assert.equal(patch.panels?.[0].powerW, 600);
  assert.equal(patch.panels?.[0].count, BENCHMARK_LEGACY_SPECS.panelCount, 'Quantity is kept');
  assert.equal(patch.panels?.[0].unitPriceUSD, 91, 'Extra fields go to the group');
  assert.deepEqual(mirrorKeys(patch), [], 'A selection never writes the mirror');
  const grouped = migrateLegacySpecs(legacy);
  const second = normalizeEquipmentEdit(grouped, editEquipmentGroup(grouped, 'inverter', { type: 'add', item: { id: 'i2', brandModel: 'Viejo', powerKW: 3, count: 1 } }));
  const detailed = selectCatalogEquipment(second, 'inverter', 1, catalog[3]);
  assert.equal(detailed.inverters?.[1].catalogItemId, 'cat-i');
  assert.equal(detailed.inverters?.[1].powerKW, 8);
  assert.deepEqual(mirrorKeys(detailed), [], 'A secondary group never touches the mirror');
  const noBattery = { ...grouped, hasBattery: false, batteries: [] };
  const battery = selectCatalogEquipment(noBattery, 'battery', 0, catalog[4], { count: 1 });
  assert.equal(battery.batteries?.length, 1, 'Selecting into an empty battery list adds the group');
  assert.equal(battery.batteries?.[0].catalogItemId, 'cat-bat');
  assert.equal(battery.batteries?.[0].capacityKWh, 16);
  const missing = selectCatalogEquipment(legacy, 'panel', 0, entry('cat-z', 'Sin potencia'));
  assert.equal(missing.panels?.[0].powerW, grouped.panels![0].powerW, 'A catalog item without magnitude keeps the current one');

  // Store: a model change on an auto-sized project is still not a manual quantity override.
  fresh('Catálogo auto');
  store().updateSpecs(selectCatalogEquipment(store().getActiveProject().specs, 'panel', 0, entry('cat-400', 'Panel 400', 'panel', { powerW: 400 })));
  specs = store().getActiveProject().specs;
  assert.equal(specs.autoCalculatePanels, true);
  assert.equal(specs.panels![0].catalogItemId, 'cat-400');
  assert.equal(specs.panels![0].count, recommendedFor(400));

  // Supplier price application records the catalog item on the primary group.
  fresh('Precio proveedor');
  const offer = { id: 'sp-a', supplierName: 'Dist QA', priceUSD: 88, updatedAt: '2026-10-21' };
  store().applySupplierPriceToProject('panel', offer, entry('cat-sp', 'QA Proveedor 610', 'panel', { powerW: 610, supplierPrices: [offer] }));
  specs = store().getActiveProject().specs;
  assert.equal(specs.panels?.[0].catalogItemId, 'cat-sp', 'Unmigrated projects migrate on this first equipment edit');
  assert.equal(specs.panels?.[0].brandModel, 'QA Proveedor 610');
  assert.equal(specs.panels?.[0].unitPriceUSD, 88);
  assert.deepEqual(mirrorKeys(specs), []);
  assert.equal(specs.panels?.[0].selectedSupplierInfo?.supplierPriceId, 'sp-a');
}
console.log('Equipment groups: migration parity, group edits, no-mirror writes, hydration and catalog identity passed.');
