import { EQUIPMENT_FALLBACK_NAME, describeEquipment, mainEquipmentGroup, type Equipment, type EquipmentGroups, type EquipmentKind } from '../equipment';

/**
 * Modelo principal de un tipo de equipo para frases (ADR 0001): nombre, grupo principal y, si hay más
 * modelos distintos, el sufijo « y N modelo(s) más». Es la única lectura de equipos de los textos; las
 * tablas listan todos los grupos y no usan esto.
 */
export interface MainModelPhrase<K extends EquipmentKind> {
  /** Grupo principal (`undefined` si el tipo no tiene grupos, p. ej. sin batería). */
  main: EquipmentGroups[K] | undefined;
  /** Nombre del modelo principal, o el nombre de reserva unificado. */
  name: string;
  /** `''` o « y N modelo(s) más». */
  more: string;
}

export function mainModelPhrase<K extends EquipmentKind>(equipment: Equipment, kind: K): MainModelPhrase<K> {
  const main = mainEquipmentGroup(equipment, kind);
  const name = main?.brandModel?.trim() || EQUIPMENT_FALLBACK_NAME[kind];
  // `describeEquipment` es el dueño del recuento de modelos: el sufijo es lo que sigue al nombre.
  const more = main ? describeEquipment(equipment, kind).slice(name.length) : '';
  return { main, name, more };
}
