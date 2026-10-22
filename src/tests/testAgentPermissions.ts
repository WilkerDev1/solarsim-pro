import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY, normalizeAgentPolicy } from '../store/slices/agentSlice';
import { executeAgentTool, executeForAssistant } from '../features/agentTools/registry';
import { AssistantRunError, runAssistant } from '../features/assistant/service';
import type { GeminiTransport } from '../../shared/geminiTransport';
import { assistantOwner } from '../features/assistant/tools';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { captureWorkspace, emptyWorkspace } from '../store/sync/organizationWorkspace';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'agent-perm', syncStatus: 'local_only' as const };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
  equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
reset();
const coverage = (value: number) => ({ name: 'propose_project_update', args: { id: project.id, title: `Cobertura ${value}`, edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: String(value) }] } });
const internal = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
const external = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' });

// 1. Defaults follow the user's decision: reads free, drafts applied with undo, guarded changes confirmed. Guarded can never be "allow".
assert.deepEqual(DEFAULT_AGENT_POLICY.internal, { read: 'allow', draft: 'allow', guarded: 'confirm' });
assert.deepEqual(DEFAULT_AGENT_POLICY.external, { read: 'allow', draft: 'allow', guarded: 'confirm' });
assert.equal(normalizeAgentPolicy({ external: { read: 'allow', draft: 'allow', guarded: 'allow' } } as any).external.guarded, 'confirm');
assert.equal(normalizeAgentPolicy(undefined).internal.draft, 'allow');

// 2. Draft tool applies immediately and is recorded with an undo entry.
const applied = await executeAgentTool(coverage(90), external());
assert(applied.status === 'applied', JSON.stringify(applied));
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 90);
const entry = store.getState().agentActivity[0];
assert.equal(entry.id, applied.activityId);
assert.equal(entry.source, 'mcp');
assert.equal(entry.clientLabel, 'claude-code');
assert.equal(entry.status, 'applied');

// 3. Undo restores the touched sections; a second undo is refused.
assert.equal(store.getState().undoAgentActivity(entry.id).success, true);
assert.notEqual(store.getState().getActiveProject().rates.targetCoveragePct, 90);
assert.equal(store.getState().agentActivity[0].status, 'undone');
assert.equal(store.getState().undoAgentActivity(entry.id).success, false);

// 4. Undo is refused when the proposal changed afterwards (points to version history instead).
const again = await executeAgentTool(coverage(85), internal());
assert(again.status === 'applied');
store.getState().updateRates({ targetCoveragePct: 70 });
const refused = store.getState().undoAgentActivity(again.activityId);
assert.equal(refused.success, false);
assert.match(refused.error || '', /historial/);
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 70);

// 5. Draft policy "confirm" → pending; confirming applies and records; rejecting does nothing.
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'confirm', guarded: 'confirm' } });
const pending = await executeAgentTool(coverage(60), external());
assert(pending.status === 'pending_confirmation');
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 70, 'pending never mutates');
assert.equal(store.getState().pendingAgentActions[0].status, 'pending');
const confirmed = store.getState().confirmAgentAction(pending.actionId);
assert.equal(confirmed.success, true);
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 60);
assert.equal(store.getState().pendingAgentActions.find((a) => a.id === pending.actionId)?.status, 'applied');
const pending2 = await executeAgentTool(coverage(55), external());
assert(pending2.status === 'pending_confirmation');
store.getState().rejectAgentAction(pending2.actionId);
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 60);
assert.equal(store.getState().confirmAgentAction(pending2.actionId).success, false, 'rejected plans cannot be confirmed later');

// 6. Status tool lets an external agent learn the decision.
const status = await executeAgentTool({ name: 'get_agent_action_status', args: { actionId: pending.actionId } }, external());
assert(status.status === 'ok');
assert.equal((status.data as { status: string }).status, 'applied');

// 7. Guarded tools always wait for confirmation, even from the internal assistant.
const panel = store.getState().equipmentCatalog.find((e) => e.type === 'panel')!;
const guarded = await executeAgentTool({ name: 'propose_equipment_update', args: { id: panel.id, edits: [{ section: 'equipment', field: 'displayName', valueJson: '"Panel QA"' }] } }, internal());
assert(guarded.status === 'pending_confirmation');
assert.notEqual(store.getState().equipmentCatalog.find((e) => e.id === panel.id)?.displayName, 'Panel QA');
assert.equal(store.getState().confirmAgentAction(guarded.actionId).success, true);
assert.equal(store.getState().equipmentCatalog.find((e) => e.id === panel.id)?.displayName, 'Panel QA');
const equipmentEntry = store.getState().agentActivity[0];
assert.equal(equipmentEntry.targetType, 'equipment');
assert.equal(store.getState().undoAgentActivity(equipmentEntry.id).success, true);
assert.equal(store.getState().equipmentCatalog.find((e) => e.id === panel.id)?.displayName, panel.displayName);

// 8. Deny blocks the tool kind entirely.
store.getState().setAgentPolicy({ external: { read: 'deny', draft: 'deny', guarded: 'deny' } });
const denied = await executeAgentTool({ name: 'search_projects', args: {} }, external());
assert(denied.status === 'error' && denied.code === 'denied');
assert.equal((await executeAgentTool({ name: 'search_projects', args: {} }, internal())).status, 'ok', 'policies are per source');

// 9. Readers never mutate, whatever the policy.
reset();
store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
  currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as any } });
const reader = await executeAgentTool(coverage(50), internal());
assert.equal(reader.status, 'error');

// 10. Persistence: policy is device-level; activity belongs to the workspace and is capped.
reset();
for (let i = 0; i < 305; i++) store.getState().recordAgentActivity({ source: 'app-assistant', tool: 'x', kind: 'draft', targetType: 'project', targetId: 'p', title: `#${i}`, changes: [] });
assert.equal(store.getState().agentActivity.length, 300);
assert.equal(store.getState().agentActivity[0].title, '#304', 'newest first');
const persisted = serializeSimulationStore(store.getState());
assert.deepEqual(persisted.agentPolicy, store.getState().agentPolicy);
assert.equal(persisted.agentActivity.length, 300);
assert.equal(captureWorkspace(store.getState()).agentActivity?.length, 300);
assert.deepEqual(emptyWorkspace().agentActivity, []);
assert.equal((persisted as Record<string, unknown>).pendingAgentActions, undefined, 'pending plans are never persisted');

// 11. Undo revalidates today's permissions: a reader keeps "Deshacer" visible but cannot use it.
reset();
const readerUndo = await executeAgentTool(coverage(77), internal());
assert(readerUndo.status === 'applied');
store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
  currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as any } });
assert.equal(store.getState().undoAgentActivity(readerUndo.activityId).success, false);
assert.equal(store.getState().agentActivity[0].status, 'applied', 'activity unchanged when permission is denied');
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 77);

// 12. Undo survives JSON persistence when the agent filled a previously absent field.
reset();
const bare = store.getState().equipmentCatalog.find((e) => e.type === 'panel')!;
store.getState().updateEquipmentItem(bare.id, { cellType: undefined });
const filled = await executeAgentTool({ name: 'propose_equipment_update', args: { id: bare.id, edits: [{ section: 'equipment', field: 'cellType', valueJson: '"N-Type"' }] } }, internal());
assert(filled.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(filled.actionId).success, true);
store.setState({ agentActivity: JSON.parse(JSON.stringify(store.getState().agentActivity)) });
assert.equal(store.getState().undoAgentActivity(store.getState().agentActivity[0].id).success, true);
assert.equal(store.getState().equipmentCatalog.find((e) => e.id === bare.id)?.cellType, undefined);

// 13. Evicted or unknown plans cannot be confirmed (no direct-apply fallback).
assert.equal(store.getState().confirmAgentAction('evicted-plan').success, false);

// 14. External agents work with the general assistant switched off, including confirmation.
reset();
store.setState({ appAssistantEnabled: false });
const offRead = await executeAgentTool({ name: 'search_projects', args: {} }, external());
assert.equal(offRead.status, 'ok');
const offEdit = await executeAgentTool(coverage(66), external());
assert(offEdit.status === 'applied', JSON.stringify(offEdit));
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'confirm', guarded: 'confirm' } });
const offPending = await executeAgentTool(coverage(64), external());
assert(offPending.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(offPending.actionId).success, true);
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 64);
assert.equal((await executeAgentTool({ name: 'search_projects', args: {} }, internal())).status, 'error', 'the in-app assistant still honours its switch');

// 15. A model failure after an applied change still reports it with its undo card.
reset();
let round = 0;
const failingAfterApply: GeminiTransport = async () => (round++ === 0
  ? { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ functionCall: { name: 'propose_project_update', args: { id: project.id, title: 'Cobertura 81', edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: '81' }] } } }] } }] }
  : { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '...' }] } }] });
const runOwner = assistantOwner();
await assert.rejects(
  () => runAssistant({ apiKey: 'synthetic', model: 'synthetic', prompt: 'Cobertura 81', history: [], signal: new AbortController().signal, transport: failingAfterApply,
    execute: (call) => executeForAssistant(call, { source: 'app-assistant', owner: runOwner }) }),
  (error: unknown) => error instanceof AssistantRunError && error.applied.length === 1 && /ya se aplicaron/.test(error.message)
);
assert.equal(store.getState().getActiveProject().rates.targetCoveragePct, 81);

console.log('PASS: agent policy (read/draft/guarded × source), immediate drafts with undo, confirmations, status tool, readers and persistence.');
