/** Estados de la cotización, transiciones permitidas y el estado derivado «Vencida». */
import type { QuotationStatus } from './types.js';

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus | 'expired', string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  void: 'Anulada',
  expired: 'Vencida',
};

const TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  draft: ['issued', 'void'],
  issued: ['accepted', 'rejected', 'void', 'draft'],
  accepted: ['void'],
  rejected: ['draft'],
  void: [],
};

export function canTransitionQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

/** Solo el borrador admite cambios de contenido. */
export function isQuotationContentLocked(status: QuotationStatus): boolean {
  return status !== 'draft';
}

/** «Vencida» no se guarda: una emitida con vigencia anterior a `today` ('YYYY-MM-DD'; el mismo día aún es válida). */
export function effectiveQuotationStatus(
  quotation: { status: QuotationStatus; validUntil: string | null },
  today: string,
): QuotationStatus | 'expired' {
  return quotation.status === 'issued' && quotation.validUntil !== null && quotation.validUntil < today ? 'expired' : quotation.status;
}
