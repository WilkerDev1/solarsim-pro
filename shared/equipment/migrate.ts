import { deriveLegacyGroupWithPrice, hasLegacyBatteryData, hasMirror, MIRROR, savedGroups, withoutMirror } from './legacy';
import { EQUIPMENT_KINDS, LIST_KEY, type EquipmentGroups, type EquipmentKind, type SystemSpecs } from './types';

/** Campos del espejo que se trasladan al primer grupo cuando este no los tiene: precio y peso. */
const CARRIED_FIELDS = ['unitPriceUSD', 'weightKilos'] as const;

/** ¿Hay que construir el grupo de batería? Con batería activa siempre; apagada, solo si los campos sueltos traen datos propios. */
const wantsBatteryGroup = (specs: SystemSpecs) => Boolean(specs.hasBattery) || hasLegacyBatteryData(specs);

/** Traslada al primer grupo lo que solo el espejo sabe (precio, peso, proveedor). Nunca pisa un dato del grupo. */
function carryIntoFirst<K extends EquipmentKind>(specs: SystemSpecs, kind: K, groups: EquipmentGroups[K][]): EquipmentGroups[K][] {
  const first = groups[0] as EquipmentGroups[EquipmentKind];
  const patch: Record<string, unknown> = {};
  for (const field of CARRIED_FIELDS) {
    const legacy = (MIRROR[kind] as Record<string, keyof SystemSpecs>)[field];
    if (first[field] === undefined && legacy && specs[legacy] !== undefined) patch[field] = specs[legacy];
  }
  const supplier = specs.selectedSupplierInfo?.[kind];
  if (!first.selectedSupplierInfo && supplier) {
    patch.selectedSupplierInfo = { supplierName: supplier.supplierName, priceUSD: supplier.priceUSD, updatedAt: supplier.updatedAt, supplierPriceId: supplier.supplierPriceId };
  }
  if (Object.keys(patch).length === 0) return groups;
  return [{ ...first, ...patch } as EquipmentGroups[K], ...groups.slice(1)];
}

/**
 * Deja la propuesta solo con grupos: construye los que falten desde el espejo heredado y borra el espejo
 * (`panelBrandModel`, `panelCount`, …, y `selectedSupplierInfo`). Idempotente; si no hay nada que migrar
 * devuelve el mismo objeto.
 *
 * Reglas:
 * - Con grupos guardados, estos mandan: cantidad, modelo y potencia del espejo se descartan.
 * - Sin grupos, se construye uno con la derivación histórica y el precio por defecto de la matriz de costos
 *   si el proyecto no tenía precio, de modo que el costo no cambie.
 * - Datos que solo tiene el espejo (precio, peso, proveedor del tipo) pasan al primer grupo si este no los tiene.
 * - DOD y eficiencia de batería no se heredan: el motor ya los resuelve por grupo e ignora el escalar cuando hay
 *   grupos (decisión 5 del ADR 0001).
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
    if (saved) (next as unknown as Record<string, unknown>)[LIST_KEY[kind]] = carryIntoFirst(specs, kind, saved);
    else if (needsGroups(kind)) (next as unknown as Record<string, unknown>)[LIST_KEY[kind]] = [deriveLegacyGroupWithPrice(specs, kind)];
  }
  return next;
}
