import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import type { EquipmentKind } from '../../shared/equipment';
import { DEFAULT_UNIT_PRICE_USD, LIST_KEY, applyLegacyEquipmentPatch, editEquipment, migrateLegacySpecs } from '../../shared/equipment';

/**
 * Compuertas del cliente sobre `shared/equipment` (ADR 0001). Los grupos (`panels`, `inverters`, `batteries`) son
 * la única fuente: ninguna función de aquí escribe el espejo heredado (`panelCount`, `batteryDOD`…); el módulo lo borra.
 * Los parámetros de sistema que no son identidad del equipo (degradación, pérdidas…) no se tocan desde un grupo.
 * `editEquipmentGroup` y `normalizeEquipmentEdit` son compuertas finas para quien arma parches de `updateSpecs`.
 */
export type { EquipmentKind };
export { DEFAULT_UNIT_PRICE_USD };
type GroupItem = { panel: PanelItemSpec; inverter: InverterItemSpec; battery: BatteryItemSpec };

export type EquipmentGroupEdit<K extends EquipmentKind> =
  | { type: 'add'; item: GroupItem[K] }
  | { type: 'update'; index: number; patch: Partial<GroupItem[K]> }
  | { type: 'remove'; index: number };

/**
 * El parche de `updateSpecs` para una edición de grupo: solo la lista nueva del tipo (`editEquipment` hace la
 * edición). Una edición inválida (índice fuera de rango, quitar el último grupo) devuelve `{}`.
 */
export function editEquipmentGroup<K extends EquipmentKind>(specs: SystemSpecs, kind: K, edit: EquipmentGroupEdit<K>): Partial<SystemSpecs> {
  const next = editEquipment(specs, kind, edit);
  return next === specs ? {} : { [LIST_KEY[kind]]: next[LIST_KEY[kind]] };
}

/**
 * Mezcla un parche de specs y devuelve specs solo con grupos (`applyLegacyEquipmentPatch`): un parche con campos
 * sueltos del espejo se traduce al grupo y nunca se escribe. Un parche sin campos de equipo se mezcla tal cual.
 */
export function normalizeEquipmentEdit(current: SystemSpecs, patch: Partial<SystemSpecs>): SystemSpecs {
  return applyLegacyEquipmentPatch(current, patch);
}

/**
 * Specs de una propuesta NUEVA sacada del caso de referencia: los grupos de paneles no heredan la degradación de la
 * referencia (0.5 %). En modo simple `resolveAnnualDegradationPct` prioriza el valor del grupo sobre el del sistema,
 * así que ese 0.5 anularía en silencio lo que el usuario configuró. Sin valor propio, el grupo usa `specs.annualDegradation`.
 */
export function withoutInheritedPanelDegradation(specs: SystemSpecs): SystemSpecs {
  if (!specs.panels?.some((group) => group.annualDegradation !== undefined)) return specs;
  return { ...specs, panels: specs.panels.map(({ annualDegradation: _inherited, ...group }) => group) };
}

/** Catalog field that sizes each kind of group. */
const MAGNITUDE = { panel: 'powerW', inverter: 'powerKW', battery: 'capacityKWh' } as const;

type CatalogEntry = Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'> & Partial<Pick<SolarEquipmentItem, 'powerW' | 'powerKW' | 'capacityKWh'>>;

/**
 * Catalog item behind a group, in order of certainty: its `catalogItemId`, a catalog id used as group id
 * (AI proposals), then a unique exact name. An ambiguous name never resolves: guessing could attach the
 * datasheet of a different model.
 */
export function resolveGroupCatalogItem<T extends CatalogEntry>(
  group: { id?: string; catalogItemId?: string; manualModel?: boolean; brandModel?: string },
  kind: EquipmentKind,
  catalog: readonly T[]
): T | null {
  const candidates = catalog.filter((item) => item.type === kind);
  const byId = (id?: string) => (id ? candidates.find((item) => item.id === id) : undefined);
  // A model the user rewrote by hand never resolves by id: its id may be the old catalog item's id.
  const exact = group.manualModel ? undefined : byId(group.catalogItemId) ?? byId(group.id);
  if (exact) return exact;
  const named = group.brandModel ? candidates.filter((item) => item.displayName === group.brandModel) : [];
  return named.length === 1 ? named[0] : null;
}

export type CatalogLinkedGroup = { id?: string; catalogItemId?: string; manualModel?: boolean; brandModel?: string };
export type CatalogLinkPatch = { catalogItemId?: string; manualModel?: true };

/** Nombre sin diferencias de mayúsculas, acentos ni espacios: «  panel  K 550 » es el mismo modelo que «Panel K 550». */
const normalizeModelName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/**
 * Identidad de catálogo que debe olvidar un grupo cuando su marca/modelo se reescribe a mano. Solo cambios de
 * mayúsculas, acentos o espacios conservan el vínculo; cualquier otro cambio (incluso de un carácter: 550 → 560)
 * puede ser otro modelo, y adjuntar la ficha técnica equivocada es peor que no adjuntar ninguna. El grupo queda con
 * `manualModel`, con lo que `resolveGroupCatalogItem` ya no lo resuelve por `catalogItemId` ni por `id`; el nombre exacto y
 * único de un equipo del catálogo lo revincula.
 */
export function detachedCatalogIdentity(kind: EquipmentKind, group: CatalogLinkedGroup, brandModel: string, catalog: readonly SolarEquipmentItem[]): CatalogLinkPatch {
  const linked = resolveGroupCatalogItem(group, kind, catalog);
  // Un id igual al catalogItemId (propuestas de IA) es identidad de catálogo aunque el catálogo aún no haya sincronizado.
  const idIsCatalogId = !!group.id && (group.id === group.catalogItemId || catalog.some(item => item.type === kind && item.id === group.id));
  // Nombre exacto y único de un equipo del catálogo (mismo criterio que el resolvedor): se revincula a ese equipo.
  const named = catalog.filter(item => item.type === kind && item.displayName === brandModel);
  if (named.length === 1) return { catalogItemId: named[0].id, manualModel: undefined };
  const reference = linked?.displayName ?? group.brandModel ?? '';
  if (normalizeModelName(brandModel) === normalizeModelName(reference)) return {};
  if (group.catalogItemId === undefined && !idIsCatalogId && !linked && !group.manualModel) return {};
  // El id no se toca (es la clave de la fila: cambiarlo quitaría el foco al escribir); `manualModel` impide que el resolvedor vuelva a usarlo.
  return { ...(group.catalogItemId !== undefined ? { catalogItemId: undefined } : {}), manualModel: true };
}

/**
 * The `updateSpecs` patch that points group `index` of `kind` at a catalog item: identity, magnitude and
 * `catalogItemId`, plus caller fields such as price. Selecting into the next free slot adds the group.
 * Like any group edit, an unmigrated project migrates here, on its first equipment edit.
 */
export function selectCatalogEquipment<K extends EquipmentKind>(
  specs: SystemSpecs,
  kind: K,
  index: number,
  item: CatalogEntry,
  extra: Partial<GroupItem[K]> = {}
): Partial<SystemSpecs> {
  // Propuesta migrada: la batería apagada con datos conserva su grupo oculto y se edita, no se duplica.
  const groups = (migrateLegacySpecs(specs)[LIST_KEY[kind]] ?? []) as GroupItem[K][];
  const field = MAGNITUDE[kind];
  const magnitude = item[field];
  const identity = {
    catalogItemId: item.id,
    manualModel: undefined,
    brandModel: item.displayName,
    ...(magnitude !== undefined && Number.isFinite(magnitude) && magnitude > 0 ? { [field]: magnitude } : {}),
    ...extra,
  } as Partial<GroupItem[K]>;
  if (groups[index]) return editEquipmentGroup(specs, kind, { type: 'update', index, patch: identity });
  if (index !== groups.length) return {};
  const added = { id: `${kind}-${item.id}`, count: 1, [field]: magnitude ?? 0, ...identity } as unknown as GroupItem[K];
  return editEquipmentGroup(specs, kind, { type: 'add', item: added });
}

/** `normalizeEquipmentEdit` for callers that produce the next specs instead of a patch. */
export function normalizeSpecsChange(previous: SystemSpecs, next: SystemSpecs): SystemSpecs {
  if (previous === next) return next;
  const patch: Partial<SystemSpecs> = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof SystemSpecs>) {
    if (previous[key] !== next[key]) (patch as Record<string, unknown>)[key] = next[key];
  }
  const normalized = normalizeEquipmentEdit(previous, patch);
  // Keys removed by the caller stay removed.
  for (const key of Object.keys(patch) as (keyof SystemSpecs)[]) if (!(key in next) && normalized[key] === undefined) delete normalized[key];
  return normalized;
}
