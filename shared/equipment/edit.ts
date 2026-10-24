import { migrateLegacySpecs } from './migrate.js';
import { LIST_KEY, type EquipmentEdit, type EquipmentGroups, type EquipmentKind, type LegacySystemSpecs } from './types.js';

/**
 * Aplica una edición de grupo y devuelve las specs completas (no un parche). Nunca escribe el espejo heredado
 * y lo borra si existía: antes de editar se migra la propuesta (`migrateLegacySpecs`), así que un proyecto
 * heredado conserva los demás tipos de equipo como grupos.
 *
 * Una edición inválida (índice fuera de rango, quitar el último grupo) no cambia nada y devuelve el mismo
 * objeto `specs`. No muta la entrada.
 */
export function editEquipment<K extends EquipmentKind, S extends LegacySystemSpecs>(specs: S, kind: K, edit: EquipmentEdit<K>): S {
  const migrated = migrateLegacySpecs(specs);
  const groups = [...((migrated[LIST_KEY[kind]] as EquipmentGroups[K][] | undefined) ?? [])];
  if (edit.type === 'add') groups.push(edit.item);
  else if (edit.type === 'update') {
    if (!groups[edit.index]) return specs;
    groups[edit.index] = { ...groups[edit.index], ...edit.patch };
  } else {
    if (groups.length <= 1 || !groups[edit.index]) return specs;
    groups.splice(edit.index, 1);
  }
  return { ...migrated, [LIST_KEY[kind]]: groups } as S;
}
