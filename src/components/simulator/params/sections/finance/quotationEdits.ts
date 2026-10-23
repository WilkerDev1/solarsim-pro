import { ITBIS_RATE, appliesItemMargin, isItemItbisExonerated } from '../../../../../../shared/financialRules';
import type { CustomQuotationDiscount, CustomQuotationItem } from '../../../../../types';

const uid = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

/** Ítem nuevo: 1 UD a $0, ITBIS exonerado y con margen (como siempre se creó). */
export function newCustomItem(): CustomQuotationItem {
  return { id: uid('item'), description: '', quantity: 1, unit: 'UD', unitPriceUSD: 0, exonerateITBIS: true, applyITBIS: true, applyMargin: true };
}

/** Descuento nuevo: fijo, $0, destino general. */
export function newCustomDiscount(): CustomQuotationDiscount {
  return { id: uid('disc'), description: '', type: 'fixed', value: 0, target: 'general' };
}

export function patchById<T extends { id: string }>(list: T[], id: string, partial: Partial<T>): T[] {
  return list.map((entry) => (entry.id === id ? { ...entry, ...partial } : entry));
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}

/** Cambio de «ITBIS exento» en un ítem: escribe ambos campos para mantener el alias antiguo. */
export const itbisPatch = (exonerated: boolean): Partial<CustomQuotationItem> => ({ exonerateITBIS: exonerated, applyITBIS: exonerated });

export const itemTotalUSD = (item: CustomQuotationItem): number => (item.quantity || 0) * (item.unitPriceUSD || 0);

/** Monto de ITBIS de la línea y si se exonera (sobre el costo, como lo calculaba la vista). */
export function itemItbisNote(item: CustomQuotationItem): { exonerated: boolean; amountUSD: number } {
  return { exonerated: isItemItbisExonerated(item), amountUSD: itemTotalUSD(item) * ITBIS_RATE };
}

/** Importe de la línea con o sin margen comercial del proyecto. */
export function itemWithMarginUSD(item: CustomQuotationItem, marginMultiplier: number): { withMargin: boolean; amountUSD: number } {
  const withMargin = appliesItemMargin(item);
  return { withMargin, amountUSD: itemTotalUSD(item) * (withMargin ? marginMultiplier : 1) };
}

export const parseQuantity = (raw: string): number => Math.max(1, parseInt(raw) || 1);
