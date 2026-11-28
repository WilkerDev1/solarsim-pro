// Panel mínimo de F4: lo que hizo un turno, como listas de texto sencillas (la tarjeta de diff rica, las anclas y el resaltado
// del dock son de F5a). Lee el estado del turno de la sesión (`TurnState` de F3c) y llama a la sesión para confirmar,
// rechazar o deshacer.
import React from 'react';
import { ArrowRight, Check, Undo2, X } from 'lucide-react';
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

const MAX_CHANGES = 8;

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
  const changes = summary.changes;
  const undoable = turn.toolOrder.map((id) => turn.tools[id]).filter((call) => call.status === 'applied' && call.activityId && call.changes.length);
  const failed = summary.failedTools.map(assistantToolLabel);
  const empty = !changes.length && !summary.pendingConfirmations.length && !summary.assumptions.length && !undoable.length;
  if (empty && !failed.length && !summary.missing.length && !message.canContinue && !message.modelNotice) return null;
  return (
    <div className="assistant-turn-details">
      {changes.length > 0 && (
        <section aria-label="Cambios aplicados">
          <h3>Cambios</h3>
          <ul className="assistant-turn-list">
            {changes.slice(0, MAX_CHANGES).map((change, index) => (
              <li key={`${change.proposalId ?? ''}:${change.path}:${index}`}>
                <span className="assistant-turn-label">{change.label}</span>{' '}
                <span>{formatChangeValue(change.before)} → {formatChangeValue(change.after)}</span>
                {change.derived && <span className="assistant-turn-muted"> (recalculado)</span>}
              </li>
            ))}
            {changes.length > MAX_CHANGES && <li className="assistant-turn-muted">y {changes.length - MAX_CHANGES} más</li>}
          </ul>
        </section>
      )}
      {undoable.length > 0 && (
        <div className="assistant-turn-actions">
          {undoable.map((call) => message.undone?.[call.activityId!]
            ? <span key={call.callId} className="assistant-turn-muted"><Check size={12} aria-hidden /> {assistantToolLabel(call.name)}: deshecho</span>
            : (
              <button key={call.callId} type="button" disabled={busy} onClick={() => actions.undo(call.activityId!)}>
                <Undo2 size={12} aria-hidden /> Deshacer {assistantToolLabel(call.name).toLowerCase()}
              </button>
            ))}
        </div>
      )}
      {summary.pendingConfirmations.map((pending) => {
        const resolution = message.resolutions?.[pending.actionId];
        return (
          <section key={pending.actionId} className="assistant-turn-pending" aria-label="Cambio por confirmar">
            <h3>{pending.title}</h3>
            {pending.changes.length > 0 && (
              <ul className="assistant-turn-list">
                {pending.changes.slice(0, MAX_CHANGES).map((change, index) => <li key={index}><span className="assistant-turn-label">{change.label}</span> {change.value}</li>)}
              </ul>
            )}
            {resolution ? (
              <p className="assistant-turn-muted">{resolution === 'applied' ? 'Aplicado.' : resolution === 'rejected' ? 'Descartado.' : resolution}</p>
            ) : (
              <div className="assistant-turn-actions">
                <button type="button" disabled={busy} onClick={() => actions.confirmPending(pending.actionId)}><Check size={12} aria-hidden /> Confirmar</button>
                <button type="button" disabled={busy} onClick={() => actions.rejectPending(pending.actionId)}><X size={12} aria-hidden /> Descartar</button>
              </div>
            )}
          </section>
        );
      })}
      {summary.assumptions.length > 0 && (
        <section aria-label="Supuestos">
          <h3>Supuse</h3>
          <ul className="assistant-turn-list">
            {summary.assumptions.map((a) => <li key={`${a.source}:${a.key}`}>{a.label}: {formatChangeValue(a.value)}</li>)}
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
