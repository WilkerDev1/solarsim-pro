/**
 * Plantillas y firmas de cotización (docs/QUOTATIONS.md#plantillas-firmas-y-sellos): recursos reutilizables por
 * organización (o por el espacio local). Una plantilla guarda el diseño y los textos por defecto; una firma o un sello,
 * una imagen con nombre y cargo. TypeScript puro: fechas e ids entran como argumento.
 */
import { isAssetRef } from '../documentAssets.js';
import { DOCUMENT_IMAGE_TYPES, checkDocumentDataUrl } from '../fileSignatures.js';
import { QUOTATION_LIMITS, isIsoDate, validateQuotationDesign } from './validation.js';
import type { QuotationContent, QuotationDesign } from './types.js';

export type QuotationSignatureKind = 'signature' | 'stamp';
/** Diseño que guarda una plantilla: el de la cotización sin el enlace a la plantilla. */
export type QuotationTemplateDesign = Omit<QuotationDesign, 'templateId' | 'signature' | 'stampImage'>;

export interface QuotationTemplateContent {
  name: string;
  description: string;
  design: QuotationTemplateDesign;
  notes: string;
  paymentTerms: string;
  /** Días de vigencia desde la fecha de emisión (`null` = sin vigencia). */
  validityDays: number | null;
  /** La predeterminada se aplica a las cotizaciones nuevas; una sola por organización (la API desmarca las demás). */
  isDefault: boolean;
}

export interface QuotationSignatureContent {
  kind: QuotationSignatureKind;
  name: string;
  /** Cargo que se imprime bajo el nombre (p. ej. «Gerente comercial»); puede ser ''. */
  role: string;
  /** Data URL png/jpeg/webp cuyo tipo real coincide con el declarado, o referencia `asset:sha256:`. */
  image: string;
  /** Una predeterminada por tipo (firma o sello). */
  isDefault: boolean;
}

/** Identidad y metadatos de sincronización, como los de una cotización. */
export interface QuotationLibraryMeta {
  id: string;
  version: number;
  baseVersion: number;
  createdById: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  organizationId?: string;
}

export type QuotationTemplate = QuotationTemplateContent & QuotationLibraryMeta;
export type QuotationSignature = QuotationSignatureContent & QuotationLibraryMeta;

export const QUOTATION_LIBRARY_LIMITS = {
  name: 120,
  description: 255,
  role: 120,
  maxValidityDays: 365,
  /** Imagen de firma o sello: bytes decodificados. */
  signatureImageBytes: 512 * 1024,
  /** Adjuntos subidos (PDF o imagen): bytes. */
  attachmentBytes: 8 * 1024 * 1024,
} as const;

export type LibraryValidation<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const INVALID_TEXT = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function text(raw: unknown, max: number, what: string): string | { error: string } {
  if (raw == null) return '';
  if (typeof raw !== 'string' || INVALID_TEXT.test(raw)) return { error: `${what} no es un texto válido` };
  const value = raw.trim();
  return value.length > max ? { error: `${what} supera ${max} caracteres` } : value;
}

/** Valida y normaliza una plantilla no confiable; descarta claves desconocidas y nunca lanza. */
export function validateQuotationTemplate(raw: unknown): LibraryValidation<QuotationTemplateContent> {
  if (!isRecord(raw)) return { ok: false, error: 'Plantilla inválida' };
  const name = text(raw.name, QUOTATION_LIBRARY_LIMITS.name, 'El nombre de la plantilla');
  if (typeof name !== 'string') return { ok: false, error: name.error };
  if (!name) return { ok: false, error: 'La plantilla necesita un nombre' };
  const description = text(raw.description, QUOTATION_LIBRARY_LIMITS.description, 'La descripción de la plantilla');
  if (typeof description !== 'string') return { ok: false, error: description.error };
  const notes = text(raw.notes, QUOTATION_LIMITS.notes, 'Las notas de la plantilla');
  if (typeof notes !== 'string') return { ok: false, error: notes.error };
  const paymentTerms = text(raw.paymentTerms, QUOTATION_LIMITS.paymentTerms, 'Las condiciones de pago de la plantilla');
  if (typeof paymentTerms !== 'string') return { ok: false, error: paymentTerms.error };
  const design = validateQuotationDesign(raw.design);
  if (!design.ok) return design;
  const { templateId: _templateId, signature: _signature, stampImage: _stamp, ...templateDesign } = design.value;
  const days = raw.validityDays ?? null;
  if (days !== null && (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 1 || days > QUOTATION_LIBRARY_LIMITS.maxValidityDays))
    return { ok: false, error: `La vigencia debe ser un número entero de días entre 1 y ${QUOTATION_LIBRARY_LIMITS.maxValidityDays}` };
  const isDefault = raw.isDefault ?? false;
  if (typeof isDefault !== 'boolean') return { ok: false, error: 'La marca de plantilla predeterminada es inválida' };
  return { ok: true, value: { name, description, design: templateDesign, notes, paymentTerms, validityDays: days, isDefault } };
}

const IMAGE_ERRORS = {
  format: 'La imagen debe ser un archivo PNG, JPEG o WebP',
  type: 'El archivo no es una imagen PNG, JPEG o WebP (su contenido no coincide con su tipo)',
  size: `La imagen supera ${QUOTATION_LIBRARY_LIMITS.signatureImageBytes / 1024} KB`,
} as const;

/** Imagen de firma o sello: referencia del servidor o data URL de imagen cuyo contenido real coincide con su tipo. */
export function checkSignatureImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return 'La firma o el sello necesitan una imagen';
  if (isAssetRef(value)) return null;
  const checked = checkDocumentDataUrl(value, { allowed: DOCUMENT_IMAGE_TYPES, maxBytes: QUOTATION_LIBRARY_LIMITS.signatureImageBytes });
  return checked.ok ? null : IMAGE_ERRORS[checked.reason];
}

/** Valida y normaliza una firma o un sello no confiable; descarta claves desconocidas y nunca lanza. */
export function validateQuotationSignature(raw: unknown): LibraryValidation<QuotationSignatureContent> {
  if (!isRecord(raw)) return { ok: false, error: 'Firma inválida' };
  if (raw.kind !== 'signature' && raw.kind !== 'stamp') return { ok: false, error: 'Tipo de firma desconocido (firma o sello)' };
  const name = text(raw.name, QUOTATION_LIBRARY_LIMITS.name, 'El nombre');
  if (typeof name !== 'string') return { ok: false, error: name.error };
  if (!name) return { ok: false, error: raw.kind === 'stamp' ? 'El sello necesita un nombre' : 'La firma necesita el nombre de quien firma' };
  const role = text(raw.role, QUOTATION_LIBRARY_LIMITS.role, 'El cargo');
  if (typeof role !== 'string') return { ok: false, error: role.error };
  const imageError = checkSignatureImage(raw.image);
  if (imageError) return { ok: false, error: imageError };
  const isDefault = raw.isDefault ?? false;
  if (typeof isDefault !== 'boolean') return { ok: false, error: 'La marca de predeterminada es inválida' };
  return { ok: true, value: { kind: raw.kind, name, role, image: raw.image as string, isDefault } };
}

/** `date` + `days` días ('YYYY-MM-DD', en UTC: sin zona horaria). */
export function addDaysIso(date: string, days: number): string {
  if (!isIsoDate(date)) return date;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Más reciente primero (a igual fecha, id): así la elección de la predeterminada es determinista en todos los equipos. */
const newestFirst = <T extends { updatedAt: string; id: string }>(a: T, b: T) =>
  a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1;

export function defaultQuotationTemplate<T extends QuotationTemplateContent & { updatedAt: string; id: string }>(templates: readonly T[]): T | undefined {
  return templates.filter((t) => t.isDefault).sort(newestFirst)[0];
}

export function defaultQuotationSignature<T extends QuotationSignatureContent & { updatedAt: string; id: string }>(
  signatures: readonly T[],
  kind: QuotationSignatureKind,
): T | undefined {
  return signatures.filter((s) => s.kind === kind && s.isDefault).sort(newestFirst)[0];
}

/** Diseño de una cotización con la plantilla elegida (enlazada por `templateId`); los textos no se tocan. */
export function designFromTemplate(template: Pick<QuotationTemplate, 'id' | 'design'>): QuotationDesign {
  const { signature: _signature, stampImage: _stamp, ...design } = template.design as QuotationDesign;
  return { ...design, templateId: template.id };
}

/**
 * Borrador nuevo con la plantilla: diseño, notas, condiciones y vigencia (desde la fecha de emisión). Lo que el contenido
 * ya traiga escrito (p. ej. desde una propuesta) gana sobre los textos de la plantilla.
 */
export function applyTemplateToNewContent(content: QuotationContent, template: QuotationTemplate): QuotationContent {
  return {
    ...content,
    design: { ...designFromTemplate(template), ...(content.design.signatureId ? { signatureId: content.design.signatureId } : {}) },
    notes: content.notes || template.notes,
    paymentTerms: content.paymentTerms || template.paymentTerms,
    validUntil: content.validUntil ?? (template.validityDays ? addDaysIso(content.issueDate, template.validityDays) : null),
  };
}

/** Plantilla nueva a partir del diseño y los textos de una cotización («Guardar como plantilla»). */
export function templateFromQuotation(
  content: Pick<QuotationContent, 'design' | 'notes' | 'paymentTerms' | 'issueDate' | 'validUntil'>,
  name: string,
): QuotationTemplateContent {
  const { templateId: _templateId, signature: _signature, stampImage: _stamp, ...design } = content.design;
  const span = content.validUntil && isIsoDate(content.validUntil) && isIsoDate(content.issueDate)
    ? Math.round((Date.UTC(...ymd(content.validUntil)) - Date.UTC(...ymd(content.issueDate))) / 86_400_000)
    : 0;
  return {
    name, description: '', design, notes: content.notes, paymentTerms: content.paymentTerms,
    validityDays: span >= 1 && span <= QUOTATION_LIBRARY_LIMITS.maxValidityDays ? span : null, isDefault: false,
  };
}

const ymd = (date: string): [number, number, number] => {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month - 1, day];
};

type SignatureLike = QuotationSignatureContent & { id: string; updatedAt: string };

/** Firma de la biblioteca que imprimiría un borrador: la elegida (si existe y es una firma) o la predeterminada. */
export function selectedQuotationSignature<T extends SignatureLike>(design: QuotationDesign, signatures: readonly T[]): T | null {
  if (!design.showSignature) return null;
  const chosen = design.signatureId ? signatures.find((s) => s.id === design.signatureId && s.kind === 'signature') : undefined;
  return chosen ?? defaultQuotationSignature(signatures, 'signature') ?? null;
}

/**
 * Diseño con la copia fija de lo que se imprime (firma y sello de la biblioteca), al salir de borrador. Desde entonces
 * la cotización ya no depende de la biblioteca: borrar una firma o cambiar la predeterminada no cambia su PDF.
 */
export function freezePrintedDesign(design: QuotationDesign, signatures: readonly SignatureLike[]): QuotationDesign {
  const { signature: _signature, stampImage: _stamp, ...rest } = design;
  const signer = selectedQuotationSignature(design, signatures);
  const stamp = design.showStamp ? defaultQuotationSignature(signatures, 'stamp') : undefined;
  return {
    ...rest,
    ...(signer ? { signature: { name: signer.name, role: signer.role, image: signer.image } } : {}),
    ...(stamp ? { stampImage: stamp.image } : {}),
  };
}
