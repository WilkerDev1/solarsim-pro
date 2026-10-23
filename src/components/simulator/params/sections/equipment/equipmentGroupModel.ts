import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import { catalogPanelGroupPatch } from '../../../../../utils/catalogGroupPatch';
import { editEquipmentGroup, resolveGroupCatalogItem, selectCatalogEquipment, type EquipmentKind } from '../../../../../utils/equipmentGroups';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../../../../utils/equipmentSpecsUtils';
import { buildCatalogSelectionUpdate } from '../../logic/catalogSelection';
import { MANUAL_BRAND_PLACEHOLDER, resolveBatteryDodPct, resolveBatteryEfficiencyPct } from '../../logic/dockDefaults';

export type EquipmentMode = 'catalog' | 'manual';
type GroupItem = { panel: PanelItemSpec; inverter: InverterItemSpec; battery: BatteryItemSpec };
type MagnitudeField = 'powerW' | 'powerKW' | 'capacityKWh';

export interface KindConfig {
  title: string;
  /** Nombre corto en minúsculas para etiquetas accesibles («panel», «inversor», «batería»). */
  noun: string;
  plural: string;
  magnitudeField: MagnitudeField;
  magnitudeUnit: string;
  magnitudeLabel: string;
  magnitudeStep: number;
  magnitudeMin: number;
  searchPlaceholder: string;
  /** Valor que la vista muestra mientras el modelo principal no tiene nombre (modo Manual). */
  manualBrandFallback: string;
}

export const KIND_CONFIG: Record<EquipmentKind, KindConfig> = {
  panel: {
    title: 'Paneles',
    noun: 'panel',
    plural: 'paneles',
    magnitudeField: 'powerW',
    magnitudeUnit: 'W',
    magnitudeLabel: 'Potencia (W)',
    magnitudeStep: 5,
    magnitudeMin: 50,
    searchPlaceholder: 'Buscar o seleccionar panel…',
    manualBrandFallback: MANUAL_BRAND_PLACEHOLDER.panel,
  },
  inverter: {
    title: 'Inversores',
    noun: 'inversor',
    plural: 'inversores',
    magnitudeField: 'powerKW',
    magnitudeUnit: 'kW',
    magnitudeLabel: 'Potencia (kW)',
    magnitudeStep: 0.5,
    magnitudeMin: 0.5,
    searchPlaceholder: 'Buscar o seleccionar inversor…',
    manualBrandFallback: MANUAL_BRAND_PLACEHOLDER.inverter,
  },
  battery: {
    title: 'Baterías',
    noun: 'batería',
    plural: 'baterías',
    magnitudeField: 'capacityKWh',
    magnitudeUnit: 'kWh',
    magnitudeLabel: 'Capacidad (kWh)',
    magnitudeStep: 0.5,
    magnitudeMin: 0.5,
    searchPlaceholder: 'Buscar o seleccionar batería…',
    manualBrandFallback: MANUAL_BRAND_PLACEHOLDER.battery,
  },
};

/** Lo que la lista dibuja de cada modelo; el principal sin nombre queda vacío para mostrar el marcador. */
export interface GroupModelView {
  key: string;
  brandModel: string;
  magnitude: number;
  count: number;
}

function itemsOf(specs: SystemSpecs, kind: EquipmentKind): Array<GroupItem[EquipmentKind]> {
  return kind === 'panel' ? getProjectPanels(specs) : kind === 'inverter' ? getProjectInverters(specs) : getProjectBatteries(specs);
}

const LEGACY_BRAND: Record<EquipmentKind, 'panelBrandModel' | 'inverterBrandModel' | 'batteryBrandModel'> = {
  panel: 'panelBrandModel',
  inverter: 'inverterBrandModel',
  battery: 'batteryBrandModel',
};
const LIST_KEY = { panel: 'panels', inverter: 'inverters', battery: 'batteries' } as const;

export function groupViews(specs: SystemSpecs, kind: EquipmentKind): GroupModelView[] {
  const field = KIND_CONFIG[kind].magnitudeField;
  const listed = (specs[LIST_KEY[kind]] ?? []).length > 0;
  return itemsOf(specs, kind).map((item, index) => ({
    key: item.id || String(index),
    // Un proyecto sin lista conserva su campo heredado vacío (marcador «Buscar o seleccionar…»).
    brandModel: !listed && index === 0 ? specs[LEGACY_BRAND[kind]] ?? '' : item.brandModel,
    magnitude: (item as unknown as Record<MagnitudeField, number>)[field],
    count: item.count,
  }));
}

/** Modelo nuevo para «+»: el primer equipo del catálogo distinto del principal, o un valor por defecto. */
export function buildNewItem<K extends EquipmentKind>(kind: K, specs: SystemSpecs, catalog: SolarEquipmentItem[], now: number = Date.now()): GroupItem[K] {
  const current = itemsOf(specs, kind)[0]?.brandModel;
  const candidate = catalog.find(entry => entry.type === kind && entry.displayName !== current);
  const price = candidate?.supplierPrices?.[0]?.priceUSD;
  if (kind === 'panel') {
    return {
      id: `panel-${now}`,
      catalogItemId: candidate?.id,
      // Con catálogo, los campos propios del modelo (degradación, eficiencia…) salen del mismo parche que la selección.
      ...(candidate ? catalogPanelGroupPatch(candidate) : { brandModel: 'Módulos JA Solar JAM66D45-630/LB (630W)', powerW: 630 }),
      count: 10,
      unitPriceUSD: price || (candidate?.powerW ? candidate.powerW * 0.17 : 105),
    } as GroupItem[K];
  }
  if (kind === 'inverter') {
    return {
      id: `inv-${now}`,
      catalogItemId: candidate?.id,
      brandModel: candidate?.displayName || 'Inversor Huawei SUN2000-5KTL-M1 (5.0kW)',
      powerKW: candidate?.powerKW || 5.0,
      count: 1,
      unitPriceUSD: price || (candidate?.powerKW ? candidate.powerKW * 220 : 1100),
    } as GroupItem[K];
  }
  return {
    id: `battery-${now}`,
    catalogItemId: candidate?.id,
    brandModel: candidate?.displayName || 'Batería Dyness A48100 (5.12 kWh)',
    capacityKWh: candidate?.capacityKWh || 5.12,
    count: 1,
    unitPriceUSD: price || (candidate?.capacityKWh ? candidate.capacityKWh * 160 : 850),
    dodPct: resolveBatteryDodPct(candidate?.dodPct),
    efficiencyPct: resolveBatteryEfficiencyPct(candidate?.batteryEfficiencyPct),
  } as GroupItem[K];
}

/** Campos que un modelo secundario toma del catálogo, más su precio (el del primer proveedor o el que ya tenía). */
function secondaryCatalogExtras(kind: EquipmentKind, item: SolarEquipmentItem, currentPrice: number | undefined): Record<string, unknown> {
  const unitPriceUSD = item.supplierPrices?.[0]?.priceUSD || currentPrice;
  if (kind === 'panel') return { ...catalogPanelGroupPatch(item), unitPriceUSD };
  if (kind === 'inverter') return { powerKW: item.powerKW || 5.0, unitPriceUSD };
  return { capacityKWh: item.capacityKWh || 5.12, unitPriceUSD, dodPct: resolveBatteryDodPct(item.dodPct), efficiencyPct: resolveBatteryEfficiencyPct(item.batteryEfficiencyPct) };
}

/** Cantidad en unidades enteras, mínimo 1: el Stepper acepta fracciones y los equipos no se cuentan en fracciones. */
export function wholeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1;
}

type CatalogLinkedGroup = { id?: string; catalogItemId?: string; manualModel?: boolean; brandModel?: string };
type CatalogLinkPatch = { catalogItemId?: string; manualModel?: true };

/** Nombre sin diferencias de mayúsculas, acentos ni espacios: «  panel  K 550 » es el mismo modelo que «Panel K 550». */
const normalizeModelName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/**
 * Identidad de catálogo que debe olvidar un grupo cuando su marca/modelo se reescribe a mano. Solo cambios de
 * mayúsculas, acentos o espacios conservan el vínculo; cualquier otro cambio (incluso de un carácter: 550 → 560)
 * puede ser otro modelo, y adjuntar la ficha técnica equivocada es peor que no adjuntar ninguna. El grupo queda con
 * `manualModel`, con lo que `resolveGroupCatalogItem` ya no lo resuelve por `catalogItemId` ni por `id`; el nombre exacto y
 * único de un equipo del catálogo lo revincula.
 */
function detachedCatalogIdentity(kind: EquipmentKind, group: CatalogLinkedGroup, brandModel: string, catalog: SolarEquipmentItem[]): CatalogLinkPatch {
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

export interface GroupActions<K extends EquipmentKind> {
  add: () => void;
  remove: (index: number) => void;
  update: (index: number, patch: Partial<GroupItem[K]>) => void;
  select: (index: number, item: SolarEquipmentItem) => void;
  setCount: (index: number, count: number) => void;
  setBrand: (index: number, brandModel: string) => void;
  setMagnitude: (index: number, value: number) => void;
}

/**
 * Acciones de un grupo de equipos. Todo cambio de lista y de cantidad pasa por `editEquipmentGroup`
 * (o `selectCatalogEquipment`, que lo usa) para que la lista y el espejo heredado no se desincronicen.
 */
export function createGroupActions<K extends EquipmentKind>(
  kind: K,
  specs: SystemSpecs,
  catalog: SolarEquipmentItem[],
  updateSpecs: (patch: Partial<SystemSpecs>) => void
): GroupActions<K> {
  const commit = (patch: Partial<SystemSpecs>) => {
    if (Object.keys(patch).length > 0) updateSpecs(patch);
  };
  const update = (index: number, patch: Partial<GroupItem[K]>) => commit(editEquipmentGroup(specs, kind, { type: 'update', index, patch }));
  const field = KIND_CONFIG[kind].magnitudeField;
  return {
    add: () => {
      const edit = editEquipmentGroup(specs, kind, { type: 'add', item: buildNewItem(kind, specs, catalog) });
      // Con varios modelos la cantidad de paneles ya no se calcula sola; una batería nueva implica «con batería».
      commit({ ...edit, ...(kind === 'panel' ? { autoCalculatePanels: false } : {}), ...(kind === 'battery' ? { hasBattery: true } : {}) });
    },
    remove: index => commit(editEquipmentGroup(specs, kind, { type: 'remove', index })),
    update,
    select: (index, item) => {
      if (index === 0) return commit(buildCatalogSelectionUpdate(specs, kind, item));
      const current = itemsOf(specs, kind)[index];
      commit(selectCatalogEquipment(specs, kind, index, item, secondaryCatalogExtras(kind, item, current?.unitPriceUSD) as Partial<GroupItem[K]>));
    },
    setCount: (index, count) => update(index, { count: wholeCount(count) } as Partial<GroupItem[K]>),
    setBrand: (index, brandModel) => {
      const group = itemsOf(specs, kind)[index];
      update(index, { brandModel, ...(group ? detachedCatalogIdentity(kind, group, brandModel, catalog) : {}) } as Partial<GroupItem[K]>);
    },
    setMagnitude: (index, value) => update(index, { [field]: value } as Partial<GroupItem[K]>),
  };
}

/** kW con un decimal si es exacto y dos si no («8.0», «7.68»). */
export function formatKW(value: number): string {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? value.toFixed(1) : value.toFixed(2);
}

/** Relación DC/AC; «—» sin potencia AC. */
export function formatDcAcRatio(dcKWp: number, acKW: number): string {
  return acKW > 0 ? (dcKWp / acKW).toFixed(2) : '—';
}
