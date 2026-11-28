/**
 * Reglas de precio del dock, ahora en el dominio (F2b; ADR 0004, «Reglas del dock en el dominio»). Puras: las usan los
 * componentes de costos y la transacción (`editIntents.ts`), así una edición por ruta da lo mismo que el gesto del dock.
 *
 * - $/Wp ↔ $/kWp: los dos campos del precio directo se escriben siempre juntos.
 * - Margen en % ↔ factor de venta: el dock muestra y teclea el margen en %, la propuesta guarda el factor.
 * - Precio sugerido al pasar a Directo y «Sugerir de costos»: el $/Wp de venta de la matriz de costos, a centavos.
 * - «Mejor proveedor»: modo automático con el proveedor más barato de cada modelo principal.
 * - Precio a mano de un modelo: apaga el modo automático, marca el precio `manual` y suelta la copia del genérico.
 */
import type { SystemSpecs } from '../../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../../types/equipment';
import { editEquipmentGroup } from '../../utils/equipmentGroups';
import { resolvePricePerWattUSD, resolveSaleMarginMultiplier } from '../../../shared/projectDefaults';

export type PricedKind = 'panel' | 'inverter' | 'battery';

/** $/Wp → $/kWp (2 decimales). */
export function pricePerKWpFromWatt(pricePerWattUSD: number): number {
  return Math.round(pricePerWattUSD * 1000 * 100) / 100;
}

/** $/kWp → $/Wp (3 decimales). */
export function pricePerWattFromKWp(pricePerKWpUSD: number): number {
  return Math.round((pricePerKWpUSD / 1000) * 1000) / 1000;
}

/** $/Wp sugerido, a centavos, del primer candidato no nulo. */
export function roundedWattPrice(...candidates: Array<number | undefined>): number {
  const value = candidates.find((c) => !!c) ?? 0;
  return Math.round(value * 100) / 100;
}

/**
 * $/Wp sugerido al pasar a Directo y con «Sugerir de costos»: el $/Wp de venta de la matriz de costos, o el precio directo
 * que ya resuelve el motor (specs → finanzas → supuesto), a centavos.
 */
export function suggestedWattPrice(matrixSalePricePerWattUSD: number | undefined, specs: Pick<SystemSpecs, 'pricePerWattUSD'>, financialsPricePerWattUSD?: number): number {
  return roundedWattPrice(matrixSalePricePerWattUSD, resolvePricePerWattUSD(specs, { pricePerWattUSD: financialsPricePerWattUSD }));
}

/** Los dos campos de precio para un $/Wp. */
export function wattPricePatch(pricePerWattUSD: number): { pricePerWattUSD: number; pricePerKWpUSD: number } {
  return { pricePerWattUSD, pricePerKWpUSD: pricePerKWpFromWatt(pricePerWattUSD) };
}

/** Los dos campos de precio para un $/kWp. */
export function kwpPricePatch(pricePerKWpUSD: number): { pricePerKWpUSD: number; pricePerWattUSD: number } {
  return { pricePerKWpUSD, pricePerWattUSD: pricePerWattFromKWp(pricePerKWpUSD) };
}

/** Margen en % (un decimal) de un factor. */
export function marginPctFromMultiplier(multiplier: number | undefined): number {
  return Math.round((resolveSaleMarginMultiplier(multiplier) - 1) * 100 * 10) / 10;
}

/** Margen en % entero, para resaltar los botones rápidos. */
export function wholeMarginPctFromMultiplier(multiplier: number | undefined): number {
  return Math.round((resolveSaleMarginMultiplier(multiplier) - 1) * 100);
}

/** Factor para un margen tecleado: NaN cuenta como 0, los negativos se llevan a 0, a 3 decimales. */
export function multiplierFromMarginInput(pct: number): number {
  const validPct = isNaN(pct) ? 0 : Math.max(0, pct);
  return Math.round((1 + validPct / 100) * 1000) / 1000;
}

/** Factor para un botón de margen rápido (sin redondeo). */
export function multiplierFromQuickMargin(pct: number): number {
  return 1 + pct / 100;
}

/** Proveedor más barato de un equipo; ante empate gana el primero de la lista. */
export function bestSupplierPrice(item: SolarEquipmentItem | null | undefined): EquipmentSupplierPrice | null {
  const prices = item?.supplierPrices;
  if (!prices || prices.length === 0) return null;
  const best = Math.min(...prices.map((s) => s.priceUSD));
  return prices.find((s) => s.priceUSD === best) ?? null;
}

const supplierSnapshot = (sp: EquipmentSupplierPrice) => ({
  supplierName: sp.supplierName,
  priceUSD: sp.priceUSD,
  updatedAt: sp.updatedAt,
  supplierPriceId: sp.id,
});

/** «Mejor proveedor»: activa el modo automático y fija precio y proveedor más barato del modelo principal de panel, inversor y batería (solo con batería). */
export function bestSupplierPricingPatch(
  specs: SystemSpecs,
  items: { panel?: SolarEquipmentItem | null; inverter?: SolarEquipmentItem | null; battery?: SolarEquipmentItem | null }
): Partial<SystemSpecs> {
  let patch: Partial<SystemSpecs> = { autoSupplierPricing: true };
  const apply = (kind: PricedKind, best: EquipmentSupplierPrice | null) => {
    if (!best) return;
    patch = { ...patch, ...editEquipmentGroup({ ...specs, ...patch }, kind, { type: 'update', index: 0, patch: { unitPriceUSD: best.priceUSD, selectedSupplierInfo: supplierSnapshot(best), priceSource: 'supplier', genericPriceInfo: undefined } }) };
  };
  apply('panel', bestSupplierPrice(items.panel));
  apply('inverter', bestSupplierPrice(items.inverter));
  apply('battery', specs.hasBattery ? bestSupplierPrice(items.battery) : null);
  return patch;
}

/**
 * Edición manual de un precio por modelo (cada tecla): apaga el modo automático, escribe el precio en el grupo y lo marca
 * `manual`, soltando la copia del precio genérico (ADR 0006 §5). El registro de la Regla 2 va aparte, al confirmar.
 */
export function manualUnitPricePatch(specs: SystemSpecs, kind: PricedKind, index: number, value: number): Partial<SystemSpecs> {
  return { autoSupplierPricing: false, ...editEquipmentGroup(specs, kind, { type: 'update', index, patch: { unitPriceUSD: value, priceSource: 'manual', genericPriceInfo: undefined } }) };
}
