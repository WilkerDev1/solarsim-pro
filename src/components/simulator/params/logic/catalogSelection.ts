import type { SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import { catalogPanelGroupPatch } from '../../../../utils/catalogGroupPatch';
import { selectCatalogEquipment, type EquipmentKind } from '../../../../utils/equipmentGroups';
import { LIST_KEY, migrateLegacySpecs } from '../../../../../shared/equipment';
import {
  DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_CATALOG_INVERTER_KW, DEFAULT_CATALOG_PANEL, resolveBatteryDodPct, resolveBatteryEfficiencyPct,
} from './dockDefaults';

type SupplierInfo = NonNullable<SystemSpecs['selectedSupplierInfo']>[EquipmentKind];

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
 * With automatic supplier pricing it takes the cheapest supplier price; otherwise it keeps the
 * supplier already chosen when this item still quotes it and drops it when it does not.
 */
export function buildCatalogSelectionUpdate(specs: SystemSpecs, kind: EquipmentKind, item: SolarEquipmentItem): Partial<SystemSpecs> {
  const { system, group } = SELECTION[kind];
  const suppliers = item.supplierPrices || [];
  const chosen: SupplierInfo = migrateLegacySpecs(specs)[LIST_KEY[kind]]?.[0]?.selectedSupplierInfo;
  let supplier: SupplierInfo;
  let unitPriceUSD: number | undefined;

  if (specs.autoSupplierPricing && suppliers.length > 0) {
    const bestSp = [...suppliers].sort((a, b) => a.priceUSD - b.priceUSD)[0];
    unitPriceUSD = bestSp.priceUSD;
    supplier = { supplierName: bestSp.supplierName, priceUSD: bestSp.priceUSD, updatedAt: bestSp.updatedAt, supplierPriceId: bestSp.id };
  } else {
    const match = suppliers.find(
      (sp) => sp.id === chosen?.supplierPriceId || sp.supplierName.toLowerCase().trim() === chosen?.supplierName?.toLowerCase().trim()
    );
    supplier = match ? { supplierName: match.supplierName, priceUSD: match.priceUSD, updatedAt: match.updatedAt, supplierPriceId: match.id } : undefined;
  }

  // The primary group takes the catalog identity (catalogItemId for datasheets), its fields, price and supplier.
  return {
    ...system(item),
    ...selectCatalogEquipment(specs, kind, 0, item, {
      ...group(item),
      selectedSupplierInfo: supplier,
      ...(unitPriceUSD !== undefined ? { unitPriceUSD } : {}),
    }),
  };
}
