// Lo que hizo un turno en el panel del asistente (F5b): una tarjeta de cambio (ChangeCard de F5a) por respuesta de herramienta,
// con los datos reales de la respuesta (diff, resultados del motor antes/después, avisos y supuestos), y Deshacer,
// Confirmar y Rechazar conectados a la sesión; una tarjeta «Propuesta creada» por creación; y «Deshacer todo el turno» con
// dos o más cambios deshacibles. Debajo, lo que no es de una tarjeta: supuestos sueltos, qué falta (sin repetir lo que ya dice
// una tarjeta), qué falló, el modelo de respaldo y «Continuar». Lee el estado del turno de la sesión (`TurnState` de F3c,
// `changeCards`, `createdProposals`) y, con `live`, la actividad y la cola de confirmaciones del store.
import React from 'react';
import { ArrowRight, Undo2 } from 'lucide-react';
import { ChangeCard } from '../../assistantFeedback/ChangeCard';
import { createdProposalStatus, pendingValidUntil, turnChangeCards, turnUndoTargets, type CreatedProposalCardView, type TurnDetailsLive } from '../panelState';

export type { TurnDetailsLive } from '../panelState';
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
  /** «Deshacer todo el turno» (sin él no se ofrece). */
  undoTurn?(turnId: string): void;
  continueTurn(): void;
}

/**
 * Tarjeta «Propuesta creada»: equipos y, solo si está completa, las cifras del motor (nunca ceros de una incompleta). Si la
 * creación se deshizo o la propuesta está en la papelera, lo dice y no muestra cifras.
 */
function CreatedProposalCard({ card, status }: { card: CreatedProposalCardView; status: 'live' | 'undone' | 'trashed' }) {
  if (status !== 'live')
    return (
      <section className="assistant-created-card" data-created-proposal={status} aria-label={`Propuesta creada: ${card.name}`}>
        <h3>{status === 'undone' ? 'Creación deshecha' : 'Propuesta en la papelera'} <small>{card.name}</small></h3>
        <p className="assistant-created-pending">
          {status === 'undone' ? 'La propuesta pasó a la papelera.' : 'Ya no está entre tus propuestas.'}{' '}
          <InfoTip label="Cómo recuperarla" text="Puedes restaurarla desde la papelera de propuestas." />
        </p>
      </section>
    );
  return (
    <section className="assistant-created-card" data-created-proposal={card.metrics ? 'complete' : 'incomplete'} aria-label={`Propuesta creada: ${card.name}`}>
      <h3>Propuesta creada <small>{card.name}</small></h3>
      {card.equipment.length > 0 && <p className="assistant-created-equipment">{card.equipment.join(' · ')}</p>}
      {card.metrics ? (
        <dl>
          {card.metrics.map((m) => (
            <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>
          ))}
        </dl>
      ) : card.reasons.length > 0 ? (
        <p className="assistant-created-pending">Propuesta incompleta: sin resultados todavía <InfoTip label="Qué falta en la propuesta" text={card.reasons.join(' ')} /></p>
      ) : null}
    </section>
  );
}

/** Llamadas del turno en curso como pasos legibles (para «Pensando…»). */
export function turnSteps(message: SessionAssistantMessage): string[] {
  return message.turn.toolOrder.map((id) => {
    const call = message.turn.tools[id];
    const label = assistantToolLabel(call.name);
    return call.status === 'error' ? `${label} (falló)` : call.status === 'pending_confirmation' ? `${label} (espera confirmación)` : label;
  });
}

const validUntilText = (iso: string) => `Vale hasta las ${new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}; después hay que pedirla de nuevo.`;

export function AssistantTurnDetails({ message, busy, actions, live }: { message: SessionAssistantMessage; busy: boolean; actions: TurnDetailsActions; live?: TurnDetailsLive }) {
  const { turn } = message;
  const summary = turn.summary;
  if (!summary) return null;
  const cards = turnChangeCards(message, live);
  const created = message.createdProposals ?? [];
  // Los supuestos y los motivos de «incompleta» que ya muestra una tarjeta no se repiten abajo.
  const inCards = new Set(cards.flatMap(({ input }) => (input.assumptions ?? []).map((a) => `${a.source}:${a.key}`)));
  const looseAssumptions = summary.assumptions.filter((a) => !inCards.has(`${a.source}:${a.key}`));
  const shownReasons = new Set([
    ...cards.flatMap(({ input }) => (input.results?.after && !input.results.after.complete ? input.results.after.reasons.map((r) => r.message) : [])),
    ...created.flatMap(({ card }) => card.reasons),
  ]);
  const missing = summary.missing.filter((reason) => !shownReasons.has(reason));
  const failed = summary.failedTools.map(assistantToolLabel);
  const undoAll = live ? turnUndoTargets(message.id, live.agentActivity, message.undoBlocked).length : 0;
  if (!cards.length && !created.length && !looseAssumptions.length && !failed.length && !missing.length && !message.canContinue && !message.modelNotice) return null;
  return (
    <div className="assistant-turn-details">
      {created.map(({ callId, card }) => <CreatedProposalCard key={callId} card={card} status={createdProposalStatus(message, callId, card.proposalId, live)} />)}
      {cards.map(({ callId, input }) => {
        const until = input.status === 'pending_confirmation' && input.actionId ? pendingValidUntil(input.actionId, live) : undefined;
        return (
          <React.Fragment key={callId}>
            <ChangeCard
              input={input}
              // Deshacer espera a que el turno termine (el modelo podría estar usando ese cambio); confirmar o rechazar no.
              busy={busy && input.status === 'applied'}
              onUndo={input.activityId ? () => actions.undo(input.activityId!) : undefined}
              onConfirm={input.actionId ? () => actions.confirmPending(input.actionId!) : undefined}
              onReject={input.actionId ? () => actions.rejectPending(input.actionId!) : undefined}
            />
            {until && <p className="assistant-turn-validity">Confirmación pendiente <InfoTip label="Hasta cuándo vale" text={validUntilText(until)} /></p>}
          </React.Fragment>
        );
      })}
      {undoAll >= 2 && actions.undoTurn && (
        <div className="assistant-turn-actions">
          <button type="button" disabled={busy} onClick={() => actions.undoTurn?.(message.id)}><Undo2 size={12} aria-hidden /> Deshacer todo el turno</button>
          {message.undoTurnError && <p className="assistant-turn-undo-error" role="alert">{message.undoTurnError}</p>}
        </div>
      )}
      {looseAssumptions.length > 0 && (
        <section aria-label="Supuestos">
          <h3>Supuse</h3>
          <ul className="assistant-turn-list">
            {looseAssumptions.map((a) => <li key={`${a.source}:${a.key}`}>{a.label}: {formatChangeValue(a.value)}</li>)}
          </ul>
        </section>
      )}
      {(missing.length > 0 || failed.length > 0 || message.modelNotice) && (
        <p className="assistant-turn-notes">
          {missing.length > 0 && <span>Propuesta incompleta <InfoTip label="Qué falta en la propuesta" text={missing.join(' ')} /></span>}
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
