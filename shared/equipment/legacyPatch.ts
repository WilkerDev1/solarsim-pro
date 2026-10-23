import { MIRROR, deriveLegacyGroupWithPrice } from './legacy';
import { migrateLegacySpecs } from './migrate';
import { EQUIPMENT_KINDS, LIST_KEY, type EquipmentKind, type SystemSpecs } from './types';

/** Campos de grupo cuyo valor escalar (asistente, importaciones) se aplica al primer grupo aunque haya varios. */
const PRIMARY_SCALAR_FIELDS: Record<EquipmentKind, readonly string[]> = { panel: [], inverter: [], battery: ['dodPct', 'efficiencyPct'] };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Aplica a las specs un parche escrito con los campos sueltos del espejo heredado (`panelCount`, `batteryDOD`,
 * `selectedSupplierInfo`…) y devuelve specs solo con grupos: el parche se traduce al grupo y el espejo nunca se
 * escribe. Es la compuerta de compatibilidad para quien aún habla en campos sueltos (asistente de IA, importaciones,
 * clientes que arman el parche a mano); el código nuevo usa `editEquipment`.
 *
 * Reglas:
 * - Un parche sin campos de equipo (ni listas, ni `hasBattery`, ni proveedor) se mezcla tal cual.
 * - Antes de aplicar se migra la propuesta (`migrateLegacySpecs`), así que un proyecto heredado queda en grupos.
 * - Una lista de grupos en el parche manda sobre los campos sueltos del mismo tipo.
 * - Con un solo grupo, cada campo suelto llega al grupo; con varios, solo DOD y eficiencia de batería (del primero).
 * - `selectedSupplierInfo[tipo]` pertenece al primer grupo del tipo.
 * - Valores `undefined` del parche se ignoran, como siempre.
 */
export function applyLegacyEquipmentPatch(current: SystemSpecs, patch: Partial<SystemSpecs>): SystemSpecs {
  const legacyOf = (kind: EquipmentKind) =>
    Object.entries(MIRROR[kind]).filter(([, legacy]) => patch[legacy as keyof SystemSpecs] !== undefined) as [string, keyof SystemSpecs][];
  const currentSupplier = (kind: EquipmentKind) => migrateLegacySpecs(current)[LIST_KEY[kind]]?.[0]?.selectedSupplierInfo;
  const supplierChanged = (kind: EquipmentKind) => patch.selectedSupplierInfo !== undefined && !sameJson(patch.selectedSupplierInfo[kind], currentSupplier(kind));
  const touches = (kind: EquipmentKind) => patch[LIST_KEY[kind]] !== undefined || legacyOf(kind).length > 0 || supplierChanged(kind);
  // El parche sin los campos del espejo: ni siquiera con valor `undefined` se vuelven a escribir.
  const rest: Record<string, unknown> = { ...patch };
  for (const kind of EQUIPMENT_KINDS) for (const legacy of Object.values(MIRROR[kind])) delete rest[legacy as string];
  delete rest.selectedSupplierInfo;
  for (const kind of EQUIPMENT_KINDS) if (rest[LIST_KEY[kind]] === undefined) delete rest[LIST_KEY[kind]];
  if (!EQUIPMENT_KINDS.some(touches) && patch.hasBattery === undefined) return { ...current, ...(rest as Partial<SystemSpecs>) };

  let merged: SystemSpecs = { ...migrateLegacySpecs(current), ...(rest as Partial<SystemSpecs>) };
  // Activar la batería de un proyecto sin datos de batería crea su grupo.
  if (merged.hasBattery) merged = migrateLegacySpecs(merged);

  for (const kind of EQUIPMENT_KINDS) {
    if (patch[LIST_KEY[kind]] !== undefined) continue;
    const scalars = legacyOf(kind);
    const supplier = supplierChanged(kind);
    if (scalars.length === 0 && !supplier) continue;

    const groups = [...(merged[LIST_KEY[kind]] ?? [])] as unknown as Record<string, unknown>[];
    if (groups.length === 0) groups.push(deriveLegacyGroupWithPrice(merged, kind) as unknown as Record<string, unknown>);
    const own = groups.length <= 1 ? scalars : scalars.filter(([field]) => PRIMARY_SCALAR_FIELDS[kind].includes(field));
    if (own.length) groups[0] = { ...groups[0], ...Object.fromEntries(own.map(([field, legacy]) => [field, patch[legacy]])) };
    if (supplier) groups[0] = { ...groups[0], selectedSupplierInfo: patch.selectedSupplierInfo?.[kind] };
    merged = { ...merged, [LIST_KEY[kind]]: groups };
  }
  return merged;
}
