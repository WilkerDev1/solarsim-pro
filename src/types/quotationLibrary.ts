import type {
  QuotationSignature, QuotationSignatureContent, QuotationTemplate, QuotationTemplateContent,
} from '../../shared/quotations';

export type {
  QuotationSignature, QuotationSignatureContent, QuotationSignatureKind, QuotationTemplate, QuotationTemplateContent, QuotationTemplateDesign,
} from '../../shared/quotations';

/** Colección de la biblioteca: plantillas o firmas y sellos. */
export type LibraryKind = 'templates' | 'signatures';
export type LibraryContent<K extends LibraryKind> = K extends 'templates' ? QuotationTemplateContent : QuotationSignatureContent;
export type LibraryRecord<K extends LibraryKind> = K extends 'templates' ? QuotationTemplate : QuotationSignature;

/** Escritura local pendiente de publicar (mismo modelo que las cotizaciones, más simple: sin plan de estados). */
export interface LibraryChange<T> {
  revision: string;
  ownerId?: string;
  baseVersion: number;
  /** Conflicto: la copia del servidor (`null` = la borraron en el servidor). */
  server?: T | null;
  /** Rechazo 4xx que no se reintenta hasta una edición nueva o una resolución. */
  rejected?: { revision: string; status: number; code?: string; error: string };
}

export interface LibraryDeletion<T = unknown> {
  id: string;
  ownerId?: string;
  baseVersion: number;
  /** Copia local al borrar: vuelve a la lista si la API rechaza el borrado. */
  record?: T;
  rejected?: { status: number; error: string };
}

export interface LibraryCollectionState<T> {
  items: T[];
  changes: Record<string, LibraryChange<T>>;
  deletions: LibraryDeletion<T>[];
  /** Cursor de `GET ?since=` del espacio de trabajo `scope`. */
  cursor: { scope: string; serverTimestamp: string } | null;
}

/** Plantillas y firmas del espacio de trabajo (se archivan y restauran con él, como las cotizaciones). */
export interface QuotationLibraryState {
  templates: LibraryCollectionState<QuotationTemplate>;
  signatures: LibraryCollectionState<QuotationSignature>;
}

export const emptyQuotationLibrary = (): QuotationLibraryState => ({
  templates: { items: [], changes: {}, deletions: [], cursor: null },
  signatures: { items: [], changes: {}, deletions: [], cursor: null },
});

export type LibraryMutationResult<T> = { ok: true; record: T } | { ok: false; error: string };
