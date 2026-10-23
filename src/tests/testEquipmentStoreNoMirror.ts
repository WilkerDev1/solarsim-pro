import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { projectDifferences } from '../store/sync/projectDifferences';
import { BENCHMARK_LEGACY_SPECS, BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary } from '../engine/financeEngine';
import { LEGACY_MIRROR_FIELDS, migrateLegacySpecs, readEquipment } from '../../shared/equipment';
import { createGroupActions } from '../components/simulator/params/sections/equipment/equipmentGroupModel';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

/**
 * Oleada 2: ningún camino del store escribe el espejo heredado (panelBrandModel, panelCount, inverter*, battery*…
 * ni `selectedSupplierInfo` por tipo). Edición del dock, selección de catálogo, precio de proveedor, importación,
 * restauración de versiones y rehidratación local dejan las specs solo con grupos.
 */
const mirror = (specs: object) => [...LEGACY_MIRROR_FIELDS, 'selectedSupplierInfo'].filter((key) => key in specs);
const legacyProject = (id: string, specs: Partial<SystemSpecs> = {}): ProjectSimulation => {
  const project = structuredClone(BENCHMARK_PROJECT);
  project.id = id;
  project.status = 'Draft';
  delete project.financials.customITBISSavedUSD; // solo el caso de referencia conserva sobrescrituras manuales
  project.specs = { ...BENCHMARK_LEGACY_SPECS, ...specs }; // formato heredado: solo espejo, sin grupos
  return project;
};
const offline = { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false };
const load = (...projects: ProjectSimulation[]) => store.setState({ projects, activeProjectId: projects[0].id, syncSettings: offline });
const active = () => store.getState().projects.find((p) => p.id === store.getState().activeProjectId)!;
const specsOf = () => active().specs;
const updateSpecs = (patch: Partial<SystemSpecs>) => store.getState().updateSpecs(patch);

const item = (over: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem => ({ brand: 'Marca', modelSeries: 'S', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over } as SolarEquipmentItem);
const sp = (id: string, name: string, priceUSD: number) => ({ id, supplierName: name, priceUSD, updatedAt: '2026-10-01' });
const panelCatalog = item({ id: 'p-600', type: 'panel', displayName: 'Panel 600 W', powerW: 600, efficiencyPct: 22, supplierPrices: [sp('s1', 'Alfa', 88), sp('s2', 'Beta', 80)] });
const inverterCatalog = item({ id: 'i-5', type: 'inverter', displayName: 'Inversor 5 kW', powerKW: 5, supplierPrices: [sp('s3', 'Alfa', 1400)] });
const batteryCatalog = item({ id: 'b-10', type: 'battery', displayName: 'Batería 10', capacityKWh: 10, dodPct: 90, batteryEfficiencyPct: 96, supplierPrices: [sp('s4', 'Alfa', 1700)] });
const catalog = [panelCatalog, inverterCatalog, batteryCatalog];

// 1. Parches heredados (asistente, importaciones) llegan al grupo y no reescriben el espejo.
{
  load(legacyProject('legacy-patch'));
  updateSpecs({ panelCount: 44, panelBrandModel: 'Canadian 615', batteryDOD: 75 });
  const specs = specsOf();
  assert.deepEqual(mirror(specs), [], 'un parche con campos heredados no deja espejo');
  assert.equal(specs.panels![0].count, 44);
  assert.equal(specs.panels![0].brandModel, 'Canadian 615');
  assert.equal(specs.batteries![0].dodPct, 75, 'DOD de batería solo por grupo');
  assert.equal(specs.inverters![0].count, 2, 'los demás tipos se migran con sus valores');
  assert.equal(specs.autoCalculatePanels, false, 'cambiar la cantidad apaga el cálculo automático');
}

// 2. Dock: acciones de grupo (cantidad, selección del catálogo, precio) no dejan espejo y apagan el cálculo automático.
{
  load(legacyProject('dock-actions', { autoCalculatePanels: true }));
  const actions = () => createGroupActions('panel', specsOf(), catalog, updateSpecs);
  actions().setCount(0, 52);
  assert.deepEqual(mirror(specsOf()), []);
  assert.equal(readEquipment(specsOf()).panels[0].count, 52);
  assert.equal(specsOf().autoCalculatePanels, false, 'editar la cantidad de paneles desde el dock apaga el cálculo automático');

  updateSpecs(buildCatalogSelectionUpdate(specsOf(), 'panel', panelCatalog));
  let panel = specsOf().panels![0];
  assert.deepEqual(mirror(specsOf()), [], 'seleccionar del catálogo no escribe el espejo');
  assert.equal(panel.brandModel, 'Panel 600 W');
  assert.equal(panel.powerW, 600);
  assert.equal(panel.catalogItemId, 'p-600');
  assert.equal(specsOf().panelEfficiency, 22, 'parámetros de sistema se conservan');

  updateSpecs({ ...buildCatalogSelectionUpdate({ ...specsOf(), autoSupplierPricing: true }, 'panel', panelCatalog), autoSupplierPricing: true });
  panel = specsOf().panels![0];
  assert.equal(panel.unitPriceUSD, 80, 'precio automático: el proveedor más barato');
  assert.equal(panel.selectedSupplierInfo?.supplierName, 'Beta');
  assert.deepEqual(mirror(specsOf()), []);

  createGroupActions('battery', specsOf(), catalog, updateSpecs).select(0, batteryCatalog);
  assert.deepEqual(mirror(specsOf()), []);
  assert.equal(specsOf().batteries![0].dodPct, 90);
  assert.equal(specsOf().batteries![0].efficiencyPct, 96);
}

// 3. Precio de proveedor aplicado al proyecto.
{
  load(legacyProject('supplier-price'));
  store.getState().applySupplierPriceToProject('panel', sp('s2', 'Beta', 80), panelCatalog);
  let specs = specsOf();
  assert.deepEqual(mirror(specs), [], 'precio de proveedor de panel');
  assert.equal(specs.panels![0].unitPriceUSD, 80);
  assert.equal(specs.panels![0].selectedSupplierInfo?.supplierPriceId, 's2');
  assert.equal(specs.panels![0].brandModel, 'Panel 600 W');
  assert.equal(specs.panels![0].powerW, 600);

  store.getState().applySupplierPriceToProject('inverter', sp('s3', 'Alfa', 1400), inverterCatalog);
  store.getState().applySupplierPriceToProject('battery', sp('s4', 'Alfa', 1700), batteryCatalog);
  specs = specsOf();
  assert.deepEqual(mirror(specs), []);
  assert.equal(specs.inverters![0].unitPriceUSD, 1400);
  assert.equal(specs.inverters![0].powerKW, 5);
  assert.equal(specs.batteries![0].unitPriceUSD, 1700);
  assert.equal(specs.batteries![0].capacityKWh, 10);
  assert.equal(specs.batteries![0].dodPct, 90);
  assert.equal(specs.hasBattery, true);

  // Sin equipo del catálogo: solo precio y proveedor del primer grupo.
  load(legacyProject('supplier-price-bare'));
  store.getState().applySupplierPriceToProject('inverter', sp('sx', 'Zeta', 2100));
  assert.deepEqual(mirror(specsOf()), []);
  assert.equal(specsOf().inverters![0].unitPriceUSD, 2100);
  assert.equal(specsOf().inverters![0].selectedSupplierInfo?.supplierName, 'Zeta');
  assert.equal(specsOf().inverters![0].powerKW, 8, 'sin catálogo no se toca la potencia');
}

// 4. Cambiar el modelo principal a mano suelta al proveedor que no lo cotiza (sobre el grupo).
{
  load(legacyProject('supplier-cleanup'));
  store.getState().applySupplierPriceToProject('panel', sp('s2', 'Beta', 80), panelCatalog);
  store.setState({ equipmentCatalog: catalog });
  const index = 0;
  updateSpecs({ panels: specsOf().panels!.map((group, i) => (i === index ? { ...group, brandModel: 'Otro modelo' } : group)) });
  assert.equal(specsOf().panels![0].selectedSupplierInfo, undefined, 'el proveedor que no cotiza el nuevo modelo se quita del grupo');
  assert.deepEqual(mirror(specsOf()), []);
}

// 5. Activar la batería de un proyecto heredado crea el grupo y no deja espejo.
{
  load(legacyProject('battery-toggle', { hasBattery: false, batteryCount: 0, batteryUnitPriceUSD: 1685 }));
  updateSpecs({ hasBattery: true });
  assert.deepEqual(mirror(specsOf()), []);
  assert.equal(specsOf().batteries![0].count, 1, 'una batería activa lleva al menos una unidad');
  assert.equal(specsOf().batteries![0].unitPriceUSD, 1685);
}

// 6. Proyecto nuevo.
{
  load(legacyProject('base'));
  store.getState().createNewProject({ name: 'Nuevo sin espejo' });
  const created = store.getState().projects.find((p) => p.client.name === 'Nuevo sin espejo')!;
  assert.deepEqual(mirror(created.specs), [], 'un proyecto nuevo nace solo con grupos');
  assert.ok(created.specs.panels?.length && created.specs.inverters?.length);
}

// 7. Importación: un archivo heredado (con espejo) y uno nuevo quedan solo con grupos, con los mismos números.
{
  const legacyFile = legacyProject('import-legacy');
  const modernFile = { ...legacyProject('import-modern'), specs: { ...migrateLegacySpecs(legacyProject('x').specs), panelCount: 99 } as SystemSpecs };
  load(legacyProject('base'));
  const result = store.getState().importProjectsFromJSON({ projects: [legacyFile, modernFile] });
  assert.equal(result.success, true);
  for (const id of ['import-legacy', 'import-modern']) {
    const imported = store.getState().projects.find((p) => p.id === id);
    assert.ok(imported, `${id}: importado`);
    assert.deepEqual(mirror(imported!.specs), [], `${id}: sin espejo`);
    assert.ok(imported!.specs.panels?.length);
  }
  const imported = store.getState().projects.find((p) => p.id === 'import-legacy')!;
  const run = (specs: SystemSpecs) => calculateFinancialSummary(imported.client.province, specs, imported.rates, imported.financials, imported.monthlyConsumption);
  assert.equal(run(imported.specs).systemCapacityKWp, 23.56, 'importar no cambia los kWp del caso de referencia');
}

// 8. Restaurar una versión (y deshacer) migra los datos heredados de la versión.
{
  load(legacyProject('restore'));
  const base = active();
  store.getState().createSnapshot('restore', 'Heredada', '', 'manual');
  const snapshot = store.getState().snapshotsByProject['restore'][0];
  assert.ok(mirror(snapshot.data.specs).length > 0, 'la versión guardada antes de migrar trae espejo');
  assert.equal(snapshot.panelCount, 38, 'el resumen de la versión cuenta los paneles de los grupos');
  updateSpecs({ panels: [{ id: 'solo', brandModel: 'Otro', powerW: 500, count: 3, unitPriceUSD: 10 }] });
  assert.equal(store.getState().restoreSnapshot('restore', snapshot.id), true);
  const restored = specsOf();
  assert.deepEqual(mirror(restored), [], 'restaurar una versión deja solo grupos');
  assert.equal(readEquipment(restored).panels[0].count, 38);
  assert.deepEqual(restored, migrateLegacySpecs(base.specs), 'lo restaurado equivale a la propuesta migrada');
}

// 9. Rehidratación local: migra una vez, es idempotente y no cambia los resultados.
{
  const projects = [legacyProject('hydrate-a'), legacyProject('hydrate-b', { hasBattery: false })];
  const before = projects.map((p) => calculateFinancialSummary(p.client.province, p.specs, p.rates, p.financials, p.monthlyConsumption));
  const persisted = { ...store.getState(), projects: projects.map((p) => structuredClone(p)) };
  hydrateSimulationStore(persisted);
  persisted.projects.forEach((p, i) => {
    assert.deepEqual(mirror(p.specs), [], `${p.id}: hidratación sin espejo`);
    assert.deepEqual(calculateFinancialSummary(p.client.province, p.specs, p.rates, p.financials, p.monthlyConsumption), before[i], `${p.id}: mismos resultados`);
  });
  const first = persisted.projects.map((p) => p.specs);
  hydrateSimulationStore(persisted);
  persisted.projects.forEach((p, i) => assert.equal(p.specs, first[i], `${p.id}: idempotente (misma referencia)`));
  assert.equal(persisted.projects[1].specs.hasBattery, false);
  assert.ok(persisted.projects[1].specs.batteries?.length, 'la batería apagada conserva sus datos en un grupo oculto');
}

// 10. Sincronización y conflictos: se comparan los equipos por el módulo.
{
  const legacy = legacyProject('diff');
  const migrated = { ...legacy, specs: migrateLegacySpecs(legacy.specs) };
  assert.deepEqual(projectDifferences(legacy, migrated), [], 'espejo y grupos equivalentes no son un conflicto');
  const edited = { ...migrated, specs: { ...migrated.specs, panels: [{ ...migrated.specs.panels![0], count: 40 }] } };
  const diffs = projectDifferences(legacy, edited);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].section, 'Equipos');
  assert.match(diffs[0].field, /módulos/i, 'la etiqueta describe el grupo, no un campo suelto');
  assert.equal(diffs[0].oldValue, 38);
  assert.equal(diffs[0].newValue, 40);
}

// 11. Historial de versiones: la comparación muestra cambios de grupos.
{
  const legacy = legacyProject('history');
  const migrated = { ...legacy, specs: migrateLegacySpecs(legacy.specs) };
  const snap = (data: ProjectSimulation, n: number) => ({ id: `s${n}`, projectId: 'history', versionNumber: n, label: `v${n}`, type: 'manual' as const, authorName: 'x', createdAt: '', systemCapacityKWp: 0, netInvestmentUSD: 0, panelCount: 0, data });
  const second = { ...migrated, specs: { ...migrated.specs, panels: [...migrated.specs.panels!, { id: 'p2', brandModel: 'Panel extra', powerW: 700, count: 5, unitPriceUSD: 120 }] } };
  assert.deepEqual(store.getState().compareSnapshots(snap(legacy, 1), snap(migrated, 2)), [], 'migrar no es un cambio');
  const diffs = store.getState().compareSnapshots(snap(migrated, 2), snap(second, 3));
  const fields = diffs.map((d) => d.field);
  assert.ok(fields.includes('Cantidad de Paneles'), 'cantidad total de paneles');
  assert.ok(fields.includes('Potencia de Panel'), 'potencia DC');
  const count = diffs.find((d) => d.field === 'Cantidad de Paneles')!;
  assert.equal(count.oldValue, 38);
  assert.equal(count.newValue, 43);
}

console.log('Store, dock, suppliers, import, history and hydration write equipment without the legacy mirror.');
