import type { SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import { catalogPanelGroupPatch } from '../../../../utils/catalogGroupPatch';
import { selectCatalogEquipment, type EquipmentKind } from '../../../../utils/equipmentGroups';

type SupplierInfo = NonNullable<SystemSpecs['selectedSupplierInfo']>;

/** Legacy mirror fields, price field and group-level extras a catalog selection writes, per equipment kind. */
const SELECTION: Record<
  EquipmentKind,
  {
    mirror: (item: SolarEquipmentItem) => Partial<SystemSpecs>;
    priceField: 'panelUnitPriceUSD' | 'inverterUnitPriceUSD' | 'batteryUnitPriceUSD';
    group: (item: SolarEquipmentItem) => Record<string, unknown>;
  }
> = {
  panel: {
    mirror: (item) => ({
      panelBrandModel: item.displayName,
      panelPowerW: item.powerW || 550,
      panelEfficiency: item.efficiencyPct || 22.0,
      tempCoeff: item.tempCoeff || -0.29,
      annualDegradation: item.annualDegradation || 0.4,
    }),
    priceField: 'panelUnitPriceUSD',
    // Model-specific values (degradation, efficiency…) are replaced, never inherited from the previous model.
    group: (item) => ({ ...catalogPanelGroupPatch(item) }),
  },
  inverter: {
    mirror: (item) => ({ inverterBrandModel: item.displayName, inverterPowerKW: item.powerKW || 8.0 }),
    priceField: 'inverterUnitPriceUSD',
    group: (item) => ({ powerKW: item.powerKW || 8.0 }),
  },
  battery: {
    mirror: (item) => ({
      batteryBrandModel: item.displayName,
      batteryCapacityKWh: item.capacityKWh || 16.08,
      batteryDOD: item.dodPct || 90,
      batteryEfficiencyPct: item.batteryEfficiencyPct || 95,
    }),
    priceField: 'batteryUnitPriceUSD',
    group: (item) => ({ capacityKWh: item.capacityKWh || 16.08, dodPct: item.dodPct || 90 }),
  },
};

/**
 * Specs patch for picking a catalog item as the primary panel, inverter or battery.
 * With automatic supplier pricing it takes the cheapest supplier price; otherwise it keeps the
 * supplier already chosen when this item still quotes it and drops it when it does not.
 */
export function buildCatalogSelectionUpdate(specs: SystemSpecs, kind: EquipmentKind, item: SolarEquipmentItem): Partial<SystemSpecs> {
  const { mirror, priceField, group } = SELECTION[kind];
  const suppliers = item.supplierPrices || [];
  const newSupplierInfo: SupplierInfo = { ...(specs.selectedSupplierInfo || {}) };
  const specsUpdate: Partial<SystemSpecs> = mirror(item);

  if (specs.autoSupplierPricing && suppliers.length > 0) {
    const bestSp = [...suppliers].sort((a, b) => a.priceUSD - b.priceUSD)[0];
    specsUpdate[priceField] = bestSp.priceUSD;
    newSupplierInfo[kind] = {
      supplierName: bestSp.supplierName,
      priceUSD: bestSp.priceUSD,
      updatedAt: bestSp.updatedAt,
      supplierPriceId: bestSp.id,
    };
  } else {
    const match = suppliers.find(
      (sp) =>
        sp.id === newSupplierInfo[kind]?.supplierPriceId ||
        sp.supplierName.toLowerCase().trim() === newSupplierInfo[kind]?.supplierName?.toLowerCase().trim()
    );
    if (match) {
      newSupplierInfo[kind] = {
        supplierName: match.supplierName,
        priceUSD: match.priceUSD,
        updatedAt: match.updatedAt,
        supplierPriceId: match.id,
      };
    } else {
      delete newSupplierInfo[kind];
    }
  }

  specsUpdate.selectedSupplierInfo = newSupplierInfo;
  const unitPriceUSD = specsUpdate[priceField];
  // The primary group takes the catalog identity (catalogItemId for datasheets); the mirror follows it.
  return {
    ...specsUpdate,
    ...selectCatalogEquipment(specs, kind, 0, item, {
      ...group(item),
      selectedSupplierInfo: newSupplierInfo[kind],
      ...(unitPriceUSD !== undefined ? { unitPriceUSD } : {}),
    }),
  };
}
