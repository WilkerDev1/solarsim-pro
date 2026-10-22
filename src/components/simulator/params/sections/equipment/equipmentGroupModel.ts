import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import { catalogPanelGroupPatch } from '../../../../../utils/catalogGroupPatch';
import { editEquipmentGroup, selectCatalogEquipment, type EquipmentKind } from '../../../../../utils/equipmentGroups';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../../../../utils/equipmentSpecsUtils';
import { buildCatalogSelectionUpdate } from '../../logic/catalogSelection';

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
    manualBrandFallback: 'Módulos Canadian Solar CS6.1-72TB-600 (600W)',
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
    manualBrandFallback: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
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
    manualBrandFallback: 'Batería Hinaess 16 KwH-48 vdc.',
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
      brandModel: candidate?.displayName || 'Módulos JA Solar JAM66D45-630/LB (630W)',
      powerW: candidate?.powerW || 630,
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
  } as GroupItem[K];
}

/** Campos que un modelo secundario toma del catálogo, más su precio (el del primer proveedor o el que ya tenía). */
function secondaryCatalogExtras(kind: EquipmentKind, item: SolarEquipmentItem, currentPrice: number | undefined): Record<string, unknown> {
  const unitPriceUSD = item.supplierPrices?.[0]?.priceUSD || currentPrice;
  if (kind === 'panel') return { ...catalogPanelGroupPatch(item), unitPriceUSD };
  if (kind === 'inverter') return { powerKW: item.powerKW || 5.0, unitPriceUSD };
  return { capacityKWh: item.capacityKWh || 5.12, unitPriceUSD };
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
    setCount: (index, count) => update(index, { count } as Partial<GroupItem[K]>),
    setBrand: (index, brandModel) => update(index, { brandModel } as Partial<GroupItem[K]>),
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
