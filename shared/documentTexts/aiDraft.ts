/**
 * Textos del documento en el borrador del asistente de propuestas (Modo IA).
 * Puro y sin imports de `src/`: el prompt (Electron y renderer) y la normalización lo comparten.
 */
import type { DocumentTextContext } from './context';
import { PAGE_TEXT_DEFINITIONS } from './pageTexts';
import { DOCUMENT_TEXT_DEFINITIONS, getDocumentTextDefinition } from './registry';
import { resolveDocumentText, type DocumentTextSource } from './resolve';
import { sanitizeDocumentText } from './write';

/** Claves que el borrador ya cubre con su propio campo: van por ese campo, nunca como texto del documento. */
export const DRAFT_FIELD_TEXT_KEYS: Readonly<Record<string, string>> = {
  'client.name': 'clientName',
  'client.address': 'address',
  'client.phone': 'phone',
  'client.email': 'email',
};

const PAGE_KEYS = new Set(PAGE_TEXT_DEFINITIONS.map((d) => d.key));

/**
 * Textos con contenido (garantías, vigencia, condiciones, servicios, alcance, notas, párrafos, datos de
 * empresa y cotización) que se ofrecen al modelo. Quedan fuera las etiquetas y títulos fijos de página
 * para no inflar el prompt; la normalización acepta igualmente cualquier clave del registro.
 */
export const AI_DRAFT_DOCUMENT_TEXT_KEYS: readonly string[] = DOCUMENT_TEXT_DEFINITIONS
  .filter((d) => !PAGE_KEYS.has(d.key) && !/^(page|toc)\./.test(d.key) && !(d.key in DRAFT_FIELD_TEXT_KEYS))
  .map((d) => d.key);

export interface AIDocumentTextEntry { key: string; label: string; text: string }

/** Contexto mínimo para el modelo: clave, etiqueta y valor actual (recortado; `…` marca un texto truncado). */
export function aiDocumentTextCatalog(source: DocumentTextSource, ctx: DocumentTextContext, maxTextLength = 160): AIDocumentTextEntry[] {
  return AI_DRAFT_DOCUMENT_TEXT_KEYS.map((key) => {
    const text = resolveDocumentText(key, source, ctx).text;
    return { key, label: getDocumentTextDefinition(key)!.label, text: text.length > maxTextLength ? `${text.slice(0, maxTextLength)}…` : text };
  });
}

/** Cambio de texto del borrador: `text: null` vuelve al texto predeterminado. */
export interface DraftDocumentText { key: string; label: string; text: string | null }

const MAX_DRAFT_TEXTS = 40;

/**
 * Valida los textos del borrador contra el registro. Sin lista en la respuesta se conservan los del
 * borrador anterior; `[]` los descarta. Las claves desconocidas o cubiertas por un campo del borrador
 * se quitan con un aviso (no bloquean el resto del borrador).
 */
export function normalizeDraftDocumentTexts(
  raw: unknown,
  previous: unknown,
  issue: (code: string, message: string, severity?: 'error' | 'warning') => void,
): DraftDocumentText[] | undefined {
  const rows = Array.isArray(raw) ? raw : Array.isArray(previous) ? previous : undefined;
  if (!rows) return undefined;
  if (rows.length > MAX_DRAFT_TEXTS) issue('too_many_document_texts', `El borrador cambia más de ${MAX_DRAFT_TEXTS} textos del documento; se conservan los primeros.`, 'warning');
  const byKey = new Map<string, DraftDocumentText>();
  for (const row of rows.slice(0, MAX_DRAFT_TEXTS)) {
    const key = typeof row?.key === 'string' ? row.key.trim() : '';
    const definition = getDocumentTextDefinition(key);
    if (!definition) { issue('unknown_document_text', `El documento no tiene el texto «${key || '(sin clave)'}»; no se cambiará.`, 'warning'); continue; }
    if (key in DRAFT_FIELD_TEXT_KEYS) { issue('document_text_is_draft_field', `«${definition.label}» se edita en el campo del borrador, no como texto del documento.`, 'warning'); continue; }
    if (row.text !== null && typeof row.text !== 'string') { issue('invalid_document_text', `«${definition.label}»: el texto no es válido; no se cambiará.`, 'warning'); continue; }
    let text: string | null = row.text === null ? null : sanitizeDocumentText(key, row.text);
    if (definition.clientField === 'quoteValidityDays' && text !== null) {
      const days = parseInt(text.replace(/\D/g, ''), 10);
      if (!Number.isInteger(days) || days <= 0 || days > 365) { issue('invalid_document_text', `«${definition.label}» necesita un número de días entre 1 y 365.`, 'warning'); continue; }
      text = String(days);
    }
    byKey.delete(key); // el último cambio de una clave gana y conserva el orden de aparición
    byKey.set(key, { key, label: definition.label, text });
  }
  return [...byKey.values()];
}

/** Valores para `documentTextsPatch` (`null` restablece). */
export function draftDocumentTextValues(texts: readonly DraftDocumentText[] | undefined): Record<string, string | null> {
  return Object.fromEntries((texts || []).map((t) => [t.key, t.text]));
}
