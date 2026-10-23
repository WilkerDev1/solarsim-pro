// A queued action is confirmed later: confirming re-checks today's policy, and the confirmation card names the real target.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool, executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'queued-p', syncStatus: 'local_only' as const };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, sessionGeneration: 0,
  clients: [], agentPolicy: structuredClone(DEFAULT_AGENT_POLICY), agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const ctxs = { mcp: () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'codex' }), 'app-assistant': () => ({ source: 'app-assistant' as const, owner: assistantOwner() }) };
const keys = { mcp: 'external', 'app-assistant': 'internal' } as const;
const setPolicy = (source: 'mcp' | 'app-assistant', draft: 'allow' | 'confirm' | 'deny', guarded: 'allow' | 'confirm' | 'deny') =>
  store.getState().setAgentPolicy({ [keys[source]]: { read: 'allow', draft, guarded } });
const trashed = () => !!store.getState().projects.find((p) => p.id === project.id)?.isDeleted;
const trash = { name: 'move_proposal_to_trash', args: { id: project.id } };
const createClient = { name: 'create_client', args: { name: 'Cliente Cola' } };

for (const source of ['mcp', 'app-assistant'] as const) {
  // 1. queue (guarded) -> deny -> confirm: rejected, nothing changes, the action is no longer pending.
  reset(); setPolicy(source, 'confirm', 'confirm');
  const queued = await executeAgentTool(trash, ctxs[source]());
  assert(queued.status === 'pending_confirmation', JSON.stringify(queued));
  setPolicy(source, 'confirm', 'deny');
  const denied = store.getState().confirmAgentAction((queued as { actionId: string }).actionId);
  assert.equal(denied.success, false);
  assert.match(denied.error || '', /permisos/);
  assert.equal(trashed(), false);
  assert.equal(store.getState().agentActivity.length, 0);
  assert.notEqual(store.getState().pendingAgentActions[0].status, 'pending');
  assert.equal(store.getState().confirmAgentAction((queued as { actionId: string }).actionId).success, false);

  // 2. draft queued -> draft denied -> confirm: rejected too.
  reset(); setPolicy(source, 'confirm', 'confirm');
  const draft = await executeAgentTool(createClient, ctxs[source]());
  assert(draft.status === 'pending_confirmation', JSON.stringify(draft));
  setPolicy(source, 'deny', 'confirm');
  assert.equal(store.getState().confirmAgentAction((draft as { actionId: string }).actionId).success, false);
  assert.equal(store.getState().clients.length, 0);

  // 3. queue -> still confirm / allow / bypass -> confirm applies (the human is confirming).
  for (const [d, g] of [['confirm', 'confirm'], ['allow', 'allow'], ['allow', 'confirm']] as const) {
    reset(); setPolicy(source, 'confirm', 'confirm');
    const again = await executeAgentTool(trash, ctxs[source]());
    assert(again.status === 'pending_confirmation');
    setPolicy(source, d, g);
    const ok = store.getState().confirmAgentAction((again as { actionId: string }).actionId);
    assert(ok.success, JSON.stringify(ok));
    assert.equal(trashed(), true);
  }

  // 4. The account loses write access while the action waits.
  reset(); setPolicy(source, 'confirm', 'confirm');
  const waiting = await executeAgentTool(trash, ctxs[source]());
  store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
    currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as any } });
  assert.equal(store.getState().confirmAgentAction((waiting as { actionId: string }).actionId).success, false);
  assert.equal(trashed(), false);
}

// 5. Confirmation copy matches the real target of a native plan.
reset(); setPolicy('app-assistant', 'confirm', 'confirm');
const created = await executeAgentTool(createClient, ctxs['app-assistant']());
store.getState().confirmAgentAction((created as { actionId: string }).actionId);
const target = store.getState().clients[0];
const delClient = await executeForAssistant({ name: 'delete_client', args: { id: target.id } }, ctxs['app-assistant']());
assert(delClient.action, 'a confirmable action is returned');
assert.equal(delClient.action.targetType, 'client');
assert.match(delClient.action.impact || '', /directorio de clientes/);
assert.doesNotMatch(delClient.action.impact || '', /propuesta|simulador/i);
const trashCard = await executeForAssistant(trash, ctxs['app-assistant']());
assert.equal(trashCard.action?.targetType, 'project');
assert.doesNotMatch(trashCard.action?.impact || '', /simulador/i);
reset(); setPolicy('app-assistant', 'confirm', 'confirm');
const template = await executeForAssistant({ name: 'save_document_text_to_company_template', args: { proposalId: project.id } }, ctxs['app-assistant']()).catch(() => undefined);
if (template?.action) assert.match(template.action.impact || '', /plantilla/);

console.log('testAgentQueuedPolicy: ok');
