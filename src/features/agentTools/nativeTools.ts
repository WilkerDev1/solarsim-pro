// Contract for agent tools implemented directly against the store (beyond the legacy assistant planners).
import type { AgentSource } from '../../../shared/agentTools/types';
import type { AgentCard } from '../../../shared/agentCards';
import type { AgentActivityEntry, AgentChange } from '../../store/slices/agentSlice';
import { useSimulationStore } from '../../store/useSimulationStore';
import { isWriterRole } from '../../../shared/permissions';
import { canEditCommercial } from '../proposals/commercial';
import { visibleAssistantEquipment, visibleAssistantProjects } from '../assistant/tools';

export interface AgentToolContext {
  source: AgentSource;
  /** Workspace/session owner captured when the request started; a change invalidates the call. */
  owner: string;
  clientLabel?: string;
  signal?: AbortSignal;
}

export interface NativeExecution {
  targetId: string;
  data?: unknown;
  cards?: AgentCard[];
  undo?: AgentActivityEntry['undo'];
}

/** A mutation prepared by a tool. `execute` revalidates everything because confirmation may happen minutes later. */
export interface NativePlan {
  title: string;
  changes: AgentChange[];
  targetType: 'project' | 'equipment' | 'client';
  execute(): NativeExecution;
}

export interface NativeResult {
  data?: unknown;
  cards?: AgentCard[];
  plan?: NativePlan;
}

/** Preparation may be async (e.g. reading a PDF); `execute` stays synchronous so confirmation can apply it immediately. */
export type NativeHandler = (args: Record<string, any>, ctx: AgentToolContext) => NativeResult | Promise<NativeResult>;

export const store = () => useSimulationStore.getState();
export const fingerprint = (value: unknown) => JSON.stringify(value ?? null);

export function canWriteWorkspace(): boolean {
  const s = store();
  const user = s.syncSettings.currentUser;
  return user ? !!s.syncSettings.authToken && isWriterRole(user.role) : s.workspaceScope === 'local';
}

export function findVisibleProject(id: string) {
  const project = visibleAssistantProjects().find((p) => p.id === id);
  if (!project) throw new Error('Propuesta no disponible en este espacio.');
  return project;
}

/** Writer role, same organization, not trashed and not in conflict. */
export function requireEditableProject(id: string) {
  const project = findVisibleProject(id);
  if (!canWriteWorkspace() || !canEditCommercial(project, store().syncSettings))
    throw new Error('Esta propuesta no admite cambios: revisa permisos, papelera o conflictos pendientes.');
  return project;
}

export function findVisibleEquipment(id: string) {
  const item = visibleAssistantEquipment().find((e) => e.id === id);
  if (!item) throw new Error('Equipo no disponible en este espacio.');
  return item;
}

export const proposalCard = (p: { id: string; status?: string; commercial?: { status?: string }; client: { name: string; projectId?: string } }): AgentCard => ({
  type: 'proposal', id: p.id, title: p.client.name, detail: p.client.projectId, status: p.status, commercialStatus: p.commercial?.status,
});

export const PROJECT_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'] as const;
export const pickFields = (source: object, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, structuredClone((source as Record<string, unknown>)[k])]));
