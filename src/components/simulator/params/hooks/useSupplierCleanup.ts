import React from 'react';
import { supplierQuotesItem } from '../../../../utils/equipmentMatchingUtils';
import type { SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';

interface SupplierCleanupArgs {
  specs: SystemSpecs;
  equipmentCatalog: SolarEquipmentItem[];
  panelSupplierMatches: boolean;
  inverterSupplierMatches: boolean;
  batterySupplierMatches: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

/** Limpieza protectora de proveedores huérfanos solo si el proveedor no existe en ningún equipo del catálogo. */
export function useSupplierCleanup({
  specs,
  equipmentCatalog,
  panelSupplierMatches,
  inverterSupplierMatches,
  batterySupplierMatches,
  updateSpecs,
}: SupplierCleanupArgs): void {
  React.useEffect(() => {
    const info = specs.selectedSupplierInfo;
    if (!info) return;

    let needsCleanup = false;
    const cleanedInfo = { ...info };

    if (info.panel && !panelSupplierMatches) {
      const existsInCatalog = equipmentCatalog.some((e) => e.type === 'panel' && supplierQuotesItem(e, info.panel));
      if (!existsInCatalog) {
        delete cleanedInfo.panel;
        needsCleanup = true;
      }
    }
    if (info.inverter && !inverterSupplierMatches) {
      const existsInCatalog = equipmentCatalog.some((e) => e.type === 'inverter' && supplierQuotesItem(e, info.inverter));
      if (!existsInCatalog) {
        delete cleanedInfo.inverter;
        needsCleanup = true;
      }
    }
    if (info.battery && !batterySupplierMatches) {
      const existsInCatalog = equipmentCatalog.some((e) => e.type === 'battery' && supplierQuotesItem(e, info.battery));
      if (!existsInCatalog) {
        delete cleanedInfo.battery;
        needsCleanup = true;
      }
    }

    if (needsCleanup) {
      updateSpecs({ selectedSupplierInfo: cleanedInfo });
    }
  }, [
    specs.selectedSupplierInfo,
    specs.panelBrandModel,
    specs.inverterBrandModel,
    specs.batteryBrandModel,
    panelSupplierMatches,
    inverterSupplierMatches,
    batterySupplierMatches,
    equipmentCatalog,
  ]);
}
