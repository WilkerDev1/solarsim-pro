// F0 (caracterización, sin cambio de comportamiento): una edición del asistente flotante con equipos y tarifa, por el camino
// real: `executeForAssistant` (registro de herramientas, fuente `app-assistant`) y la aplicación del plan (`applyPlan`).
// Fija cuántas escrituras hace al store, cuántas veces llama a `triggerAutoSync`, cómo cambia `updatedAt` y el resultado del
// motor que la futura transacción `commitProjectEdits` (F2a2) tendrá que igualar. Si una de estas cifras cambia a propósito,
// se actualiza aquí en el mismo PR que lo cambia, con su justificación.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { probeStore, settleUndoDebounce } from './support/storeProbe';

const store = useSimulationStore;
const INITIAL_UPDATED_AT = '2026-01-01T00:00:00.000Z';
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'edit-char', syncStatus: 'local_only' as const, updatedAt: INITIAL_UPDATED_AT, createdAt: INITIAL_UPDATED_AT };
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
const reset = (policy = DEFAULT_AGENT_POLICY) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  agentPolicy: policy, agentActivity: [], pendingAgentActions: [], undoStack: [], redoStack: [], canUndo: false, canRedo: false,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
/** Estado de partida realista: la propuesta está abierta (su base ya está en el historial de Ctrl+Z, como al abrirla en la app). */
const open = (policy = DEFAULT_AGENT_POLICY) => { reset(policy); store.getState().setActiveProject(project.id, 'simulator'); };
const ctx = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
const active = () => store.getState().getActiveProject();
/** Lo que el motor expone de forma estable para esta propuesta. */
const engine = () => {
  const s = store.getState().getFinancialSummary();
  return {
    systemCapacityKWp: s.systemCapacityKWp, annualProductionKWh: Math.round(s.annualProductionKWh * 10) / 10, energyCoveragePct: s.energyCoveragePct,
    contractPriceUSD: s.contractPriceUSD, netInvestmentUSD: s.netInvestmentUSD, year1SavingsUSD: s.year1SavingsUSD, paybackYears: s.paybackYears,
  };
};
const edits = () => [
  { section: 'specs', field: 'panels', valueJson: JSON.stringify([{ id: panel.id, count: 10, unitPriceUSD: 100 }]) },
  { section: 'specs', field: 'inverters', valueJson: JSON.stringify([{ id: inverter.id, count: 1, unitPriceUSD: 1500 }]) },
  { section: 'client', field: 'distributor', valueJson: '"EDENORTE"' },
  { section: 'client', field: 'tariffCode', valueJson: '"BTS1"' },
  { section: 'rates', field: 'distributor', valueJson: '"EDENORTE"' },
  { section: 'rates', field: 'tariffCode', valueJson: '"BTS1"' },
];
const call = (title: string, list: unknown[]) => ({ name: 'propose_project_update', args: { id: project.id, title, edits: list } });

const BEFORE = { systemCapacityKWp: 23.56, annualProductionKWh: 39068, energyCoveragePct: 99.3, contractPriceUSD: 25371.12, netInvestmentUSD: 17585.74, year1SavingsUSD: 8418.19, paybackYears: 2.3 };
const AFTER = { systemCapacityKWp: 5.9, annualProductionKWh: 9783.6, energyCoveragePct: 24.9, contractPriceUSD: 13410.18, netInvestmentUSD: 8637.88, year1SavingsUSD: 2108.17, paybackYears: 3.9 };

// 1. Equipos + tarifa tocan el precio: el plan es `guarded`, queda en cola y NO escribe en la propuesta hasta que se confirma.
open();
const probe = probeStore(store, project.id);
assert.deepEqual(engine(), BEFORE, 'punto de partida: caso de referencia con 38 paneles de 620 W');
const planned = await executeForAssistant(call('Equipos y tarifa', edits()), ctx());
assert.equal((planned.data as { status: string }).status, 'pending_confirmation');
assert(planned.action, 'el panel muestra el plan con su botón «Aplicar»');
assert.deepEqual(probe.writes, [['pendingAgentActions']], 'planificar solo encola: una escritura, ninguna a projects');
assert.deepEqual(probe.syncCalls, []);
assert.equal(active().updatedAt, INITIAL_UPDATED_AT, 'planificar no toca updatedAt');
assert.deepEqual(engine(), BEFORE, 'ni cambia el resultado del motor');

// 2. Confirmar aplica el plan: tres escrituras a `projects` (cliente, specs y tarifa, una por sección), cada una con su sincronización.
probe.reset();
const confirmed = store.getState().confirmAgentAction(planned.action.id);
assert.equal(confirmed.success, true);
assert.deepEqual(probe.writes, [['projects'], ['projects'], ['projects'], ['agentActivity'], ['pendingAgentActions']],
  'tres escrituras a projects (una por sección editada: client, specs y rates), luego el registro de actividad y el estado de la cola');
assert.deepEqual(probe.syncCalls, [false, false, false], 'triggerAutoSync(false) tras cada escritura a projects; ninguna sincronización inmediata');
assert.equal(probe.updatedAtStamps.length, 3);
for (const stamp of probe.updatedAtStamps) assert(Date.parse(stamp) > Date.parse(INITIAL_UPDATED_AT), 'cada escritura estampa un updatedAt nuevo');
assert.equal(active().updatedAt, probe.updatedAtStamps.at(-1));
assert.equal(active().createdAt, INITIAL_UPDATED_AT);
assert.deepEqual(engine(), AFTER, 'resultado del motor que commitProjectEdits debe igualar');
const edited = active();
assert.equal(edited.specs.panels?.length, 1);
assert.equal(edited.specs.panels?.[0].id, panel.id);
assert.equal(edited.specs.panels?.[0].count, 10);
assert.equal(edited.specs.inverters?.[0].count, 1);
assert.equal(edited.specs.autoCalculatePanels, false, 'editar paneles apaga el autodimensionado');
assert.equal(edited.client.distributor, 'EDENORTE');
assert.equal(edited.rates.tariffCode, 'BTS1');
assert.equal(edited.specs.pricingMode, 'cost_matrix', 'una edición de precio deja la propuesta en modo catálogo (política automatizada)');
assert.equal(edited.specs.isDetailed, false);
const entry = store.getState().agentActivity[0];
assert.equal(entry.id, confirmed.activityId);
assert.equal(entry.source, 'app-assistant');
assert.equal(entry.kind, 'guarded');
assert.equal(entry.tool, 'propose_project_update');
assert.deepEqual(entry.undo?.fields, ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'], 'el deshacer guarda las seis secciones del proyecto');
assert.equal(store.getState().undoStack.length, 1, 'el historial de Ctrl+Z aún solo tiene la base: la entrada nueva se agrupa 600 ms');
probe.reset();
await settleUndoDebounce();
assert.deepEqual(probe.writes, [['undoStack', 'redoStack', 'canUndo']], 'pasado el agrupado, las tres escrituras son un único paso de Ctrl+Z');
assert.equal(store.getState().undoStack.length, 2);
probe.stop();

// 3. El mismo lote con el modo sin confirmación («guarded: allow») deja exactamente el mismo proyecto y el mismo resultado del motor.
open({ ...DEFAULT_AGENT_POLICY, internal: { read: 'allow', draft: 'allow', guarded: 'allow' } });
const bypassProbe = probeStore(store, project.id);
const bypassed = await executeForAssistant(call('Equipos y tarifa', edits()), ctx());
assert(bypassed.activityId, 'se aplica en el acto y queda registrada');
assert.equal(bypassed.action, undefined, 'sin tarjeta de confirmación');
assert.deepEqual(bypassProbe.writes, [['projects'], ['projects'], ['projects'], ['agentActivity']], 'sin cola: no hay escritura de estado pendiente');
assert.deepEqual(bypassProbe.syncCalls, [false, false, false]);
assert.deepEqual(engine(), AFTER);
for (const section of ['client', 'specs', 'rates', 'financials', 'monthlyConsumption'] as const)
  assert.deepEqual(active()[section], edited[section], `${section} igual con y sin confirmación`);
bypassProbe.stop();

// 4. Una edición que no toca precios es `draft`: con la política por defecto se aplica sin pasar por la cola.
open();
const draftProbe = probeStore(store, project.id);
const live = await executeForAssistant(call('Solo tarifa', edits().filter((e) => e.section !== 'specs')), ctx());
assert(live.activityId);
assert.deepEqual(draftProbe.writes, [['projects'], ['projects'], ['agentActivity']], 'cliente y tarifa: dos escrituras a projects y el registro');
assert.deepEqual(draftProbe.syncCalls, [false, false]);
assert.equal(store.getState().pendingAgentActions.length, 0);
draftProbe.stop();

console.log('PASS: assistant edit characterization: writes, autosync calls, updatedAt stamps and engine result of an equipment + tariff edit.');
