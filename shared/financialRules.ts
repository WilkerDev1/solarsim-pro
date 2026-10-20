/** Dominican tax rules shared by the finance engine, the simulator and the share-viewer fallbacks. */

/** ITBIS (VAT) rate. */
export const ITBIS_RATE = 0.18;

/** Ley 57-07 income-tax credit on eligible equipment, amortized over three fiscal years. */
export const LEY5707_CREDIT_RATE = 0.4;

interface QuotationItemFlags {
  exonerateITBIS?: boolean;
  /** Legacy flag kept for older projects: true meant "exempt from ITBIS". */
  applyITBIS?: boolean;
  applyMargin?: boolean;
}

/** `exonerateITBIS` wins; older items fall back to `applyITBIS`; unspecified items are exempt. */
export function isItemItbisExonerated(item: QuotationItemFlags): boolean {
  return item.exonerateITBIS !== undefined ? item.exonerateITBIS : (item.applyITBIS ?? true);
}

/** Extra items carry the project margin unless it was explicitly switched off. */
export function appliesItemMargin(item: QuotationItemFlags): boolean {
  return item.applyMargin !== false;
}

interface QuotationItemAmounts extends QuotationItemFlags {
  quantity?: number;
  unitPriceUSD?: number;
}

/**
 * Sale value and ITBIS of extra quotation items, rounded to cents. ITBIS is computed on the sale
 * price (with margin when it applies); exempt items report it as exonerated under Ley 57-07.
 */
export function customItemsTaxBreakdown(items: readonly QuotationItemAmounts[], marginMultiplier: number) {
  let saleTotalUSD = 0;
  let exoneratedITBISUSD = 0;
  let nonExoneratedITBISUSD = 0;
  for (const item of items) {
    const sale = (item.quantity || 0) * (item.unitPriceUSD || 0) * (appliesItemMargin(item) ? marginMultiplier : 1.0);
    saleTotalUSD += sale;
    if (isItemItbisExonerated(item)) exoneratedITBISUSD += sale * ITBIS_RATE;
    else nonExoneratedITBISUSD += sale * ITBIS_RATE;
  }
  const cents = (value: number) => Math.round(value * 100) / 100;
  return { saleTotalUSD: cents(saleTotalUSD), exoneratedITBISUSD: cents(exoneratedITBISUSD), nonExoneratedITBISUSD: cents(nonExoneratedITBISUSD) };
}
