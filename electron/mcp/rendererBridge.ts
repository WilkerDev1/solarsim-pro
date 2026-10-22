// Request/response correlation between the MCP server (main) and the renderer that executes agent tools.
import { randomUUID } from 'node:crypto';
import type { McpInvokeMessage, McpRendererSnapshot } from '../../shared/agentTools/bridge';
import type { AgentToolCall, AgentToolDefinition, AgentToolOutcome } from '../../shared/agentTools/types';

export type BridgeErrorCode = 'renderer_not_ready' | 'renderer_unavailable' | 'timeout';

export class BridgeError extends Error {
  constructor(public readonly code: BridgeErrorCode, message: string) {
    super(message);
  }
}

export interface RendererBridgeOptions {
  /** Delivers the message to the renderer; false when there is no live window. */
  send: (message: McpInvokeMessage) => boolean;
  readTimeoutMs?: number;
  draftTimeoutMs?: number;
}

interface Pending {
  resolve: (outcome: AgentToolOutcome) => void;
  reject: (error: BridgeError) => void;
  timer: NodeJS.Timeout;
}

const READ_TIMEOUT_MS = 15_000;
const DRAFT_TIMEOUT_MS = 30_000;
/** `get_agent_action_status` legitimately waits up to 20 s for a human decision. */
const WAITING_TOOLS: Record<string, number> = { get_agent_action_status: 25_000 };

export class RendererBridge {
  private pending = new Map<string, Pending>();
  private snapshot: McpRendererSnapshot | null = null;

  constructor(private readonly options: RendererBridgeOptions) {}

  get ready(): boolean {
    return this.snapshot !== null;
  }

  get tools(): AgentToolDefinition[] {
    return this.snapshot?.tools ?? [];
  }

  setReady(snapshot: McpRendererSnapshot): void {
    this.snapshot = snapshot;
  }

  /** The renderer reloaded, crashed or closed: it must announce itself again, and in-flight calls cannot complete. */
  rendererGone(): void {
    this.snapshot = null;
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(new BridgeError('renderer_unavailable', 'La ventana de SolarSim se cerró o se recargó.'));
    }
  }

  invoke(call: AgentToolCall, clientLabel?: string): Promise<AgentToolOutcome> {
    if (!this.snapshot) return Promise.reject(new BridgeError('renderer_not_ready', 'SolarSim no está listo. Abre la aplicación e inicia sesión si hace falta.'));
    const requestId = randomUUID();
    return new Promise<AgentToolOutcome>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new BridgeError('timeout', 'SolarSim no respondió a tiempo.'));
      }, this.timeoutFor(call.name));
      this.pending.set(requestId, { resolve, reject, timer });
      let delivered = false;
      try {
        delivered = this.options.send({ requestId, call, clientLabel });
      } catch {
        delivered = false;
      }
      if (!delivered) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new BridgeError('renderer_unavailable', 'La ventana de SolarSim no está disponible.'));
      }
    });
  }

  /** Returns false for unknown or already settled ids (late answers after a timeout are dropped). */
  respond(requestId: string, outcome: AgentToolOutcome): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(outcome);
    return true;
  }

  private timeoutFor(tool: string): number {
    const waiting = WAITING_TOOLS[tool];
    if (waiting) return waiting;
    const kind = this.tools.find((t) => t.name === tool)?.kind;
    return kind === 'draft' ? this.options.draftTimeoutMs ?? DRAFT_TIMEOUT_MS : this.options.readTimeoutMs ?? READ_TIMEOUT_MS;
  }
}
