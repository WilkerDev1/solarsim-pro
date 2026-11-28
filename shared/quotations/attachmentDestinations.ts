/**
 * Destinos de un adjunto de cotización (docs/QUOTATION_EDITOR.md#adjuntos): «Dentro del PDF» y «Archivo aparte en el
 * correo», combinables y con al menos uno. Se expresan con el contrato que la API ya valida
 * (`mode: 'include' | 'related'`) más el opcional `alsoSeparate`:
 *
 * - solo PDF    = `include`
 * - solo correo = `related`
 * - ambos       = `include` + `alsoSeparate: true`
 */
import type { QuotationAttachment } from './types.js';

export type AttachmentDestination = 'pdf' | 'email';
export interface AttachmentDestinations {
  /** Se fusiona al final del PDF de la cotización. */
  pdf: boolean;
  /** Va como archivo suelto junto al PDF en el correo. */
  email: boolean;
}

type DestinationFields = Pick<QuotationAttachment, 'mode' | 'alsoSeparate'>;

export const attachmentDestinations = (attachment: DestinationFields): AttachmentDestinations => ({
  pdf: attachment.mode === 'include',
  email: attachment.mode === 'related' || (attachment.mode === 'include' && attachment.alsoSeparate === true),
});

export const goesInsidePdf = (attachment: DestinationFields): boolean => attachment.mode === 'include';
export const goesSeparate = (attachment: DestinationFields): boolean => attachmentDestinations(attachment).email;

/** El adjunto con esos destinos; `null` si no queda ninguno (la regla «al menos uno»). Nunca muta la entrada. */
export function withAttachmentDestinations<T extends DestinationFields>(attachment: T, destinations: AttachmentDestinations): T | null {
  if (!destinations.pdf && !destinations.email) return null;
  const { alsoSeparate: _previous, ...rest } = attachment;
  if (destinations.pdf && destinations.email) return { ...rest, mode: 'include', alsoSeparate: true } as T;
  return { ...rest, mode: destinations.pdf ? 'include' : 'related' } as T;
}

/** Destinos tras conmutar uno (puede no quedar ninguno: `withAttachmentDestinations` lo rechaza). */
export function toggledDestinations(attachment: DestinationFields, which: AttachmentDestination): AttachmentDestinations {
  const current = attachmentDestinations(attachment);
  return { ...current, [which]: !current[which] };
}

/** Resumen de un grupo: «2 en el PDF · 1 aparte» (un adjunto con los dos destinos cuenta en ambos); vacío, «Ninguno». */
export function attachmentDestinationSummary(attachments: readonly DestinationFields[]): string {
  if (!attachments.length) return 'Ninguno';
  const pdf = attachments.filter(goesInsidePdf).length;
  const separate = attachments.filter(goesSeparate).length;
  return [pdf ? `${pdf} en el PDF` : '', separate ? `${separate} aparte` : ''].filter(Boolean).join(' · ');
}

/** Etiqueta corta del destino para listas (dock del catálogo). */
export function attachmentDestinationLabel(attachment: DestinationFields): string {
  const { pdf, email } = attachmentDestinations(attachment);
  return pdf && email ? 'En el PDF y aparte' : pdf ? 'En el PDF' : 'Aparte en el correo';
}
