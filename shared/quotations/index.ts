/** Dominio puro de cotizaciones (docs/QUOTATIONS.md, ADR 0007). Lo comparten el cliente, la API y el PDF. */
export { DEFAULT_QUOTATION_DESIGN, emptyQuotationContent } from './types.js';
export type {
  Quotation, QuotationAttachment, QuotationContent, QuotationCurrency, QuotationDesign, QuotationPrintedSignature, QuotationDiscount, QuotationIssuer, QuotationLine,
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
export { quotationFromProposal, type ProposalAttachmentOrigin, type ProposalQuotationSource, type QuotationFromProposalOptions } from './fromProposal.js';
export { validateQuotationDesign } from './validation.js';
export {
  attachmentDestinationLabel, attachmentDestinationSummary, attachmentDestinations, goesInsidePdf, goesSeparate, toggledDestinations,
  withAttachmentDestinations, type AttachmentDestination, type AttachmentDestinations,
} from './attachmentDestinations.js';
export {
  QUOTATION_LIBRARY_LIMITS, addDaysIso, applyTemplateToNewContent, checkSignatureImage, defaultQuotationSignature, defaultQuotationTemplate,
  designFromTemplate, freezePrintedDesign, selectedQuotationSignature, templateFromQuotation, validateQuotationSignature, validateQuotationTemplate,
  type LibraryValidation, type QuotationLibraryMeta, type QuotationSignature, type QuotationSignatureContent, type QuotationSignatureKind,
  type QuotationTemplate, type QuotationTemplateContent, type QuotationTemplateDesign,
} from './library.js';
export { LOCAL_ONLY_FIELDS, withoutLocalOnlyMissingIn, type LocalOnlyField } from './localOnlyFields.js';
