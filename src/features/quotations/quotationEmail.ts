/**
 * Correo de una cotización (docs/QUOTATION_EDITOR.md#correo), todo puro: asunto y cuerpo generados desde la
 * cotización, destinatario validado, enlace `mailto:` sin inyección de cabeceras y con tope de longitud, y la lista de
 * archivos que acompañarían el mensaje. La app no envía correos ni adjunta archivos: prepara el texto y abre la
 * aplicación de correo del usuario.
 */
import {
  QUOTATION_SHEET_TEXTS, computeQuotationTotals, formatMoney, formatSheetDate, goesInsidePdf, goesSeparate,
  type QuotationAttachment, type QuotationContent, type QuotationPrintedClient,
} from '../../../shared/quotations';
import { isValidEmailAddress } from '../../../shared/externalUrl';
import { quotationPdfFileName } from './exportQuotationPdf';

export { isValidEmailAddress };

export type QuotationEmailSource = Pick<
  QuotationContent, 'client' | 'projectLabel' | 'validUntil' | 'paymentTerms' | 'seller' | 'issuer' | 'currency' | 'items' | 'discounts'
> & { number: string | null; status?: QuotationContent['status'] };

/** Lo editable del correo para un envío (estado local del editor, nunca se guarda en la cotización). */
export interface QuotationEmailText {
  subject: string;
  /** Saludo e introducción. */
  opening: string;
  /** Despedida, antes de la firma. */
  closing: string;
}

export interface QuotationEmailSummary {
  /** Número o «Borrador». */
  reference: string;
  /** Total con moneda (`formatMoney`). */
  total: string;
  rows: { label: string; value: string }[];
}

export interface QuotationEmailFile {
  /** Clave estable: `quotation-pdf` o el id del adjunto. */
  id: string;
  name: string;
  /** Tipo que se muestra en la etiqueta: PDF, PNG, JPG, WEBP. */
  kind: string;
  /** Va aparte (adjunto con «Archivo aparte en el correo», que el usuario adjunta a mano); el PDF de la cotización no. */
  separate: boolean;
  /** Aparte y además dentro del PDF (los dos destinos). */
  alsoInPdf?: boolean;
  /** Para el PDF: «Incluye N adjuntos»; vacío sin adjuntos dentro. */
  annexes?: string;
  note: string;
}

/** Tope del enlace `mailto:` completo: por debajo de los ~2 000 caracteres que aceptan Windows y Outlook. */
export const MAILTO_MAX_LENGTH = 2000;
/** Máximo del asunto en puntos de código: lo aplican el generador (con «…») y el campo editable (`limitSubject`). */
export const SUBJECT_MAX_CHARS = 200;
const TERMS_MAX_CHARS = 120;
const TRUNCATION_NOTE = '[Mensaje recortado: pega aquí el mensaje completo que copiaste desde SolarSim.]';

const chars = (text: string) => Array.from(text);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
/** Acota a `max` puntos de código cortando por palabra si se puede, con «…». */
function clip(text: string, max: number): string {
  const list = chars(text);
  if (list.length <= max) return text;
  const cut = list.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Asunto tecleado: en una línea no se fuerza aquí (se respeta lo escrito), pero nunca más de `SUBJECT_MAX_CHARS`. */
export function limitSubject(text: string): string {
  const list = chars(text);
  return list.length <= SUBJECT_MAX_CHARS ? text : list.slice(0, SUBJECT_MAX_CHARS).join('');
}

/** Condiciones de pago en una línea: la primera no vacía, acotada; «…» si había más. */
export function summarizePaymentTerms(terms: string): string {
  const lines = terms.split(/\r?\n/).map(oneLine).filter(Boolean);
  if (!lines.length) return '';
  const first = clip(lines[0], TERMS_MAX_CHARS);
  return lines.length > 1 && !first.endsWith('…') ? `${first}…` : first;
}

export function quotationEmailText(source: QuotationEmailSource): QuotationEmailText {
  const name = oneLine(source.client.attention) || oneLine(source.client.name);
  const about = oneLine(source.issuer.name) || oneLine(source.projectLabel);
  const subject = clip(oneLine([`Cotización ${source.number ?? 'en borrador'}`, about].filter(Boolean).join(' — ')), SUBJECT_MAX_CHARS);
  const what = source.number ? 'la cotización' : 'el borrador de la cotización';
  return {
    subject,
    opening: `${name ? `Hola, ${name}:` : 'Hola:'}\n\nAdjuntamos ${what} que nos solicitó. Aquí tiene el resumen; el detalle completo está en el PDF.`,
    closing: 'Quedamos atentos a cualquier consulta.',
  };
}

export function quotationEmailSummary(source: QuotationEmailSource): QuotationEmailSummary {
  const totals = computeQuotationTotals({ items: source.items, discounts: source.discounts });
  const rows = [
    { label: QUOTATION_SHEET_TEXTS.project, value: oneLine(source.projectLabel) },
    { label: QUOTATION_SHEET_TEXTS.validUntil, value: source.validUntil ? formatSheetDate(source.validUntil) : '' },
    { label: 'Forma de pago', value: summarizePaymentTerms(source.paymentTerms) },
  ].filter((row) => row.value);
  return { reference: source.number ?? QUOTATION_SHEET_TEXTS.draftNumber, total: formatMoney(totals.totalCents, source.currency), rows };
}

/** Firma del mensaje: vendedor y, debajo, emisor · teléfono (lo que haya). */
export function quotationEmailSignature(source: QuotationEmailSource): string[] {
  const company = [oneLine(source.issuer.name), oneLine(source.issuer.phone)].filter(Boolean).join(' · ');
  return [oneLine(source.seller), company].filter(Boolean);
}

/** Cuerpo en texto plano: introducción, resumen, despedida y firma. */
export function quotationEmailBody(text: QuotationEmailText, summary: QuotationEmailSummary, signature: readonly string[]): string {
  const facts = [`Cotización: ${summary.reference}`, `Total: ${summary.total}`, ...summary.rows.map((row) => `${row.label}: ${row.value}`)].join('\n');
  return [text.opening.trim(), facts, text.closing.trim(), signature.join('\n')].filter(Boolean).join('\n\n');
}

/** Correo impreso del cliente, sin espacios ni saltos de línea, y si sirve para el `mailto:`. */
export function quotationEmailRecipient(client: QuotationPrintedClient): { address: string; valid: boolean } {
  const address = client.email.replace(/\s+/g, '');
  return { address, valid: isValidEmailAddress(address) };
}

/** Sustituye sustitutos sueltos (texto pegado dañado), que `encodeURIComponent` no admite. */
const wellFormed = (text: string) => text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
const encode = (text: string) => encodeURIComponent(wellFormed(text));
/** El prefijo más largo (en puntos de código) cuya codificación cabe en `budget`. */
function fitEncoded(text: string, budget: number): string {
  const list = chars(wellFormed(text));
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encodeURIComponent(list.slice(0, mid).join('')).length <= budget) low = mid;
    else high = mid - 1;
  }
  return list.slice(0, low).join('');
}

/**
 * `mailto:` con destinatario (solo si es válido), asunto en una línea y cuerpo con saltos CRLF, todo con
 * `encodeURIComponent`. Si no cabe en `maxLength`, recorta el asunto a la mitad del tope como mucho y el cuerpo a lo
 * que quede, con una nota que pide pegar el mensaje copiado (`truncated`).
 */
export function buildMailtoUrl(
  message: { to: string; subject: string; body: string },
  maxLength: number = MAILTO_MAX_LENGTH,
): { url: string; truncated: boolean; recipientIncluded: boolean } {
  const to = message.to.trim();
  let recipientIncluded = isValidEmailAddress(to);
  let head = `mailto:${recipientIncluded ? encodeURIComponent(to).replace(/%40/g, '@') : ''}?subject=`;
  // Un tope absurdo que ni siquiera deja sitio al destinatario: se abre sin él antes que pasarse.
  if (recipientIncluded && head.length > maxLength) {
    recipientIncluded = false;
    head = 'mailto:?subject=';
  }
  let subject = oneLine(message.subject);
  const body = message.body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
  const full = `${head}${encode(subject)}&body=${encode(body)}`;
  if (full.length <= maxLength) return { url: full, truncated: false, recipientIncluded };
  const subjectBudget = Math.max(0, Math.floor((maxLength - head.length) / 2));
  if (encode(subject).length > subjectBudget) subject = fitEncoded(subject, subjectBudget);
  const note = encode(`\r\n\r\n${TRUNCATION_NOTE}`);
  const fixed = `${head}${encode(subject)}&body=`;
  const room = maxLength - fixed.length - note.length;
  if (room > 0) {
    const kept = fitEncoded(body, room).trimEnd();
    return { url: `${fixed}${encode(kept)}${note}`, truncated: true, recipientIncluded };
  }
  // Sin sitio para el cuerpo: solo el asunto, acotado a lo que quede (el mensaje se pega desde el portapapeles).
  subject = fitEncoded(subject, Math.max(0, maxLength - head.length));
  return { url: `${head}${encode(subject)}`, truncated: true, recipientIncluded };
}

const kindOf = (name: string) => {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toUpperCase();
  return ext === 'JPEG' ? 'JPG' : ext && ['PDF', 'PNG', 'JPG', 'WEBP'].includes(ext) ? ext : 'PDF';
};

/** «Incluye N adjuntos»: los «Dentro del PDF» que el PDF lleva al final; sin ninguno, vacío. */
export function includedAnnexesLabel(attachments: readonly QuotationAttachment[]): string {
  const included = attachments.filter(goesInsidePdf).length;
  return included ? `Incluye ${included === 1 ? '1 adjunto' : `${included} adjuntos`}` : '';
}

/**
 * Lo que acompañaría al mensaje: el PDF de la cotización con su nombre real de exportación (los adjuntos «Dentro del
 * PDF» ya van dentro, y se dice cuántos) y, aparte, los que tienen «Archivo aparte en el correo» (solo correo o los dos
 * destinos), que el usuario descarga en Adjuntos y adjunta a mano.
 */
export function quotationEmailAttachments(number: string | null, attachments: readonly QuotationAttachment[]): QuotationEmailFile[] {
  const pdf: QuotationEmailFile = {
    id: 'quotation-pdf',
    name: quotationPdfFileName(number),
    kind: 'PDF',
    separate: false,
    annexes: includedAnnexesLabel(attachments),
    note: includedAnnexesLabel(attachments) || 'La cotización',
  };
  return [pdf, ...attachments.filter(goesSeparate).map((a) => {
    const name = a.fileName.trim() || a.title.trim() || 'Adjunto';
    const note = goesInsidePdf(a)
      ? 'Aparte (también va dentro del PDF): descárgalo en Adjuntos y adjúntalo a mano'
      : 'Aparte: descárgalo en Adjuntos y adjúntalo a mano';
    return { id: a.id, name, kind: kindOf(name), separate: true, ...(goesInsidePdf(a) ? { alsoInPdf: true } : {}), note };
  })];
}

/**
 * Texto del correo editado para este envío (estado local de la vista previa, nunca se guarda). `context` recuerda
 * de qué cotización se partió al editar (`quotationEmailContext`): si después cambian el número, el estado o el
 * cliente, el texto editado puede haber quedado viejo y la vista lo avisa.
 */
export interface QuotationEmailDraft {
  overrides: Partial<QuotationEmailText>;
  context: string | null;
}

export const EMPTY_EMAIL_DRAFT: QuotationEmailDraft = { overrides: {}, context: null };

/** Lo que, si cambia, deja viejo un texto editado: número, estado y nombre o atención del cliente. */
export function quotationEmailContext(source: QuotationEmailSource): string {
  return JSON.stringify([source.number, source.status ?? null, oneLine(source.client.name), oneLine(source.client.attention)]);
}

/** Cambia un texto (el asunto, acotado con `limitSubject`); la primera edición fija el contexto. */
export function editEmailDraft(draft: QuotationEmailDraft, key: keyof QuotationEmailText, value: string, context: string): QuotationEmailDraft {
  return {
    overrides: { ...draft.overrides, [key]: key === 'subject' ? limitSubject(value) : value },
    context: draft.context ?? context,
  };
}

/** «Restablecer texto»: vuelve a lo generado. */
export const resetEmailDraft = (): QuotationEmailDraft => EMPTY_EMAIL_DRAFT;

/** Texto que se muestra y envía, si difiere de lo generado y si quedó viejo respecto a la cotización actual. */
export function emailDraftView(draft: QuotationEmailDraft, defaults: QuotationEmailText, context: string): { text: QuotationEmailText; edited: boolean; stale: boolean } {
  const text = { ...defaults, ...draft.overrides };
  const edited = (Object.keys(draft.overrides) as (keyof QuotationEmailText)[]).some((key) => draft.overrides[key] !== undefined && draft.overrides[key] !== defaults[key]);
  return { text, edited, stale: edited && draft.context !== null && draft.context !== context };
}
