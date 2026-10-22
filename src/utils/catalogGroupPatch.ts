import type { PanelItemSpec } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

/**
 * Model-specific fields of a panel group taken from the selected catalog item. Every field is replaced
 * (undefined when the catalog lacks it) so values from the previous model never leak into the new one.
 */
export function catalogPanelGroupPatch(item: SolarEquipmentItem): Pick<PanelItemSpec, 'brandModel' | 'powerW' | 'efficiencyPct' | 'tempCoeff' | 'annualDegradation' | 'weightKilos'> {
  return {
    brandModel: item.displayName,
    powerW: item.powerW || 550,
    efficiencyPct: item.efficiencyPct,
    tempCoeff: item.tempCoeff,
    annualDegradation: item.annualDegradation,
    weightKilos: item.weightKg,
  };
}
