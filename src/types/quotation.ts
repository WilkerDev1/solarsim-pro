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
  rejected?: QuotationRejection;
}

export interface QuotationDeletionCommand {
  id: string;
  ownerId?: string;
  baseVersion: number;
}

/** Cursor de la descarga incremental (`GET /api/quotations?since=`) del espacio de trabajo `scope`. */
export interface QuotationSyncCursor {
  scope: string;
  serverTimestamp: string;
}

export type QuotationMutationResult =
  | { ok: true; quotation: QuotationRecord }
  | { ok: false; error: string };
