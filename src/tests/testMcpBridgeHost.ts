import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { connectMcpBridge } from '../features/agentTools/mcpBridge';
import type { ElectronMcpApi, McpInvokeMessage, McpRendererSnapshot } from '../../shared/agentTools/bridge';
import type { AgentToolOutcome } from '../../shared/agentTools/types';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'mcp-host', syncStatus: 'local_only' as const };
store.setState({
  workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});

// Fake preload API: records what the renderer announces and answers.
let invoke: (message: McpInvokeMessage) => void = () => {};
let unsubscribed = 0;
const ready: McpRendererSnapshot[] = [];
const responses: { requestId: string; outcome: AgentToolOutcome }[] = [];
const api: ElectronMcpApi = {
  getStatus: async () => { throw new Error('unused'); },
  setEnabled: async () => { throw new Error('unused'); },
  regenerateToken: async () => { throw new Error('unused'); },
  copyToken: async () => true,
  onInvoke: (callback) => { invoke = callback; return () => { unsubscribed++; }; },
  respond: (requestId, outcome) => { responses.push({ requestId, outcome }); },
  ready: (snapshot) => { ready.push(snapshot); },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

const dispose = connectMcpBridge(api);

// Announces exactly the tools the device policy exposes to external agents.
assert.equal(ready.length, 1);
const names = ready[0].tools.map((t) => t.name);
assert(names.includes('search_projects') && names.includes('create_proposal'));
assert(!names.includes('apply_proposal_draft'), 'internal-only tools are never exposed to MCP');
assert(ready[0].tools.every((t) => t.surfaces.includes('mcp')));

// Calls run through executeAgentTool as source "mcp", keep the client label and answer by request id.
invoke({ requestId: 'r1', call: { name: 'search_projects', args: {} }, clientLabel: 'claude-code' });
await settle();
assert.equal(responses[0].requestId, 'r1');
assert.equal(responses[0].outcome.status, 'ok');
const coverage = { name: 'propose_project_update', args: { id: project.id, title: 'Cobertura', edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: '88' }] } };
invoke({ requestId: 'r2', call: coverage, clientLabel: 'codex' });
await settle();
assert.equal(responses[1].outcome.status, 'applied');
assert.equal(store.getState().agentActivity[0].source, 'mcp');
assert.equal(store.getState().agentActivity[0].clientLabel, 'codex');

// Guarded changes answer immediately with a pending action; policy denial and bad arguments are plain errors.
const panel = store.getState().equipmentCatalog.find((e) => e.type === 'panel')!;
invoke({ requestId: 'r3', call: { name: 'propose_equipment_update', args: { id: panel.id, edits: [{ section: 'equipment', field: 'displayName', valueJson: '"X"' }] } } });
await settle();
assert.equal(responses[2].outcome.status, 'pending_confirmation');
invoke({ requestId: 'r4', call: { name: 'search_projects', args: { limit: 'many' } } });
await settle();
assert(responses[3].outcome.status === 'error' && responses[3].outcome.code === 'invalid_arguments');
invoke({ requestId: 'r5', call: { name: 'apply_proposal_draft', args: {} } });
await settle();
assert(responses[4].outcome.status === 'error' && responses[4].outcome.code === 'unknown_tool');

// A policy change republishes the tool list; unrelated updates do not.
const before = ready.length;
store.setState({ activeView: 'dashboard' });
await settle();
assert.equal(ready.length, before);
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'deny', guarded: 'confirm' } });
await settle();
assert.equal(ready.length, before + 1);
assert(!ready[ready.length - 1].tools.some((t) => t.kind === 'draft'));
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'allow', guarded: 'confirm' } });
await settle();
assert.equal(ready.length, before + 2);

// Everything that crosses IPC must be structured-cloneable plain data.
for (const { outcome } of responses) assert.doesNotThrow(() => structuredClone(outcome));

dispose();
assert.equal(unsubscribed, 1);
const after = ready.length;
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'deny', guarded: 'confirm' } });
await settle();
assert.equal(ready.length, after, 'disposed bridge stops announcing');
console.log('MCP bridge host: tool snapshot, execution, labels and policy refresh verified.');
