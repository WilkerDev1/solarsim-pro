/**
 * EquipmentModel: único dueño de los grupos de equipos (`panels`, `inverters`, `batteries`) y del espejo
 * heredado de un solo modelo. TypeScript puro (cliente, API y Worker). Ver docs/adr/0001-equipment-model-sin-espejo.md.
 */
import { deriveLegacyGroupWithPrice, savedGroups } from './legacy.js';
import type { Equipment, LegacySystemSpecs } from './types.js';

export { DEFAULT_UNIT_PRICE_USD, LEGACY_MIRROR_FIELDS, deriveLegacyGroup } from './legacy.js';
export { editEquipment } from './edit.js';
export { applyLegacyEquipmentPatch } from './legacyPatch.js';
export { migrateLegacySpecs } from './migrate.js';
export { EQUIPMENT_FALLBACK_NAME, describeEquipment, describePanelConfiguration, uniformPanelWatts, equipmentTotals, mainEquipmentGroup, type EquipmentTotals } from './summary.js';
export { EQUIPMENT_KINDS, LIST_KEY, type BatteryItemSpec, type Equipment, type EquipmentEdit, type EquipmentSpecs, type EquipmentGroups, type EquipmentKind, type InverterItemSpec, type LegacyEquipmentFields, type LegacySystemSpecs, type PanelItemSpec } from './types.js';

/**
 * Grupos normalizados. Con grupos guardados se devuelven tal cual; sin ellos se derivan de los campos
 * heredados (con el precio por defecto de la matriz de costos). Es el único lector del espejo. Con
 * `hasBattery` falso, `batteries` es `[]` aunque haya grupos o campos de batería guardados.
 */
export function readEquipment(specs: LegacySystemSpecs): Equipment {
  return {
    panels: savedGroups(specs, 'panel') ?? [deriveLegacyGroupWithPrice(specs, 'panel')],
    inverters: savedGroups(specs, 'inverter') ?? [deriveLegacyGroupWithPrice(specs, 'inverter')],
    batteries: !specs.hasBattery ? [] : savedGroups(specs, 'battery') ?? [deriveLegacyGroupWithPrice(specs, 'battery')],
  };
}
