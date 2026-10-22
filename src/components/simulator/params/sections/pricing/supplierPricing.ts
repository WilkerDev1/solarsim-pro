import type { SystemSpecs } from '../../../../../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../../../../../types/equipment';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../../../../utils/equipmentSpecsUtils';

export type PricedKind = 'panel' | 'inverter' | 'battery';

type SupplierInfo = NonNullable<SystemSpecs['selectedSupplierInfo']>;

/** Valores por defecto que la vista mostraba cuando el modelo no trae precio propio. */
export const DEFAULT_UNIT_PRICE_USD: Record<PricedKind, number> = { panel: 103.32, inverter: 2300, battery: 1990 };
export const DEFAULT_INSTALLATION_USD_PER_KWP = 170;

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

/** «Mejor proveedor»: activa el modo automático y fija precio y proveedor más barato de panel, inversor y batería (solo con batería). */
export function bestSupplierPricingPatch(
  specs: SystemSpecs,
  items: { panel?: SolarEquipmentItem | null; inverter?: SolarEquipmentItem | null; battery?: SolarEquipmentItem | null }
): Partial<SystemSpecs> {
  const patch: Partial<SystemSpecs> = { autoSupplierPricing: true };
  const info: SupplierInfo = { ...(specs.selectedSupplierInfo || {}) };

  const panel = bestSupplierPrice(items.panel);
  if (panel) {
    patch.panelUnitPriceUSD = panel.priceUSD;
    info.panel = supplierSnapshot(panel);
  }
  const inverter = bestSupplierPrice(items.inverter);
  if (inverter) {
    patch.inverterUnitPriceUSD = inverter.priceUSD;
    info.inverter = supplierSnapshot(inverter);
  }
  const battery = specs.hasBattery ? bestSupplierPrice(items.battery) : null;
  if (battery) {
    patch.batteryUnitPriceUSD = battery.priceUSD;
    info.battery = supplierSnapshot(battery);
  }

  patch.selectedSupplierInfo = info;
  return patch;
}

/** Edición manual de un precio por modelo: apaga el modo automático; el primer modelo también escribe el precio plano. */
export function manualUnitPricePatch(specs: SystemSpecs, kind: PricedKind, index: number, value: number): Partial<SystemSpecs> {
  const patch: Partial<SystemSpecs> = { autoSupplierPricing: false };
  if (kind === 'panel') {
    const list = [...getProjectPanels(specs)];
    list[index] = { ...list[index], unitPriceUSD: value };
    patch.panels = list.length > 1 ? list : undefined;
    if (index === 0) patch.panelUnitPriceUSD = value;
  } else if (kind === 'inverter') {
    const list = [...getProjectInverters(specs)];
    list[index] = { ...list[index], unitPriceUSD: value };
    patch.inverters = list.length > 1 ? list : undefined;
    if (index === 0) patch.inverterUnitPriceUSD = value;
  } else {
    const list = [...getProjectBatteries(specs)];
    list[index] = { ...list[index], unitPriceUSD: value };
    patch.batteries = list.length > 1 ? list : undefined;
    if (index === 0) patch.batteryUnitPriceUSD = value;
  }
  return patch;
}

/** Precio mostrado de un modelo: el propio, si no el plano del proyecto, si no el valor por defecto. */
export function displayedUnitPrice(own: number | undefined, flat: number | undefined, kind: PricedKind): number {
  return own !== undefined ? own : flat !== undefined ? flat : DEFAULT_UNIT_PRICE_USD[kind];
}
