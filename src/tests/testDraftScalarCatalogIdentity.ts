import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { buildProjectFromDraft } from '../store/slices/aiSlice';
import { prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { proposalDatasheets } from '../utils/proposalDatasheets';
import { resolveGroupCatalogItem } from '../utils/equipmentGroups';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import type { ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

/**
 * Release 2.7.1: un borrador de IA con selección escalar que reemplaza el modelo de un grupo vinculado al catálogo
 * no puede dejar la identidad del equipo anterior (`catalogItemId`, id del grupo): `resolveGroupCatalogItem` la
 * prioriza sobre el nombre y la propuesta seguiría anexando la ficha técnica del equipo viejo.
 * Regla (la del dock, `equipmentGroupModel`): nombre exacto y único del catálogo ⇒ se vincula a ese equipo; si no,
 * el grupo queda `manualModel` sin `catalogItemId`.
 */
const tariff = DEFAULT_RD_TARIFF_MATRIX as never;
const item = (id: string, displayName: string, type: SolarEquipmentItem['type'], asset: string): SolarEquipmentItem =>
  ({ id, displayName, type, brand: 'QA', modelSeries: 'QA', datasheetAssetId: asset, datasheetName: `${asset}.pdf`, createdAt: '2026-10-14', updatedAt: '2026-10-14' });
const catalog = [
  item('panel-a', 'Panel A 600W', 'panel', 'ds-panel-a'), item('panel-b', 'Panel B 620W', 'panel', 'ds-panel-b'),
  item('inv-a', 'Inversor A', 'inverter', 'ds-inv-a'), item('inv-b', 'Inversor B', 'inverter', 'ds-inv-b'),
  item('dup-1', 'Panel Doble', 'panel', 'ds-dup-1'), item('dup-2', 'Panel Doble', 'panel', 'ds-dup-2'),
];
const draft = { monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', recommendedPanelCount: 12, selectedPanelWatts: 600 };
const linkedProject = (groupId = 'g1'): ProjectSimulation => {
  const project = structuredClone(BENCHMARK_PROJECT);
  project.id = 'linked';
  project.specs = { ...project.specs, isDetailed: false,
    panels: [{ id: groupId, catalogItemId: 'panel-a', brandModel: 'Panel A 600W', powerW: 600, count: 12, unitPriceUSD: 100 }],
    inverters: [{ id: 'gi', catalogItemId: 'inv-a', brandModel: 'Inversor A', powerKW: 8, count: 1, unitPriceUSD: 2000 }] };
  return project;
};
const keys = (project: ProjectSimulation) => proposalDatasheets(project, catalog).map((sheet) => sheet.key).sort();
const apply = (project: ProjectSimulation, extra: object, options: object = { catalog }) =>
  prepareProposalDraftProject(project, { ...draft, ...extra } as never, tariff, { isNew: false, ...options });

// 0. Punto de partida: las fichas son las del equipo vinculado.
assert.deepEqual(keys(linkedProject()), ['ds-inv-a', 'ds-panel-a']);

// 1. Modelo del catálogo (nombre exacto y único): el grupo se vincula al equipo nuevo y la ficha es la suya.
{
  const next = apply(linkedProject(), { selectedPanelModel: 'Panel B 620W', selectedInverterModel: 'Inversor B' });
  assert.equal(next.specs.panels![0].catalogItemId, 'panel-b');
  assert.notEqual(next.specs.panels![0].manualModel, true);
  assert.equal(resolveGroupCatalogItem(next.specs.panels![0], 'panel', catalog)?.id, 'panel-b');
  assert.equal(next.specs.inverters![0].catalogItemId, 'inv-b');
  assert.deepEqual(keys(next), ['ds-inv-b', 'ds-panel-b'], 'la ficha del equipo anterior ya no se anexa');
  assert.equal(next.specs.panels![0].count, 12, 'la cantidad del grupo se conserva');
}

// 2. Modelo que no está en el catálogo: el grupo queda manual y sin la ficha del equipo anterior.
{
  const next = apply(linkedProject(), { selectedPanelModel: 'Panel C Desconocido', selectedInverterModel: 'Inversor C' });
  assert.equal(next.specs.panels![0].manualModel, true);
  assert.equal(next.specs.panels![0].catalogItemId, undefined);
  assert.equal(next.specs.panels![0].brandModel, 'Panel C Desconocido');
  assert.equal(resolveGroupCatalogItem(next.specs.panels![0], 'panel', catalog), null);
  assert.equal(next.specs.inverters![0].manualModel, true);
  assert.deepEqual(keys(next), [], 'sin vínculo no se anexa ninguna ficha');
}

// 3. El id del grupo es el del equipo del catálogo (propuestas de IA): tampoco sobrevive al reemplazo.
{
  const withCatalogId = linkedProject('panel-a');
  const unknown = apply(withCatalogId, { selectedPanelModel: 'Panel C Desconocido' });
  assert.equal(resolveGroupCatalogItem(unknown.specs.panels![0], 'panel', catalog), null);
  assert.deepEqual(keys(unknown), ['ds-inv-a'], 'solo queda la ficha del inversor sin cambios');
  const named = apply(withCatalogId, { selectedPanelModel: 'Panel B 620W' });
  assert.equal(resolveGroupCatalogItem(named.specs.panels![0], 'panel', catalog)?.id, 'panel-b');
}

// 4. Nombre ambiguo en el catálogo: nunca se adivina; queda manual.
{
  const next = apply(linkedProject(), { selectedPanelModel: 'Panel Doble' });
  assert.equal(next.specs.panels![0].manualModel, true);
  assert.equal(resolveGroupCatalogItem(next.specs.panels![0], 'panel', catalog), null);
}

// 5. Sin catálogo disponible: el reemplazo también desvincula (no hay forma de saber a qué equipo apunta el nombre).
{
  const next = apply(linkedProject(), { selectedPanelModel: 'Panel B 620W' }, {});
  assert.equal(next.specs.panels![0].catalogItemId, undefined);
  assert.equal(next.specs.panels![0].manualModel, true);
}

// 6. Mismo modelo (o solo cambian mayúsculas): el vínculo se conserva.
{
  const same = apply(linkedProject(), { selectedPanelModel: 'Panel A 600W' });
  assert.equal(same.specs.panels![0].catalogItemId, 'panel-a');
  assert.notEqual(same.specs.panels![0].manualModel, true);
  assert.deepEqual(keys(same), ['ds-inv-a', 'ds-panel-a']);
  const cased = apply(linkedProject(), { selectedPanelModel: 'panel a 600w' });
  assert.equal(cased.specs.panels![0].catalogItemId, 'panel-a');
}

// 7. Aplicación real (agente/asistente): el catálogo del almacén decide el vínculo.
{
  const original = store.getState();
  try {
    store.setState({ projects: [linkedProject()], activeProjectId: 'linked', equipmentCatalog: catalog,
      syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
    const built = buildProjectFromDraft(store.getState(), { ...draft, selectedPanelModel: 'Panel B 620W' } as never, false);
    assert.ok('project' in built, 'error' in built ? built.error : '');
    assert.equal(built.project.specs.panels![0].catalogItemId, 'panel-b');
    assert.deepEqual(keys(built.project), ['ds-inv-a', 'ds-panel-b']);
    const manual = buildProjectFromDraft(store.getState(), { ...draft, selectedPanelModel: 'Panel C Desconocido' } as never, false);
    assert.ok('project' in manual);
    assert.deepEqual(keys(manual.project), ['ds-inv-a'], 'la ficha del panel anterior no sobrevive');
  } finally {
    store.setState(original, true);
  }
}
console.log('Scalar proposal drafts re-link or detach the group catalog identity.');
