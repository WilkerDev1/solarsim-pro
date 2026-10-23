import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../../src/types';

export type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs };

export type EquipmentKind = 'panel' | 'inverter' | 'battery';

/** Grupo (modelo + cantidad + precio) de cada tipo de equipo. */
export interface EquipmentGroups {
  panel: PanelItemSpec;
  inverter: InverterItemSpec;
  battery: BatteryItemSpec;
}

/** Equipos normalizados de una propuesta. `batteries` es `[]` cuando el sistema no lleva batería. */
export interface Equipment {
  panels: PanelItemSpec[];
  inverters: InverterItemSpec[];
  batteries: BatteryItemSpec[];
}

export type EquipmentListKey = keyof Equipment;

export const LIST_KEY: Record<EquipmentKind, EquipmentListKey> = { panel: 'panels', inverter: 'inverters', battery: 'batteries' };
export const EQUIPMENT_KINDS: readonly EquipmentKind[] = ['panel', 'inverter', 'battery'];

/** Edición de un grupo. El último grupo de un tipo nunca se elimina. */
export type EquipmentEdit<K extends EquipmentKind> =
  | { type: 'add'; item: EquipmentGroups[K] }
  | { type: 'update'; index: number; patch: Partial<EquipmentGroups[K]> }
  | { type: 'remove'; index: number };
