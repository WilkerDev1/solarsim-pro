import type { PanelItemSpec, SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import { catalogPanelGroupPatch } from '../../../../utils/catalogGroupPatch';
import { selectCatalogEquipment, type EquipmentKind } from '../../../../utils/equipmentGroups';
import { LIST_KEY, migrateLegacySpecs } from '../../../../../shared/equipment';
import { resolveAutoPrice, type GenericPriceInfo } from '../../../../../shared/equipmentPrices';
import {
  DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_CATALOG_INVERTER_KW, DEFAULT_CATALOG_PANEL, resolveBatteryDodPct, resolveBatteryEfficiencyPct,
} from './dockDefaults';

type SupplierInfo = PanelItemSpec['selectedSupplierInfo'];

/** Precio genérico efectivo de un equipo, o nada. Sin sesión (modo local) el llamador pasa `undefined`: la función está apagada. */
export type GenericPriceLookup = (equipmentId: string) => GenericPriceInfo | null | undefined;

/**
 * Campos de precio de un grupo al elegir un modelo (ADR 0006 §5), con el resolvedor único `resolveAutoPrice`: oferta
 * utilizable (preferida o la más barata) → precio genérico (copia en `genericPriceInfo`, sin proveedor) → sin precio. Cada
 * campo se escribe siempre (también `undefined`): elegir otro modelo nunca arrastra precio, proveedor ni copia del anterior.
 * `kind: 'none'` deja al llamador decidir el respaldo (p. ej. la estimación de «+»).
 */
export function autoPriceFields(item: SolarEquipmentItem, generic: GenericPriceInfo | null | undefined): { kind: 'supplier' | 'generic' | 'none'; fields: Record<string, unknown> } {
  const price = resolveAutoPrice(item, generic);
  if (price?.kind === 'supplier') {
    const offer = price.offer;
    return { kind: 'supplier', fields: { unitPriceUSD: offer.priceUSD, priceSource: 'supplier', genericPriceInfo: undefined,
      selectedSupplierInfo: { supplierName: offer.supplierName, priceUSD: offer.priceUSD, updatedAt: offer.updatedAt, supplierPriceId: offer.id } } };
  }
  if (price?.kind === 'generic') {
    return { kind: 'generic', fields: { unitPriceUSD: price.priceUSD, priceSource: 'generic', genericPriceInfo: { ...price.generic }, selectedSupplierInfo: undefined } };
  }
  return { kind: 'none', fields: { unitPriceUSD: undefined, priceSource: undefined, genericPriceInfo: undefined, selectedSupplierInfo: undefined } };
}

/** System-level panel parameters and group-level fields a catalog selection writes, per equipment kind. */
const SELECTION: Record<
  EquipmentKind,
  {
    system: (item: SolarEquipmentItem) => Partial<SystemSpecs>;
    group: (item: SolarEquipmentItem) => Record<string, unknown>;
  }
> = {
  panel: {
    system: (item) => ({
      panelEfficiency: item.efficiencyPct || DEFAULT_CATALOG_PANEL.efficiencyPct,
      tempCoeff: item.tempCoeff || DEFAULT_CATALOG_PANEL.tempCoeff,
      annualDegradation: item.annualDegradation || DEFAULT_CATALOG_PANEL.annualDegradation,
    }),
    // Model-specific values (degradation, efficiency…) are replaced, never inherited from the previous model.
    group: (item) => ({ ...catalogPanelGroupPatch(item), powerW: item.powerW || DEFAULT_CATALOG_PANEL.powerW }),
  },
  inverter: {
    system: () => ({}),
    group: (item) => ({ powerKW: item.powerKW || DEFAULT_CATALOG_INVERTER_KW }),
  },
  battery: {
    system: () => ({}),
    group: (item) => ({
      capacityKWh: item.capacityKWh || DEFAULT_BATTERY_CAPACITY_KWH,
      dodPct: resolveBatteryDodPct(item.dodPct),
      efficiencyPct: resolveBatteryEfficiencyPct(item.batteryEfficiencyPct),
    }),
  },
};

/**
 * Specs patch for picking a catalog item as the primary panel, inverter or battery (group edit; never the legacy mirror).
 * In manual pricing mode a supplier already chosen that this item still quotes is kept (with the group's price). Otherwise
 * the price comes from the shared resolver: usable offer → generic price (`generic`, only with a session) → no price; the
 * previous model's price is never carried over.
 */
export function buildCatalogSelectionUpdate(specs: SystemSpecs, kind: EquipmentKind, item: SolarEquipmentItem, generic?: GenericPriceInfo | null): Partial<SystemSpecs> {
  const { system, group } = SELECTION[kind];
  const suppliers = item.supplierPrices || [];
  const chosen: SupplierInfo = migrateLegacySpecs(specs)[LIST_KEY[kind]]?.[0]?.selectedSupplierInfo;
  const match = !specs.autoSupplierPricing && chosen
    ? suppliers.find((sp) => sp.id === chosen.supplierPriceId || sp.supplierName.toLowerCase().trim() === chosen.supplierName?.toLowerCase().trim())
    : undefined;
  const price = match
    ? { selectedSupplierInfo: { supplierName: match.supplierName, priceUSD: match.priceUSD, updatedAt: match.updatedAt, supplierPriceId: match.id } }
    : autoPriceFields(item, generic).fields;

  // The primary group takes the catalog identity (catalogItemId for datasheets), its fields, price and supplier.
  return {
    ...system(item),
    ...selectCatalogEquipment(specs, kind, 0, item, { ...group(item), ...price }),
  };
}
