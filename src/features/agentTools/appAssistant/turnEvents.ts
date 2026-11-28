/**
 * Eventos del turno del asistente de la app (F3c) y su reducción pura. Los emite el bucle (F4) y los consume el panel (F5):
 * aquí solo hay tipos y funciones puras, sin interfaz, sin reloj y sin store.
 *
 * Un turno es la secuencia de eventos desde el mensaje del usuario hasta el cierre. La reducción es reproducible (los
 * mismos eventos dan el mismo estado, paso a paso o de golpe) y no muta su entrada; `turn_finished` y un error no
 * recuperable cierran el turno igual (llamadas en curso `interrupted` y resumen), y luego los eventos tardíos se ignoran. Una
 * llamada aplicada no se sobrescribe, y un `idempotency_conflict` no sustituye a la llamada ya terminada de su callId.
 *
 * Los supuestos solo entran si salen de la lista cerrada (`assumptions.ts`); uno inventado queda como error recuperable
 * `assumption_rejected`, que el bucle devuelve al modelo para que lo corrija.
 */
import type { ProjectFieldChange } from '../../../domain/projectEditTransaction';
import type { AgentChange } from '../../../store/slices/agentSlice';
import type { SizingAssumptionUsed } from '../../../domain/sizing';
import {
  assumptionFromSizing, validateDeclaredAssumption, type AssumptionReferences, type DeclaredAssumption, type SizingCitationContext,
} from './assumptions';
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

/** Cierra el turno con `status`: las llamadas en curso quedan interrumpidas y se calcula el resumen. */
function closeTurn(state: TurnState, status: 'finished' | 'failed', input: TurnSummaryInput): TurnState {
  const tools = Object.fromEntries(Object.entries(state.tools).map(([id, call]) => [id, call.status === 'running' ? { ...call, status: 'interrupted' as const } : call]));
  const closed: TurnState = { ...state, tools, status };
  return { ...closed, summary: turnSummary(closed, input) };
}

/**
 * Aplica un evento. No muta `state`; devuelve el mismo objeto si el evento no cambia nada. `refs` (Ajustes vigentes y la
 * propuesta del turno) valida los supuestos de esas fuentes: sin ellas, un supuesto de Ajustes o de la propuesta se rechaza.
 */
export function reduceTurnEvent(state: TurnState, event: AssistantTurnEvent, refs: AssumptionReferences = {}): TurnState {
  if (state.status !== 'running') return state;
  switch (event?.type) {
    case 'text_delta':
      return event.text ? { ...state, text: state.text + event.text } : state;
    case 'tool_call_started': {
      // Un reinicio del mismo callId (reintento) no borra una llamada que ya terminó: conserva su estado y su diff.
      const known = state.tools[event.callId];
      if (known && known.status !== 'running') return state;
      return withTool(state, { callId: event.callId, name: event.name, status: 'running', changes: [] });
    }
    case 'tool_call_finished': {
      // Una llamada ya terminada no se pierde: una respuesta posterior del mismo callId solo cuenta si es la transición real
      // de una confirmación (pendiente → aplicada o error, el estado de la acción en la cola). Un idempotency_conflict (el
      // callId se reutilizó con otros argumentos) nunca sustituye a la llamada: queda como error recuperable, que el mismo
      // toolResponseEvents emite. Tampoco un error posterior borra lo aplicado.
      const known = state.tools[event.callId];
      if (known && known.status !== 'running') {
        if (event.error?.code === 'idempotency_conflict') return state;
        if (known.status === 'applied') return state;
      }
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
      const result = validateDeclaredAssumption(event.assumption, refs);
      if (!result.ok) return { ...state, errors: [...state.errors, { code: 'assumption_rejected', message: result.reason, recoverable: true }] };
      if (state.assumptions.some((a) => sameAssumption(a, result.assumption))) return state;
      return { ...state, assumptions: [...state.assumptions, result.assumption] };
    }
    case 'recoverable_error': {
      const recoverable = event.recoverable !== false;
      const error: TurnError = { code: event.code, message: event.message, ...(event.callId ? { callId: event.callId } : {}), recoverable };
      const next = { ...state, errors: [...state.errors, error] };
      // Un error no recuperable cierra el turno como turn_finished: lo en curso queda interrumpido y hay resumen de lo hecho.
      return recoverable ? next : closeTurn(next, 'failed', {});
    }
    case 'turn_finished':
      return closeTurn(state, 'finished', event.summary);
    default:
      return state;
  }
}

export const reduceTurnEvents = (state: TurnState, events: readonly AssistantTurnEvent[], refs: AssumptionReferences = {}): TurnState =>
  events.reduce((acc, event) => reduceTurnEvent(acc, event, refs), state);

/**
 * Eventos de una respuesta del conjunto del asistente (`executeAssistantToolset`): la llamada terminada con su diff, la
 * confirmación pendiente (con los cambios de su tarjeta), el error recuperable y los supuestos que cite el dimensionado
 * (`data.assumptions`, de la lista cerrada; el resto se descarta). `context` lleva la propuesta del turno y los argumentos
 * de la llamada: sin la propuesta no se declara un dato «de la propuesta», y lo pedido por argumento no es un supuesto.
 */
export function toolResponseEvents(callId: string, response: AssistantToolResponse, context: SizingCitationContext = {}): AssistantTurnEvent[] {
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
      const assumption = used && typeof used === 'object' ? assumptionFromSizing(used as SizingAssumptionUsed, context) : undefined;
      if (assumption) events.push({ type: 'assumption_declared', assumption });
    }
  return events;
}
