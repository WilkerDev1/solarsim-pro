/** Cotización: documento comercial simple (líneas, descuentos, ITBIS y total). No es una factura fiscal ni una propuesta. */
import { DEFAULT_DOP_RATE } from '../assumptions.js';

export type QuotationStatus = 'draft' | 'issued' | 'accepted' | 'rejected' | 'void';
export type QuotationCurrency = 'DOP' | 'USD';
export type QuotationLineKind = 'item' | 'detail';

export interface QuotationLine {
  id: string;
  /** 'detail' = fila descriptiva (descripción y cantidad), sin precio; aporta 0 al total. */
  kind: QuotationLineKind;
  description: string;
  /** Admite decimales (hasta 3). */
  quantity: number;
  /** 'UD', 'pies', … puede ser ''. */
  unit: string;
  /** Entero ≥ 0, en centavos; en 'detail' siempre 0. */
  unitPriceCents: number;
  /** 0–100, descuento de la línea. */
  discountPct: number;
  /** Aplica ITBIS. */
  taxable: boolean;
  /** Equipo del catálogo de origen. */
  catalogItemId?: string;
}

/** Descuento global: `fixed` en centavos, `percentage` de 0 a 100 sobre el subtotal. */
export interface QuotationDiscount {
  id: string;
  label: string;
  type: 'fixed' | 'percentage';
  value: number;
}

/** Datos del cliente tal como se imprimen; independientes del registro de clientes. */
export interface QuotationPrintedClient {
  name: string;
  attention: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
}

export interface QuotationIssuer {
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Data URL de imagen (png, jpeg o webp) o referencia `asset:sha256:`; puede ser ''. */
  logo: string;
}

export interface QuotationDesign {
  templateId?: string;
  layout: 'clasica' | 'banda' | 'minimal';
  accent: string;
  typography: 'sans' | 'serif';
  signatureId?: string;
  showSignature: boolean;
  showStamp: boolean;
}

export interface QuotationAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  uploadedAt: string;
  /** 'include' se fusiona al PDF; 'related' solo queda enlazado. */
  mode: 'include' | 'related';
  origin: 'manual' | 'catalog' | 'proposal';
  assetId?: string;
  catalogItemId?: string;
  sourceProjectId?: string;
  thumbnailDataUrl?: string;
}

/** Contenido editable de una cotización (lo que valida la API y edita el cliente). */
export interface QuotationContent {
  status: QuotationStatus;
  /** 'YYYY-MM-DD'. */
  issueDate: string;
  /** 'YYYY-MM-DD' o null. */
  validUntil: string | null;
  currency: QuotationCurrency;
  /** DOP por 1 USD, entre 1 y 10 000. */
  exchangeRate: number;
  clientId?: string;
  client: QuotationPrintedClient;
  sourceProjectId?: string;
  folderId?: string;
  seller: string;
  projectLabel: string;
  items: QuotationLine[];
  discounts: QuotationDiscount[];
  notes: string;
  paymentTerms: string;
  design: QuotationDesign;
  attachments: QuotationAttachment[];
  issuer: QuotationIssuer;
}

/** Registro completo: contenido + identidad y metadatos de sincronización. */
export interface Quotation extends QuotationContent {
  id: string;
  /** 'COT-2026-0147'; null hasta que la API lo asigna. */
  number: string | null;
  version: number;
  baseVersion: number;
  createdById: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_QUOTATION_DESIGN: QuotationDesign = {
  layout: 'clasica',
  accent: '#087b58',
  typography: 'sans',
  showSignature: true,
  showStamp: true,
};

/**
 * Borrador vacío. La fecha entra como argumento (shared no lee relojes) y la tasa de cambio sale de
 * `overrides` o, sin ella, de la constante compartida de supuestos.
 */
export function emptyQuotationContent(today: string, overrides: Partial<QuotationContent> = {}): QuotationContent {
  return {
    status: 'draft',
    issueDate: today,
    validUntil: null,
    currency: 'DOP',
    exchangeRate: DEFAULT_DOP_RATE,
    client: { name: '', attention: '', taxId: '', phone: '', email: '', address: '' },
    seller: '',
    projectLabel: '',
    items: [],
    discounts: [],
    notes: '',
    paymentTerms: '',
    design: { ...DEFAULT_QUOTATION_DESIGN },
    attachments: [],
    issuer: { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' },
    ...overrides,
  };
}
