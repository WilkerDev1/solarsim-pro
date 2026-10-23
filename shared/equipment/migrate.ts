import { deriveLegacyGroupWithPrice, hasLegacyBatteryData, hasMirror, savedGroups, withoutMirror } from './legacy';
import { EQUIPMENT_KINDS, LIST_KEY, type EquipmentKind, type SystemSpecs } from './types';

/** ¿Hay que construir el grupo de batería? Con batería activa siempre; apagada, solo si los campos sueltos traen datos propios. */
const wantsBatteryGroup = (specs: SystemSpecs) => Boolean(specs.hasBattery) || hasLegacyBatteryData(specs);

/**
 * Deja la propuesta solo con grupos: construye los que falten desde el espejo heredado y borra el espejo
 * (`panelBrandModel`, `panelCount`, …, y `selectedSupplierInfo`). Idempotente; si no hay nada que migrar
 * devuelve el mismo objeto.
 *
 * Reglas:
 * - Migración invariante: no cambia ningún resultado visible (costo, precio, kWp, energía, finanzas, textos).
 * - Con grupos guardados, estos mandan y el espejo solo se borra: no se traslada nada a los grupos (ni cantidad,
 *   potencia, capacidad, precio, DOD o eficiencia, que afectan cálculos, ni peso o proveedor, que se ven en la
 *   matriz de costos, las fichas y los textos). Hoy el motor ignora el espejo cuando hay grupos y un grupo sin precio cuenta 0.
 * - Sin grupos, se construye uno con la derivación histórica y el precio por defecto de la matriz de costos
 *   si el proyecto no tenía precio, de modo que el costo no cambie.
 * - Batería: con `hasBattery` activo siempre hay grupo. Con `hasBattery` falso solo se crea si los campos sueltos
 *   traen datos propios, para no perderlos al reactivar la batería; `readEquipment` lo oculta mientras esté apagada.
 * - Los parámetros de sistema que no son identidad del equipo (degradación, vida útil, pérdidas…) no se tocan.
 *
 * El tipo `SystemSpecs` aún declara obligatorios algunos campos sueltos; hasta que las oleadas siguientes los
 * vuelvan opcionales, el resultado puede carecer de ellos.
 */
export function migrateLegacySpecs(specs: SystemSpecs): SystemSpecs {
  const needsGroups = (kind: EquipmentKind) => !savedGroups(specs, kind) && (kind !== 'battery' || wantsBatteryGroup(specs));
  if (!hasMirror(specs) && !EQUIPMENT_KINDS.some(needsGroups)) return specs;

  const next: SystemSpecs = withoutMirror(specs);
  for (const kind of EQUIPMENT_KINDS) {
    const saved = savedGroups(specs, kind);
    if (saved) (next as unknown as Record<string, unknown>)[LIST_KEY[kind]] = saved;
    else if (needsGroups(kind)) (next as unknown as Record<string, unknown>)[LIST_KEY[kind]] = [deriveLegacyGroupWithPrice(specs, kind)];
  }
  return next;
}
