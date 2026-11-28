/**
 * Presentación de los precios por modelo del dock. Las reglas («Mejor proveedor», precio a mano) viven en el dominio desde F2b
 * (`src/domain/rules/pricingRules.ts`) y se re-exportan aquí para los componentes.
 */
export { bestSupplierPrice, bestSupplierPricingPatch, manualUnitPricePatch, type PricedKind } from '../../../../../domain/rules/pricingRules';

/** La fila muestra «Genérico» solo mientras el precio sea el de la copia y no haya proveedor asignado. */
export function isGenericPriced(group: { unitPriceUSD?: number; selectedSupplierInfo?: unknown; genericPriceInfo?: { priceUSD: number } }): boolean {
  const info = group.genericPriceInfo;
  return !!info && !group.selectedSupplierInfo && typeof group.unitPriceUSD === 'number' && Math.abs(group.unitPriceUSD - info.priceUSD) < 0.005;
}

/**
 * Precio mostrado de un modelo: el propio, o `undefined` («sin precio») si no tiene. El motor cuenta 0 para un grupo sin
 * precio (p. ej. de un borrador de IA); mostrarle un precio de referencia inventaría un costo que no está en los totales.
 */
export function displayedUnitPrice(own: number | undefined): number | undefined {
  return own;
}
