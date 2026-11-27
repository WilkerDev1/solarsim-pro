import React from 'react';
import { effectiveQuotationStatus, formatMoney } from '../../../../shared/quotations';
import type { QuotationRecord } from '../../../types/quotation';
import { formatQuotationDate, quotationTotalCents } from '../../../utils/quotationSummary';
import { QuotationStatusChip } from '../common/QuotationStatusChip';

export interface LinkedQuotationsListProps {
  quotations: readonly QuotationRecord[];
  today: string;
  onOpen: (id: string) => void;
  /** Texto cuando no hay ninguna. */
  emptyText: string;
  /** Nombre accesible de la lista. */
  label: string;
  theme?: string;
}

/**
 * Cotizaciones enlazadas (a una propuesta o a un cliente): número resaltado, cliente o proyecto y fecha, total en su
 * moneda y el estado al final de la fila. Clic abre el editor. Solo lista; nunca escribe.
 */
export const LinkedQuotationsList: React.FC<LinkedQuotationsListProps> = ({ quotations, today, onOpen, emptyText, label, theme }) => {
  if (!quotations.length) return <p className="lq-empty">{emptyText}</p>;
  return (
    <ul className="lq" aria-label={label} data-theme={theme}>
      {quotations.map((quotation) => {
        const number = quotation.number ?? 'Sin número';
        const detail = [quotation.projectLabel || quotation.client.name, formatQuotationDate(quotation.issueDate)].filter(Boolean).join(' · ');
        return (
          <li key={quotation.id}>
            <button type="button" className="lq-row" onClick={() => onOpen(quotation.id)} aria-label={`Abrir la cotización ${number}`}>
              <span className="lq-text">
                <span className="lq-number">{number}</span>
                <span className="lq-detail">{detail}</span>
              </span>
              <span className="lq-total">{formatMoney(quotationTotalCents(quotation), quotation.currency)}</span>
              <QuotationStatusChip status={effectiveQuotationStatus(quotation, today)} className="lq-chip" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
