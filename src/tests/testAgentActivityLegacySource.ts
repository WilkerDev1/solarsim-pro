// F6 (criterio de aceptación): la actividad que dejó el asistente de propuestas (el modal retirado) se sigue mostrando.
//
// Las instalaciones que actualizan traen entradas de `agentActivity` con la fuente `proposal-assistant` y la herramienta
// `apply_proposal_draft`, en las dos formas que escribía el modal al pulsar «Aplicar»:
//  · crear: deshacer = `trash` (la propuesta creada se manda a la papelera);
//  · actualizar la propuesta abierta: deshacer = restaurar las secciones y `aiSource` (huella tomada justo después).
// Nada de eso se puede romper al borrar el modal: la entrada se hidrata sin lanzar (estado guardado y archivo del espacio de
// trabajo), se lista con su etiqueta «anterior» y, si sigue siendo coherente con la propuesta, se deshace como siempre.
// El tipo `proposal-assistant` y su etiqueta se conservan solo para leer el historial: ya nada ejecuta con esa fuente.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY, type AgentActivityEntry } from '../store/slices/agentSlice';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { captureWorkspace, changeWorkspace } from '../store/sync/organizationWorkspace';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { agentSourceLabel, listAgentActivity } from '../features/agentTools/activityList';
import type { SimulationStore } from '../store/types';

const store = useSimulationStore;
const s = () => store.getState();
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'legacy-activity-p', syncStatus: 'local_only' as const };
const SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'];
const fields = [...SECTIONS, 'aiSource'];
const pick = (source: object, keys: string[]) => Object.fromEntries(keys.map((k) => [k, structuredClone((source as Record<string, unknown>)[k])]));
const fingerprint = (value: unknown) => JSON.stringify(value ?? null);

// Lo que el modal dejó al «Aplicar» una actualización: antes de cambiar la propuesta y la huella de después.
const before = pick(project, fields);
const changed = { ...structuredClone(project), rates: { ...project.rates, targetCoveragePct: 63 } };
const after = pick(changed, fields);

const legacyUpdate: AgentActivityEntry = {
  id: 'legacy-update', at: '2026-10-01T10:00:00.000Z', source: 'proposal-assistant', tool: 'apply_proposal_draft', kind: 'draft',
  targetType: 'project', targetId: project.id, title: `Actualizar ${project.client.name}`,
  changes: [{ label: 'Cliente', value: project.client.name }, { label: 'Modalidad', value: 'Simple (Catálogo IA) · matriz de costos' }],
  status: 'applied', undo: { before, fields, afterFingerprint: fingerprint(after) },
};
const legacyCreate: AgentActivityEntry = {
  id: 'legacy-create', at: '2026-10-01T09:00:00.000Z', source: 'proposal-assistant', tool: 'apply_proposal_draft', kind: 'draft',
  targetType: 'project', targetId: 'legacy-created', title: 'Crear propuesta para Hotel Legado',
  changes: [{ label: 'Cliente', value: 'Hotel Legado' }, { label: 'Modalidad', value: 'Simple (Catálogo IA) · matriz de costos' }],
  status: 'applied', undo: { op: 'trash', before: {}, afterFingerprint: '' },
};
const legacyUndone: AgentActivityEntry = { ...legacyCreate, id: 'legacy-undone', status: 'undone', undo: undefined };
const appEntry: AgentActivityEntry = { ...legacyCreate, id: 'app-1', source: 'app-assistant', tool: 'create_proposal', title: 'Crear propuesta nueva' };
const mcpEntry: AgentActivityEntry = { ...legacyCreate, id: 'mcp-1', source: 'mcp', clientLabel: 'codex', tool: 'create_proposal', title: 'Crear por MCP' };
// Lo que queda en disco: JSON no guarda los `undefined` (por eso la entrada lleva `fields`).
const onDisk = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const ACTIVITY = [appEntry, legacyUpdate, mcpEntry, legacyCreate, legacyUndone];

const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(changed), { ...structuredClone(project), id: 'legacy-created', client: { ...project.client, name: 'Hotel Legado' } }],
  activeProjectId: project.id, sessionGeneration: 0, clients: [], agentPolicy: structuredClone(DEFAULT_AGENT_POLICY),
  agentActivity: structuredClone(ACTIVITY), pendingAgentActions: [],
  syncSettings: { ...s().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});

// 1. Etiquetas: la entrada antigua se nombra «anterior»; las demás fuentes no cambian.
assert.equal(agentSourceLabel('proposal-assistant'), 'Asistente de propuestas (anterior)');
assert.equal(agentSourceLabel('app-assistant'), 'Asistente general');
assert.equal(agentSourceLabel('mcp'), 'Agente externo');
// Una fuente que esta versión no conoce (un estado guardado por una versión futura) no rompe el listado.
assert.equal(typeof agentSourceLabel('otro-origen' as never), 'string');
assert.ok(agentSourceLabel('otro-origen' as never).length > 0);

// 2. Estado guardado: serializar, pasar por JSON (como el disco) e hidratar no pierde ni cambia la actividad antigua.
reset();
const saved = JSON.parse(JSON.stringify(serializeSimulationStore(s()))) as SimulationStore;
assert.doesNotThrow(() => hydrateSimulationStore(saved));
assert.deepEqual(saved.agentActivity.map((a) => a.id), ACTIVITY.map((a) => a.id), 'ninguna entrada se descarta al hidratar');
assert.deepEqual(saved.agentActivity.find((a) => a.id === 'legacy-update'), onDisk(legacyUpdate), 'la entrada antigua llega intacta');
assert.deepEqual(saved.agentActivity.find((a) => a.id === 'legacy-create'), onDisk(legacyCreate));

// 3. Listado: con su etiqueta, en el filtro de los asistentes de la aplicación y nunca en el de agentes externos.
const rows = listAgentActivity(saved.agentActivity, 'all');
assert.deepEqual(rows.map((r) => r.entry.id), ACTIVITY.map((a) => a.id));
const legacyRow = rows.find((r) => r.entry.id === 'legacy-update')!;
assert.equal(legacyRow.sourceLabel, 'Asistente de propuestas (anterior)');
assert.equal(legacyRow.targetLabel, 'Propuesta');
assert.deepEqual(listAgentActivity(saved.agentActivity, 'internal').map((r) => r.entry.id), ['app-1', 'legacy-update', 'legacy-create', 'legacy-undone']);
assert.deepEqual(listAgentActivity(saved.agentActivity, 'mcp').map((r) => r.entry.id), ['mcp-1']);
assert.equal(listAgentActivity(Array.from({ length: 150 }, (_, i) => ({ ...legacyCreate, id: `n${i}` })), 'all').length, 100, 'el panel muestra como mucho 100');
assert.deepEqual(listAgentActivity([], 'all'), []);

// 4. El archivo del espacio de trabajo (cambiar de organización y volver) conserva la actividad antigua.
reset();
const session = s().syncSettings;
const archive = captureWorkspace(s());
assert.deepEqual(archive.agentActivity?.map((a) => a.id), ACTIVITY.map((a) => a.id));
const away = changeWorkspace(s(), { ...session, serverUrl: 'https://otra.invalid', authToken: 'x', currentUser: { id: 'u', organizationId: 'org-x', role: 'ADMIN', email: 'qa@example.invalid', name: 'QA' } as never });
assert.deepEqual(away.agentActivity, [], 'el otro espacio empieza sin actividad');
store.setState(away as Partial<SimulationStore>);
const back = changeWorkspace(s(), session);
assert.deepEqual(back.agentActivity?.map((a) => a.id), ACTIVITY.map((a) => a.id), 'al volver, la actividad antigua sigue ahí');
assert.deepEqual(back.agentActivity?.find((a) => a.id === 'legacy-update'), legacyUpdate, 'la entrada vuelve tal cual (en memoria)');

// 5. Deshacer sigue funcionando con la entrada antigua: restaura las secciones y `aiSource`; crear va a la papelera.
reset();
const undoUpdate = s().undoAgentActivity('legacy-update');
assert.deepEqual(undoUpdate, { success: true }, JSON.stringify(undoUpdate));
assert.equal(s().projects.find((p) => p.id === project.id)!.rates.targetCoveragePct, project.rates.targetCoveragePct, 'el cambio del modal se deshace');
assert.equal(s().agentActivity.find((a) => a.id === 'legacy-update')!.status, 'undone');
const undoCreate = s().undoAgentActivity('legacy-create');
assert.deepEqual(undoCreate, { success: true }, JSON.stringify(undoCreate));
assert.equal(s().projects.find((p) => p.id === 'legacy-created')!.isDeleted, true, 'la propuesta creada por el modal va a la papelera');
// Una entrada cuya propuesta cambió después no se deshace a ciegas (la huella manda, como siempre).
reset();
store.setState((state) => ({ projects: state.projects.map((p) => (p.id === project.id ? { ...p, rates: { ...p.rates, targetCoveragePct: 12 } } : p)) }));
const stale = s().undoAgentActivity('legacy-update');
assert.equal(stale.success, false);
assert.match(stale.error || '', /cambió después/);

// 6. Nada ejecuta con la fuente antigua: la herramienta que aplicaba el borrador ya no existe, ni siquiera con la fuente de antes.
reset();
const ctx = { source: 'proposal-assistant' as const, owner: assistantOwner() };
const retired = await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: {}, createNew: true } }, ctx);
assert.equal(retired.status, 'error');
assert.equal((retired as { code: string }).code, 'unknown_tool');
const retiredRead = await executeAgentTool({ name: 'search_projects', args: { query: '' } }, ctx);
assert.equal(retiredRead.status, 'error', 'la fuente antigua es solo de lectura del historial: tampoco consulta');
assert.equal((retiredRead as { code: string }).code, 'unknown_tool');
assert.equal(s().projects.length, 2, 'nada se creó ni se tocó');

console.log('PASS: la actividad antigua del asistente de propuestas se hidrata, se lista con su etiqueta, se deshace y nada ejecuta ya con esa fuente.');
