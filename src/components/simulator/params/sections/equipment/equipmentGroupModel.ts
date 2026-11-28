import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import type { EquipmentKind } from '../../../../../utils/equipmentGroups';
import { readEquipment } from '../../../../../../shared/equipment';
import {
  buildNewItem as buildDomainNewItem, groupAddPatch, groupBrandPatch, groupCountPatch, groupMagnitudePatch, groupRemovePatch, groupSelectPatch,
  groupUpdatePatch, type GenericPriceLookup,
} from '../../../../../domain/rules/equipmentRules';
import { MANUAL_BRAND_PLACEHOLDER } from '../../logic/dockDefaults';

/** Las reglas de la lista (catálogo, «+», quitar, cantidad, marca y magnitud) viven en el dominio desde F2b. */
export { wholeCount } from '../../../../../domain/rules/equipmentRules';

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
  return readEquipment(specs)[LIST_KEY[kind]];
}

const LIST_KEY = { panel: 'panels', inverter: 'inverters', battery: 'batteries' } as const;

export function groupViews(specs: SystemSpecs, kind: EquipmentKind): GroupModelView[] {
  const field = KIND_CONFIG[kind].magnitudeField;
  return itemsOf(specs, kind).map((item, index) => ({
    key: item.id || String(index),
    brandModel: item.brandModel,
    magnitude: (item as unknown as Record<MagnitudeField, number>)[field],
    count: item.count,
  }));
}

/** Modelo nuevo para «+» (regla del dominio, `buildNewItem` de `equipmentRules`); `now` da el id del grupo. */
export function buildNewItem<K extends EquipmentKind>(kind: K, specs: SystemSpecs, catalog: SolarEquipmentItem[], now: number = Date.now(), genericFor?: GenericPriceLookup): GroupItem[K] {
  return buildDomainNewItem(kind, specs, catalog, now, genericFor);
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
 * (o `selectCatalogEquipment`, que lo usa) (el espejo heredado nunca se escribe). `genericFor` da el precio genérico
 * efectivo de un equipo al elegirlo o añadirlo; sin sesión no se pasa y no hay genérico.
 */
export function createGroupActions<K extends EquipmentKind>(
  kind: K,
  specs: SystemSpecs,
  catalog: SolarEquipmentItem[],
  updateSpecs: (patch: Partial<SystemSpecs>) => void,
  genericFor?: GenericPriceLookup
): GroupActions<K> {
  const commit = (patch: Partial<SystemSpecs>) => {
    if (Object.keys(patch).length > 0) updateSpecs(patch);
  };
  return {
    add: () => commit(groupAddPatch(kind, specs, catalog, Date.now(), genericFor)),
    remove: index => commit(groupRemovePatch(kind, specs, index)),
    update: (index, patch) => commit(groupUpdatePatch(kind, specs, index, patch)),
    select: (index, item) => commit(groupSelectPatch(kind, specs, index, item, genericFor?.(item.id))),
    setCount: (index, count) => commit(groupCountPatch(kind, specs, index, count)),
    setBrand: (index, brandModel) => commit(groupBrandPatch(kind, specs, index, brandModel, catalog)),
    setMagnitude: (index, value) => commit(groupMagnitudePatch(kind, specs, index, value)),
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
