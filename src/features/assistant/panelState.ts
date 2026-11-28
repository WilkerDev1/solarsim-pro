/**
 * Estado derivado del panel del asistente (F5b). Puro: sin React ni store, sobre el estado de la sesión.
 *
 * - `assistantBadge`: la insignia discreta del botón del asistente (trabajo en curso o cambios sin ver con el panel cerrado).
 * - `turnChangeCards`: las tarjetas de cambio (ChangeCard de F5a) de un turno, con su estado al día: lo deshecho (desde el
 *   panel o por `undo_change`) pasa a «deshecho», un Deshacer fallido muestra su motivo, lo confirmado o rechazado deja de
 *   pedir confirmación y lo caducado se ve caducado antes de pulsarlo.
 * - `turnUndoTargets`: lo que revierte «Deshacer todo el turno».
 * - `createdProposalCard`: la tarjeta «Propuesta creada» (equipos y, si está completa, kWp, precio, ahorro y retorno).
 */
import type { ChangeCardInput } from '../assistantFeedback';
import type { AssistantSessionState, SessionAssistantMessage } from './session/assistantSession';
import type { AgentActivityEntry, PendingAgentAction } from '../../store/slices/agentSlice';
import type { AssistantToolResponse } from '../agentTools/appAssistant/toolset';

export type AssistantBadgeKind = 'working' | 'unseen' | null;

export function assistantBadge(state: Pick<AssistantSessionState, 'busy' | 'unseen' | 'queued'>): { kind: AssistantBadgeKind; label: string } {
  if (state.busy) return { kind: 'working', label: state.queued ? 'trabajando; tu mensaje está en cola' : 'trabajando' };
  if (state.unseen) return { kind: 'unseen', label: 'respuesta o cambios sin ver' };
  return { kind: null, label: '' };
}

export interface TurnChangeCard {
  callId: string;
  input: ChangeCardInput;
}

/**
 * Lo que dice el store en este momento: la actividad (un cambio deshecho por el modelo con `undo_change` o desde Ajustes) y
 * la cola de confirmaciones (resuelta fuera del panel, o caducada). `now` para la caducidad (puro: sin reloj propio).
 */
export interface TurnDetailsLive {
  agentActivity: readonly Pick<AgentActivityEntry, 'id' | 'status' | 'source' | 'turnId' | 'undo'>[];
  pendingAgentActions: readonly Pick<PendingAgentAction, 'id' | 'status' | 'expiresAt' | 'activityId' | 'error'>[];
  now: number;
}

const EXPIRED_MESSAGE = 'La acción caducó. Pide al asistente que la prepare de nuevo.';

/**
 * Las tarjetas del turno, en orden de llamada, al día: lo resuelto desde el panel (deshacer, su fallo, confirmar, rechazar)
 * y, con `live`, lo que dice el store (deshecho por otra vía, confirmación resuelta fuera o caducada al pintarla).
 */
export function turnChangeCards(
  message: Pick<SessionAssistantMessage, 'changeCards' | 'undone' | 'undoErrors' | 'resolutions'>,
  live?: TurnDetailsLive,
): TurnChangeCard[] {
  const activity = (id: string) => live?.agentActivity.find((a) => a.id === id);
  const pending = (id: string) => live?.pendingAgentActions.find((a) => a.id === id);
  const applied = (input: ChangeCardInput): ChangeCardInput => {
    const id = input.activityId;
    if (!id) return input;
    if (message.undone?.[id] || activity(id)?.status === 'undone') return { ...input, status: 'undone' };
    const failed = message.undoErrors?.[id];
    // Un Deshacer que falló no se vuelve a ofrecer (fallaría igual): queda el motivo, con role=alert.
    if (failed) return { ...input, activityId: undefined, error: { code: 'undo_failed', message: failed } };
    return input;
  };
  return (message.changeCards ?? []).map(({ callId, input }) => {
    if (input.status === 'applied') return { callId, input: applied(input) };
    if (input.status === 'pending_confirmation' && input.actionId) {
      const resolution = message.resolutions?.[input.actionId];
      const action = pending(input.actionId);
      if (resolution === 'applied' || (!resolution && action?.status === 'applied'))
        return { callId, input: applied({ ...input, status: 'applied', actionId: undefined, ...(action?.activityId ? { activityId: action.activityId } : {}) }) };
      if (resolution === 'rejected' || (!resolution && action?.status === 'rejected')) return { callId, input: { ...input, status: 'rejected' } };
      if (resolution) return { callId, input: { ...input, status: /caduc/i.test(resolution) ? 'expired' : 'error', error: { code: 'confirm_failed', message: resolution } } };
      if (action && (action.status === 'expired' || (action.status === 'pending' && live && Date.parse(action.expiresAt) < live.now)))
        return { callId, input: { ...input, status: 'expired', actionId: undefined, error: { code: 'expired', message: EXPIRED_MESSAGE } } };
      if (action?.status === 'failed')
        return { callId, input: { ...input, status: 'error', actionId: undefined, error: { code: 'confirm_failed', message: action.error || 'No se pudo aplicar.' } } };
    }
    return { callId, input };
  });
}

/** Hasta cuándo vale una confirmación pendiente (para su ⓘ), o `undefined` si ya no está pendiente. */
export function pendingValidUntil(actionId: string, live: TurnDetailsLive | undefined): string | undefined {
  const action = live?.pendingAgentActions.find((a) => a.id === actionId);
  return action?.status === 'pending' ? action.expiresAt : undefined;
}

/**
 * Lo que revierte «Deshacer todo el turno»: los cambios del asistente de ese turno aún aplicados y deshacibles, del más
 * reciente al más antiguo (la actividad ya va en ese orden). Mandar a la papelera o restaurar no entra: esos piden la
 * confirmación de siempre (`undo_change` o la papelera).
 */
export function turnUndoTargets(turnId: string, agentActivity: TurnDetailsLive['agentActivity']): string[] {
  return agentActivity
    .filter((a) => a.turnId === turnId && a.source === 'app-assistant' && a.status === 'applied' && !!a.undo && a.undo.op !== 'trash' && a.undo.op !== 'restore')
    .map((a) => a.id);
}

// ── Tarjeta «Propuesta creada» ──────────────────────────────────────────────────────────────────────────────────────────
export interface CreatedProposalCardView {
  proposalId: string;
  name: string;
  /** «10× Canadian 620 W», por grupo (paneles, inversores, baterías). */
  equipment: string[];
  /** Cifras del motor, solo si la propuesta está completa; `null` si no (nunca ceros falsos, ADR 0009). */
  metrics: { label: string; value: string }[] | null;
  /** Lo que falta si está incompleta. */
  reasons: string[];
}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** La tarjeta de una `create_proposal` aplicada, a partir de su respuesta (`results.after` y el resumen de la propuesta). */
export function createdProposalCard(response: AssistantToolResponse): CreatedProposalCardView | null {
  if (response.tool !== 'create_proposal' || response.status !== 'applied' || !response.proposalId) return null;
  const summary = response.proposal;
  const groups = summary ? [...summary.equipment.panels, ...summary.equipment.inverters, ...summary.equipment.batteries] : [];
  const equipment = groups.filter((g) => g.count > 0 && g.brandModel).map((g) => `${g.count}× ${g.brandModel}`);
  const after = response.results?.after ?? null;
  const metrics = after?.complete
    ? [
      { label: 'Potencia', value: `${after.metrics.systemCapacityKWp.toLocaleString('en-US', { maximumFractionDigits: 2 })} kWp` },
      { label: 'Precio de contrato', value: money(after.metrics.contractPriceUSD) },
      { label: 'Ahorro del año 1', value: money(after.metrics.year1SavingsUSD) },
      { label: 'Retorno', value: `${after.metrics.paybackYears.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} años` },
    ]
    : null;
  return {
    proposalId: response.proposalId,
    name: summary?.name || 'Propuesta nueva',
    equipment,
    metrics,
    reasons: after && !after.complete ? after.reasons.map((r) => r.message) : [],
  };
}
