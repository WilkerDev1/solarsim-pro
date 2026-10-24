import React from 'react';
import type { SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import { readEquipment } from '../../../../../shared/equipment';
import { editEquipmentGroup } from '../../../../utils/equipmentGroups';

/** Auto-sanear inconsistencias de potencia unitaria del modelo principal si está en el catálogo verificado. */
export function useCatalogPowerSync(
  specs: SystemSpecs,
  equipmentCatalog: SolarEquipmentItem[],
  updateSpecs: (specs: Partial<SystemSpecs>) => void
): void {
  const { inverters, panels } = readEquipment(specs);
  const inverter = inverters[0];
  const panel = panels[0];
  React.useEffect(() => {
    if (inverter?.brandModel && inverter.powerKW) {
      const match = equipmentCatalog.find((it) => it.type === 'inverter' && it.displayName === inverter.brandModel);
      if (match && match.powerKW && match.powerKW !== inverter.powerKW) {
        updateSpecs(editEquipmentGroup(specs, 'inverter', { type: 'update', index: 0, patch: { powerKW: match.powerKW } }));
      }
    }
    if (panel?.brandModel && panel.powerW) {
      const match = equipmentCatalog.find((it) => it.type === 'panel' && it.displayName === panel.brandModel);
      if (match && match.powerW && match.powerW !== panel.powerW) {
        updateSpecs(editEquipmentGroup(specs, 'panel', { type: 'update', index: 0, patch: { powerW: match.powerW } }));
      }
    }
  }, [inverter?.brandModel, panel?.brandModel, equipmentCatalog]);
}
