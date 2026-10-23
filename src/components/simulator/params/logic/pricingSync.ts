/** Price per Wp ↔ price per kWp, and sale margin % ↔ multiplier, as the pricing section keeps them in sync. */
import { resolveSaleMarginMultiplier } from './dockDefaults';


/** $/Wp → $/kWp (2 decimals). */
export function pricePerKWpFromWatt(pricePerWattUSD: number): number {
  return Math.round(pricePerWattUSD * 1000 * 100) / 100;
}

/** $/kWp → $/Wp (3 decimals). */
export function pricePerWattFromKWp(pricePerKWpUSD: number): number {
  return Math.round((pricePerKWpUSD / 1000) * 1000) / 1000;
}

/** Suggested $/Wp rounded to cents, falling back through the given candidates (first truthy wins). */
export function roundedWattPrice(...candidates: Array<number | undefined>): number {
  const value = candidates.find((c) => !!c) ?? 0;
  return Math.round(value * 100) / 100;
}

/** Both price fields for a $/Wp value. */
export function wattPricePatch(pricePerWattUSD: number): { pricePerWattUSD: number; pricePerKWpUSD: number } {
  return { pricePerWattUSD, pricePerKWpUSD: pricePerKWpFromWatt(pricePerWattUSD) };
}

/** Both price fields for a $/kWp value. */
export function kwpPricePatch(pricePerKWpUSD: number): { pricePerKWpUSD: number; pricePerWattUSD: number } {
  return { pricePerKWpUSD, pricePerWattUSD: pricePerWattFromKWp(pricePerKWpUSD) };
}

/** Margin % (one decimal) shown for a multiplier. */
export function marginPctFromMultiplier(multiplier: number | undefined): number {
  return Math.round((resolveSaleMarginMultiplier(multiplier) - 1) * 100 * 10) / 10;
}

/** Whole-percent margin used to highlight the quick-margin buttons. */
export function wholeMarginPctFromMultiplier(multiplier: number | undefined): number {
  return Math.round((resolveSaleMarginMultiplier(multiplier) - 1) * 100);
}

/** Multiplier for the typed margin %: NaN counts as 0, negatives clamp to 0, rounded to 3 decimals. */
export function multiplierFromMarginInput(pct: number): number {
  const validPct = isNaN(pct) ? 0 : Math.max(0, pct);
  return Math.round((1 + validPct / 100) * 1000) / 1000;
}

/** Multiplier for a quick-margin button (not rounded). */
export function multiplierFromQuickMargin(pct: number): number {
  return 1 + pct / 100;
}
