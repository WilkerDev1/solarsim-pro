/**
 * Conjunto de herramientas del asistente de la app (F3a): las declaraciones en un solo sitio (`definitions.ts`) y una sola
 * entrada para ejecutarlas, `executeAssistantToolset`, que devuelve SIEMPRE la misma forma (`AssistantToolResponse`): estado,
 * cambios por ruta, resultados del motor antes y después (o los motivos de «incompleta», nunca cifras), avisos, datos propios
 * y el resumen compacto y actualizado de la propuesta. Ese contexto vivo es el cuerpo de `functionResponse.response`: F4 lo
 * manda tal cual, nunca como un texto aparte.
 *
 * Todavía no lo usa ningún bucle: el asistente flotante actual sigue con `executeForAssistant` y `listAgentTools` hasta F4.
 * Permisos: los de hoy, sin cambios (política por fuente y rol; los precios piden confirmación salvo el modo sin
 * confirmación); el perfil «edición en vivo» es de F3b.
 */
import type { AgentToolCall, AgentToolDefinition, AgentToolOutcome } from '../../../../shared/agentTools/types';
import type { AgentCard } from '../../../../shared/agentCards';
import { validateJsonSchema } from '../../../../shared/agentTools/jsonSchema';
import { agentPolicyKey } from '../../../store/slices/agentSlice';
import { diffProjectFields } from '../../../domain/projectEditTransaction';
import { parseFieldPath } from '../../../domain/projectFields';
import { engineResults, proposalStateSummary, type ProposalStateSummary } from '../../../domain/proposalSnapshot';
import type { ProposalOperation } from '../../../domain/proposalOperations';
import { energyCalculationMode } from '../../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../../application/featurePolicy';
import { touchesPricingEdits } from '../../assistant/pricingFields';
import { visibleAssistantProjects } from '../../assistant/tools';
import { executeAgentTool, runNativeTool } from '../registry';
import { store, type AgentToolContext, type NativeHandler } from '../nativeTools';
import { APP_ASSISTANT_HANDLERS, type ToolPayload } from './handlers';
import { appAssistantToolDefinitions } from './definitions';

export { APP_ASSISTANT_TOOLSET, appAssistantToolDefinitions } from './definitions';

export interface AssistantToolResponse extends Required<Pick<ToolPayload, 'changes' | 'results' | 'warnings'>> {
  status: 'ok' | 'applied' | 'pending_confirmation' | 'error';
  tool: string;
  proposalId?: string;
  /** Resumen compacto y actualizado de la propuesta afectada (el «contexto vivo»), o `null` si la herramienta no toca ninguna. */
  proposal: ProposalStateSummary | null;
  data?: unknown;
  cards?: AgentCard[];
  error?: NonNullable<ToolPayload['error']>;
  /** Cambio aplicado (para deshacerlo con undo_change). */
  activityId?: string;
  /** Acción que espera la confirmación del usuario en la app. */
  actionId?: string;
  /** Misma llamada del mismo turno ya ejecutada: no se volvió a aplicar. */
  duplicate?: boolean;
}

/** Declaraciones activas para el asistente de la app: el conjunto fijo, sin las que la política de este dispositivo niega. */
export function listAssistantToolset(): AgentToolDefinition[] {
  const policy = store().agentPolicy[agentPolicyKey('app-assistant')];
  return appAssistantToolDefinitions().filter((definition) => policy[definition.kind] !== 'deny');
}

const PRICING_OPERATIONS = new Set<ProposalOperation['op']>([
  'select_equipment', 'add_equipment', 'remove_equipment', 'set_storage', 'set_margin_pct', 'best_supplier', 'suggest_direct_price',
  'upsert_item', 'remove_item', 'upsert_discount', 'remove_discount',
]);
/** Como hoy: los precios son sensibles venga de la herramienta que venga; un lote que los toca se trata entero como protegido. */
export function operationsTouchPricing(ops: unknown): boolean {
  if (!Array.isArray(ops)) return false;
  return ops.some((op: ProposalOperation) => {
    if (PRICING_OPERATIONS.has(op?.op)) return true;
    if (op?.op !== 'set' || typeof op.path !== 'string') return false;
    const [section, field] = parseFieldPath(op.path) ?? [];
    return typeof section === 'string' && typeof field === 'string' && touchesPricingEdits([{ section, field }]);
  });
}

/** Herramientas compartidas cuyo `id` es el de una propuesta. */
const PROPOSAL_BY_ID = new Set(['set_proposal_status', 'set_commercial_status', 'duplicate_proposal', 'get_project', 'get_simulation']);
function proposalOf(name: string, args: Record<string, unknown>) {
  const id = typeof args.proposalId === 'string' ? args.proposalId : PROPOSAL_BY_ID.has(name) && typeof args.id === 'string' ? args.id : undefined;
  return id ? visibleAssistantProjects().find((p) => p.id === id) : undefined;
}

function response(tool: string, status: AssistantToolResponse['status'], payload: ToolPayload | undefined, extra: Partial<AssistantToolResponse> = {}): AssistantToolResponse {
  const proposalId = payload?.proposalId ?? extra.proposalId;
  const s = store();
  const project = proposalId ? s.projects.find((p) => p.id === proposalId) : undefined;
  return {
    status, tool,
    ...(proposalId ? { proposalId } : {}),
    changes: payload?.changes ?? [],
    results: payload?.results ?? { before: null, after: null },
    warnings: payload?.warnings ?? [],
    proposal: project ? proposalStateSummary(project, { open: project.id === s.activeProjectId }) : null,
    ...(payload?.data !== undefined ? { data: payload.data } : {}),
    ...(payload?.error ? { error: payload.error } : {}),
    ...extra,
  };
}
const failed = (tool: string, code: string, message: string, extra: Partial<AssistantToolResponse> = {}) =>
  response(tool, 'error', undefined, { error: { code, message }, ...extra });

async function runOwn(handler: NativeHandler, definition: AgentToolDefinition, args: Record<string, unknown>, ctx: AgentToolContext): Promise<AssistantToolResponse> {
  const name = definition.name;
  const policy = store().agentPolicy[agentPolicyKey(ctx.source)];
  if (policy[definition.kind] === 'deny') return failed(name, 'denied', 'Los permisos de agentes de este dispositivo no permiten esta acción.');
  const errors = validateJsonSchema(definition.inputSchema, args);
  if (errors.length) return failed(name, 'invalid_arguments', errors.slice(0, 5).join(' '));
  if (ctx.signal?.aborted) return failed(name, 'cancelled', 'Solicitud cancelada.');
  const effective: AgentToolDefinition = name === 'edit_proposal' && operationsTouchPricing(args.ops) ? { ...definition, kind: 'guarded' } : definition;
  let preview: ToolPayload | undefined;
  const capture: NativeHandler = async (a, c) => {
    const result = await handler(a, c);
    preview = result.data as ToolPayload | undefined;
    return result;
  };
  const outcome: AgentToolOutcome = await runNativeTool(capture, effective, args, ctx);
  const proposalId = typeof args.proposalId === 'string' ? args.proposalId : undefined;
  switch (outcome.status) {
    case 'error': return response(name, 'error', preview?.error ? preview : undefined, { error: { code: outcome.code, message: outcome.message }, ...(proposalId ? { proposalId } : {}) });
    case 'ok': return response(name, preview?.error ? 'error' : 'ok', outcome.data as ToolPayload, { cards: outcome.cards });
    case 'applied': return response(name, 'applied', outcome.data as ToolPayload, { activityId: outcome.activityId, cards: outcome.cards });
    case 'pending_confirmation': return response(name, 'pending_confirmation', preview, { actionId: outcome.actionId, cards: outcome.cards });
  }
}

async function runShared(call: AgentToolCall, args: Record<string, unknown>, ctx: AgentToolContext): Promise<AssistantToolResponse> {
  const before = proposalOf(call.name, args);
  const snapshot = before ? structuredClone(before) : undefined;
  const outcome = await executeAgentTool({ name: call.name, args }, ctx);
  const after = snapshot ? store().projects.find((p) => p.id === snapshot.id) : undefined;
  const mode = energyCalculationMode(effectiveFeatureSettings(store()));
  const applied = outcome.status === 'applied';
  const payload: ToolPayload = {
    ...(snapshot ? { proposalId: snapshot.id } : {}),
    changes: applied && snapshot && after ? diffProjectFields(snapshot, after) : [],
    results: { before: applied && snapshot ? engineResults(snapshot, mode) : null, after: after ? engineResults(after, mode) : null },
    warnings: [],
  };
  switch (outcome.status) {
    case 'error': return response(call.name, 'error', payload, { error: { code: outcome.code, message: outcome.message } });
    case 'ok': return response(call.name, 'ok', { ...payload, data: outcome.data }, { cards: outcome.cards });
    case 'applied': return response(call.name, 'applied', { ...payload, data: outcome.data }, { activityId: outcome.activityId, cards: outcome.cards });
    case 'pending_confirmation': return response(call.name, 'pending_confirmation', { ...payload, data: { summary: outcome.summary } }, { actionId: outcome.actionId, cards: outcome.cards });
  }
}

/** Respuestas de las escrituras por `owner + turno + llamada`: un reintento del mismo turno no vuelve a aplicar. */
const completed = new Map<string, { fingerprint: string; response: AssistantToolResponse }>();
const MAX_COMPLETED = 200;

/** Ejecuta una herramienta del conjunto del asistente de la app. Ver el encabezado del módulo. */
export async function executeAssistantToolset(call: AgentToolCall, ctx: AgentToolContext): Promise<AssistantToolResponse> {
  const definition = appAssistantToolDefinitions().find((d) => d.name === call.name);
  if (!definition) return failed(call.name, 'unknown_tool', 'Esa herramienta no está en el conjunto del asistente.');
  const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};
  const key = definition.kind !== 'read' && ctx.turnId && ctx.callId ? `${ctx.owner}\u0000${ctx.turnId}\u0000${ctx.callId}` : undefined;
  const fingerprint = `${call.name}\u0000${JSON.stringify(args)}`;
  const previous = key ? completed.get(key) : undefined;
  if (previous) {
    if (previous.fingerprint !== fingerprint) return failed(call.name, 'idempotency_conflict', 'Esta llamada del turno ya se usó con otros argumentos.');
    return { ...previous.response, duplicate: true };
  }
  const handler = APP_ASSISTANT_HANDLERS[definition.name];
  const result = handler ? await runOwn(handler, definition, args, ctx) : await runShared(call, args, ctx);
  if (key && result.status !== 'error') {
    completed.set(key, { fingerprint, response: result });
    while (completed.size > MAX_COMPLETED) completed.delete(completed.keys().next().value!);
  }
  return result;
}
