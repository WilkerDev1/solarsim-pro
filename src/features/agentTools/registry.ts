// Runtime for the shared agent tools: one entry point for both in-app assistants and the local MCP bridge.
import { AGENT_TOOL_DEFINITIONS, findAgentTool } from '../../../shared/agentTools/definitions';
import { validateJsonSchema } from '../../../shared/agentTools/jsonSchema';
import type { AgentSource, AgentToolCall, AgentToolDefinition, AgentToolOutcome } from '../../../shared/agentTools/types';
import type { AgentCard } from '../../../shared/agentCards';
import { useSimulationStore } from '../../store/useSimulationStore';
import { agentPolicyKey, installAgentRuntime, type AgentActivityEntry, type AgentChange, type PendingAgentAction } from '../../store/slices/agentSlice';
import { editableAssistantFields } from '../assistant/validation';
import { applyAssistantAction, executeAssistantTool } from '../assistant/tools';
import { assistantFieldLabel, assistantValueLabel } from '../assistant/labels';
import type { AssistantAction, AssistantCard, AssistantToolResult } from '../assistant/types';

export interface AgentToolContext {
  source: AgentSource;
  /** Workspace/session owner captured when the request started; a change invalidates the call. */
  owner: string;
  clientLabel?: string;
  signal?: AbortSignal;
}

const MAX_RESULT_BYTES = 64000;
const PROJECT_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'] as const;
const store = () => useSimulationStore.getState();
const fingerprint = (value: unknown) => JSON.stringify(value ?? null);
const pick = (source: object, keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, structuredClone((source as Record<string, unknown>)[k])]));

export function listAgentTools(source: AgentSource): AgentToolDefinition[] {
  const policy = store().agentPolicy[agentPolicyKey(source)];
  return AGENT_TOOL_DEFINITIONS.filter((d) => d.surfaces.includes(source) && policy[d.kind] !== 'deny').map(describeAgentTool);
}

/** Appends the live editable-field whitelist so models see exactly which fields are accepted. */
export function describeAgentTool(definition: AgentToolDefinition): AgentToolDefinition {
  if (definition.name === 'propose_project_update')
    return { ...definition, description: `${definition.description} Campos: ${JSON.stringify({ ...editableAssistantFields, equipment: undefined })}` };
  if (definition.name === 'propose_equipment_update')
    return { ...definition, description: `${definition.description} Campos: ${editableAssistantFields.equipment.join(',')}` };
  return definition;
}

export function toAgentCard(card: AssistantCard): AgentCard {
  return card.kind === 'project'
    ? { type: 'proposal', id: card.id, title: card.title, detail: card.detail }
    : { type: 'equipment', id: card.id, title: card.title, detail: card.detail };
}

export function toAssistantCard(card: AgentCard): AssistantCard | undefined {
  if (card.type === 'proposal') return { kind: 'project', id: card.id, title: card.title, detail: card.detail || '' };
  if (card.type === 'equipment') return { kind: 'equipment', id: card.id, title: card.title, detail: card.detail || '' };
  return undefined;
}

/** `edits[].valueJson` (string, model-friendly) → `edits[].value` (parsed) for the planners. */
function decodeArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(args.edits)) return args;
  return {
    ...args,
    edits: args.edits.map((edit: { valueJson: string }) => {
      try {
        return { ...edit, value: JSON.parse(edit.valueJson) };
      } catch {
        throw new Error('valueJson no es JSON válido.');
      }
    }),
  };
}

const describeChanges = (action: AssistantAction): AgentChange[] =>
  action.edits.map((e) => ({ label: assistantFieldLabel(e.field), value: assistantValueLabel(e.value) }));

/** Applies a revalidated plan and records it with the sections needed to undo it. */
function applyPlan(action: AssistantAction, meta: { source: AgentSource; clientLabel?: string; tool: string; kind: 'draft' | 'guarded' }) {
  const s = store();
  const fields = action.kind === 'equipment' ? [...new Set(action.edits.map((e) => e.field))] : [...PROJECT_SECTIONS];
  const target = action.kind === 'equipment' ? s.equipmentCatalog.find((e) => e.id === action.targetId) : s.projects.find((p) => p.id === action.targetId);
  if (!target) throw new Error('Destino no disponible.');
  const before = pick(target, fields);
  applyAssistantAction(action);
  const after = action.kind === 'equipment'
    ? store().equipmentCatalog.find((e) => e.id === action.targetId)
    : store().projects.find((p) => p.id === action.targetId);
  return store().recordAgentActivity({
    source: meta.source, clientLabel: meta.clientLabel, tool: meta.tool, kind: meta.kind,
    targetType: action.kind, targetId: action.targetId, title: action.title, changes: describeChanges(action),
    undo: after ? { before, afterFingerprint: fingerprint(pick(after, fields)) } : undefined,
  });
}

function undoEntry(entry: AgentActivityEntry) {
  const s = store();
  const fields = Object.keys(entry.undo!.before);
  const current = entry.targetType === 'equipment' ? s.equipmentCatalog.find((e) => e.id === entry.targetId) : s.projects.find((p) => p.id === entry.targetId);
  if (!current) return { success: false, error: 'El destino ya no existe.' };
  if (fingerprint(pick(current, fields)) !== entry.undo!.afterFingerprint)
    return { success: false, error: 'El destino cambió después; usa el historial de versiones de la propuesta para revertir.' };
  if (entry.targetType === 'equipment') {
    s.updateEquipmentItem(entry.targetId, entry.undo!.before);
    return { success: true };
  }
  return s.updateProjectById(entry.targetId, () => structuredClone(entry.undo!.before))
    ? { success: true }
    : { success: false, error: 'La propuesta no admite cambios (papelera).' };
}

installAgentRuntime({
  apply(pending: PendingAgentAction) {
    try {
      const activityId = applyPlan(pending.plan as AssistantAction, { source: pending.source, clientLabel: pending.clientLabel, tool: pending.tool, kind: pending.kind === 'guarded' ? 'guarded' : 'draft' });
      return { success: true, activityId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'No se pudo aplicar.' };
    }
  },
  undo: undoEntry,
});

async function actionStatus(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolOutcome> {
  const deadline = Date.now() + Math.min(20, Number(args.waitSeconds) || 0) * 1000;
  for (;;) {
    const action = store().pendingAgentActions.find((a) => a.id === args.actionId);
    if (!action) return { status: 'error', code: 'not_found', message: 'Acción desconocida o ya descartada.' };
    const expired = action.status === 'pending' && Date.parse(action.expiresAt) < Date.now();
    if (action.status !== 'pending' || expired || Date.now() >= deadline || ctx.signal?.aborted)
      return { status: 'ok', data: { actionId: action.id, status: expired ? 'expired' : action.status, error: action.error, activityId: action.activityId } };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function executeAgentTool(call: AgentToolCall, ctx: AgentToolContext): Promise<AgentToolOutcome> {
  const definition = findAgentTool(call.name);
  if (!definition || !definition.surfaces.includes(ctx.source))
    return { status: 'error', code: 'unknown_tool', message: 'Herramienta no permitida.' };
  const policy = store().agentPolicy[agentPolicyKey(ctx.source)];
  if (policy[definition.kind] === 'deny')
    return { status: 'error', code: 'denied', message: 'Los permisos de agentes de este dispositivo no permiten esta acción.' };
  const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};
  const errors = validateJsonSchema(definition.inputSchema, args);
  if (errors.length) return { status: 'error', code: 'invalid_arguments', message: errors.slice(0, 5).join(' ') };
  if (ctx.signal?.aborted) return { status: 'error', code: 'cancelled', message: 'Solicitud cancelada.' };
  if (definition.name === 'get_agent_action_status') return actionStatus(args, ctx);
  let result: AssistantToolResult;
  try {
    result = executeAssistantTool({ name: call.name, args: decodeArgs(args) }, ctx.owner);
  } catch (error) {
    return { status: 'error', code: 'tool_failed', message: error instanceof Error ? error.message : 'Herramienta no disponible.' };
  }
  if (JSON.stringify(result.data ?? null).length > MAX_RESULT_BYTES)
    return { status: 'error', code: 'result_too_large', message: 'Resultado demasiado grande. Consulta un equipo o una propuesta específica.' };
  const cards = result.cards?.map(toAgentCard);
  const action = result.action;
  if (!action) return { status: 'ok', data: result.data, cards };
  const kind = definition.kind === 'guarded' ? 'guarded' : 'draft';
  const meta = { source: ctx.source, clientLabel: ctx.clientLabel, tool: definition.name, kind } as const;
  if (kind === 'draft' && policy.draft === 'allow') {
    try {
      const activityId = applyPlan(action, meta);
      return { status: 'applied', data: { status: 'applied', edits: action.edits }, activityId, cards };
    } catch (error) {
      return { status: 'error', code: 'apply_failed', message: error instanceof Error ? error.message : 'No se pudo aplicar.' };
    }
  }
  store().queueAgentAction({ id: action.id, ...meta, title: action.title, changes: describeChanges(action), plan: action });
  return { status: 'pending_confirmation', actionId: action.id, summary: action.title, cards };
}

export function getPendingAgentAction(actionId: string): AssistantAction | undefined {
  return store().pendingAgentActions.find((a) => a.id === actionId)?.plan as AssistantAction | undefined;
}

/** Legacy shape consumed by the general assistant UI (cards, confirmable plan or applied activity). */
export async function executeForAssistant(call: AgentToolCall, ctx: AgentToolContext): Promise<AssistantToolResult> {
  const outcome = await executeAgentTool(call, ctx);
  if (outcome.status === 'error') throw new Error(outcome.message);
  const cards = outcome.cards?.map(toAssistantCard).filter((c): c is AssistantCard => !!c);
  if (outcome.status === 'pending_confirmation') {
    const action = getPendingAgentAction(outcome.actionId)!;
    return { data: { status: 'pending_confirmation', edits: action.edits }, cards, action };
  }
  if (outcome.status === 'applied') return { data: outcome.data, cards, activityId: outcome.activityId };
  return { data: outcome.data, cards };
}
