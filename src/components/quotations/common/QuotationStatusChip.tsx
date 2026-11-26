import React from 'react';
import { QUOTATION_STATUS_LABELS } from '../../../../shared/quotations/index';
import type { QuotationStatus } from '../../../types/quotation';

export type QuotationDisplayStatus = QuotationStatus | 'expired';

/** Colores de cada estado en claro y oscuro; los usan la lista, los indicadores y la cabecera del editor. */
export const QUOTATION_STATUS_TONES: Record<QuotationDisplayStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-zinc-700 dark:text-zinc-100',
  issued: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  accepted: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  void: 'bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',
  expired: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

/** Estado de una cotización; recibe el estado efectivo (`effectiveQuotationStatus`) para mostrar «Vencida». */
export const QuotationStatusChip: React.FC<{ status: QuotationDisplayStatus; className?: string }> = ({ status, className = '' }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${QUOTATION_STATUS_TONES[status]} ${className}`}>
    {QUOTATION_STATUS_LABELS[status]}
  </span>
);
