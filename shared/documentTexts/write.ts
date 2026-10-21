import type { DocumentTextContext } from './context';
import { getDocumentTextDefinition, type DocumentTextDefinition } from './registry';
import { defaultDocumentText, resolveDocumentText, type DocumentTextClient, type DocumentTextCustomization, type DocumentTextSource } from './resolve';
import { sanitizeRichText } from './richText';

/** Cambios a aplicar en el proyecto: personalización y, si corresponde, datos del cliente. */
export interface DocumentTextPatch {
  customization?: Record<string, unknown> & DocumentTextCustomization;
  client?: Record<string, unknown> & Partial<DocumentTextClient>;
}

function requireDefinition(key: string): DocumentTextDefinition {
  const definition = getDocumentTextDefinition(key);
  if (!definition) throw new Error(`Texto del documento desconocido: ${key}`);
  return definition;
}

/** Normaliza un valor según el formato del texto (negrita/cursiva/viñetas solo en textos enriquecidos). */
export function sanitizeDocumentText(key: string, value: string): string {
  const definition = requireDefinition(key);
  return sanitizeRichText(value, { format: definition.format, multiline: definition.multiline, maxLength: definition.maxLength });
}

/**
 * Parche para guardar `value` en `key`. Escribir el texto predeterminado equivale a restablecer,
 * así los textos dinámicos siguen siéndolo.
 */
export function documentTextPatch(key: string, value: string, source: DocumentTextSource, ctx: DocumentTextContext): DocumentTextPatch {
  const definition = requireDefinition(key);
  const text = sanitizeDocumentText(key, value);

  if (definition.clientField) {
    if (definition.clientField === 'quoteValidityDays') {
      const days = parseInt(text.replace(/\D/g, ''), 10);
      return { client: { quoteValidityDays: Number.isNaN(days) || days <= 0 ? 7 : days } };
    }
    return { client: { [definition.clientField]: text } };
  }

  const other = (otherKey: string) => resolveDocumentText(otherKey, source, ctx).text;
  if (definition.resettable !== false && text === defaultDocumentText(definition, ctx, other) && !definition.emptyIsValue) {
    return documentTextResetPatch(key, source);
  }

  const patch: DocumentTextPatch = definition.legacyField
    ? { customization: { [definition.legacyField]: text } }
    : { customization: { texts: { ...(source.customization?.texts || {}), [key]: text } } };
  if (definition.mirrorsClientField) patch.client = { [definition.mirrorsClientField]: text };
  return patch;
}

/** Parche para volver al texto predeterminado. */
export function documentTextResetPatch(key: string, source: DocumentTextSource): DocumentTextPatch {
  const definition = requireDefinition(key);
  if (definition.clientField) {
    if (definition.resettable === false) return {};
    return { client: { [definition.clientField]: definition.clientField === 'quoteValidityDays' ? 7 : '' } };
  }
  if (definition.legacyField) {
    // Los datos de empresa/contacto distinguen «vacío» de «sin definir»: restablecer quita el campo.
    return { customization: { [definition.legacyField]: definition.emptyIsValue ? undefined : '' } };
  }
  const { [key]: _removed, ...texts } = source.customization?.texts || {};
  return { customization: { texts } };
}

/**
 * Varios textos a la vez (`null` restablece). Cada parche se calcula sobre el resultado del
 * anterior, así que `texts` y los campos espejo quedan coherentes.
 */
export function documentTextsPatch(values: Record<string, string | null>, source: DocumentTextSource, ctx: DocumentTextContext): DocumentTextPatch {
  const combined: DocumentTextPatch = {};
  let current: DocumentTextSource = source;
  for (const [key, value] of Object.entries(values)) {
    const patch = value === null ? documentTextResetPatch(key, current) : documentTextPatch(key, value, current, ctx);
    if (patch.customization) combined.customization = { ...(combined.customization || {}), ...patch.customization };
    if (patch.client) combined.client = { ...(combined.client || {}), ...patch.client };
    current = applyDocumentTextPatch(current, patch);
  }
  return combined;
}

/** Aplica un parche a una fuente (inmutable). Sirve al store, a las pruebas y a las herramientas de IA. */
export function applyDocumentTextPatch<T extends DocumentTextSource>(source: T, patch: DocumentTextPatch): T {
  const next = { ...source };
  if (patch.customization) next.customization = { ...(source.customization || {}), ...patch.customization } as T['customization'];
  if (patch.client) next.client = { ...(source.client || {}), ...patch.client } as T['client'];
  return next;
}
