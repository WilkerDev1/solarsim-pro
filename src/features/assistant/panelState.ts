/**
 * Estado derivado del panel del asistente (F5b). Puro: sin React ni store, sobre el estado de la sesión.
 *
 * - `assistantBadge`: la insignia discreta del botón del asistente (trabajo en curso o cambios sin ver con el panel cerrado).
 * - `turnChangeCards`: las tarjetas de cambio (ChangeCard de F5a) de un turno, con su estado al día: lo que se deshizo desde
 *   el panel pasa a «deshecho» y lo confirmado o rechazado deja de pedir confirmación.
 */
import type { ChangeCardInput } from '../assistantFeedback';
import type { AssistantSessionState, SessionAssistantMessage } from './session/assistantSession';

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

/** Las tarjetas del turno, en orden de llamada, con lo resuelto desde el panel (deshacer, confirmar, rechazar). */
export function turnChangeCards(message: Pick<SessionAssistantMessage, 'changeCards' | 'undone' | 'resolutions'>): TurnChangeCard[] {
  return (message.changeCards ?? []).map(({ callId, input }) => {
    if (input.status === 'applied' && input.activityId && message.undone?.[input.activityId]) return { callId, input: { ...input, status: 'undone' } };
    if (input.status === 'pending_confirmation' && input.actionId) {
      const resolution = message.resolutions?.[input.actionId];
      if (resolution === 'applied') return { callId, input: { ...input, status: 'applied', actionId: undefined } };
      if (resolution === 'rejected') return { callId, input: { ...input, status: 'rejected' } };
      if (resolution) return { callId, input: { ...input, status: /caduc/i.test(resolution) ? 'expired' : 'error', error: { code: 'confirm_failed', message: resolution } } };
    }
    return { callId, input };
  });
}
