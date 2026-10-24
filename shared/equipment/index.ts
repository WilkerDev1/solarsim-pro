/**
 * EquipmentModel: único dueño de los grupos de equipos (`panels`, `inverters`, `batteries`) y del espejo
 * heredado de un solo modelo. TypeScript puro (cliente, API y Worker). Ver docs/adr/0001-equipment-model-sin-espejo.md.
 */
import { deriveLegacyGroupWithPrice, savedGroups } from './legacy';
import type { Equipment, SystemSpecs } from './types';

export { DEFAULT_UNIT_PRICE_USD, LEGACY_MIRROR_FIELDS, deriveLegacyGroup } from './legacy';
export { editEquipment } from './edit';
export { applyLegacyEquipmentPatch } from './legacyPatch';
export { migrateLegacySpecs } from './migrate';
export { EQUIPMENT_FALLBACK_NAME, describeEquipment, describePanelConfiguration, uniformPanelWatts, equipmentTotals, mainEquipmentGroup, type EquipmentTotals } from './summary';
export { EQUIPMENT_KINDS, LIST_KEY, type BatteryItemSpec, type Equipment, type EquipmentEdit, type EquipmentGroups, type EquipmentKind, type InverterItemSpec, type PanelItemSpec } from './types';

/**
 * Grupos normalizados. Con grupos guardados se devuelven tal cual; sin ellos se derivan de los campos
 * heredados (con el precio por defecto de la matriz de costos). Es el único lector del espejo. Con
 * `hasBattery` falso, `batteries` es `[]` aunque haya grupos o campos de batería guardados.
 */
export function readEquipment(specs: SystemSpecs): Equipment {
  return {
    panels: savedGroups(specs, 'panel') ?? [deriveLegacyGroupWithPrice(specs, 'panel')],
    inverters: savedGroups(specs, 'inverter') ?? [deriveLegacyGroupWithPrice(specs, 'inverter')],
    batteries: !specs.hasBattery ? [] : savedGroups(specs, 'battery') ?? [deriveLegacyGroupWithPrice(specs, 'battery')],
  };
}
