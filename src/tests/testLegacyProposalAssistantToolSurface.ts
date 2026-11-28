// LEGADO: se elimina en F6 junto con la herramienta apply_proposal_draft y la superficie/fuente 'proposal-assistant'.
// Parte de las suites mixtas testAgentToolSchemas (línea 65) y testMcpBridgeHost (líneas 38 y 78), partidas en F0: lo que sobrevive
// (esquemas, política, puente MCP) sigue allí; aquí queda solo lo que habla de la herramienta exclusiva del asistente de propuestas.
// La garantía general «ninguna herramienta interna llega al MCP» la fija ahora testAgentContractGolden (lista por superficie).
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agentTools/definitions';
import { connectMcpBridge } from '../features/agentTools/mcpBridge';
import { listAgentTools } from '../features/agentTools/registry';
import type { ElectronMcpApi, McpInvokeMessage, McpRendererSnapshot } from '../../shared/agentTools/bridge';
import type { AgentToolOutcome } from '../../shared/agentTools/types';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'legacy-surface', syncStatus: 'local_only' as const };
store.setState({
  workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});

// apply_proposal_draft solo existe en la superficie del asistente de propuestas: no en el asistente general ni en el MCP.
const definition = AGENT_TOOL_DEFINITIONS.find((d) => d.name === 'apply_proposal_draft')!;
assert.deepEqual(definition.surfaces, ['proposal-assistant']);
assert(listAgentTools('proposal-assistant').some((d) => d.name === 'apply_proposal_draft'));
assert(!listAgentTools('app-assistant').some((d) => d.name === 'apply_proposal_draft'), 'surface-specific tools stay on their surface');

// Puente del MCP local: ni se anuncia ni se ejecuta.
let invoke: (message: McpInvokeMessage) => void = () => {};
const ready: McpRendererSnapshot[] = [];
const responses: { requestId: string; outcome: AgentToolOutcome }[] = [];
const api: ElectronMcpApi = {
  getStatus: async () => { throw new Error('unused'); },
  setEnabled: async () => { throw new Error('unused'); },
  regenerateToken: async () => { throw new Error('unused'); },
  copyToken: async () => true,
  onInvoke: (callback) => { invoke = callback; return () => {}; },
  respond: (requestId, outcome) => { responses.push({ requestId, outcome }); },
  ready: (snapshot) => { ready.push(snapshot); },
};
const dispose = connectMcpBridge(api);
const names = ready[0].tools.map((t) => t.name);
assert(!names.includes('apply_proposal_draft'), 'internal-only tools are never exposed to MCP');
invoke({ requestId: 'r5', call: { name: 'apply_proposal_draft', args: {} } });
await new Promise((resolve) => setTimeout(resolve, 10));
assert(responses[0].outcome.status === 'error' && responses[0].outcome.code === 'unknown_tool');
dispose();

console.log('PASS (legado): apply_proposal_draft stays on the proposal-assistant surface and never reaches the MCP bridge.');
