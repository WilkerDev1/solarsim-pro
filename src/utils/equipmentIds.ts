import type { EquipmentType } from '../types/equipment';

const TYPED_PREFIX = /^eq-(?:panel|inverter|battery)-/;

/** Id de un equipo nuevo creado a mano en el catálogo: `eq-<tipo>-<ms>-<aleatorio>`. */
export function newEquipmentItemId(type: EquipmentType, now: number = Date.now(), random: () => number = Math.random): string {
  return `eq-${type}-${now}-${random().toString(36).substring(2, 6)}`;
}

/**
 * Id con el que se guarda el equipo del editor. El borrador nace con el tipo de la pestaña (panel por defecto) y el
 * usuario puede cambiarlo antes de guardar: en un equipo NUEVO el prefijo se alinea con el tipo final
 * (eq-battery-…, eq-inverter-…). Un equipo existente conserva su id siempre, tenga el prefijo que tenga.
 */
export function savedEquipmentItemId(id: string | undefined, type: EquipmentType, isNew: boolean): string {
  if (!id) return newEquipmentItemId(type);
  if (!isNew) return id;
  return TYPED_PREFIX.test(id) ? id.replace(TYPED_PREFIX, `eq-${type}-`) : id;
}
