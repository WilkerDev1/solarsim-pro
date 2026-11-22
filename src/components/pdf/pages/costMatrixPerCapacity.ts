import type { CostMatrixSummary } from '../../../types';

/**
 * Filas «Precio kilos costo / ventas» de la matriz de costos (pestaña de cotización y página 5 del PDF): por kWp y por W,
 * en RD$ y en USD, con la misma venta en las dos unidades. Solo presentación: las cifras salen de `calculateCostMatrixSummary`.
 */
export interface PerCapacityText {
  dop: string;
  usd: string;
}

const money = (value: number, locale: string) => value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const finite = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function costMatrixPerCapacity(matrix: CostMatrixSummary, kind: 'cost' | 'sale'): PerCapacityText {
  const usdPerKWp = finite(kind === 'cost' ? matrix.precioKilosCostoUSD : matrix.precioKilosVentasUSD);
  const dopPerKWp = finite(kind === 'cost' ? matrix.precioKilosCostoDOP : matrix.precioKilosVentasDOP);
  // Un resumen sin los campos por W (calculado por una versión anterior) los deriva de los de kWp.
  const usdPerW = finite(kind === 'cost' ? matrix.costPerWattUSD : matrix.salePerWattUSD ?? usdPerKWp / 1000);
  const dopPerW = finite(kind === 'cost' ? matrix.costPerWattDOP ?? dopPerKWp / 1000 : matrix.salePerWattDOP ?? dopPerKWp / 1000);
  return {
    dop: `RD$ ${money(dopPerKWp, 'es-DO')} /kWp (RD$ ${money(dopPerW, 'es-DO')} /W)`,
    usd: `$${money(usdPerKWp, 'en-US')} USD/kWp ($${usdPerW.toFixed(2)} USD/W)`,
  };
}
