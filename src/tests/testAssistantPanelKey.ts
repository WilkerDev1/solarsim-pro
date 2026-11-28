// F0 (caracterización) → F5b: la lógica de montaje del panel del asistente como funciones puras (sin DOM simulado, decisión
// del plan). La clave del panel (`assistantPanelKey`) decide cuándo React remonta `AssistantPanel`. Hasta F4 remontar abortaba
// el turno y vaciaba la conversación; desde F4 ambos viven en la sesión fuera de React. F5b invierte lo que quedaba: la clave
// es solo el espacio de trabajo y la sesión (`owner`), así abrir o crear otra propuesta ya no remonta el panel.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { assistantOwner } from '../features/assistant/tools';
import { assistantPanelKey, assistantProjectId, assistantVisibleIn } from '../features/assistant/assistantScope';

// 1. Forma de la clave: solo el espacio de trabajo y la sesión (invertido en F5b: antes llevaba la propuesta abierta).
assert.equal(assistantPanelKey('local|0'), 'assistant|local|0');
assert.equal(assistantPanelKey.length, 1, 'la clave ya no recibe la propuesta');
assert.notEqual(assistantPanelKey('local|0'), assistantPanelKey('local|1'), 'otra sesión (sessionGeneration) remonta el panel');
assert.notEqual(assistantPanelKey('local|0'), assistantPanelKey('https://x.invalid|org|0'), 'otro espacio de trabajo remonta el panel');

// 2. Dónde aparece el panel y qué propuesta considera abierta. F5b: en TODAS las vistas de trabajo (antes solo en cuatro),
// salvo las que la organización oculta (cotizaciones apagadas) y lo que no es una vista de la app.
const WORK_VIEWS = ['dashboard', 'simulator', 'pdf-preview', 'project-hub', 'companies-hub', 'clients-hub', 'quotations-hub', 'quotation-editor', 'quotation-library'];
for (const view of WORK_VIEWS) assert.equal(assistantVisibleIn(view), true, `${view}: el asistente está disponible`);
for (const view of ['quotations-hub', 'quotation-editor', 'quotation-library']) assert.equal(assistantVisibleIn(view, { quotations: false }), false, `${view}: oculta por la organización, el asistente tampoco aparece ahí`);
for (const view of ['simulator', 'clients-hub', 'dashboard']) assert.equal(assistantVisibleIn(view, { quotations: false }), true, `${view}: ocultar cotizaciones no quita el asistente del resto`);
for (const view of ['settings', 'catalog', 'quotations']) assert.equal(assistantVisibleIn(view), false, `${view}: no es una vista de la app`);
assert.equal(assistantProjectId('simulator', 'p-1'), 'p-1');
assert.equal(assistantProjectId('project-hub', 'p-1'), 'p-1');
assert.equal(assistantProjectId('pdf-preview', 'p-1'), 'p-1');
assert.equal(assistantProjectId('dashboard', 'p-1'), undefined, 'en el panel general no hay propuesta abierta aunque exista una activa');
assert.equal(assistantProjectId('simulator', ''), undefined);

// 3. Con el store real: abrir o crear una propuesta desde el panel general NO cambia la clave (invertido en F5b: el panel no
// se remonta; la conversación y el turno ya vivían en la sesión desde F4).
const store = useSimulationStore;
const a = { ...structuredClone(BENCHMARK_PROJECT), id: 'key-a', syncStatus: 'local_only' as const };
store.setState({ appAssistantEnabled: true, workspaceScope: 'local', projects: [a], activeProjectId: a.id, activeView: 'dashboard', sessionGeneration: 0,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const keyNow = () => assistantPanelKey(assistantOwner());
const onDashboard = keyNow();
store.getState().setActiveProject(a.id, 'simulator');
const onProposalA = keyNow();
assert.equal(onProposalA, onDashboard, 'abrir una propuesta desde el panel general no remonta el panel');
store.getState().setActiveView('project-hub');
assert.equal(keyNow(), onProposalA, 'cambiar de vista dentro de la misma propuesta no lo remonta');
store.getState().createNewProject('Propuesta nueva');
assert.equal(keyNow(), onProposalA, 'crear una propuesta (que se activa) no remonta el panel');
store.getState().setActiveView('clients-hub');
assert.equal(keyNow(), onDashboard, 'ir a otra vista de trabajo tampoco');
store.setState({ sessionGeneration: 1 });
assert.notEqual(keyNow(), onDashboard, 'sessionGeneration forma parte del owner y de la clave');
assert.match(keyNow(), /\|1$/);

console.log('PASS: assistant panel key (only workspace/session) and visibility in every work view, as pure functions.');
