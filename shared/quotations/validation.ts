/** Validación y normalización de contenido de cotización no confiable (cuerpo de la API, sincronización, agentes). Mismo patrón que `validateClientInput`. */
import { roundHalfUp } from './money.js';
import { DEFAULT_QUOTATION_DESIGN } from './types.js';
import type {
  QuotationAttachment, QuotationContent, QuotationDesign, QuotationDiscount, QuotationIssuer, QuotationLine, QuotationPrintedClient,
} from './types.js';

export const QUOTATION_LIMITS = {
  id: 64,
  assetId: 128,
  lineDescription: 500,
  unit: 16,
  label: 255,
  taxId: 32,
  phone: 64,
  address: 500,
  notes: 4000,
  paymentTerms: 2000,
  fileName: 255,
  dataUrl: 2_000_000,
  timestamp: 40,
  maxItems: 200,
  maxDiscounts: 20,
  maxAttachments: 40,
  maxQuantity: 1_000_000,
  maxExchangeRate: 10_000,
} as const;

export type QuotationValidation = { ok: true; value: QuotationContent } | { ok: false; error: string };

class Invalid extends Error {}
const reject = (message: string): never => { throw new Invalid(message); };

const STATUSES = ['draft', 'issued', 'accepted', 'rejected', 'void'] as const;
const CURRENCIES = ['DOP', 'USD'] as const;
const LAYOUTS = ['clasica', 'banda', 'minimal'] as const;
const TYPOGRAPHIES = ['sans', 'serif'] as const;
const LINE_KINDS = ['item', 'detail'] as const;
const DISCOUNT_TYPES = ['fixed', 'percentage'] as const;
const ATTACHMENT_MODES = ['include', 'related'] as const;
const ATTACHMENT_ORIGINS = ['manual', 'catalog', 'proposal'] as const;
const ACCENT = /^#[0-9a-fA-F]{6}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T => typeof value === 'string' && (options as readonly string[]).includes(value);

/** 'YYYY-MM-DD' de calendario real (sin `Date` dependiente de zona horaria para comparar). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Cadena recortada; ausente = ''; otro tipo o más larga que `max` rechaza con `message`. */
function text(raw: unknown, max: number, message: string): string {
  if (raw == null) return '';
  if (typeof raw !== 'string') return reject(message);
  const value = raw.trim();
  return value.length > max ? reject(message) : value;
}

/** Texto opcional: '' o ausente → undefined. */
function optionalText(raw: unknown, max: number, message: string): string | undefined {
  return text(raw, max, message) || undefined;
}

function object(raw: unknown, message: string): Record<string, unknown> {
  if (raw == null) return {};
  return isRecord(raw) ? raw : reject(message);
}

function list(raw: unknown, max: number, tooMany: string, notList: string): unknown[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return reject(notList);
  return raw.length > max ? reject(tooMany) : raw;
}

function uniqueId(raw: unknown, seen: Set<string>, what: string): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id.length > QUOTATION_LIMITS.id) return reject(`Id de ${what} inválido`);
  if (seen.has(id)) return reject(`Id de ${what} duplicado`);
  seen.add(id);
  return id;
}

function finite(raw: unknown, message: string): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : reject(message);
}

function line(raw: unknown, seen: Set<string>): QuotationLine {
  if (!isRecord(raw)) return reject('Línea de cotización inválida');
  const id = uniqueId(raw.id, seen, 'línea');
  const kind = raw.kind ?? 'item';
  if (!oneOf(LINE_KINDS, kind)) return reject('Tipo de línea inválido');
  const description = text(raw.description, QUOTATION_LIMITS.lineDescription, 'La descripción de la línea es inválida o demasiado larga');
  const unit = text(raw.unit, QUOTATION_LIMITS.unit, 'La unidad de la línea es inválida o demasiado larga');
  const quantity = finite(raw.quantity ?? 0, 'La cantidad de la línea es inválida');
  if (quantity < 0 || quantity > QUOTATION_LIMITS.maxQuantity) return reject('La cantidad de la línea es inválida');
  const catalogItemId = optionalText(raw.catalogItemId, QUOTATION_LIMITS.id, 'Id de equipo del catálogo inválido');
  const result: QuotationLine = {
    id, kind, description, quantity: roundHalfUp(quantity * 1000) / 1000, unit, unitPriceCents: 0, discountPct: 0, taxable: false,
  };
  if (kind === 'item') {
    const price = finite(raw.unitPriceCents ?? 0, 'El precio de la línea es inválido');
    if (price < 0) return reject('El precio de la línea es inválido');
    const discountPct = finite(raw.discountPct ?? 0, 'El descuento de la línea es inválido');
    if (discountPct < 0 || discountPct > 100) return reject('El descuento de la línea debe estar entre 0 y 100');
    const taxable = raw.taxable ?? true;
    if (typeof taxable !== 'boolean') return reject('La marca de ITBIS de la línea es inválida');
    result.unitPriceCents = roundHalfUp(price);
    result.discountPct = discountPct;
    result.taxable = taxable;
  }
  if (catalogItemId) result.catalogItemId = catalogItemId;
  return result;
}

function discount(raw: unknown, seen: Set<string>): QuotationDiscount {
  if (!isRecord(raw)) return reject('Descuento inválido');
  const id = uniqueId(raw.id, seen, 'descuento');
  if (!oneOf(DISCOUNT_TYPES, raw.type)) return reject('Tipo de descuento inválido');
  const label = text(raw.label, QUOTATION_LIMITS.label, 'La etiqueta del descuento es inválida o demasiado larga');
  const value = finite(raw.value, 'El valor del descuento es inválido');
  if (value < 0 || (raw.type === 'percentage' && value > 100)) return reject('El valor del descuento es inválido');
  return { id, label, type: raw.type, value: raw.type === 'fixed' ? roundHalfUp(value) : value };
}

function client(raw: unknown): QuotationPrintedClient {
  const data = object(raw, 'Datos del cliente inválidos');
  return {
    name: text(data.name, QUOTATION_LIMITS.label, 'El nombre del cliente es inválido o demasiado largo'),
    attention: text(data.attention, QUOTATION_LIMITS.label, 'La atención del cliente es inválida o demasiado larga'),
    taxId: text(data.taxId, QUOTATION_LIMITS.taxId, 'El RNC o cédula del cliente es inválido'),
    phone: text(data.phone, QUOTATION_LIMITS.phone, 'El teléfono del cliente es inválido'),
    email: text(data.email, QUOTATION_LIMITS.label, 'El correo del cliente es inválido'),
    address: text(data.address, QUOTATION_LIMITS.address, 'La dirección del cliente es inválida o demasiado larga'),
  };
}

function issuer(raw: unknown): QuotationIssuer {
  const data = object(raw, 'Datos del emisor inválidos');
  return {
    name: text(data.name, QUOTATION_LIMITS.label, 'El nombre del emisor es inválido o demasiado largo'),
    taxId: text(data.taxId, QUOTATION_LIMITS.taxId, 'El RNC del emisor es inválido'),
    address: text(data.address, QUOTATION_LIMITS.address, 'La dirección del emisor es inválida o demasiado larga'),
    phone: text(data.phone, QUOTATION_LIMITS.phone, 'El teléfono del emisor es inválido'),
    email: text(data.email, QUOTATION_LIMITS.label, 'El correo del emisor es inválido'),
    website: text(data.website, QUOTATION_LIMITS.label, 'El sitio web del emisor es inválido'),
    logo: text(data.logo, QUOTATION_LIMITS.dataUrl, 'El logo del emisor es inválido o demasiado grande'),
  };
}

function design(raw: unknown): QuotationDesign {
  const data = object(raw, 'Diseño inválido');
  const layout = data.layout ?? DEFAULT_QUOTATION_DESIGN.layout;
  if (!oneOf(LAYOUTS, layout)) return reject('Diseño: plantilla de disposición desconocida');
  const typography = data.typography ?? DEFAULT_QUOTATION_DESIGN.typography;
  if (!oneOf(TYPOGRAPHIES, typography)) return reject('Diseño: tipografía desconocida');
  const accent = data.accent ?? DEFAULT_QUOTATION_DESIGN.accent;
  if (typeof accent !== 'string' || !ACCENT.test(accent)) return reject('Diseño: el color de acento debe tener el formato #rrggbb');
  const showSignature = data.showSignature ?? DEFAULT_QUOTATION_DESIGN.showSignature;
  const showStamp = data.showStamp ?? DEFAULT_QUOTATION_DESIGN.showStamp;
  if (typeof showSignature !== 'boolean' || typeof showStamp !== 'boolean') return reject('Diseño: las opciones de firma y sello son inválidas');
  const result: QuotationDesign = { layout, accent: accent.toLowerCase(), typography, showSignature, showStamp };
  const templateId = optionalText(data.templateId, QUOTATION_LIMITS.id, 'Diseño: id de plantilla inválido');
  const signatureId = optionalText(data.signatureId, QUOTATION_LIMITS.id, 'Diseño: id de firma inválido');
  if (templateId) result.templateId = templateId;
  if (signatureId) result.signatureId = signatureId;
  return result;
}

function attachment(raw: unknown, seen: Set<string>): QuotationAttachment {
  if (!isRecord(raw)) return reject('Anexo inválido');
  const id = uniqueId(raw.id, seen, 'anexo');
  if (!oneOf(ATTACHMENT_MODES, raw.mode)) return reject('Anexo inválido: modo desconocido');
  if (!oneOf(ATTACHMENT_ORIGINS, raw.origin)) return reject('Anexo inválido: origen desconocido');
  const count = (value: unknown, what: string): number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : reject(`Anexo inválido: ${what}`);
  const result: QuotationAttachment = {
    id,
    fileName: text(raw.fileName, QUOTATION_LIMITS.fileName, 'Anexo inválido: nombre de archivo'),
    fileSize: count(raw.fileSize ?? 0, 'tamaño del archivo'),
    pageCount: count(raw.pageCount ?? 0, 'número de páginas'),
    title: text(raw.title, QUOTATION_LIMITS.label, 'Anexo inválido: título'),
    uploadedAt: text(raw.uploadedAt, QUOTATION_LIMITS.timestamp, 'Anexo inválido: fecha de carga'),
    mode: raw.mode,
    origin: raw.origin,
  };
  const assetId = optionalText(raw.assetId, QUOTATION_LIMITS.assetId, 'Anexo inválido: referencia del archivo');
  const catalogItemId = optionalText(raw.catalogItemId, QUOTATION_LIMITS.id, 'Anexo inválido: id del equipo');
  const sourceProjectId = optionalText(raw.sourceProjectId, QUOTATION_LIMITS.id, 'Anexo inválido: id de la propuesta');
  const thumbnailDataUrl = optionalText(raw.thumbnailDataUrl, QUOTATION_LIMITS.dataUrl, 'Anexo inválido: miniatura');
  if (assetId) result.assetId = assetId;
  if (catalogItemId) result.catalogItemId = catalogItemId;
  if (sourceProjectId) result.sourceProjectId = sourceProjectId;
  if (thumbnailDataUrl) result.thumbnailDataUrl = thumbnailDataUrl;
  return result;
}

function parse(data: Record<string, unknown>): QuotationContent {
  if (!oneOf(STATUSES, data.status)) return reject('Estado de cotización inválido');
  if (!oneOf(CURRENCIES, data.currency)) return reject('Moneda de cotización inválida');
  if (!isIsoDate(data.issueDate)) return reject('Fecha de emisión inválida (use AAAA-MM-DD)');
  const validUntil = data.validUntil ?? null;
  if (validUntil !== null && !isIsoDate(validUntil)) return reject('Fecha de vigencia inválida (use AAAA-MM-DD)');
  if (validUntil !== null && validUntil < data.issueDate) return reject('La vigencia no puede ser anterior a la fecha de emisión');
  if (typeof data.exchangeRate !== 'number' || !Number.isFinite(data.exchangeRate) || data.exchangeRate <= 0 || data.exchangeRate > QUOTATION_LIMITS.maxExchangeRate) {
    return reject('La tasa de cambio debe ser un número mayor que 0');
  }

  const lineIds = new Set<string>();
  const items = list(data.items, QUOTATION_LIMITS.maxItems, `Demasiadas líneas (máx. ${QUOTATION_LIMITS.maxItems})`, 'Las líneas deben ser una lista').map(raw => line(raw, lineIds));
  const discountIds = new Set<string>();
  const discounts = list(data.discounts, QUOTATION_LIMITS.maxDiscounts, `Demasiados descuentos (máx. ${QUOTATION_LIMITS.maxDiscounts})`, 'Los descuentos deben ser una lista').map(raw => discount(raw, discountIds));
  const attachmentIds = new Set<string>();
  const attachments = list(data.attachments, QUOTATION_LIMITS.maxAttachments, `Demasiados anexos (máx. ${QUOTATION_LIMITS.maxAttachments})`, 'Los anexos deben ser una lista').map(raw => attachment(raw, attachmentIds));

  const printedClient = client(data.client);
  if (data.status !== 'draft') {
    if (!printedClient.name) return reject('El nombre del cliente es obligatorio');
    if (!items.some(item => item.kind === 'item')) return reject('La cotización necesita al menos una línea con precio');
  }

  const value: QuotationContent = {
    status: data.status,
    issueDate: data.issueDate,
    validUntil,
    currency: data.currency,
    exchangeRate: data.exchangeRate,
    client: printedClient,
    seller: text(data.seller, QUOTATION_LIMITS.label, 'El vendedor es inválido o demasiado largo'),
    projectLabel: text(data.projectLabel, QUOTATION_LIMITS.label, 'La etiqueta del proyecto es inválida o demasiado larga'),
    items,
    discounts,
    notes: text(data.notes, QUOTATION_LIMITS.notes, 'Las notas son inválidas o demasiado largas'),
    paymentTerms: text(data.paymentTerms, QUOTATION_LIMITS.paymentTerms, 'Las condiciones de pago son inválidas o demasiado largas'),
    design: design(data.design),
    attachments,
    issuer: issuer(data.issuer),
  };
  const clientId = optionalText(data.clientId, QUOTATION_LIMITS.id, 'Id de cliente inválido');
  const sourceProjectId = optionalText(data.sourceProjectId, QUOTATION_LIMITS.id, 'Id de propuesta de origen inválido');
  const folderId = optionalText(data.folderId, QUOTATION_LIMITS.id, 'Id de carpeta inválido');
  if (clientId) value.clientId = clientId;
  if (sourceProjectId) value.sourceProjectId = sourceProjectId;
  if (folderId) value.folderId = folderId;
  return value;
}

/** Valida y normaliza contenido no confiable; descarta claves desconocidas y nunca lanza. */
export function validateQuotationContent(data: unknown): QuotationValidation {
  if (!isRecord(data)) return { ok: false, error: 'Cotización inválida' };
  try {
    return { ok: true, value: parse(data) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}
