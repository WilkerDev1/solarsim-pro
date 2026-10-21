import type { DocumentTextContext } from './context';
import { DOCUMENT_TEXT_DEFINITIONS, getDocumentTextDefinition } from './registry';
import { resolveDocumentText, storedDocumentText, type DocumentTextCustomization, type DocumentTextSource } from './resolve';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cambia los datos literales del cliente por placeholders antes de guardar un texto en la plantilla
 * de la empresa: el nombre del cliente de esta propuesta no debe aparecer en la siguiente.
 */
export function templatizeText(text: string, ctx: DocumentTextContext): string {
  const replacements: Array<[string, string]> = [];
  const add = (value: string | undefined, placeholder: string, minLength: number) => {
    const trimmed = (value || '').trim();
    if (trimmed.length < minLength || trimmed === 'Cliente') return;
    replacements.push([trimmed, placeholder], [trimmed.toUpperCase(), placeholder]);
  };
  add(ctx.clientName, '{clientName}', 3);
  if (ctx.clientContactPerson !== ctx.clientName) add(ctx.clientContactPerson, '{contactName}', 3);
  add(ctx.clientPhone, '{clientPhone}', 7);
  add(ctx.clientEmail, '{clientEmail}', 5);
  // Los valores más largos primero, para no partir un nombre que contiene a otro.
  replacements.sort((a, b) => b[0].length - a[0].length);
  let result = text;
  for (const [literal, placeholder] of replacements) result = result.replace(new RegExp(escapeRegExp(literal), 'g'), placeholder);
  return result;
}

/**
 * Deja solo los textos que pueden ir en una plantilla de empresa: quita contacto, teléfono y correo
 * del cliente y las entradas de `texts` no plantillables o desconocidas.
 */
export function templateTexts<T extends DocumentTextCustomization>(customization: T): T {
  const result = { ...customization } as Record<string, unknown> & DocumentTextCustomization;
  for (const definition of DOCUMENT_TEXT_DEFINITIONS) {
    if (!definition.templatable && definition.legacyField) delete result[definition.legacyField];
  }
  if (customization.texts) {
    result.texts = Object.fromEntries(
      Object.entries(customization.texts).filter(([key]) => getDocumentTextDefinition(key)?.templatable),
    );
  }
  return result as T;
}

export interface TemplateTextPatchResult {
  /** Cambios a fusionar en la plantilla de la empresa (`texts` ya combinado con la plantilla actual). */
  patch: Record<string, unknown> & DocumentTextCustomization;
  saved: string[];
  /** Claves que no pueden ir en una plantilla (datos del cliente). */
  skipped: string[];
}

/**
 * Parche de plantilla para las claves indicadas: los textos personalizados se guardan con
 * placeholders; los que están en su valor predeterminado se quitan de la plantilla.
 */
export function companyTemplateTextPatch(
  keys: readonly string[] | 'all',
  source: DocumentTextSource,
  ctx: DocumentTextContext,
  template: DocumentTextCustomization = {},
): TemplateTextPatchResult {
  const requested = keys === 'all' ? DOCUMENT_TEXT_DEFINITIONS.map((definition) => definition.key) : keys;
  const patch: Record<string, unknown> & DocumentTextCustomization = {};
  const texts: Record<string, string> = { ...(template.texts || {}) };
  let touchedTexts = false;
  const saved: string[] = [];
  const skipped: string[] = [];
  for (const key of requested) {
    const definition = getDocumentTextDefinition(key);
    if (!definition || !definition.templatable || definition.clientField) {
      skipped.push(key);
      continue;
    }
    const resolved = resolveDocumentText(key, source, ctx);
    const stored = storedDocumentText(definition, source);
    const custom = resolved.source === 'custom' && stored !== undefined ? templatizeText(stored, ctx) : undefined;
    if (definition.legacyField) {
      patch[definition.legacyField] = custom ?? (definition.emptyIsValue ? undefined : '');
    } else {
      touchedTexts = true;
      if (custom === undefined) delete texts[key];
      else texts[key] = custom;
    }
    saved.push(key);
  }
  if (touchedTexts) patch.texts = texts;
  return { patch, saved, skipped };
}
