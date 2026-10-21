// Runtime for the shared agent tools: one entry point for both in-app assistants and the local MCP bridge.
import { AGENT_TOOL_DEFINITIONS, findAgentTool } from '../../../shared/agentTools/definitions';
import { validateJsonSchema } from '../../../shared/agentTools/jsonSchema';
import type { AgentSource, AgentToolCall, AgentToolDefinition, AgentToolOutcome } from '../../../shared/agentTools/types';
import type { AgentCard } from '../../../shared/agentCards';
import { editableAssistantFields } from '../assistant/validation';
import { executeAssistantTool } from '../assistant/tools';
import type { AssistantAction, AssistantCard, AssistantToolResult } from '../assistant/types';

export interface AgentToolContext {
  source: AgentSource;
  /** Workspace/session owner captured when the request started; a change invalidates the call. */
  owner: string;
  clientLabel?: string;
  signal?: AbortSignal;
}

const MAX_RESULT_BYTES = 64000;
const pendingActions = new Map<string, AssistantAction>();

export function listAgentTools(source: AgentSource): AgentToolDefinition[] {
  return AGENT_TOOL_DEFINITIONS.filter((d) => d.surfaces.includes(source)).map(describeAgentTool);
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

export async function executeAgentTool(call: AgentToolCall, ctx: AgentToolContext): Promise<AgentToolOutcome> {
  const definition = findAgentTool(call.name);
  if (!definition || !definition.surfaces.includes(ctx.source))
    return { status: 'error', code: 'unknown_tool', message: 'Herramienta no permitida.' };
  const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};
  const errors = validateJsonSchema(definition.inputSchema, args);
  if (errors.length) return { status: 'error', code: 'invalid_arguments', message: errors.slice(0, 5).join(' ') };
  if (ctx.signal?.aborted) return { status: 'error', code: 'cancelled', message: 'Solicitud cancelada.' };
  let result: AssistantToolResult;
  try {
    result = executeAssistantTool({ name: call.name, args: decodeArgs(args) }, ctx.owner);
  } catch (error) {
    return { status: 'error', code: 'tool_failed', message: error instanceof Error ? error.message : 'Herramienta no disponible.' };
  }
  if (JSON.stringify(result.data ?? null).length > MAX_RESULT_BYTES)
    return { status: 'error', code: 'result_too_large', message: 'Resultado demasiado grande. Consulta un equipo o una propuesta específica.' };
  const cards = result.cards?.map(toAgentCard);
  if (result.action) {
    pendingActions.set(result.action.id, result.action);
    // Bounded: only recent plans can be confirmed; older ones must be prepared again.
    while (pendingActions.size > 50) pendingActions.delete(pendingActions.keys().next().value!);
    return { status: 'pending_confirmation', actionId: result.action.id, summary: result.action.title, cards };
  }
  return { status: 'ok', data: result.data, cards };
}

export function getPendingAgentAction(actionId: string): AssistantAction | undefined {
  return pendingActions.get(actionId);
}

/** Legacy shape consumed by the general assistant UI (cards + confirmable action). */
export async function executeForAssistant(call: AgentToolCall, ctx: AgentToolContext): Promise<AssistantToolResult> {
  const outcome = await executeAgentTool(call, ctx);
  if (outcome.status === 'error') throw new Error(outcome.message);
  const cards = outcome.cards?.map(toAssistantCard).filter((c): c is AssistantCard => !!c);
  if (outcome.status === 'pending_confirmation') {
    const action = getPendingAgentAction(outcome.actionId)!;
    return { data: { status: 'pending_confirmation', edits: action.edits }, cards, action };
  }
  return { data: outcome.data, cards };
}
