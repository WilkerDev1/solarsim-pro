// F0 (caracterización): la lógica de montaje del panel flotante como funciones puras (sin DOM simulado, decisión del plan).
// La clave del panel (`assistantPanelKey`) decide cuándo React remonta `AssistantPanel`: remontar aborta el turno en curso y
// vacía la conversación (estado local de `useAppAssistant`). Hoy la clave cambia al abrir o crear otra propuesta.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { assistantOwner } from '../features/assistant/tools';
import { assistantPanelKey, assistantProjectId, assistantVisibleIn } from '../features/assistant/assistantScope';

// 1. Forma de la clave: espacio de trabajo y sesión, y la propuesta abierta o «global».
assert.equal(assistantPanelKey('local|0', 'p-1'), 'local|0|p-1');
assert.equal(assistantPanelKey('local|0'), 'local|0|global');
assert.equal(assistantPanelKey('local|0', ''), 'local|0|global');
assert.notEqual(assistantPanelKey('local|0', 'p-1'), assistantPanelKey('local|1', 'p-1'), 'otra sesión (sessionGeneration) remonta el panel');
assert.notEqual(assistantPanelKey('local|0', 'p-1'), assistantPanelKey('https://x.invalid|org|0', 'p-1'), 'otro espacio de trabajo remonta el panel');

// 2. Dónde aparece el panel y qué propuesta considera abierta.
for (const view of ['simulator', 'project-hub', 'pdf-preview', 'dashboard']) assert.equal(assistantVisibleIn(view), true, view);
for (const view of ['settings', 'catalog', 'quotations']) assert.equal(assistantVisibleIn(view), false, `${view}: el panel no se monta (AppAssistant devuelve null y se desmonta la conversación)`);
assert.equal(assistantProjectId('simulator', 'p-1'), 'p-1');
assert.equal(assistantProjectId('project-hub', 'p-1'), 'p-1');
assert.equal(assistantProjectId('pdf-preview', 'p-1'), 'p-1');
assert.equal(assistantProjectId('dashboard', 'p-1'), undefined, 'en el panel general no hay propuesta abierta aunque exista una activa');
assert.equal(assistantProjectId('simulator', ''), undefined);

// 3. Con el store real: abrir o crear una propuesta desde el panel general CAMBIA la clave (se remonta el panel y se pierde la conversación).
// Se invierte en F5b: la conversación pasará a vivir fuera del árbol con clave y sobrevivirá a abrir la propuesta que el propio asistente crea.
const store = useSimulationStore;
const a = { ...structuredClone(BENCHMARK_PROJECT), id: 'key-a', syncStatus: 'local_only' as const };
store.setState({ appAssistantEnabled: true, workspaceScope: 'local', projects: [a], activeProjectId: a.id, activeView: 'dashboard', sessionGeneration: 0,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const keyNow = () => {
  const { activeView, activeProjectId } = store.getState();
  return assistantPanelKey(assistantOwner(), assistantProjectId(activeView, activeProjectId));
};
const onDashboard = keyNow();
assert.match(onDashboard, /\|global$/);
store.getState().setActiveProject(a.id, 'simulator');
const onProposalA = keyNow();
assert.notEqual(onProposalA, onDashboard, 'abrir una propuesta desde el panel general remonta el panel');
store.getState().setActiveView('project-hub');
assert.equal(keyNow(), onProposalA, 'cambiar de vista dentro de la misma propuesta no lo remonta');
store.getState().createNewProject('Propuesta nueva');
assert.notEqual(keyNow(), onProposalA, 'crear una propuesta (que se activa) remonta el panel');
store.setState({ sessionGeneration: 1 });
assert.match(keyNow(), /\|1\|/, 'sessionGeneration forma parte del owner y de la clave');

console.log('PASS: assistant panel key and visibility rules as pure functions (current behavior).');
