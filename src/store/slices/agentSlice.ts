import type { SimulationSlice } from '../types';
import type { AgentSource, AgentToolKind } from '../../../shared/agentTools/types';

export type AgentPolicyLevel = 'allow' | 'confirm' | 'deny';
export interface AgentSourcePolicy {
  read: 'allow' | 'deny';
  draft: AgentPolicyLevel;
  /** Catalog, prices, deletions and commercial status always need a human: never "allow". */
  guarded: 'confirm' | 'deny';
}
/** `internal` = in-app assistants; `external` = agents connected through the local MCP server. */
export interface AgentPolicy {
  internal: AgentSourcePolicy;
  external: AgentSourcePolicy;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  internal: { read: 'allow', draft: 'allow', guarded: 'confirm' },
  external: { read: 'allow', draft: 'allow', guarded: 'confirm' },
};

export function normalizeAgentPolicy(value: Partial<AgentPolicy> | undefined): AgentPolicy {
  const one = (raw: Partial<AgentSourcePolicy> | undefined, fallback: AgentSourcePolicy): AgentSourcePolicy => ({
    read: raw?.read === 'deny' ? 'deny' : 'allow',
    draft: raw?.draft === 'confirm' || raw?.draft === 'deny' ? raw.draft : fallback.draft,
    guarded: raw?.guarded === 'deny' ? 'deny' : 'confirm',
  });
  return { internal: one(value?.internal, DEFAULT_AGENT_POLICY.internal), external: one(value?.external, DEFAULT_AGENT_POLICY.external) };
}

export const agentPolicyKey = (source: AgentSource): keyof AgentPolicy => (source === 'mcp' ? 'external' : 'internal');

export interface AgentChange {
  label: string;
  value: string;
}

export interface AgentActivityEntry {
  id: string;
  at: string;
  source: AgentSource;
  clientLabel?: string;
  tool: string;
  kind: AgentToolKind;
  targetType: 'project' | 'equipment';
  targetId: string;
  title: string;
  changes: AgentChange[];
  status: 'applied' | 'undone';
  /** Only the sections the change touched, plus a fingerprint of their state right after it. */
  undo?: { before: Record<string, unknown>; fields?: string[]; afterFingerprint: string };
}

export type PendingAgentActionStatus = 'pending' | 'applied' | 'rejected' | 'expired' | 'failed';
export interface PendingAgentAction {
  id: string;
  source: AgentSource;
  clientLabel?: string;
  tool: string;
  kind: AgentToolKind;
  title: string;
  changes: AgentChange[];
  /** Opaque, revalidated plan (features/assistant AssistantAction). */
  plan: unknown;
  createdAt: string;
  expiresAt: string;
  status: PendingAgentActionStatus;
  error?: string;
  activityId?: string;
}

export interface AgentActionResult {
  success: boolean;
  error?: string;
  activityId?: string;
}

/** Apply/undo live in features/agentTools (they need the planners); the store only delegates to them. */
export interface AgentRuntime {
  apply(action: PendingAgentAction): AgentActionResult;
  undo(entry: AgentActivityEntry): AgentActionResult;
}
let runtime: AgentRuntime | undefined;
export function installAgentRuntime(next: AgentRuntime) {
  runtime = next;
}

export const MAX_AGENT_ACTIVITY = 300;
const MAX_PENDING = 50;
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface AgentSlice {
  agentPolicy: AgentPolicy;
  agentActivity: AgentActivityEntry[];
  pendingAgentActions: PendingAgentAction[];
  setAgentPolicy: (patch: Partial<AgentPolicy>) => void;
  recordAgentActivity: (entry: Omit<AgentActivityEntry, 'id' | 'at' | 'status'>) => string;
  queueAgentAction: (action: Omit<PendingAgentAction, 'createdAt' | 'expiresAt' | 'status'>) => void;
  confirmAgentAction: (id: string) => AgentActionResult;
  rejectAgentAction: (id: string) => void;
  undoAgentActivity: (id: string) => AgentActionResult;
}

export const createAgentSlice: SimulationSlice<AgentSlice> = (set, get) => {
  const patchPending = (id: string, patch: Partial<PendingAgentAction>) =>
    set((s) => ({ pendingAgentActions: s.pendingAgentActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  return {
    agentPolicy: DEFAULT_AGENT_POLICY,
    agentActivity: [],
    pendingAgentActions: [],
    setAgentPolicy: (patch) => set((s) => ({ agentPolicy: normalizeAgentPolicy({ ...s.agentPolicy, ...patch }) })),
    recordAgentActivity: (entry) => {
      const id = newId();
      set((s) => ({ agentActivity: [{ ...entry, id, at: new Date().toISOString(), status: 'applied' as const }, ...s.agentActivity].slice(0, MAX_AGENT_ACTIVITY) }));
      return id;
    },
    queueAgentAction: (action) => {
      const now = Date.now();
      set((s) => ({
        pendingAgentActions: [
          { ...action, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 10 * 60_000).toISOString(), status: 'pending' as const },
          ...s.pendingAgentActions.filter((a) => a.id !== action.id),
        ].slice(0, MAX_PENDING),
      }));
    },
    confirmAgentAction: (id) => {
      const action = get().pendingAgentActions.find((a) => a.id === id);
      if (!action || action.status !== 'pending') return { success: false, error: 'La acción ya no está disponible; pide al agente que la prepare de nuevo.' };
      if (Date.parse(action.expiresAt) < Date.now()) {
        patchPending(id, { status: 'expired' });
        return { success: false, error: 'La acción caducó. Pide al agente que la prepare de nuevo.' };
      }
      if (!runtime) return { success: false, error: 'Agentes no disponibles.' };
      const result = runtime.apply(action);
      patchPending(id, result.success ? { status: 'applied', activityId: result.activityId } : { status: 'failed', error: result.error });
      return result;
    },
    rejectAgentAction: (id) => {
      const action = get().pendingAgentActions.find((a) => a.id === id);
      if (action?.status === 'pending') patchPending(id, { status: 'rejected' });
    },
    undoAgentActivity: (id) => {
      const entry = get().agentActivity.find((a) => a.id === id);
      if (!entry || entry.status !== 'applied' || !entry.undo) return { success: false, error: 'Este cambio no se puede deshacer.' };
      if (!runtime) return { success: false, error: 'Agentes no disponibles.' };
      const result = runtime.undo(entry);
      if (result.success)
        set((s) => ({ agentActivity: s.agentActivity.map((a) => (a.id === id ? { ...a, status: 'undone' as const } : a)) }));
      return result;
    },
  };
};
