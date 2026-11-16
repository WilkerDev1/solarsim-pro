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

/**
 * Entrada del contexto del modelo. `truncated`: solo se envía el inicio del texto. `dynamic`: el texto se
 * calcula con los datos de la propuesta y, en una propuesta nueva, no se envía (el caso de referencia no es el cliente).
 */
export interface AIDocumentTextEntry { key: string; label: string; text?: string; truncated?: true; dynamic?: true }

/** Tope por texto y presupuesto total: los textos de fábrica (~4,5 KB en total) viajan completos. */
const MAX_TEXT_CHARS = 1200;
const TOTAL_TEXT_BUDGET = 12000;
const TRUNCATED_CHARS = 160;

/** Depende de los datos del proyecto (cliente, cotización, equipos, cifras, tarifa o vigencia). */
export const isProjectDependentText = (key: string): boolean => {
  const definition = getDocumentTextDefinition(key);
  return !!definition && (definition.section === 'client' || !!definition.projectDependent);
};

/**
 * Contexto para el modelo: clave, etiqueta y valor actual, completo hasta el tope y el presupuesto;
 * lo que no cabe se recorta y se marca `truncated`. Con `newProposal`, los textos que dependen del
 * proyecto se envían sin valor (`dynamic`).
 */
export function aiDocumentTextCatalog(source: DocumentTextSource, ctx: DocumentTextContext, options: { newProposal?: boolean } = {}): AIDocumentTextEntry[] {
  let budget = TOTAL_TEXT_BUDGET;
  return AI_DRAFT_DOCUMENT_TEXT_KEYS.map((key): AIDocumentTextEntry => {
    const label = getDocumentTextDefinition(key)!.label;
    if (options.newProposal && isProjectDependentText(key)) return { key, label, dynamic: true };
    const text = resolveDocumentText(key, source, ctx).text;
    if (text.length <= MAX_TEXT_CHARS && text.length <= budget) { budget -= text.length; return { key, label, text }; }
    const cut = text.slice(0, Math.min(TRUNCATED_CHARS, Math.max(0, budget)));
    budget -= cut.length;
    return { key, label, text: cut, truncated: true };
  });
}

/** Cambio de texto del borrador: `text: null` vuelve al texto predeterminado. `partial`: la IA solo vio el inicio del texto actual. */
export interface DraftDocumentText { key: string; label: string; text: string | null; partial?: true }

const VALIDITY_DAYS = /^(\d{1,3})(?:\s*d[ií]as?)?$/i;

const MAX_DRAFT_TEXTS = 40;

/**
 * Valida los textos del borrador contra el registro. Sin lista en la respuesta se conservan los del
 * borrador anterior; `[]` los descarta. Las claves desconocidas o cubiertas por un campo del borrador
 * se quitan con un aviso (no bloquean el resto del borrador). `seen` es el contexto enviado al modelo:
 * reescribir un texto del que solo vio el inicio marca la fila `partial` y avisa.
 */
export function normalizeDraftDocumentTexts(
  raw: unknown,
  previous: unknown,
  issue: (code: string, message: string, severity?: 'error' | 'warning') => void,
  seen?: readonly AIDocumentTextEntry[],
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
    let text: string | null;
    if (row.text === null) text = null;
    else if (definition.clientField === 'quoteValidityDays') {
      // Antes de sanear (el campo admite 4 caracteres): solo «N» o «N día(s)», nunca «-15» ni «1 día (antes 2)».
      const match = VALIDITY_DAYS.exec(row.text.trim());
      const days = match ? Number(match[1]) : NaN;
      if (!(days >= 1 && days <= 365)) { issue('invalid_document_text', `«${definition.label}» necesita un número entero de días entre 1 y 365 (p. ej. «15» o «15 días»).`, 'warning'); continue; }
      text = String(days);
    } else text = sanitizeDocumentText(key, row.text);
    const partial = row.partial === true || (Array.isArray(raw) && text !== null && !!seen?.some((t) => t.key === key && t.truncated));
    byKey.delete(key); // el último cambio de una clave gana y conserva el orden de aparición
    byKey.set(key, { key, label: definition.label, text, ...(partial ? { partial: true as const } : {}) });
  }
  const partial = [...byKey.values()].filter((t) => t.partial);
  if (partial.length) issue('document_text_seen_partially', `La IA solo vio el inicio de: ${partial.map((t) => t.label).join(', ')}. Revisa el texto completo antes de aplicar.`, 'warning');
  return [...byKey.values()];
}

/** Valores para `documentTextsPatch` (`null` restablece). */
export function draftDocumentTextValues(texts: readonly DraftDocumentText[] | undefined): Record<string, string | null> {
  return Object.fromEntries((texts || []).map((t) => [t.key, t.text]));
}
