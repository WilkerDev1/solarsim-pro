export type AssistantSection =
  'client' | 'specs' | 'rates' | 'financials' | 'consumption' | 'equipment';
export interface AssistantEdit {
  section: AssistantSection;
  field: string;
  value: unknown;
}
export interface AssistantAction {
  id: string;
  kind: 'project' | 'equipment';
  /** Real target of a native plan (the legacy `kind` only distinguishes project/equipment). */
  targetType?: 'project' | 'equipment' | 'client';
  /** Confirmation copy that matches what the plan really changes; the card falls back to the legacy text. */
  impact?: string;
  targetId: string;
  title: string;
  edits: AssistantEdit[];
  fingerprint: string;
  owner: string;
}
export interface AssistantCard {
  kind: 'project' | 'equipment';
  id: string;
  title: string;
  detail: string;
}
export interface AssistantMessage {
  role: 'user' | 'assistant';
  text: string;
  cards?: AssistantCard[];
  actions?: AssistantAction[];
  /** Changes already applied under the drafts-free policy; each one can be undone. */
  applied?: { activityId: string; title: string }[];
  /** Rich cards beyond project/equipment (audit tables, clients, attachments…), rendered by cards/registry. */
  agentCards?: import('../../../shared/agentCards').AgentCard[];
}
export interface AssistantToolCall {
  name: string;
  args: Record<string, unknown>;
}
export interface AssistantToolResult {
  data: unknown;
  cards?: AssistantCard[];
  action?: AssistantAction;
  activityId?: string;
  agentCards?: import('../../../shared/agentCards').AgentCard[];
}
