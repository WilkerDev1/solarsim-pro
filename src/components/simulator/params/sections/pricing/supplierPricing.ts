import type { SystemSpecs } from '../../../../../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../../../../../types/equipment';
import { editEquipmentGroup } from '../../../../../utils/equipmentGroups';

export type PricedKind = 'panel' | 'inverter' | 'battery';

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
