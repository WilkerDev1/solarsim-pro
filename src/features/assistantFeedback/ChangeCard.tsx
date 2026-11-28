/**
 * Tarjeta de cambio del asistente (F5a): componente de presentación. Pinta el modelo de `changeCardModel.ts` (diff compacto
 * antes → después, lo que se ajustó solo, resultados del motor, avisos y supuestos) y expone los botones por callbacks:
 * `onUndo` (aplicado), `onConfirm` / `onReject` (pendiente). No lee el store, no llama a herramientas y no navega: quien la
 * monte (el panel de F5b) decide qué hace cada botón. Sin CSS propio (clases de Tailwind) para poder importarla en pruebas;
 * pensada para la superficie oscura del chat (misma paleta que `chat.css`).
 *
 * Uso desde el panel: `changeCardInputFromResponse(response, { assumptions })` convierte la respuesta de una herramienta
 * (la `AssistantToolResponse` completa, no el evento `tool_call_finished`, que no trae resultados) en la entrada; `null` = no hay tarjeta que mostrar.
 */
import React from 'react';
import { buildChangeCardView, type ChangeCardInput, type ChangeRowView, type ChangeCardView } from './changeCardModel';

export interface ChangeCardProps {
  input: ChangeCardInput;
  /** Deshacer el cambio aplicado (`activityId` de la entrada). */
  onUndo?: () => void;
  /** Confirmar o rechazar el cambio pendiente (`actionId` de la entrada). */
  onConfirm?: () => void;
  onReject?: () => void;
  /** Mientras una acción está en curso: los botones quedan deshabilitados. */
  busy?: boolean;
}

const TONE: Record<ChangeCardView['tone'], string> = {
  applied: 'text-emerald-300',
  pending: 'text-amber-200',
  neutral: 'text-[#bac7d8]',
  error: 'text-[#ffb5bd]',
};

const buttonClass = 'cursor-pointer rounded-[7px] border border-[#52647b] bg-[#26374d] px-2.5 py-1 text-xs text-[#eef3fb] disabled:cursor-default disabled:opacity-50';

const Row: React.FC<{ row: ChangeRowView }> = ({ row }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
    <dt className="min-w-0 text-[11px] text-[#bac7d8]">{row.label}</dt>
    <dd className="m-0 min-w-0 text-right font-mono text-[12px] [overflow-wrap:anywhere]">
      <del className="text-[#bac7d8] decoration-[#52647b]">{row.before}</del>
      <span className="sr-only"> pasa a </span>
      <span aria-hidden="true" className="px-1 text-[#bac7d8]">→</span>
      <ins className="font-semibold text-[#edf2f8] no-underline">{row.after}</ins>
    </dd>
  </div>
);

export const ChangeCard: React.FC<ChangeCardProps> = ({ input, onUndo, onConfirm, onReject, busy = false }) => {
  const view = buildChangeCardView(input);
  const { actions } = view;
  const showUndo = actions.undo && !!onUndo;
  const showConfirm = actions.confirm && !!onConfirm;
  const showReject = actions.reject && !!onReject;
  return (
    <section aria-label={`${view.headline}: ${view.title}`} data-change-card={view.status} className="mt-2.5 rounded-[10px] border border-[#374458] p-3 text-xs leading-normal text-[#edf2f8]">
      <header className="mb-1.5">
        <h3 className="m-0 text-[13px] font-semibold">{view.title}</h3>
        <p className={`m-0 text-[11px] ${TONE[view.tone]}`}>{view.headline} · <span className="text-[#bac7d8]">{view.summary}</span></p>
      </header>

      {view.error && <p role="alert" className="my-1.5 text-[#ffb5bd]">{view.error}</p>}

      {view.rows.length > 0 && (
        <dl className="m-0 grid gap-1.5">
          {view.rows.map((row) => <Row key={row.path} row={row} />)}
        </dl>
      )}
      {view.hiddenRows > 0 && <p className="m-0 mt-1 text-[11px] text-[#bac7d8]">y {view.hiddenRows} más</p>}

      {view.derived && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[#bac7d8]">{view.derived.label}</summary>
          <dl className="m-0 mt-1.5 grid gap-1.5">
            {view.derived.rows.map((row) => <Row key={row.path} row={row} />)}
          </dl>
        </details>
      )}

      {view.results.kind === 'metrics' && (
        <div className="mt-2 border-t border-[#374458] pt-2">
          <p className="m-0 mb-1 text-[11px] font-semibold text-[#bac7d8]">Resultados</p>
          {view.results.unchanged
            ? <p className="m-0 text-[11px] text-[#bac7d8]">Los resultados no cambian.</p>
            : (
              <dl className="m-0 grid gap-1.5">
                {view.results.rows.map((row) => (
                  <Row key={row.key} row={{ path: row.key, label: row.label, before: row.before, after: row.after, derived: false }} />
                ))}
              </dl>
            )}
        </div>
      )}
      {view.results.kind === 'incomplete' && (
        <div className="mt-2 border-t border-[#374458] pt-2">
          <p className="m-0 mb-1 text-[11px] font-semibold text-[#bac7d8]">Resultados pendientes <span aria-hidden="true">—</span></p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {view.results.reasons.map((reason) => <li key={reason} className="text-[11px] text-[#bac7d8]">{reason}</li>)}
          </ul>
        </div>
      )}

      {(view.warnings.length > 0 || view.assumptions.length > 0) && (
        <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[11px] text-[#bac7d8]">
          {view.warnings.map((warning) => (
            <li key={warning}><span aria-hidden="true">ⓘ </span>{warning}</li>
          ))}
          {view.assumptions.map((assumption) => (
            <li key={`${assumption.label}-${assumption.value}`}>
              <span aria-hidden="true">ⓘ </span>Supuesto · {assumption.label}: <span className="font-mono">{assumption.value}</span> ({assumption.origin})
            </li>
          ))}
        </ul>
      )}

      {(showUndo || showConfirm || showReject) && (
        <footer className="mt-2.5 flex flex-wrap gap-1.5">
          {showConfirm && <button type="button" disabled={busy} onClick={onConfirm} className={buttonClass}>Confirmar</button>}
          {showReject && <button type="button" disabled={busy} onClick={onReject} className={buttonClass}>Rechazar</button>}
          {showUndo && <button type="button" disabled={busy} onClick={onUndo} className={buttonClass}>Deshacer</button>}
        </footer>
      )}
    </section>
  );
};
