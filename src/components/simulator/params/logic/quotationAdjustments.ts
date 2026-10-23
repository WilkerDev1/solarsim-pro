import { ITBIS_RATE, isItemItbisExonerated } from '../../../../../shared/financialRules';
import type { CustomQuotationDiscount, CustomQuotationItem } from '../../../../types';

/** USD amount a discount takes off the list price: percentages clamp to 0–100 and round to cents. */
export function discountAmountUSD(disc: CustomQuotationDiscount, listPriceUSD: number): number {
  if (disc.type === 'percentage') {
    const pct = Math.max(0, Math.min(100, disc.value || 0));
    return Math.round(listPriceUSD * (pct / 100) * 100) / 100;
  }
  return Math.max(0, disc.value || 0);
}

export interface QuotationAdjustments {
  totalDiscountUSD: number;
  /** Discounts imputed to equipment (reduce the Ley 57-07 40% base). */
  equipmentDiscountUSD: number;
  itemsSubtotalUSD: number;
  /** ITBIS the client does not pay on exonerated custom items. */
  exoneratedITBISUSD: number;
  /** ITBIS charged to the client on non-exonerated custom items. */
  chargedITBISUSD: number;
  /** Lista → Final: list price minus every discount, never below zero. */
  finalPriceUSD: number;
}

export function computeQuotationAdjustments(
  items: CustomQuotationItem[],
  discounts: CustomQuotationDiscount[],
  listPriceUSD: number
): QuotationAdjustments {
  const totalDiscountUSD = discounts.reduce((sum, disc) => sum + discountAmountUSD(disc, listPriceUSD), 0);
  const equipmentDiscountUSD = discounts
    .filter((disc) => disc.target === 'equipment')
    .reduce((sum, disc) => sum + discountAmountUSD(disc, listPriceUSD), 0);
  const itemsSubtotalUSD = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPriceUSD || 0), 0);
  const exoneratedITBISUSD = items.reduce(
    (sum, it) => (isItemItbisExonerated(it) ? sum + (it.quantity || 0) * (it.unitPriceUSD || 0) * ITBIS_RATE : sum),
    0
  );
  const chargedITBISUSD = items.reduce(
    (sum, it) => (!isItemItbisExonerated(it) ? sum + (it.quantity || 0) * (it.unitPriceUSD || 0) * ITBIS_RATE : sum),
    0
  );
  return {
    totalDiscountUSD,
    equipmentDiscountUSD,
    itemsSubtotalUSD,
    exoneratedITBISUSD,
    chargedITBISUSD,
    finalPriceUSD: Math.max(0, listPriceUSD - totalDiscountUSD),
  };
}
