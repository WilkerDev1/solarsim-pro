import React from 'react';
import type { SystemSpecs } from '../../../../types';
import type { SolarEquipmentItem } from '../../../../types/equipment';

/** Auto-sanear inconsistencias de potencia unitaria si el modelo seleccionado está en el catálogo verificado. */
export function useCatalogPowerSync(
  specs: SystemSpecs,
  equipmentCatalog: SolarEquipmentItem[],
  updateSpecs: (specs: Partial<SystemSpecs>) => void
): void {
  React.useEffect(() => {
    if (specs.inverterBrandModel && specs.inverterPowerKW) {
      const match = equipmentCatalog.find(
        (it) => it.type === 'inverter' && it.displayName === specs.inverterBrandModel
      );
      if (match && match.powerKW && match.powerKW !== specs.inverterPowerKW) {
        updateSpecs({ inverterPowerKW: match.powerKW });
      }
    }
    if (specs.panelBrandModel && specs.panelPowerW) {
      const match = equipmentCatalog.find(
        (it) => it.type === 'panel' && it.displayName === specs.panelBrandModel
      );
      if (match && match.powerW && match.powerW !== specs.panelPowerW) {
        updateSpecs({ panelPowerW: match.powerW });
      }
    }
  }, [specs.inverterBrandModel, specs.panelBrandModel, equipmentCatalog]);
}
