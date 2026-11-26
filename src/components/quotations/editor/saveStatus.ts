import type { QuotationChange } from '../../../types/quotation';

export interface QuotationSaveStatus {
  label: string;
  tone: 'neutral' | 'pending' | 'error';
  /** Detalle para lectores de pantalla y el título (p. ej. el motivo de un rechazo). */
  detail?: string;
}

/**
 * Estado de guardado honesto de una cotización, leído de su cambio pendiente (`quotationChanges[id]`). Sin cuenta todo
 * queda en este equipo; con sesión, lo pendiente aún no está en el servidor y un conflicto o rechazo se dice tal cual.
 */
export function quotationSaveStatus(change: QuotationChange | undefined, context: { online: boolean; version: number }): QuotationSaveStatus {
  if (!context.online) return { label: 'Guardado en este equipo', tone: 'neutral' };
  if (change?.serverDeleted) return { label: 'Conflicto: otro miembro la eliminó', tone: 'error' };
  if (change?.serverQuotation) return { label: 'Conflicto con la versión del servidor', tone: 'error' };
  if (change?.rejected && change.rejected.revision === change.revision) {
    return { label: 'Rechazada por el servidor', tone: 'error', detail: change.rejected.error };
  }
  if (change) return { label: 'Pendiente de publicar', tone: 'pending' };
  return context.version > 0 ? { label: 'Publicado', tone: 'neutral' } : { label: 'Pendiente de publicar', tone: 'pending' };
}
