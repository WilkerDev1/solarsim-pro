import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../types';
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
  battery: { brandModel: 'batteryBrandModel', capacityKWh: 'batteryCapacityKWh', count: 'batteryCount', unitPriceUSD: 'batteryUnitPriceUSD', weightKilos: 'batteryWeightKilos' },
};
const KINDS: EquipmentKind[] = ['panel', 'inverter', 'battery'];

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
    } else if (!supplierChanged(kind)) continue;
    // The selected supplier belongs to the primary group, like supplier pricing does.
    if (supplierChanged(kind) && groups[0]) groups[0] = { ...groups[0], selectedSupplierInfo: patch.selectedSupplierInfo?.[kind] };
    lists[kind] = groups;
  }
  return withGroups(merged, touched, lists);
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
