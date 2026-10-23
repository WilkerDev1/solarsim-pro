import { DOCUMENT_SECTION_IDS, DOCUMENT_SECTIONS, isDocumentSectionId, type DocumentSectionId } from './documentTexts/sections';

/** Diseño persistente del documento (`customization.layout`): visibilidad de secciones, tema y cabecera/pie. */
export interface DocumentLayout {
  /** Secciones visibles por defecto que el usuario ocultó. */
  hiddenSections?: string[];
  /** Secciones ocultas por defecto (confidenciales) que el usuario mostró. */
  visibleSections?: string[];
  themeId?: string;
  showHeadersFooters?: boolean;
}

export type SectionVisibility = Record<DocumentSectionId, boolean>;

const visibleByDefault = (id: DocumentSectionId) => !DOCUMENT_SECTIONS[id].confidential;

/** Visibilidad efectiva de cada sección: todas, salvo las confidenciales, hasta que el usuario decida. */
export function resolveSectionVisibility(layout?: DocumentLayout | null): SectionVisibility {
  const hidden = new Set(layout?.hiddenSections ?? []);
  const shown = new Set(layout?.visibleSections ?? []);
  return Object.fromEntries(
    DOCUMENT_SECTION_IDS.map((id) => [id, shown.has(id) ? true : hidden.has(id) ? false : visibleByDefault(id)]),
  ) as SectionVisibility;
}

/** Diseño con la visibilidad de una sección cambiada; solo guarda las diferencias con el valor por defecto. */
export function withSectionVisible(layout: DocumentLayout | null | undefined, id: DocumentSectionId, visible: boolean): DocumentLayout {
  const hidden = (layout?.hiddenSections ?? []).filter((item) => item !== id);
  const shown = (layout?.visibleSections ?? []).filter((item) => item !== id);
  if (visible !== visibleByDefault(id)) (visible ? shown : hidden).push(id);
  const next: DocumentLayout = { ...layout };
  if (hidden.length) next.hiddenSections = hidden; else delete next.hiddenSections;
  if (shown.length) next.visibleSections = shown; else delete next.visibleSections;
  return next;
}

/**
 * Parche para `setDocumentLayout` al cambiar una sección. Lleva siempre las dos listas (vacías si
 * no quedan diferencias) para que volver al valor por defecto reemplace la lista guardada en lugar
 * de heredarla al combinar parches.
 */
export function sectionVisibilityPatch(layout: DocumentLayout | null | undefined, id: DocumentSectionId, visible: boolean): Required<Pick<DocumentLayout, 'hiddenSections' | 'visibleSections'>> {
  const next = withSectionVisible(layout, id, visible);
  return { hiddenSections: next.hiddenSections ?? [], visibleSections: next.visibleSections ?? [] };
}

/** Quita ids desconocidos y valores inválidos de un diseño guardado (datos antiguos o editados a mano). */
export function normalizeDocumentLayout(layout: unknown): DocumentLayout {
  if (!layout || typeof layout !== 'object') return {};
  const source = layout as Record<string, unknown>;
  const ids = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter(isDocumentSectionId))] : []);
  const result: DocumentLayout = {};
  const hidden = ids(source.hiddenSections);
  const shown = ids(source.visibleSections);
  if (hidden.length) result.hiddenSections = hidden;
  if (shown.length) result.visibleSections = shown;
  if (typeof source.themeId === 'string' && source.themeId) result.themeId = source.themeId;
  if (typeof source.showHeadersFooters === 'boolean') result.showHeadersFooters = source.showHeadersFooters;
  return result;
}

export const showHeadersFooters = (layout?: DocumentLayout | null): boolean => layout?.showHeadersFooters !== false;
