// F3c: `propose_project_update` como fachada. Sigue funcionando una versión más para los agentes externos, con la MISMA
// definición (contrato congelado, testFrozenAgentContract) y el mismo resultado observable; por dentro, al aplicar, delega en la
// transacción nueva (`commitProjectEdits`: una escritura, un sello, un autosync) SOLO cuando la transacción deja exactamente la
// misma propuesta que el camino antiguo (los parches por sección en orden: cliente, specs, tarifas, finanzas, consumos). Si
// las reglas nuevas cambiarían algo (p. ej. una tarifa trae su precio de referencia y su perfil, que el camino antiguo
// conservaba), si la transacción rechaza el lote o si no habría cambios, se queda en el camino antiguo, que fijó F0
// (testAssistantEditCharacterization sigue igual).
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { applyProjectEdit } from '../domain/projectEdit';
import { probeStore, settleUndoDebounce } from './support/storeProbe';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { legacySectionPatches, legacyPatchesResult, planFacadeCommit } from '../features/agentTools/proposeProjectUpdateFacade';
import type { ProjectSimulation } from '../types';

const store = useSimulationStore;
const INITIAL_UPDATED_AT = '2026-01-01T00:00:00.000Z';
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'facade', syncStatus: 'local_only' as const, updatedAt: INITIAL_UPDATED_AT, createdAt: INITIAL_UPDATED_AT };
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const open = (policy = DEFAULT_AGENT_POLICY) => {
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
    agentPolicy: policy, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  store.getState().setActiveProject(project.id, 'simulator');
};
const active = () => store.getState().getActiveProject();
const external = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'Claude Code' });
const call = (title: string, edits: { section: string; field: string; valueJson: string }[]) => ({ name: 'propose_project_update', args: { id: project.id, title, edits } });
const SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'] as const;
const sections = (p: ProjectSimulation) => JSON.stringify(SECTIONS.map((s) => p[s]));
/** El camino antiguo, calculado a mano y sin la fachada: un `applyProjectEdit` por sección, en el orden de `applyAssistantAction`. */
const legacyByHand = (before: ProjectSimulation, patches: { client?: object; rates?: object; financials?: object }) => {
  const ctx = { equipmentCatalog: store.getState().equipmentCatalog, tariffMatrix: store.getState().tariffMatrix };
  let next = before;
  if (patches.client) next = { ...next, ...applyProjectEdit(next, { kind: 'client', patch: patches.client }, ctx) };
  if (patches.rates) next = { ...next, ...applyProjectEdit(next, { kind: 'rates', patch: patches.rates as never }, ctx) };
  if (patches.financials) next = { ...next, ...applyProjectEdit(next, { kind: 'financials', patch: patches.financials as never }, ctx) };
  return next;
};

// ── 1. Equivalente: cliente + cobertura + tasa de descuento (tres secciones, sin precios) ─────────────────────────────────
const threeSections = [
  { section: 'client', field: 'contactPhone', valueJson: '"809-555-0101"' },
  { section: 'rates', field: 'targetCoveragePct', valueJson: '80' },
  { section: 'financials', field: 'discountRatePct', valueJson: '9' },
];
open();
const expected = legacyByHand(active(), { client: { contactPhone: '809-555-0101' }, rates: { targetCoveragePct: 80 }, financials: { discountRatePct: 9 } });
assert.notEqual(sections(expected), sections(active()), 'el lote sí cambia la propuesta');
let probe = probeStore(store, project.id);
const outcome = await executeAgentTool(call('Contacto, cobertura y descuento', threeSections), external());
assert.equal(outcome.status, 'applied', JSON.stringify(outcome));
// El resultado que ve el agente externo no cambia de forma: el mismo {status, edits} de siempre.
assert.deepEqual(Object.keys(outcome.status === 'applied' ? outcome.data as object : {}), ['status', 'edits']);
assert.deepEqual((outcome as { data: { edits: unknown[] } }).data.edits, [
  { section: 'client', field: 'contactPhone', value: '809-555-0101' },
  { section: 'rates', field: 'targetCoveragePct', value: 80 },
  { section: 'financials', field: 'discountRatePct', value: 9 },
]);
// La propuesta queda EXACTAMENTE como por el camino antiguo…
assert.equal(sections(active()), sections(expected), 'misma propuesta que con un parche por sección');
// …pero en una escritura, un sello y un autosync (el camino antiguo hacía tres de cada).
assert.deepEqual(probe.writes, [['projects', 'undoHistory', 'canUndo'], ['agentActivity']], 'una escritura a projects y el registro');
assert.deepEqual(probe.syncCalls, [false]);
assert.equal(probe.updatedAtStamps.length, 1);
assert.ok(Date.parse(active().updatedAt) > Date.parse(INITIAL_UPDATED_AT));
assert.equal(active().syncStatus, 'local_only');
// Ctrl+Z: un paso, con la misma fuente y las mismas secciones que el camino antiguo, y además las rutas de campo.
const steps = store.getState().undoHistory.journals[project.id].undo;
assert.equal(steps.length, 1);
assert.equal(steps[0].source, 'user', 'la misma fuente que dejaba el camino antiguo');
// (el teléfono del cliente es espejo del documento: las reglas también tocan `customization`, igual que en el camino antiguo)
assert.deepEqual(steps[0].paths.map((p) => p.path).sort(), ['client', 'customization', 'financials', 'rates']);
assert.ok(steps[0].fields?.some((f) => f.path === 'rates.targetCoveragePct' && f.after === 80 && !f.derived));
// La actividad del agente se deshace como siempre (restaura las seis secciones de antes).
const entry = store.getState().agentActivity[0];
assert.equal(entry.tool, 'propose_project_update');
assert.equal(entry.source, 'mcp');
assert.deepEqual(entry.undo?.fields, [...SECTIONS]);
probe.reset();
await settleUndoDebounce();
assert.deepEqual(probe.writes, [], 'nada diferido');
probe.stop();
assert.equal(store.getState().undoAgentActivity(entry.id).success, true);
assert.equal(sections(active()), sections(project), 'deshacer devuelve la propuesta original');

// ── 2. No equivalente: la tarifa por ruta trae su precio y su perfil; el camino antiguo los conservaba → no delega ──────────
const tariff = [
  { section: 'client', field: 'distributor', valueJson: '"EDENORTE"' },
  { section: 'client', field: 'tariffCode', valueJson: '"BTS1"' },
  { section: 'rates', field: 'distributor', valueJson: '"EDENORTE"' },
  { section: 'rates', field: 'tariffCode', valueJson: '"BTS1"' },
];
open();
const tariffExpected = legacyByHand(active(), { client: { distributor: 'EDENORTE', tariffCode: 'BTS1' }, rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' } });
probe = probeStore(store, project.id);
assert.equal((await executeAgentTool(call('Tarifa', tariff), external())).status, 'applied');
assert.deepEqual(probe.writes, [['projects', 'undoHistory', 'canUndo'], ['projects', 'undoHistory'], ['agentActivity']], 'camino antiguo: una escritura por sección, como fija F0');
assert.equal(sections(active()), sections(tariffExpected));
assert.equal(active().rates.energyCostPerKWh, project.rates.energyCostPerKWh, 'conserva el precio de energía, como siempre');
probe.stop();

// ── 3. Sin cambios: el camino antiguo estampa igualmente (no delega para no cambiar eso) ─────────────────────────────────
open();
probe = probeStore(store, project.id);
assert.equal((await executeAgentTool(call('Igual', [{ section: 'rates', field: 'targetCoveragePct', valueJson: String(project.rates.targetCoveragePct) }]), external())).status, 'applied');
assert.deepEqual(probe.writes.filter((w) => w.includes('projects')).length, 1);
assert.equal(probe.updatedAtStamps.length, 1, 'el camino antiguo estampa aunque no cambie nada');
probe.stop();

// ── 4. La decisión, pura ──────────────────────────────────────────────────────────────────────────────────────────────────
open();
const ctx = { equipmentCatalog: store.getState().equipmentCatalog, tariffMatrix: store.getState().tariffMatrix };
const patchesOf = (edits: { section: string; field: string; value: unknown }[]) => legacySectionPatches(edits as never, store.getState().equipmentCatalog);
const same = planFacadeCommit(active(), patchesOf([{ section: 'rates', field: 'targetCoveragePct', value: 80 }, { section: 'client', field: 'contactPhone', value: '1' }]), ctx);
assert.equal(same.delegate, true);
assert.deepEqual(same.delegate && same.edits.map((e) => e.path).sort(), ['client.contactPhone', 'rates.targetCoveragePct']);
const differs = planFacadeCommit(active(), patchesOf([{ section: 'rates', field: 'tariffCode', value: 'BTS1' }]), ctx);
assert.deepEqual(differs, { delegate: false, reason: 'rules_differ' });
const nothing = planFacadeCommit(active(), patchesOf([{ section: 'rates', field: 'targetCoveragePct', value: project.rates.targetCoveragePct }]), ctx);
assert.deepEqual(nothing, { delegate: false, reason: 'no_changes' });
// Un campo que el registro no conoce (el camino antiguo lo admite): la transacción lo rechaza → camino antiguo.
const unknownField = planFacadeCommit(active(), { specs: { campoInventado: 1 } }, ctx);
assert.deepEqual(unknownField, { delegate: false, reason: 'rejected' });
// El camino antiguo puro coincide con el de las porciones del store.
assert.equal(sections(legacyPatchesResult(active(), { client: { contactPhone: '809-555-0101' }, rates: { targetCoveragePct: 80 }, financials: { discountRatePct: 9 } }, ctx)), sections(expected));
// Los parches por sección: los grupos del catálogo como los arma la herramienta (precio manual, sin autodimensionado).
const panel = catalog.find((e) => e.type === 'panel')!;
const groupPatches = patchesOf([{ section: 'specs', field: 'panels', value: [{ id: panel.id, count: 3, unitPriceUSD: 90 }] }]);
assert.equal(groupPatches.specs?.autoCalculatePanels, false);
assert.deepEqual((groupPatches.specs?.panels as { id: string; priceSource: string; brandModel: string }[])[0], {
  id: panel.id, count: 3, unitPriceUSD: 90, priceSource: 'manual', brandModel: panel.displayName, weightKilos: panel.weightKg,
  powerW: panel.powerW, efficiencyPct: panel.efficiencyPct, tempCoeff: panel.tempCoeff, annualDegradation: panel.annualDegradation,
});

console.log('PASS: fachada propose_project_update: misma definición y resultado; delega en commitProjectEdits solo cuando deja la misma propuesta.');
