// Renderer side of the local MCP bridge: executes forwarded tool calls and keeps main's tool snapshot in sync.
import type { ElectronMcpApi } from '../../../shared/agentTools/bridge';
import type { AgentToolOutcome } from '../../../shared/agentTools/types';
import { useSimulationStore } from '../../store/useSimulationStore';
import { assistantOwner } from '../assistant/tools';
import { executeAgentTool, listAgentTools } from './registry';

/** Plain JSON only: the outcome crosses IPC and goes out over HTTP. */
const plain = (outcome: AgentToolOutcome): AgentToolOutcome => JSON.parse(JSON.stringify(outcome));

export function connectMcpBridge(api: ElectronMcpApi): () => void {
  let disposed = false;
  let announced = '';
  const announce = () => {
    if (disposed) return;
    const tools = listAgentTools('mcp');
    const key = JSON.stringify(tools);
    if (key === announced) return;
    announced = key;
    api.ready({ tools });
  };

  const stopInvoke = api.onInvoke(async ({ requestId, call, clientLabel }) => {
    let outcome: AgentToolOutcome;
    try {
      // The owner is read at execution time: a call that arrives after a workspace or session switch uses the current one.
      outcome = await executeAgentTool(call, { source: 'mcp', owner: assistantOwner(), clientLabel });
    } catch (error) {
      outcome = { status: 'error', code: 'tool_failed', message: error instanceof Error ? error.message : 'Herramienta no disponible.' };
    }
    if (!disposed) api.respond(requestId, plain(outcome));
  });

  let policy = useSimulationStore.getState().agentPolicy;
  let generation = useSimulationStore.getState().sessionGeneration;
  const stopStore = useSimulationStore.subscribe((state) => {
    if (state.agentPolicy === policy && state.sessionGeneration === generation) return;
    policy = state.agentPolicy;
    generation = state.sessionGeneration;
    announce();
  });
  announce();

  return () => {
    disposed = true;
    stopInvoke();
    stopStore();
  };
}
