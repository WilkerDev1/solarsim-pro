/** Totales de una cotización en centavos enteros. Función pura; ver docs/QUOTATIONS.md para el algoritmo. */
import { ITBIS_RATE } from '../financialRules.js';
import { mulDivRound, roundHalfUp } from './money.js';
import type { QuotationContent } from './types.js';
import { QUOTATION_LIMITS } from './validation.js';

export interface QuotationLineTotals {
  id: string;
  grossCents: number;
  lineDiscountCents: number;
  netCents: number;
  /** Parte del descuento global prorrateada a esta línea. */
  allocatedDiscountCents: number;
  /** Base gravada de la línea (neto − descuento asignado) si es gravada; 0 si no. */
  taxableBaseCents: number;
}

export interface QuotationTotals {
  lines: QuotationLineTotals[];
  subtotalCents: number;
  discounts: { id: string; appliedCents: number }[];
  discountCents: number;
  taxableBaseCents: number;
  exemptBaseCents: number;
  taxCents: number;
  totalCents: number;
}

/** Número ≥ 0 acotado a `max` (lo que no sea un número finito, y los negativos, valen 0). */
const bounded = (value: unknown, max: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, max) : 0);
const clampPct = (value: unknown): number => bounded(value, 100);
const idOf = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Porcentaje en centésimas de punto (12.5 % → 1250) para operar en enteros. */
const pctBasis = (pct: unknown): number => Math.round(Number((clampPct(pct) * 100).toPrecision(12)));
const ITBIS_BASIS = Math.round(ITBIS_RATE * 10000);

/** Reparte `total` entre `weights` con el método del mayor resto; empates por orden. La suma es exactamente `total`. */
function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const bigTotal = BigInt(total);
  const bigSum = BigInt(sum);
  const parts = weights.map((weight, index) => {
    const scaled = bigTotal * BigInt(weight);
    return { index, floor: scaled / bigSum, remainder: scaled % bigSum };
  });
  let left = total - parts.reduce((acc, part) => acc + Number(part.floor), 0);
  const result = parts.map(part => Number(part.floor));
  const order = [...parts].sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const part of order) {
    if (left <= 0) break;
    if (weights[part.index] > 0) {
      result[part.index] += 1;
      left -= 1;
    }
  }
  return result;
}

/**
 * Nunca lanza ni devuelve NaN/Infinity, con cualquier entrada. Las entradas se acotan a los topes de
 * `QUOTATION_LIMITS` (cantidad, precio unitario y descuento fijo; porcentajes a 0–100; lo no finito vale 0) y el
 * bruto acumulado del documento a `maxDocumentCents` (una línea que lo exceda se recorta a lo que queda). El contenido
 * validado ya cumple esos topes, así que para él no cambia nada; con ellos todo el cálculo es entero exacto.
 */
export function computeQuotationTotals(content: Pick<QuotationContent, 'items' | 'discounts'>): QuotationTotals {
  const items: unknown[] = Array.isArray(content?.items) ? content.items : [];
  const discounts: unknown[] = Array.isArray(content?.discounts) ? content.discounts : [];
  const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});

  let grossLeft = QUOTATION_LIMITS.maxDocumentCents;
  const base = items.map(raw => {
    const item = record(raw);
    if (item.kind !== 'item') return { id: idOf(item.id), grossCents: 0, lineDiscountCents: 0, netCents: 0, taxable: false };
    const quantityMilli = roundHalfUp(bounded(item.quantity, QUOTATION_LIMITS.maxQuantity) * 1000);
    const priceCents = roundHalfUp(bounded(item.unitPriceCents, QUOTATION_LIMITS.maxUnitPriceCents));
    const grossCents = Math.min(grossLeft, mulDivRound(quantityMilli, priceCents, 1000));
    grossLeft -= grossCents;
    const lineDiscountCents = Math.min(grossCents, mulDivRound(grossCents, pctBasis(item.discountPct), 10000));
    return { id: idOf(item.id), grossCents, lineDiscountCents, netCents: grossCents - lineDiscountCents, taxable: item.taxable === true };
  });
  const subtotalCents = base.reduce((acc, line) => acc + line.netCents, 0);

  // Cada descuento global se calcula sobre el subtotal (sin cascada) y se acota a lo que queda por descontar.
  let remaining = subtotalCents;
  const appliedDiscounts = discounts.map(rawDiscount => {
    const discount = record(rawDiscount);
    const raw = discount.type === 'percentage'
      ? mulDivRound(subtotalCents, pctBasis(discount.value), 10000)
      : roundHalfUp(bounded(discount.value, QUOTATION_LIMITS.maxDocumentCents));
    const appliedCents = Math.min(raw, remaining);
    remaining -= appliedCents;
    return { id: idOf(discount.id), appliedCents };
  });
  const discountCents = subtotalCents - remaining;

  const allocated = allocateLargestRemainder(discountCents, base.map(line => line.netCents));
  const lines: QuotationLineTotals[] = base.map((line, index) => ({
    id: line.id,
    grossCents: line.grossCents,
    lineDiscountCents: line.lineDiscountCents,
    netCents: line.netCents,
    allocatedDiscountCents: allocated[index],
    taxableBaseCents: line.taxable ? line.netCents - allocated[index] : 0,
  }));

  const taxableBaseCents = lines.reduce((acc, line) => acc + line.taxableBaseCents, 0);
  const exemptBaseCents = subtotalCents - discountCents - taxableBaseCents;
  // El ITBIS se calcula una sola vez sobre la base gravada del documento, no línea a línea.
  const taxCents = mulDivRound(taxableBaseCents, ITBIS_BASIS, 10000);

  return {
    lines,
    subtotalCents,
    discounts: appliedDiscounts,
    discountCents,
    taxableBaseCents,
    exemptBaseCents,
    taxCents,
    totalCents: subtotalCents - discountCents + taxCents,
  };
}
