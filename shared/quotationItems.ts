/**
 * Visibilidad de los ítems extra en el desglose de la cotización. Un ítem con `hideInQuotation: true`
 * se cobra igual (subtotal, ITBIS, margen, descuentos, Ley 57-07, precio por watt) pero no se lista
 * como fila en «EQUIPOS Y MATERIALES». Ausente o `false` = visible, así las propuestas existentes no cambian.
 * Es una regla de presentación: nunca se usa en el motor financiero.
 */
export interface QuotationItemVisibility {
  id?: string;
  hideInQuotation?: boolean;
}

export const isItemHiddenInQuotation = (item: QuotationItemVisibility): boolean => item.hideInQuotation === true;

/** Ítems que se listan en el documento (PDF, visor compartido, vista de cotización). */
export function visibleQuotationItems<T extends QuotationItemVisibility>(items: readonly T[] | null | undefined): T[] {
  return Array.isArray(items) ? items.filter((item) => !isItemHiddenInQuotation(item)) : [];
}

/**
 * Al reescribir la lista completa de ítems (IA, asistente, agentes externos), una fila sin decisión
 * explícita sobre `hideInQuotation` conserva la de la fila anterior con el mismo `id`.
 * Un `false` explícito sí vuelve visible el ítem.
 */
export function preserveHiddenInQuotation<T extends QuotationItemVisibility>(
  next: readonly T[],
  previous: readonly QuotationItemVisibility[] | null | undefined,
): T[] {
  const hiddenIds = new Set((Array.isArray(previous) ? previous : []).filter((item) => isItemHiddenInQuotation(item) && item.id).map((item) => item.id));
  return next.map((item) => (item.hideInQuotation === undefined && item.id && hiddenIds.has(item.id) ? { ...item, hideInQuotation: true } : item));
}
