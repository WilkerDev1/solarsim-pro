/**
 * Eventos del turno del asistente de la app (F3c) y su reducción pura. Los emite el bucle (F4) y los consume el panel (F5):
 * aquí solo hay tipos y funciones puras, sin interfaz, sin reloj y sin store.
 *
 * Un turno es la secuencia de eventos desde el mensaje del usuario hasta el cierre. La reducción es reproducible (los
 * mismos eventos dan el mismo estado, paso a paso o de golpe) y no muta su entrada; tras `turn_finished` (o un error no
 * recuperable) el estado queda fijo y los eventos tardíos se ignoran.
 *
 * Los supuestos solo entran si salen de la lista cerrada (`assumptions.ts`); uno inventado queda como error recuperable
 * `assumption_rejected`, que el bucle devuelve al modelo para que lo corrija.
 */
import type { ProjectFieldChange } from '../../../domain/projectEditTransaction';
import type { AgentChange } from '../../../store/slices/agentSlice';
import type { SizingAssumptionUsed } from '../../../domain/sizing';
import { assumptionFromSizing, validateDeclaredAssumption, type DeclaredAssumption } from './assumptions';
import type { AssistantToolResponse } from './toolset';

export const TURN_EVENT_TYPES = [
  'text_delta', 'tool_call_started', 'tool_call_finished', 'confirmation_pending', 'assumption_declared', 'recoverable_error', 'turn_finished',
] as const;
export type TurnEventType = (typeof TURN_EVENT_TYPES)[number];

/** Estado con que termina una llamada (el de `AssistantToolResponse`). */
export type ToolCallStatus = AssistantToolResponse['status'];

export interface TurnSummaryInput {
  /** Lo que falta para completar la propuesta o el pedido, en español. */
  missing?: string[];
  /** Siguientes pasos sugeridos. */
  nextSteps?: string[];
}

export type AssistantTurnEvent =
  /** Texto parcial del modelo (se concatena). */
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_started'; callId: string; name: string; args?: Record<string, unknown> }
  /** Llamada terminada con su diff por ruta (vacío si no cambió nada). */
  | {
    type: 'tool_call_finished'; callId: string; name: string; status: ToolCallStatus; changes: ProjectFieldChange[];
    proposalId?: string; activityId?: string; error?: { code: string; message: string };
  }
  /** Un cambio espera la confirmación del usuario en la app (cola de acciones). */
  | { type: 'confirmation_pending'; callId: string; actionId: string; title: string; changes: AgentChange[] }
  | { type: 'assumption_declared'; assumption: DeclaredAssumption }
  /** Error del que el turno se puede recuperar (por defecto); `recoverable: false` lo termina. */
  | { type: 'recoverable_error'; code: string; message: string; callId?: string; recoverable?: boolean }
  /** Cierre del turno: lo que el bucle sabe además de lo que ya dicen los eventos. */
  | { type: 'turn_finished'; summary: TurnSummaryInput };

export interface TurnToolCall {
  callId: string;
  name: string;
  /** `running` mientras no termina; `interrupted` si el turno se cerró antes. */
  status: ToolCallStatus | 'running' | 'interrupted';
  changes: ProjectFieldChange[];
  proposalId?: string;
  activityId?: string;
  error?: { code: string; message: string };
}

export interface TurnPendingConfirmation {
  callId: string;
  actionId: string;
  title: string;
  changes: AgentChange[];
}

export interface TurnError {
  code: string;
  message: string;
  callId?: string;
  recoverable: boolean;
}

/** Resumen del turno: qué cambió, qué se supuso, qué espera confirmación, qué falta y qué sigue. */
export interface TurnSummary {
  changes: (ProjectFieldChange & { proposalId?: string })[];
  assumptions: DeclaredAssumption[];
  pendingConfirmations: TurnPendingConfirmation[];
  missing: string[];
  nextSteps: string[];
  /** Herramientas que fallaron o quedaron interrumpidas. */
  failedTools: string[];
  /** Propuestas tocadas, en orden de aparición. */
  proposalIds: string[];
}

export interface TurnState {
  turnId: string;
  status: 'running' | 'finished' | 'failed';
  text: string;
  tools: Record<string, TurnToolCall>;
  /** Orden de las llamadas (por primera aparición). */
  toolOrder: string[];
  pendingConfirmations: TurnPendingConfirmation[];
  assumptions: DeclaredAssumption[];
  errors: TurnError[];
  /** Solo al terminar. */
  summary?: TurnSummary;
}

export function initialTurnState(turnId: string): TurnState {
  return { turnId, status: 'running', text: '', tools: {}, toolOrder: [], pendingConfirmations: [], assumptions: [], errors: [] };
}

const sameAssumption = (a: DeclaredAssumption, b: DeclaredAssumption) => a.source === b.source && a.key === b.key && JSON.stringify(a.value) === JSON.stringify(b.value);
const unique = (values: readonly string[]) => [...new Set(values)];

function withTool(state: TurnState, call: TurnToolCall): TurnState {
  return {
    ...state,
    tools: { ...state.tools, [call.callId]: call },
    toolOrder: state.toolOrder.includes(call.callId) ? state.toolOrder : [...state.toolOrder, call.callId],
  };
}

/** El resumen del estado actual (con lo que añadió el cierre, si lo hubo). */
export function turnSummary(state: TurnState, input: TurnSummaryInput = { missing: state.summary?.missing, nextSteps: state.summary?.nextSteps }): TurnSummary {
  const calls = state.toolOrder.map((id) => state.tools[id]);
  return {
    changes: calls.flatMap((call) => (call.status === 'applied' ? call.changes.map((change) => ({ ...(call.proposalId ? { proposalId: call.proposalId } : {}), ...change })) : [])),
    assumptions: state.assumptions,
    pendingConfirmations: state.pendingConfirmations,
    missing: [...(input.missing ?? [])],
    nextSteps: [...(input.nextSteps ?? [])],
    failedTools: unique(calls.filter((call) => call.status === 'error' || call.status === 'interrupted').map((call) => call.name)),
    proposalIds: unique(calls.flatMap((call) => (call.proposalId ? [call.proposalId] : []))),
  };
}

/** Aplica un evento. No muta `state`; devuelve el mismo objeto si el evento no cambia nada. */
export function reduceTurnEvent(state: TurnState, event: AssistantTurnEvent): TurnState {
  if (state.status !== 'running') return state;
  switch (event?.type) {
    case 'text_delta':
      return event.text ? { ...state, text: state.text + event.text } : state;
    case 'tool_call_started':
      return withTool(state, { callId: event.callId, name: event.name, status: 'running', changes: [] });
    case 'tool_call_finished': {
      const next = withTool(state, {
        callId: event.callId, name: event.name, status: event.status, changes: [...event.changes],
        ...(event.proposalId ? { proposalId: event.proposalId } : {}), ...(event.activityId ? { activityId: event.activityId } : {}),
        ...(event.error ? { error: event.error } : {}),
      });
      // Una llamada que terminó aplicada o con error ya no espera confirmación.
      return event.status === 'pending_confirmation' ? next : { ...next, pendingConfirmations: next.pendingConfirmations.filter((p) => p.callId !== event.callId) };
    }
    case 'confirmation_pending': {
      const pending = { callId: event.callId, actionId: event.actionId, title: event.title, changes: [...event.changes] };
      return { ...state, pendingConfirmations: [...state.pendingConfirmations.filter((p) => p.actionId !== event.actionId), pending] };
    }
    case 'assumption_declared': {
      const result = validateDeclaredAssumption(event.assumption);
      if (!result.ok) return { ...state, errors: [...state.errors, { code: 'assumption_rejected', message: result.reason, recoverable: true }] };
      if (state.assumptions.some((a) => sameAssumption(a, result.assumption))) return state;
      return { ...state, assumptions: [...state.assumptions, result.assumption] };
    }
    case 'recoverable_error': {
      const recoverable = event.recoverable !== false;
      const error: TurnError = { code: event.code, message: event.message, ...(event.callId ? { callId: event.callId } : {}), recoverable };
      return { ...state, errors: [...state.errors, error], ...(recoverable ? {} : { status: 'failed' as const }) };
    }
    case 'turn_finished': {
      const tools = Object.fromEntries(Object.entries(state.tools).map(([id, call]) => [id, call.status === 'running' ? { ...call, status: 'interrupted' as const } : call]));
      const closed: TurnState = { ...state, tools, status: 'finished' };
      return { ...closed, summary: turnSummary(closed, event.summary) };
    }
    default:
      return state;
  }
}

export const reduceTurnEvents = (state: TurnState, events: readonly AssistantTurnEvent[]): TurnState => events.reduce(reduceTurnEvent, state);

/**
 * Eventos de una respuesta del conjunto del asistente (`executeAssistantToolset`): la llamada terminada con su diff, la
 * confirmación pendiente (con los cambios de su tarjeta), el error recuperable y los supuestos que cite el dimensionado
 * (`data.assumptions`, de la lista cerrada; el resto se descarta).
 */
export function toolResponseEvents(callId: string, response: AssistantToolResponse): AssistantTurnEvent[] {
  const events: AssistantTurnEvent[] = [{
    type: 'tool_call_finished', callId, name: response.tool, status: response.status,
    ...(response.proposalId ? { proposalId: response.proposalId } : {}), ...(response.activityId ? { activityId: response.activityId } : {}),
    changes: [...response.changes],
    ...(response.error ? { error: { code: response.error.code, message: response.error.message } } : {}),
  }];
  if (response.status === 'pending_confirmation' && response.actionId) {
    const card = response.cards?.find((c) => c.type === 'pending-action' && c.actionId === response.actionId);
    const changes: AgentChange[] = card && card.type === 'pending-action'
      ? card.changes.map((c) => ({ label: c.label, value: c.after }))
      : response.changes.map((c) => ({ label: c.label, value: JSON.stringify(c.after) }));
    events.push({ type: 'confirmation_pending', callId, actionId: response.actionId, title: card?.title ?? response.tool, changes });
  }
  if (response.status === 'error' && response.error) events.push({ type: 'recoverable_error', callId, code: response.error.code, message: response.error.message });
  const cited = (response.data as { assumptions?: unknown } | undefined)?.assumptions;
  if (Array.isArray(cited))
    for (const used of cited) {
      const assumption = used && typeof used === 'object' ? assumptionFromSizing(used as SizingAssumptionUsed) : undefined;
      if (assumption) events.push({ type: 'assumption_declared', assumption });
    }
  return events;
}
