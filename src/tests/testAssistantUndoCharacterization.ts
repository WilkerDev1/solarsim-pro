// F0 (caracterización, sin cambio de comportamiento): los dos deshacer que hoy conviven.
//  (a) el de la actividad del agente (`undoAgentActivity`, por huella de las seis secciones del proyecto);
//  (b) el de Ctrl+Z (`undo`, una única pila que pertenece a la propuesta abierta pero no sabe de qué propuesta es).
// Aquí se fija lo que OCURRE de verdad, también cuando es un fallo. Cada aserción marcada «se invierte en F2a1» describe un
// comportamiento erróneo que esa fase corrige; al corregirlo se cambia la aserción en el mismo PR.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { probeStore, settleUndoDebounce } from './support/storeProbe';

const store = useSimulationStore;
const s = () => store.getState();
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const original = { ...structuredClone(BENCHMARK_PROJECT), id: 'undo-a', syncStatus: 'local_only' as const };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(original)], activeProjectId: '', activeView: 'simulator',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoStack: [], redoStack: [], canUndo: false, canRedo: false,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const coverageEdit = (value: number) => ({ name: 'propose_project_update', args: { id: original.id, title: `Cobertura ${value}`, edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: String(value) }] } });
const ctx = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
const coverageOf = (id: string) => s().projects.find((p) => p.id === id)!.rates.targetCoveragePct;
const nameOf = (id: string) => s().projects.find((p) => p.id === id)!.client.name;

// ── (a) Deshacer la actividad del agente tras una edición manual intermedia ────────────────────────────────────────────────
reset();
s().setActiveProject(original.id, 'simulator');
const agent = await executeForAssistant(coverageEdit(90), ctx());
assert(agent.activityId, 'el borrador del asistente se aplica en vivo y queda en la actividad');
assert.equal(coverageOf(original.id), 90);
await settleUndoDebounce();
// El usuario edita a mano OTRA sección distinta de la que tocó el agente (cliente): la huella cubre las seis secciones.
const personBefore = s().getActiveProject().client.contactPerson;
s().updateClient({ contactPerson: 'Ing. Manual' });
await settleUndoDebounce();
const probe = probeStore(store, original.id);
const refused = s().undoAgentActivity(agent.activityId!);
assert.equal(refused.success, false);
assert.match(refused.error || '', /cambió después; usa el historial de versiones/);
assert.deepEqual(probe.writes, [], 'un deshacer rechazado no escribe nada');
assert.equal(coverageOf(original.id), 90, 'la edición del agente sigue ahí');
assert.equal(s().getActiveProject().client.contactPerson, 'Ing. Manual', 'y la manual también');
assert.equal(s().agentActivity.find((e) => e.id === agent.activityId)?.status, 'applied', 'la entrada no pasa a «undone»: sigue pendiente de decidir');
probe.stop();

// Ctrl+Z revierte la edición manual (la pila tiene la base, el estado del agente y el manual) y entonces la huella vuelve a coincidir.
assert.equal(s().undoStack.length, 3);
s().undo();
assert.equal(s().getActiveProject().client.contactPerson, personBefore, 'la edición manual se revierte');
assert.equal(coverageOf(original.id), 90, 'Ctrl+Z conserva la edición del agente');
const accepted = s().undoAgentActivity(agent.activityId!);
assert.equal(accepted.success, true, 'sin cambios intermedios la huella coincide y el agente se deshace');
assert.notEqual(coverageOf(original.id), 90);
assert.equal(s().agentActivity.find((e) => e.id === agent.activityId)?.status, 'undone');

// La huella solo cubre client, specs, rates, financials, monthlyConsumption y customization: un cambio fuera de ellas (el estado
// de la propuesta) no bloquea el deshacer del agente, y este tampoco lo revierte.
reset();
s().setActiveProject(original.id, 'simulator');
const agent2 = await executeForAssistant(coverageEdit(85), ctx());
s().setProjectStatus(original.id, 'Final');
assert.equal(s().undoAgentActivity(agent2.activityId!).success, true);
assert.equal(s().projects.find((p) => p.id === original.id)?.status, 'Final', 'el estado manual sobrevive al deshacer del agente');
await settleUndoDebounce();

// ── (b) Deshacer entre propuestas: crear o duplicar y pulsar Ctrl+Z ───────────────────────────────────────────────────────
/** La propuesta A abierta y con historial: base + dos ediciones manuales separadas (cobertura 80 y 70). */
async function openWithHistory() {
  reset();
  s().setActiveProject(original.id, 'simulator');
  s().updateRates({ targetCoveragePct: 80 });
  await settleUndoDebounce();
  s().updateRates({ targetCoveragePct: 70 });
  await settleUndoDebounce();
  assert.equal(s().undoStack.length, 3);
  assert.equal(coverageOf(original.id), 70);
}

// Control: abrir otra propuesta con `setActiveProject` reinicia la pila y Ctrl+Z no hace nada. Es lo que crear y duplicar no hacen.
await openWithHistory();
const other = { ...structuredClone(BENCHMARK_PROJECT), id: 'undo-other', syncStatus: 'local_only' as const };
store.setState({ projects: [...s().projects, other] });
s().setActiveProject(other.id, 'simulator');
assert.equal(s().canUndo, false);
assert.equal(s().undoStack.length, 1);
s().undo();
assert.equal(coverageOf(other.id), BENCHMARK_PROJECT.rates.targetCoveragePct, 'abrir otra propuesta: Ctrl+Z no escribe en ella');

// (b1) «Nueva simulación» (createNewProject): activa la propuesta nueva sin sembrar su base en la pila.
await openWithHistory();
s().createNewProject({ name: 'Propuesta nueva' });
const created = s().getActiveProject();
assert.notEqual(created.id, original.id);
assert.equal(created.rates.targetCoveragePct, 95, 'la nueva nace con la cobertura de fábrica');
assert.equal(s().canUndo, true, 'Ctrl+Z sigue habilitado con la pila de OTRA propuesta (se invierte en F2a1: debe quedar deshabilitado)');
assert.equal(s().undoStack.length, 3, 'la pila sigue siendo la de A (se invierte en F2a1: la nueva debe empezar con su propia base)');
s().undo();
// FALLO CONFIRMADO: Ctrl+Z reescribe la propuesta nueva con el contenido de A (cliente completo, tarifas y cobertura).
assert.equal(s().activeProjectId, created.id, 'sigue activa la propuesta nueva');
assert.equal(nameOf(created.id), BENCHMARK_PROJECT.client.name, 'se invierte en F2a1: debe seguir llamándose «Propuesta nueva»');
assert.equal(s().projects.find((p) => p.id === created.id)!.client.projectId, BENCHMARK_PROJECT.client.projectId, 'se invierte en F2a1: hereda el código SP-2024-089 de A');
assert.equal(coverageOf(created.id), 80, 'se invierte en F2a1: recibe la cobertura anterior de A (80), no la suya (95)');
assert.equal(coverageOf(original.id), 70, 'A no se toca');

// (b2) Duplicar: la copia queda activa y el primer Ctrl+Z la sustituye por un estado anterior del original.
await openWithHistory();
const copyId = s().duplicateProject(original.id)!;
assert.equal(s().activeProjectId, copyId);
assert.equal(nameOf(copyId), `${BENCHMARK_PROJECT.client.name} (Copia)`);
assert.equal(coverageOf(copyId), 70, 'la copia nace con el contenido actual del original');
assert.equal(s().canUndo, true, 'se invierte en F2a1: Ctrl+Z debe estar deshabilitado en la copia recién creada');
s().undo();
assert.equal(nameOf(copyId), BENCHMARK_PROJECT.client.name, 'se invierte en F2a1: la copia pierde «(Copia)» y su nombre');
assert.equal(s().projects.find((p) => p.id === copyId)!.client.projectId, BENCHMARK_PROJECT.client.projectId, 'se invierte en F2a1: duplica el código del original');
assert.equal(coverageOf(copyId), 80, 'se invierte en F2a1: recibe un estado anterior del original');
assert.equal(coverageOf(original.id), 70, 'el original no se toca');

// (b3) Asistente de propuestas (`applyExtractedInvoice` con propuesta nueva): mismo patrón, sin base propia.
await openWithHistory();
const draft = normalizeProposalDraft({ clientName: 'Desde factura', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: null, marginOnSalePct: null, installationUnitPriceUSD: null, installationTotalUSD: null, customItems: [], customDiscounts: [] } },
catalog, { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(s().tariffMatrix) });
s().applyExtractedInvoice(draft, true);
const fromInvoice = s().getActiveProject();
assert.equal(fromInvoice.client.name, 'Desde factura');
assert.equal(s().canUndo, true, 'se invierte en F2a1: Ctrl+Z debe estar deshabilitado');
s().undo();
assert.equal(nameOf(fromInvoice.id), BENCHMARK_PROJECT.client.name, 'se invierte en F2a1: la propuesta de la factura recibe el cliente de A');
assert.equal(coverageOf(fromInvoice.id), 80, 'se invierte en F2a1');

// (b4) El agente crea con `create_proposal` sin activar la propuesta (invariante «los agentes no navegan»): no hay Ctrl+Z cruzado.
await openWithHistory();
const made = await executeForAssistant({ name: 'create_proposal', args: { clientName: 'Del agente', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ catalogItemId: panel.id, count: 12 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, ctx());
const madeId = (made.data as { proposalId: string }).proposalId;
assert.equal(s().activeProjectId, original.id, 'crear con el agente no cambia la propuesta abierta');
s().undo();
assert.equal(coverageOf(original.id), 80, 'Ctrl+Z sigue actuando sobre la propuesta abierta (A)');
assert.equal(nameOf(madeId), 'Del agente', 'y la creada por el agente no se toca');
// (b5) Deshacer la creación desde la actividad la manda a la papelera (op `trash`), no es una entrada de la pila.
assert.equal(s().undoAgentActivity(made.activityId!).success, true);
assert.equal(s().projects.find((p) => p.id === madeId)?.isDeleted, true);

console.log('PASS: undo characterization: agent undo fingerprint conflict and Ctrl+Z across proposals (create, duplicate, invoice draft).');
