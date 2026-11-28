// Lo que hizo un turno en el panel del asistente (F5b): una tarjeta de cambio (ChangeCard de F5a) por respuesta de herramienta,
// con los datos reales de la respuesta (diff, resultados del motor antes/después, avisos y supuestos), y Deshacer,
// Confirmar y Rechazar conectados a la sesión. Debajo, lo que no es de una tarjeta: supuestos sueltos, qué falta, qué falló,
// el modelo de respaldo y «Continuar». Lee el estado del turno de la sesión (`TurnState` de F3c y `changeCards`).
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ChangeCard } from '../../assistantFeedback/ChangeCard';
import { turnChangeCards } from '../panelState';
import type { SessionAssistantMessage } from '../session/assistantSession';
import { assistantToolLabel } from '../session/assistantSession';
import { assistantValueLabel } from '../labels';
import { InfoTip } from '../../../components/simulator/params/ui/InfoTip';

/** Valor legible para la lista de cambios (nunca JSON largo). */
export function formatChangeValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '—';
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number')) return value.length === 12 ? `12 meses (${(value as number[]).reduce((a, b) => a + b, 0).toLocaleString('es-DO', { maximumFractionDigits: 0 })} al año)` : `${value.length} valores`;
    return value.length === 1 ? '1 elemento' : `${value.length} elementos`;
  }
  if (value && typeof value === 'object') {
    const named = (value as { brandModel?: unknown; description?: unknown }).brandModel ?? (value as { description?: unknown }).description;
    return typeof named === 'string' && named ? named : 'cambiado';
  }
  const label = assistantValueLabel(value);
  return label.length > 80 ? `${label.slice(0, 77)}…` : label;
}

export interface TurnDetailsActions {
  confirmPending(actionId: string): void;
  rejectPending(actionId: string): void;
  undo(activityId: string): void;
  continueTurn(): void;
}

/** Llamadas del turno en curso como pasos legibles (para «Pensando…»). */
export function turnSteps(message: SessionAssistantMessage): string[] {
  return message.turn.toolOrder.map((id) => {
    const call = message.turn.tools[id];
    const label = assistantToolLabel(call.name);
    return call.status === 'error' ? `${label} (falló)` : call.status === 'pending_confirmation' ? `${label} (espera confirmación)` : label;
  });
}

export function AssistantTurnDetails({ message, busy, actions }: { message: SessionAssistantMessage; busy: boolean; actions: TurnDetailsActions }) {
  const { turn } = message;
  const summary = turn.summary;
  if (!summary) return null;
  const cards = turnChangeCards(message);
  // Los supuestos que ya muestra una tarjeta no se repiten abajo.
  const inCards = new Set(cards.flatMap(({ input }) => (input.assumptions ?? []).map((a) => `${a.source}:${a.key}`)));
  const looseAssumptions = summary.assumptions.filter((a) => !inCards.has(`${a.source}:${a.key}`));
  const failed = summary.failedTools.map(assistantToolLabel);
  if (!cards.length && !looseAssumptions.length && !failed.length && !summary.missing.length && !message.canContinue && !message.modelNotice) return null;
  return (
    <div className="assistant-turn-details">
      {cards.map(({ callId, input }) => (
        <ChangeCard
          key={callId}
          input={input}
          // Deshacer espera a que el turno termine (el modelo podría estar usando ese cambio); confirmar o rechazar no.
          busy={busy && input.status === 'applied'}
          onUndo={input.activityId ? () => actions.undo(input.activityId!) : undefined}
          onConfirm={input.actionId ? () => actions.confirmPending(input.actionId!) : undefined}
          onReject={input.actionId ? () => actions.rejectPending(input.actionId!) : undefined}
        />
      ))}
      {looseAssumptions.length > 0 && (
        <section aria-label="Supuestos">
          <h3>Supuse</h3>
          <ul className="assistant-turn-list">
            {looseAssumptions.map((a) => <li key={`${a.source}:${a.key}`}>{a.label}: {formatChangeValue(a.value)}</li>)}
          </ul>
        </section>
      )}
      {(summary.missing.length > 0 || failed.length > 0 || message.modelNotice) && (
        <p className="assistant-turn-notes">
          {summary.missing.length > 0 && <span>Propuesta incompleta <InfoTip label="Qué falta en la propuesta" text={summary.missing.join(' ')} /></span>}
          {failed.length > 0 && <span>Sin completar: {failed.join(', ')}</span>}
          {message.modelNotice && <span>Modelo de respaldo <InfoTip label="Modelo de respaldo" text={message.modelNotice} /></span>}
        </p>
      )}
      {message.canContinue && (
        <div className="assistant-turn-actions">
          <button type="button" disabled={busy} onClick={actions.continueTurn}><ArrowRight size={12} aria-hidden /> Continuar</button>
        </div>
      )}
    </div>
  );
}
