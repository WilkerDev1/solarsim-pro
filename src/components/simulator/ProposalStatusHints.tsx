import React from 'react';
import { InfoTip } from './params/ui';
import type { ProposalCompleteness } from '../../domain/proposalCompleteness';
import { incompleteReasonsText } from '../../domain/proposalCompleteness';
import { NEW_PROPOSAL_DEFAULTS } from '../../domain/newProposal';

/**
 * Indicaciones discretas del estado de la propuesta (F2b, ADR 0009): «incompleta» y «consumo estimado». Texto pequeño y
 * neutro con el motivo en un ⓘ (InfoTip), nunca una caja de color: lo que falta se corrige en el dock o en la pestaña Energía.
 */

/** Línea bajo las pestañas del simulador mientras la propuesta esté incompleta. */
export const IncompleteNotice: React.FC<{ completeness: ProposalCompleteness }> = ({ completeness }) => {
  if (!completeness.incomplete) return null;
  return (
    <p role="status" data-proposal-incomplete className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
      Propuesta incompleta: los resultados no se calculan hasta completar los datos.
      <InfoTip label="Qué falta" text={incompleteReasonsText(completeness)} />
    </p>
  );
};

/** Sustituye un bloque de resultados (nunca en cero) mientras la propuesta esté incompleta. */
export const ResultsPending: React.FC<{ completeness: ProposalCompleteness; title?: string }> = ({ completeness, title = 'Resultados pendientes' }) => (
  <section aria-label={title} data-results-pending className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 dark:border-zinc-700 dark:text-zinc-300">
    <h3 className="flex items-center gap-1 font-bold text-slate-700 dark:text-zinc-200">
      {title}
      <InfoTip label="Qué falta" text={incompleteReasonsText(completeness)} />
    </h3>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
      {completeness.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}
    </ul>
  </section>
);

/** Marca discreta del consumo estimado de fábrica. */
export const EstimatedConsumptionHint: React.FC = () => (
  <span data-consumption-estimated className="inline-flex items-center gap-1 text-[11px] font-semibold normal-case tracking-normal">
    Consumo estimado
    <InfoTip
      label="Sobre el consumo estimado"
      text={`La propuesta nació sin datos de consumo: ${NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh.toLocaleString('es-DO')} kWh cada mes, como estimación. Escribe los consumos reales (o carga la factura) para afinar el dimensionado y el ahorro.`}
    />
  </span>
);

/** «—» en lugar de una cifra mientras la propuesta esté incompleta (del dominio: `shownMetric`). */
export { PENDING_VALUE } from '../../domain/proposalCompleteness';
