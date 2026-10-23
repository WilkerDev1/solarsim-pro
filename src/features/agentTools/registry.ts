// Runtime for the shared agent tools: one entry point for both in-app assistants and the local MCP bridge.
import { AGENT_TOOL_DEFINITIONS, findAgentTool } from '../../../shared/agentTools/definitions';
import { validateJsonSchema } from '../../../shared/agentTools/jsonSchema';
import type { AgentSource, AgentToolCall, AgentToolDefinition, AgentToolOutcome } from '../../../shared/agentTools/types';
import type { AgentCard } from '../../../shared/agentCards';
import { useSimulationStore } from '../../store/useSimulationStore';
import { isWriterRole } from '../../../shared/permissions';
import { agentPolicyKey, installAgentRuntime, type AgentActivityEntry, type AgentSourcePolicy, type AgentChange, type PendingAgentAction } from '../../store/slices/agentSlice';
import { editableAssistantFields } from '../assistant/validation';
import { applyAssistantAction, assistantOwner, executeAssistantTool } from '../assistant/tools';
import type { AgentToolContext, NativeHandler, NativePlan } from './nativeTools';
import { PROPOSAL_TOOL_HANDLERS } from './proposalTools';
import { CATALOG_TOOL_HANDLERS } from './catalogTools';
import { DOCUMENT_TOOL_HANDLERS } from './documentTools';
import { ATTACHMENT_TOOL_HANDLERS } from './attachmentTools';
import { CLIENT_TOOL_HANDLERS } from './clientTools';
import { touchesPricing } from '../assistant/pricingFields';
import { assistantFieldLabel, assistantValueLabel } from '../assistant/labels';
import type { AssistantAction, AssistantCard, AssistantToolResult } from '../assistant/types';

export type { AgentToolContext } from './nativeTools';
const NATIVE_HANDLERS: Record<string, NativeHandler> = { ...PROPOSAL_TOOL_HANDLERS, ...CATALOG_TOOL_HANDLERS, ...DOCUMENT_TOOL_HANDLERS, ...ATTACHMENT_TOOL_HANDLERS, ...CLIENT_TOOL_HANDLERS };

const MAX_RESULT_BYTES = 64000;
/**
 * Guarded tools whose effect the activity log cannot undo (the server keeps commercial reports; company templates and the
 * directory deletion are outside the proposal). Bypass mode never skips the confirmation for them.
 */
export const BYPASS_EXEMPT_TOOLS: ReadonlySet<string> = new Set(['add_commercial_report', 'save_document_text_to_company_template', 'delete_client']);
const PROJECT_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'] as const;
const store = () => useSimulationStore.getState();
/** Queued plans carry no card of their own: expose the pending changes so MCP Apps hosts (and the app) can render them. */
const pendingCard = (actionId: string, title: string, changes: AgentChange[]): AgentCard => ({
  type: 'pending-action', id: actionId, title, actionId, changes: changes.slice(0, 20).map((c) => ({ label: c.label, after: c.value })),
});
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

export { touchesPricing };

const describeChanges = (action: AssistantAction): AgentChange[] =>
  action.edits.map((e) => ({ label: assistantFieldLabel(e.field), value: assistantValueLabel(e.value) }));

/** Applies a revalidated plan and records it with the sections needed to undo it. */
function applyPlan(action: AssistantAction, meta: { source: AgentSource; clientLabel?: string; tool: string; kind: 'draft' | 'guarded' }) {
  // Only the general assistant depends on its own on/off switch; other agent surfaces keep working without it.
  const requireAssistantEnabled = meta.source === 'app-assistant';
  const s = store();
  const fields = action.kind === 'equipment' ? [...new Set(action.edits.map((e) => e.field))] : [...PROJECT_SECTIONS];
  const target = action.kind === 'equipment' ? s.equipmentCatalog.find((e) => e.id === action.targetId) : s.projects.find((p) => p.id === action.targetId);
  if (!target) throw new Error('Destino no disponible.');
  const before = pick(target, fields);
  applyAssistantAction(action, { requireAssistantEnabled });
  const after = action.kind === 'equipment'
    ? store().equipmentCatalog.find((e) => e.id === action.targetId)
    : store().projects.find((p) => p.id === action.targetId);
  return store().recordAgentActivity({
    source: meta.source, clientLabel: meta.clientLabel, tool: meta.tool, kind: meta.kind,
    targetType: action.kind, targetId: action.targetId, title: action.title, changes: describeChanges(action),
    // `fields` survives JSON persistence even when a field was absent (undefined) before the change.
    undo: after ? { before, fields, afterFingerprint: fingerprint(pick(after, fields)) } : undefined,
  });
}

/** Undo is a new write: revalidate today's permissions and target state, never the ones from when the agent acted. */
function canWriteNow(): boolean {
  const s = store();
  const user = s.syncSettings.currentUser;
  return user ? !!s.syncSettings.authToken && isWriterRole(user.role) : s.workspaceScope === 'local';
}

type PlanMeta = { source: AgentSource; clientLabel?: string; tool: string; kind: 'draft' | 'guarded' };
const isNativePlan = (plan: unknown): plan is NativePlan => !!plan && typeof (plan as NativePlan).execute === 'function';

function runNativePlan(plan: NativePlan, meta: PlanMeta) {
  const execution = plan.execute();
  const activityId = store().recordAgentActivity({
    ...meta, targetType: plan.targetType, targetId: execution.targetId, title: plan.title, changes: plan.changes, undo: execution.undo,
  });
  return { activityId, execution };
}

function undoEntry(entry: AgentActivityEntry) {
  const s = store();
  if (!canWriteNow()) return { success: false, error: 'Tu cuenta solo puede consultar.' };
  if (entry.undo?.op === 'trash' || entry.undo?.op === 'restore') {
    const project = s.projects.find((p) => p.id === entry.targetId);
    if (!project) return { success: false, error: 'La propuesta ya no existe.' };
    if (entry.undo.op === 'trash') s.moveToTrash(project.id);
    else s.restoreProject(project.id);
    return { success: true };
  }
  const fields = entry.undo!.fields || Object.keys(entry.undo!.before);
  const restored = Object.fromEntries(fields.map((f) => [f, structuredClone(entry.undo!.before[f])]));
  if (entry.targetType === 'equipment') {
    const current = s.equipmentCatalog.find((e) => e.id === entry.targetId);
    if (!current) return { success: false, error: 'El equipo ya no existe.' };
    if (s.equipmentConflicts[entry.targetId]) return { success: false, error: 'Resuelve primero el conflicto del equipo.' };
    if (fingerprint(pick(current, fields)) !== entry.undo!.afterFingerprint)
      return { success: false, error: 'El equipo cambió después; revísalo en el catálogo.' };
    s.updateEquipmentItem(entry.targetId, restored);
    const after = store().equipmentCatalog.find((e) => e.id === entry.targetId);
    return after && fingerprint(pick(after, fields)) === fingerprint(restored)
      ? { success: true }
      : { success: false, error: 'El catálogo rechazó el cambio.' };
  }
  const current = s.projects.find((p) => p.id === entry.targetId);
  if (!current) return { success: false, error: 'La propuesta ya no existe.' };
  // A client link may only be restored while that client still exists (the API rejects links to deleted clients).
  const previousClientId = fields.includes('clientId') ? restored.clientId : undefined;
  if (typeof previousClientId === 'string' && !s.clients.some((c) => c.id === previousClientId))
    return { success: false, error: 'El cliente enlazado antes ya no existe en el directorio.' };
  if (current.isDeleted || current.syncStatus === 'conflict') return { success: false, error: 'La propuesta no admite cambios (papelera o conflicto).' };
  if (fingerprint(pick(current, fields)) !== entry.undo!.afterFingerprint)
    return { success: false, error: 'La propuesta cambió después; usa el historial de versiones para revertir.' };
  if (!s.updateProjectById(entry.targetId, () => restored, { restore: true })) return { success: false, error: 'La propuesta no admite cambios.' };
  const after = store().projects.find((p) => p.id === entry.targetId);
  return after && fingerprint(pick(after, fields)) === fingerprint(restored)
    ? { success: true }
    : { success: false, error: 'No se pudo restaurar el estado anterior; usa el historial de versiones.' };
}

/** Copy for the confirmation card of a native plan: it names what the plan really changes, never the open proposal by default. */
function nativeImpact(tool: string, targetType: NativePlan['targetType']): string {
  if (targetType === 'client') return 'Cambiará el directorio de clientes.';
  if (targetType === 'equipment') return 'Cambiará el catálogo compartido.';
  if (tool === 'save_document_text_to_company_template') return 'Cambiará la plantilla de documentos de la empresa.';
  return 'Cambiará una propuesta del espacio de trabajo.';
}

installAgentRuntime({
  apply(pending: PendingAgentAction) {
    try {
      // Confirming is a new write: today's policy and account role win over those from when the action was queued.
      if (store().agentPolicy[agentPolicyKey(pending.source)][pending.kind === 'guarded' ? 'guarded' : 'draft'] === 'deny')
        return { success: false, error: 'Los permisos de agentes de este dispositivo ya no permiten esta acción.' };
      if (!canWriteNow()) return { success: false, error: 'Tu cuenta solo puede consultar.' };
      if (isNativePlan(pending.plan)) {
        const meta = { source: pending.source, clientLabel: pending.clientLabel, tool: pending.tool, kind: pending.kind === 'guarded' ? 'guarded' : 'draft' } as const;
        return { success: true, activityId: runNativePlan(pending.plan, meta).activityId };
      }
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
  const native = NATIVE_HANDLERS[definition.name];
  if (native) return executeNative(native, definition, args, ctx);
  let result: AssistantToolResult;
  try {
    result = executeAssistantTool({ name: call.name, args: decodeArgs(args) }, ctx.owner, { requireAssistantEnabled: ctx.source === 'app-assistant' });
  } catch (error) {
    return { status: 'error', code: 'tool_failed', message: error instanceof Error ? error.message : 'Herramienta no disponible.' };
  }
  if (JSON.stringify(result.data ?? null).length > MAX_RESULT_BYTES)
    return { status: 'error', code: 'result_too_large', message: 'Resultado demasiado grande. Consulta un equipo o una propuesta específica.' };
  const cards = result.cards?.map(toAgentCard);
  const action = result.action;
  if (!action) return { status: 'ok', data: result.data, cards };
  // Prices are sensitive whatever tool carries them: a plan that touches any pricing field is guarded as a whole.
  const kind = definition.kind === 'guarded' || touchesPricing(action) ? 'guarded' : 'draft';
  if (kind === 'guarded' && policy.guarded === 'deny')
    return { status: 'error', code: 'denied', message: 'Los permisos de agentes de este dispositivo no permiten cambiar precios.' };
  const meta = { source: ctx.source, clientLabel: ctx.clientLabel, tool: definition.name, kind } as const;
  // Bypass (guarded = allow) only skips the human click: validations, permissions and the undoable activity entry stay.
  if ((kind === 'draft' && policy.draft === 'allow') || (kind === 'guarded' && policy.guarded === 'allow')) {
    try {
      const activityId = applyPlan(action, meta);
      return { status: 'applied', data: { status: 'applied', edits: action.edits }, activityId, cards };
    } catch (error) {
      return { status: 'error', code: 'apply_failed', message: error instanceof Error ? error.message : 'No se pudo aplicar.' };
    }
  }
  const changes = describeChanges(action);
  store().queueAgentAction({ id: action.id, ...meta, title: action.title, changes, plan: action });
  return { status: 'pending_confirmation', actionId: action.id, summary: action.title, cards: [...(cards ?? []), pendingCard(action.id, action.title, changes)] };
}

async function executeNative(handler: NativeHandler, definition: AgentToolDefinition, args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolOutcome> {
  if (ctx.owner !== assistantOwner()) return { status: 'error', code: 'stale_owner', message: 'El espacio o la sesión cambió.' };
  let result;
  try {
    result = await handler(args, ctx);
  } catch (error) {
    return { status: 'error', code: 'tool_failed', message: error instanceof Error ? error.message : 'Herramienta no disponible.' };
  }
  // Preparation may have awaited (e.g. counting PDF pages): the request could be cancelled or the session changed meanwhile.
  if (ctx.signal?.aborted) return { status: 'error', code: 'cancelled', message: 'Solicitud cancelada.' };
  if (ctx.owner !== assistantOwner()) return { status: 'error', code: 'stale_owner', message: 'El espacio o la sesión cambió.' };
  if (JSON.stringify(result.data ?? null).length > MAX_RESULT_BYTES)
    return { status: 'error', code: 'result_too_large', message: 'Resultado demasiado grande. Usa filtros más concretos.' };
  if (!result.plan) return { status: 'ok', data: result.data, cards: result.cards };
  const kind = definition.kind === 'guarded' ? 'guarded' : 'draft';
  // The policy or the account role may have changed while the handler awaited: decide with today's permissions,
  // never with the ones captured before the await.
  const policy: AgentSourcePolicy = store().agentPolicy[agentPolicyKey(ctx.source)];
  if (policy[kind] === 'deny')
    return { status: 'error', code: 'denied', message: 'Los permisos de agentes de este dispositivo no permiten esta acción.' };
  if (!canWriteNow()) return { status: 'error', code: 'tool_failed', message: 'Tu cuenta solo puede consultar.' };
  const meta = { source: ctx.source, clientLabel: ctx.clientLabel, tool: definition.name, kind } as const;
  // In the proposal assistant the user already reviewed and clicked «Aplicar»: that click is the confirmation.
  const confirmedInUi = ctx.source === 'proposal-assistant' && policy.draft === 'confirm';
  const bypassed = kind === 'guarded' && policy.guarded === 'allow' && !BYPASS_EXEMPT_TOOLS.has(definition.name);
  if ((kind === 'draft' && (policy.draft === 'allow' || confirmedInUi)) || bypassed) {
    try {
      const { activityId, execution } = runNativePlan(result.plan, meta);
      return { status: 'applied', data: { status: 'applied', ...(execution.data as object) }, activityId, cards: execution.cards ?? result.cards };
    } catch (error) {
      return { status: 'error', code: 'apply_failed', message: error instanceof Error ? error.message : 'No se pudo aplicar.' };
    }
  }
  const actionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store().queueAgentAction({ id: actionId, ...meta, title: result.plan.title, changes: result.plan.changes, plan: result.plan });
  return { status: 'pending_confirmation', actionId, summary: result.plan.title, cards: [...(result.cards ?? []), pendingCard(actionId, result.plan.title, result.plan.changes)] };
}

export function getPendingAgentAction(actionId: string): AssistantAction | undefined {
  return store().pendingAgentActions.find((a) => a.id === actionId)?.plan as AssistantAction | undefined;
}

/** Legacy shape consumed by the general assistant UI (cards, confirmable plan or applied activity). */
export async function executeForAssistant(call: AgentToolCall, ctx: AgentToolContext): Promise<AssistantToolResult> {
  const outcome = await executeAgentTool(call, ctx);
  if (outcome.status === 'error') throw new Error(outcome.message);
  const cards = outcome.cards?.map(toAssistantCard).filter((c): c is AssistantCard => !!c);
  const agentCards = outcome.cards?.filter((c) => !toAssistantCard(c));
  if (outcome.status === 'pending_confirmation') {
    const pending = store().pendingAgentActions.find((a) => a.id === outcome.actionId)!;
    const action: AssistantAction = isNativePlan(pending.plan)
      // Native plans are shown with their human-readable changes; confirmation always goes through the queue by id.
      ? { id: pending.id, kind: pending.plan.targetType === 'equipment' ? 'equipment' : 'project', targetType: pending.plan.targetType,
          impact: nativeImpact(pending.tool, pending.plan.targetType), targetId: '', title: pending.title, fingerprint: '', owner: ctx.owner,
          edits: pending.changes.map((c) => ({ section: 'client' as const, field: c.label, value: c.value })) }
      : (pending.plan as AssistantAction);
    return { data: { status: 'pending_confirmation', changes: pending.changes }, cards, action };
  }
  if (outcome.status === 'applied') return { data: outcome.data, cards, agentCards, activityId: outcome.activityId };
  return { data: outcome.data, cards, agentCards };
}
