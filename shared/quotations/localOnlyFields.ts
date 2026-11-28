/**
 * Campos de una cotización que una API o un cliente anteriores no conocen y descartan en silencio («solo locales» para
 * ellos): `dismissedSourceDocuments` (la 2.10.0) y `alsoSeparate` de cada adjunto (la 2.10.1)
 * (docs/QUOTATIONS.md#campos-solo-locales). La API los declara en `GET /api/quotations` (`localOnlyFieldsStored`) y
 * los usa para no bloquear el cambio de estado de un cliente anterior.
 */
import type { QuotationContent } from './types.js';

export const LOCAL_ONLY_FIELDS = ['alsoSeparate', 'dismissedSourceDocuments'] as const;
export type LocalOnlyField = (typeof LOCAL_ONLY_FIELDS)[number];

/**
 * `stored` sin los campos solo locales que faltan en `incoming` (los adjuntos se emparejan por id). Si un PUT de una
 * cotización bloqueada coincide con esto salvo el estado, solo difiere de lo guardado en que un cliente que no conoce
 * esos campos los dejó fuera: es un cambio de estado puro. Nunca muta la entrada.
 */
export function withoutLocalOnlyMissingIn(stored: QuotationContent, incoming: QuotationContent): QuotationContent {
  let out: QuotationContent = stored;
  if (stored.dismissedSourceDocuments !== undefined && incoming.dismissedSourceDocuments === undefined) {
    const { dismissedSourceDocuments: _missing, ...rest } = stored;
    out = rest;
  }
  const incomingAttachments = new Map((incoming.attachments ?? []).map((a) => [a.id, a]));
  const lacks = (id: string) => { const theirs = incomingAttachments.get(id); return !!theirs && theirs.alsoSeparate === undefined; };
  if ((stored.attachments ?? []).some((a) => a.alsoSeparate !== undefined && lacks(a.id))) {
    out = {
      ...out,
      attachments: stored.attachments.map((a) => {
        if (a.alsoSeparate === undefined || !lacks(a.id)) return a;
        const { alsoSeparate: _missing, ...rest } = a;
        return rest;
      }),
    };
  }
  return out;
}
