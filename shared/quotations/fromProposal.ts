/**
 * Conversión propuesta → borrador de cotización. La propuesta no tiene precio unitario por equipo (lista equipos con
 * cantidad y da totales agregados), así que quien llama arma `ProposalQuotationSource` con los importes ya calculados.
 */
import { DEFAULT_QUOTATION_DESIGN } from './types.js';
import type { QuotationAttachment, QuotationContent, QuotationCurrency, QuotationDesign, QuotationIssuer, QuotationLine, QuotationPrintedClient } from './types.js';

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
  pricedLines: { description: string; quantity: number; unit: string; unitPriceCents: number; taxable: boolean }[];
  discounts: { label: string; type: 'fixed' | 'percentage'; value: number }[];
  paymentTerms: string;
  notes: string;
  validUntil: string | null;
  attachments: Omit<QuotationAttachment, 'mode' | 'origin' | 'sourceProjectId'>[];
  issuer: QuotationIssuer;
}

export interface QuotationFromProposalOptions {
  /** 'YYYY-MM-DD': fecha de emisión. */
  today: string;
  design?: QuotationDesign;
  /** Generador de ids inyectado (shared no usa `crypto` ni relojes). */
  newId: () => string;
}

/** Borrador ('draft') con las líneas con precio primero y las descriptivas después; no muta `source` ni comparte referencias con él. */
export function quotationFromProposal(source: ProposalQuotationSource, options: QuotationFromProposalOptions): QuotationContent {
  const priced: QuotationLine[] = source.pricedLines.map(item => ({
    id: options.newId(),
    kind: 'item',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceCents: item.unitPriceCents,
    discountPct: 0,
    taxable: item.taxable,
  }));
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
  return {
    status: 'draft',
    issueDate: options.today,
    validUntil: source.validUntil,
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
      origin: 'proposal' as const,
      sourceProjectId: source.projectId,
    })),
    issuer: { ...source.issuer },
  };
}
