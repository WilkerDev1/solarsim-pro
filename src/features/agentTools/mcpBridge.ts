// Renderer side of the local MCP bridge: executes forwarded tool calls and keeps main's tool snapshot in sync.
import type { ElectronMcpApi } from '../../../shared/agentTools/bridge';
import type { AgentToolOutcome } from '../../../shared/agentTools/types';
import { isDeviceFeatureAvailable } from '../../../shared/applicationFeatures';
import { useSimulationStore } from '../../store/useSimulationStore';
import { assistantOwner } from '../assistant/tools';
import { executeAgentTool, listAgentTools } from './registry';

/** Plain JSON only: the outcome crosses IPC and goes out over HTTP. */
const plain = (outcome: AgentToolOutcome): AgentToolOutcome => JSON.parse(JSON.stringify(outcome));

export interface McpBridgeOptions {
  /** Effective availability of the `localMcpServer` device feature. */
  available?: () => boolean;
}

export function connectMcpBridge(api: ElectronMcpApi, options: McpBridgeOptions = {}): () => void {
  const available = options.available ?? (() => isDeviceFeatureAvailable('localMcpServer'));
  let disposed = false;
  let announced = '';
  const announce = () => {
    if (disposed) return;
    const tools = available() ? listAgentTools('mcp') : [];
    const key = JSON.stringify(tools);
    if (key === announced) return;
    announced = key;
    api.ready({ tools });
  };

  const stopInvoke = api.onInvoke(async ({ requestId, call, clientLabel }) => {
    let outcome: AgentToolOutcome;
    if (!available()) {
      api.respond(requestId, { status: 'error', code: 'unavailable', message: 'El servidor MCP local no está disponible en esta versión.' });
      return;
    }
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
