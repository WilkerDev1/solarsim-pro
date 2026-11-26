/** Dominio puro de cotizaciones (docs/QUOTATIONS.md, ADR 0007). Lo comparten el cliente, la API y el PDF. */
export { DEFAULT_QUOTATION_DESIGN, emptyQuotationContent } from './types.js';
export type {
  Quotation, QuotationAttachment, QuotationContent, QuotationCurrency, QuotationDesign, QuotationDiscount, QuotationIssuer, QuotationLine,
  QuotationLineKind, QuotationPrintedClient, QuotationStatus,
} from './types.js';
export { convertCents, formatAmount, formatMoney, fromCents, toCents } from './money.js';
export { computeQuotationTotals, type QuotationLineTotals, type QuotationTotals } from './totals.js';
export { QUOTATION_STATUS_LABELS, canTransitionQuotation, effectiveQuotationStatus, isQuotationContentLocked } from './status.js';
export { QUOTATION_NUMBER_PREFIX, formatQuotationNumber, parseQuotationNumber, quotationNumberYear } from './numbering.js';
export { QUOTATION_LIMITS, isIsoDate, validateQuotationContent, type QuotationValidation } from './validation.js';
export {
  QUOTATION_SHEET_TEXTS, currencySymbol, formatExchangeRate, formatQuantity, formatSheetDate, itbisPercentLabel, sheetCurrencyLabel, sheetPageLabel,
} from './sheetTexts.js';
export { quotationFromProposal, type ProposalQuotationSource, type QuotationFromProposalOptions } from './fromProposal.js';
