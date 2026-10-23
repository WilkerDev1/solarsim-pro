import React from 'react';
import { supplierQuotesItem } from '../../../../utils/equipmentMatchingUtils';
import { LIST_KEY, migrateLegacySpecs } from '../../../../../shared/equipment';
import { editEquipmentGroup } from '../../../../utils/equipmentGroups';
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

const KINDS = ['panel', 'inverter', 'battery'] as const;

/** Limpieza protectora de proveedores huérfanos del grupo principal, solo si el proveedor no existe en ningún equipo del catálogo. */
export function useSupplierCleanup({
  specs,
  equipmentCatalog,
  panelSupplierMatches,
  inverterSupplierMatches,
  batterySupplierMatches,
  updateSpecs,
}: SupplierCleanupArgs): void {
  const migrated = migrateLegacySpecs(specs);
  const primary = (kind: (typeof KINDS)[number]) => migrated[LIST_KEY[kind]]?.[0];
  const signature = KINDS.map((kind) => `${primary(kind)?.brandModel}|${primary(kind)?.selectedSupplierInfo?.supplierPriceId}|${primary(kind)?.selectedSupplierInfo?.supplierName}`).join('#');
  React.useEffect(() => {
    const matches = { panel: panelSupplierMatches, inverter: inverterSupplierMatches, battery: batterySupplierMatches };
    let patch: Partial<SystemSpecs> = {};
    let current = migrated;
    for (const kind of KINDS) {
      const info = primary(kind)?.selectedSupplierInfo;
      if (!info || matches[kind]) continue;
      if (equipmentCatalog.some((e) => e.type === kind && supplierQuotesItem(e, info))) continue;
      const edit = editEquipmentGroup(current, kind, { type: 'update', index: 0, patch: { selectedSupplierInfo: undefined } });
      patch = { ...patch, ...edit };
      current = { ...current, ...edit };
    }
    if (Object.keys(patch).length > 0) updateSpecs(patch);
  }, [signature, panelSupplierMatches, inverterSupplierMatches, batterySupplierMatches, equipmentCatalog]);
}
