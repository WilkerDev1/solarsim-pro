import type { Quotation, QuotationContent } from '../../shared/quotations';

export type {
  Quotation, QuotationAttachment, QuotationContent, QuotationCurrency, QuotationDesign, QuotationDiscount, QuotationIssuer, QuotationLine,
  QuotationLineKind, QuotationPrintedClient, QuotationStatus,
} from '../../shared/quotations';

/**
 * Cotización guardada en el cliente. `version`/`baseVersion` valen 0 hasta la primera confirmación del servidor y
 * `number` es `null` hasta que la API lo asigna (con sesión) o lleva el número local (sin cuenta).
 */
export interface QuotationRecord extends Quotation {
  organizationId?: string;
  /**
   * Campos «solo locales» (los que una API anterior descarta) tal como los tenía la última copia del servidor instalada,
   * antes de conservar lo local (`serverTruth`, docs/QUOTATIONS.md#compatibilidad-de-alsoseparate). No se publica.
   */
  confirmedLocalOnly?: ConfirmedLocalOnly;
  /** Tras «Usar la del servidor» de un rechazo: la siguiente copia del servidor se instala sin conservar lo local. */
  discardLocalOnly?: true;
}

export interface ConfirmedLocalOnly {
  dismissedSourceDocuments?: string[];
  /** Ids de los adjuntos `include` con `alsoSeparate` en el servidor. */
  alsoSeparate: string[];
}

/** Rechazo 4xx que no se reintenta hasta que cambie la cotización (nueva revisión) o el usuario lo resuelva. */
export interface QuotationRejection {
  revision: string;
  status: number;
  code?: string;
  error: string;
}

/** Escritura local pendiente; `serverQuotation`/`serverDeleted` describen un conflicto sin resolver. */
export interface QuotationChange {
  revision: string;
  ownerId?: string;
  baseVersion: number;
  /** Contenido publicable confirmado por el servidor en `baseVersion` (ausente en una creación). */
  base?: QuotationContent;
  serverQuotation?: QuotationRecord;
  /** Otro miembro la borró mientras este equipo tenía cambios sin publicar; la copia local se conserva para revisarla. */
  serverDeleted?: boolean;
  /** The conflict comes from a stale deletion (409 with a newer record): `keep_local` deletes it again. */
  deletionConflict?: boolean;
  rejected?: QuotationRejection;
  /**
   * Una imagen o un adjunto nuevos no se pudieron subir (o el servidor no los tiene): la cotización no se publica sin
   * ellos y se reintenta en la siguiente pasada. Texto breve para el estado de guardado.
   */
  assetsPending?: string;
}

export interface QuotationDeletionCommand {
  id: string;
  ownerId?: string;
  baseVersion: number;
  /** Local copy at deletion time, shown again if the API rejects the deletion. */
  quotation?: QuotationRecord;
  /** 4xx other than 404/409: not retried until the user retries (`keep_local`) or discards it (`accept_server`). */
  rejected?: { status: number; error: string };
}

/** Cursor de la descarga incremental (`GET /api/quotations?since=`) del espacio de trabajo `scope`. */
export interface QuotationSyncCursor {
  scope: string;
  serverTimestamp: string;
}

export type QuotationMutationResult =
  | { ok: true; quotation: QuotationRecord }
  | { ok: false; error: string };
