import { interpolate, type DocumentTextContext } from './context';
import { DOCUMENT_TEXT_DEFINITIONS, getDocumentTextDefinition, type DocumentTextDefinition, type DocumentTextSection } from './registry';

/** Lo mínimo de `DocumentCustomization` que leen los textos (sin importar tipos de `src/`). */
export interface DocumentTextCustomization {
  texts?: Record<string, string>;
}

/** Lectura de un campo arbitrario (los tipos de `src/` no declaran índice de strings). */
export const fieldOf = (record: object | undefined, field: string): unknown => (record as Record<string, unknown> | undefined)?.[field];

export interface DocumentTextClient {
  name?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  quoteNumber?: string;
  quoteDate?: string;
  quoteValidityDays?: number;
}

/** Dónde están guardados los textos: la personalización y los datos del cliente del proyecto. */
export interface DocumentTextSource {
  customization?: DocumentTextCustomization;
  client?: DocumentTextClient;
}

export interface ResolvedDocumentText {
  key: string;
  text: string;
  /** 'custom' si se muestra un valor guardado; 'default' si se muestra el texto por defecto (fijo o dinámico). */
  source: 'custom' | 'default';
  /** El texto mostrado difiere del predeterminado (chip «Personalizado», botón «Restablecer»). */
  isCustomized: boolean;
  /** Valor guardado tal cual (sin interpolar), si lo hay. */
  stored?: string;
}

/** Valor guardado para una definición, o `undefined` si no hay ninguno. */
export function storedDocumentText(definition: DocumentTextDefinition, source: DocumentTextSource): string | undefined {
  if (definition.clientField) {
    const value = fieldOf(source.client, definition.clientField);
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : undefined;
    return typeof value === 'string' ? value : undefined;
  }
  const customization = source.customization;
  const value = definition.legacyField ? fieldOf(customization, definition.legacyField) : customization?.texts?.[definition.key];
  return typeof value === 'string' ? value : undefined;
}

function hasCustomValue(definition: DocumentTextDefinition, stored: string | undefined): stored is string {
  if (stored === undefined) return false;
  if (definition.knownFactoryValues?.includes(stored)) return false;
  return definition.emptyIsValue ? true : stored.trim() !== '';
}

export function resolveDocumentText(key: string, source: DocumentTextSource, ctx: DocumentTextContext): ResolvedDocumentText {
  return resolveWith(key, source, ctx, new Set());
}

function resolveWith(key: string, source: DocumentTextSource, ctx: DocumentTextContext, visiting: Set<string>): ResolvedDocumentText {
  const definition = getDocumentTextDefinition(key);
  if (!definition) throw new Error(`Texto del documento desconocido: ${key}`);
  if (visiting.has(key)) throw new Error(`Referencia circular entre textos: ${key}`);
  visiting.add(key);
  const other = (otherKey: string) => resolveWith(otherKey, source, ctx, visiting).text;
  try {
    const defaultText = defaultDocumentText(definition, ctx, other);
    const stored = storedDocumentText(definition, source);
    if (!hasCustomValue(definition, stored)) return { key, text: defaultText, source: 'default', isCustomized: false, ...(stored !== undefined ? { stored } : {}) };
    const text = interpolate(definition.read ? definition.read(stored, ctx, other) : stored, ctx);
    return { key, text, source: 'custom', isCustomized: definition.customWhenStored || text !== defaultText, stored };
  } finally {
    visiting.delete(key);
  }
}

/** Texto predeterminado (fijo o calculado del contexto), ya listo para mostrar. */
export function defaultDocumentText(definition: DocumentTextDefinition, ctx: DocumentTextContext, other: (key: string) => string = () => ''): string {
  return typeof definition.defaultText === 'function' ? definition.defaultText(ctx, other) : definition.defaultText;
}

export interface DocumentTextListItem extends ResolvedDocumentText {
  label: string;
  section: DocumentTextSection;
  format: DocumentTextDefinition['format'];
  multiline: boolean;
  templatable: boolean;
  resettable: boolean;
}

/** Todos los textos resueltos (o los de una sección): base de las herramientas de IA. */
export function listDocumentTexts(source: DocumentTextSource, ctx: DocumentTextContext, filter: { section?: DocumentTextSection } = {}): DocumentTextListItem[] {
  return DOCUMENT_TEXT_DEFINITIONS
    .filter((definition) => !filter.section || definition.section === filter.section)
    .map((definition) => ({
      ...resolveDocumentText(definition.key, source, ctx),
      label: definition.label,
      section: definition.section,
      format: definition.format,
      multiline: definition.multiline,
      templatable: definition.templatable,
      resettable: definition.resettable !== false,
    }));
}
