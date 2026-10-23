import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from './equipmentSpecsUtils';

/**
 * Equipment groups (`panels`, `inverters`, `batteries`) are the source of truth. The legacy single-model
 * fields (`panelBrandModel`, `panelCount`, …) are kept as a mirror of the first group so 2.6.0 clients,
 * the share viewer and published snapshots keep reading valid data. System-level parameters that the
 * engines read from the legacy fields (battery DoD/efficiency/lifespan, panel degradation, …) are not
 * group identity and are never rewritten from a group.
 */
export type EquipmentKind = 'panel' | 'inverter' | 'battery';
type GroupItem = { panel: PanelItemSpec; inverter: InverterItemSpec; battery: BatteryItemSpec };
type ListKey = 'panels' | 'inverters' | 'batteries';

const LIST_KEY: Record<EquipmentKind, ListKey> = { panel: 'panels', inverter: 'inverters', battery: 'batteries' };

/** Group field → legacy mirror field. */
const MIRROR: { [K in EquipmentKind]: Partial<Record<keyof GroupItem[K], keyof SystemSpecs>> } = {
  panel: { brandModel: 'panelBrandModel', powerW: 'panelPowerW', count: 'panelCount', unitPriceUSD: 'panelUnitPriceUSD', weightKilos: 'panelWeightKilos' },
  inverter: { brandModel: 'inverterBrandModel', powerKW: 'inverterPowerKW', count: 'inverterCount', unitPriceUSD: 'inverterUnitPriceUSD', weightKilos: 'inverterWeightKilos' },
  battery: { brandModel: 'batteryBrandModel', capacityKWh: 'batteryCapacityKWh', dodPct: 'batteryDOD', efficiencyPct: 'batteryEfficiencyPct', count: 'batteryCount', unitPriceUSD: 'batteryUnitPriceUSD', weightKilos: 'batteryWeightKilos' },
};
const KINDS: EquipmentKind[] = ['panel', 'inverter', 'battery'];

/** Group fields whose legacy scalar edit applies to the first group even when the project has several. */
const PRIMARY_SCALAR_FIELDS: Record<EquipmentKind, string[]> = { panel: [], inverter: [], battery: ['dodPct', 'efficiencyPct'] };

/** Unit price the cost matrix assumes for a legacy single-model project without one. */
export const DEFAULT_UNIT_PRICE_USD: Record<EquipmentKind, number> = { panel: 103.32, inverter: 2300.0, battery: 1990.0 };

function groupsOf<K extends EquipmentKind>(specs: SystemSpecs, kind: K): GroupItem[K][] {
  const saved = specs[LIST_KEY[kind]] as GroupItem[K][] | undefined;
  if (saved?.length) return saved;
  const legacy = kind === 'panel' ? getProjectPanels(specs) : kind === 'inverter' ? getProjectInverters(specs) : specs.hasBattery ? getProjectBatteries(specs) : saved ?? [];
  // Keep the engine's legacy price default once the group becomes explicit.
  return legacy.map((item) => ({ ...item, unitPriceUSD: item.unitPriceUSD ?? DEFAULT_UNIT_PRICE_USD[kind] })) as GroupItem[K][];
}

/** Legacy fields mirrored from the first group of `kind` (only values the group defines). */
function mirrorOf<K extends EquipmentKind>(specs: SystemSpecs, kind: K, first: GroupItem[K] | undefined): Partial<SystemSpecs> {
  if (!first) return {};
  const mirror: Record<string, unknown> = {};
  for (const [field, legacy] of Object.entries(MIRROR[kind]) as [keyof GroupItem[K], keyof SystemSpecs][]) {
    if (first[field] !== undefined) mirror[legacy as string] = first[field];
  }
  // DOD/eficiencia: si el primer grupo no tiene dato propio, el espejo se reinicia para que un escalar del principal anterior no se herede.
  if (kind === 'battery') {
    for (const field of PRIMARY_SCALAR_FIELDS.battery) {
      if (first[field as keyof GroupItem[K]] === undefined) mirror[(MIRROR.battery as Record<string, string>)[field]] = undefined;
    }
  }
  if (first.selectedSupplierInfo) mirror.selectedSupplierInfo = { ...specs.selectedSupplierInfo, [kind]: first.selectedSupplierInfo };
  return mirror as Partial<SystemSpecs>;
}

function withGroups(specs: SystemSpecs, kinds: EquipmentKind[], lists: Partial<Record<EquipmentKind, unknown[]>> = {}): SystemSpecs {
  let next: SystemSpecs = { ...specs };
  for (const kind of kinds) {
    const groups = (lists[kind] ?? groupsOf(specs, kind)) as GroupItem[typeof kind][];
    next = { ...next, [LIST_KEY[kind]]: groups, ...mirrorOf(next, kind, groups[0]) };
  }
  return next;
}

/** Specs with every equipment group materialized and the legacy mirror refreshed. Idempotent. */
export function withEquipmentGroups(specs: SystemSpecs): SystemSpecs {
  return withGroups(specs, KINDS);
}

export type EquipmentGroupEdit<K extends EquipmentKind> =
  | { type: 'add'; item: GroupItem[K] }
  | { type: 'update'; index: number; patch: Partial<GroupItem[K]> }
  | { type: 'remove'; index: number };

/** The `updateSpecs` patch for one group edit: the new list plus its legacy mirror. The last group is never removed. */
export function editEquipmentGroup<K extends EquipmentKind>(specs: SystemSpecs, kind: K, edit: EquipmentGroupEdit<K>): Partial<SystemSpecs> {
  const groups = [...groupsOf(specs, kind)];
  if (edit.type === 'add') groups.push(edit.item);
  else if (edit.type === 'update') {
    if (!groups[edit.index]) return {};
    groups[edit.index] = { ...groups[edit.index], ...edit.patch };
  } else {
    if (groups.length <= 1 || !groups[edit.index]) return {};
    groups.splice(edit.index, 1);
  }
  // Only mirror fields that change: an unchanged panelCount in the patch would read as a manual quantity override.
  const changed = Object.entries(mirrorOf(specs, kind, groups[0])).filter(
    ([key, value]) => JSON.stringify(specs[key as keyof SystemSpecs]) !== JSON.stringify(value)
  );
  return { [LIST_KEY[kind]]: groups, ...Object.fromEntries(changed) } as Partial<SystemSpecs>;
}

/**
 * Merges a specs patch keeping groups and mirror consistent. A patch that touches no equipment field is
 * merged as-is (projects migrate on their first equipment edit, not on load, so syncing does not resend
 * every project). Legacy-field edits reach the group only while the project has a single group; with
 * several groups the engines read the groups, so the mirror is refreshed from the first group instead.
 */
export function normalizeEquipmentEdit(current: SystemSpecs, patch: Partial<SystemSpecs>): SystemSpecs {
  const merged: SystemSpecs = { ...current, ...patch };
  const supplierChanged = (kind: EquipmentKind) =>
    'selectedSupplierInfo' in patch &&
    JSON.stringify(patch.selectedSupplierInfo?.[kind]) !== JSON.stringify(current.selectedSupplierInfo?.[kind]);
  const touched = KINDS.filter((kind) =>
    patch[LIST_KEY[kind]] !== undefined || supplierChanged(kind) || Object.values(MIRROR[kind]).some((legacy) => legacy && patch[legacy] !== undefined)
  ) as EquipmentKind[];
  if (patch.hasBattery !== undefined && !touched.includes('battery')) touched.push('battery');
  if (touched.length === 0) return merged;

  const lists: Partial<Record<EquipmentKind, unknown[]>> = {};
  for (const kind of touched) {
    if (patch[LIST_KEY[kind]] !== undefined) continue;
    let groups = [...groupsOf(current, kind)] as GroupItem[typeof kind][];
    if (groups.length <= 1) {
      const fromPatch: Record<string, unknown> = {};
      for (const [field, legacy] of Object.entries(MIRROR[kind]) as [string, keyof SystemSpecs][]) {
        if (patch[legacy] !== undefined) fromPatch[field] = patch[legacy];
      }
      const single = groups[0] ?? groupsOf(merged, kind)[0];
      groups = single ? [{ ...single, ...fromPatch }] : groupsOf(merged, kind);
    } else {
      // Con varios grupos los motores leen los grupos; un valor escalar de DOD/eficiencia (asistente, importaciones) es del primero.
      const primary: Record<string, unknown> = {};
      for (const field of PRIMARY_SCALAR_FIELDS[kind]) {
        const legacy = (MIRROR[kind] as Record<string, keyof SystemSpecs>)[field];
        if (legacy && patch[legacy] !== undefined) primary[field] = patch[legacy];
      }
      if (Object.keys(primary).length) groups[0] = { ...groups[0], ...primary };
      else if (!supplierChanged(kind)) continue;
    }
    // The selected supplier belongs to the primary group, like supplier pricing does.
    if (supplierChanged(kind) && groups[0]) groups[0] = { ...groups[0], selectedSupplierInfo: patch.selectedSupplierInfo?.[kind] };
    lists[kind] = groups;
  }
  return withGroups(merged, touched, lists);
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

function withoutId(ids: string[] | undefined, id: string): string[] | undefined {
  const rest = (ids ?? []).filter((entry) => entry !== id);
  return rest.length ? rest : undefined;
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
  const groups = groupsOf(specs, kind);
  const field = MAGNITUDE[kind];
  const magnitude = item[field];
  const identity = {
    catalogItemId: item.id,
    manualModel: undefined,
    // Elegir B del catálogo lo vuelve a usar: sale de la lista de dejados, los demás se conservan.
    detachedCatalogItemIds: withoutId(groups[index]?.detachedCatalogItemIds, item.id),
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
