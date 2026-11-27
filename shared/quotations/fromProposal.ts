/**
 * Conversión propuesta → borrador de cotización. La propuesta no tiene precio unitario por equipo (lista equipos con
 * cantidad y da totales agregados), así que quien llama arma `ProposalQuotationSource` con los importes ya calculados.
 */
import { DEFAULT_QUOTATION_DESIGN } from './types.js';
import { validateQuotationContent, type QuotationValidation } from './validation.js';
import type { QuotationAttachment, QuotationContent, QuotationCurrency, QuotationDesign, QuotationIssuer, QuotationLine, QuotationPrintedClient } from './types.js';

/** Origen de un documento que llega desde una propuesta. */
export type ProposalAttachmentOrigin = 'proposal' | 'catalog';

export interface ProposalQuotationSource {
  projectId: string;
  clientId?: string;
  client: QuotationPrintedClient;
  projectLabel: string;
  currency: QuotationCurrency;
  exchangeRate: number;
  seller: string;
  /** Equipos y servicios sin precio. */
  detailLines: { description: string; quantity: number; unit: string; catalogItemId?: string }[];
  /**
   * Líneas con precio. `note` añade justo debajo una fila descriptiva sin cantidad (p. ej. el descuento que la línea ya
   * lleva incluido, docs/QUOTATION_FROM_PROPOSAL.md); no cambia los totales.
   */
  pricedLines: { description: string; quantity: number; unit: string; unitPriceCents: number; taxable: boolean; note?: string }[];
  discounts: { label: string; type: 'fixed' | 'percentage'; value: number }[];
  paymentTerms: string;
  notes: string;
  validUntil: string | null;
  /**
   * Documentos de la propuesta, siempre como «Solo relacionado». `origin` es `'catalog'` para una ficha técnica del
   * catálogo (con su `catalogItemId`) y `'proposal'` (por defecto) para el resto; cualquier otro valor queda `'proposal'`.
   */
  attachments: (Omit<QuotationAttachment, 'mode' | 'origin' | 'sourceProjectId'> & { origin?: ProposalAttachmentOrigin })[];
  issuer: QuotationIssuer;
}

export interface QuotationFromProposalOptions {
  /** 'YYYY-MM-DD': fecha de emisión. */
  today: string;
  design?: QuotationDesign;
  /** Generador de ids inyectado (shared no usa `crypto` ni relojes). */
  newId: () => string;
}

/**
 * Borrador ('draft') con las líneas con precio primero (cada una seguida de su `note`, si la tiene) y las descriptivas
 * después; no muta `source` ni comparte
 * referencias con él. Una vigencia anterior a `today` se descarta (`null`). El resultado pasa por
 * `validateQuotationContent`: `ok` trae el contenido ya normalizado (validarlo otra vez no lo cambia) y `!ok` el
 * motivo, p. ej. una propuesta sin id o importes fuera de tope.
 */
export function quotationFromProposal(source: ProposalQuotationSource, options: QuotationFromProposalOptions): QuotationValidation {
  if (typeof source.projectId !== 'string' || !source.projectId.trim()) return { ok: false, error: 'La propuesta de origen no tiene id' };
  const priced: QuotationLine[] = source.pricedLines.flatMap(item => [
    {
      id: options.newId(),
      kind: 'item' as const,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      discountPct: 0,
      taxable: item.taxable,
    },
    ...(item.note
      ? [{ id: options.newId(), kind: 'detail' as const, description: item.note, quantity: 0, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false }]
      : []),
  ]);
  const details: QuotationLine[] = source.detailLines.map(item => ({
    id: options.newId(),
    kind: 'detail',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceCents: 0,
    discountPct: 0,
    taxable: false,
    ...(item.catalogItemId ? { catalogItemId: item.catalogItemId } : {}),
  }));
  const design = options.design ?? DEFAULT_QUOTATION_DESIGN;
  // Comparación de cadenas ISO 'YYYY-MM-DD', como `effectiveQuotationStatus`.
  const validUntil = source.validUntil !== null && source.validUntil < options.today ? null : source.validUntil;
  const content: QuotationContent = {
    status: 'draft',
    issueDate: options.today,
    validUntil,
    currency: source.currency,
    exchangeRate: source.exchangeRate,
    ...(source.clientId ? { clientId: source.clientId } : {}),
    client: { ...source.client },
    sourceProjectId: source.projectId,
    seller: source.seller,
    projectLabel: source.projectLabel,
    items: [...priced, ...details],
    discounts: source.discounts.map(discount => ({ id: options.newId(), label: discount.label, type: discount.type, value: discount.value })),
    notes: source.notes,
    paymentTerms: source.paymentTerms,
    design: { ...design },
    attachments: source.attachments.map(attachment => ({
      ...attachment,
      mode: 'related' as const,
      origin: attachment.origin === 'catalog' ? ('catalog' as const) : ('proposal' as const),
      sourceProjectId: source.projectId,
    })),
    issuer: { ...source.issuer },
  };
  return validateQuotationContent(content);
}
