/**
 * Reglas de la lista de equipos del dock, ahora en el dominio (F2b; ADR 0004, «Reglas del dock en el dominio»). Puras: el dock
 * (`createGroupActions`) y la transacción (`editIntents.ts`) arman con ellas el mismo parche de specs, así «elige este panel
 * del catálogo» por ruta deja el mismo proyecto que elegirlo en el selector.
 *
 * - Elegir un modelo del catálogo: el grupo toma la identidad del catálogo (fichas anexas), sus campos y su precio del
 *   resolvedor único (oferta preferida o la más barata utilizable → precio genérico → sin precio; ADR 0006 §5); en el modelo
 *   principal también los parámetros del panel del sistema; con precio a mano se conserva el proveedor que siga cotizando.
 * - «+»: un modelo nuevo (el primero del catálogo distinto del principal, o uno por defecto) con su precio.
 * - Quitar, cantidad entera (mínimo 1), marca y magnitud a mano (la marca suelta o toma la identidad del catálogo).
 */
import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, SystemSpecs } from '../../types';
import type { SolarEquipmentItem } from '../../types/equipment';
import { catalogPanelGroupPatch } from '../../utils/catalogGroupPatch';
import { detachedCatalogIdentity, editEquipmentGroup, selectCatalogEquipment, type EquipmentKind } from '../../utils/equipmentGroups';
import { LIST_KEY, migrateLegacySpecs, readEquipment } from '../../../shared/equipment';
import { resolveAutoPrice, type GenericPriceInfo } from '../../../shared/equipmentPrices';
import { DEFAULT_BATTERY_CAPACITY_KWH, resolveBatteryDodPct, resolveBatteryEfficiencyPct } from '../../../shared/projectDefaults';

type SupplierInfo = PanelItemSpec['selectedSupplierInfo'];
type GroupItem = { panel: PanelItemSpec; inverter: InverterItemSpec; battery: BatteryItemSpec };

/** Valores que toma un panel del catálogo al que le faltan datos (`||`). */
export const DEFAULT_CATALOG_PANEL = { powerW: 550, efficiencyPct: 22, tempCoeff: -0.29, annualDegradation: 0.4 } as const;
/** Potencia (kW) de un inversor del catálogo sin potencia (`||`). */
export const DEFAULT_CATALOG_INVERTER_KW = 8;

/** Precio genérico efectivo de un equipo, o nada. Sin sesión (modo local) el llamador pasa `undefined`: la función está apagada. */
export type GenericPriceLookup = (equipmentId: string) => GenericPriceInfo | null | undefined;

/** Campo de la magnitud de cada tipo (potencia del panel o del inversor, capacidad de la batería). */
export const MAGNITUDE_FIELD = { panel: 'powerW', inverter: 'powerKW', battery: 'capacityKWh' } as const;

/**
 * Campos de precio de un grupo al elegir un modelo (ADR 0006 §5), con el resolvedor único `resolveAutoPrice`: oferta
 * utilizable (preferida o la más barata) → precio genérico (copia en `genericPriceInfo`, sin proveedor) → sin precio. Cada
 * campo se escribe siempre (también `undefined`): elegir otro modelo nunca arrastra precio, proveedor ni copia del anterior.
 * `kind: 'none'` deja al llamador decidir el respaldo (p. ej. la estimación de «+»).
 */
export function autoPriceFields(item: SolarEquipmentItem, generic: GenericPriceInfo | null | undefined): { kind: 'supplier' | 'generic' | 'none'; fields: Record<string, unknown> } {
  const price = resolveAutoPrice(item, generic);
  if (price?.kind === 'supplier') {
    const offer = price.offer;
    return { kind: 'supplier', fields: { unitPriceUSD: offer.priceUSD, priceSource: 'supplier', genericPriceInfo: undefined,
      selectedSupplierInfo: { supplierName: offer.supplierName, priceUSD: offer.priceUSD, updatedAt: offer.updatedAt, supplierPriceId: offer.id } } };
  }
  if (price?.kind === 'generic') {
    return { kind: 'generic', fields: { unitPriceUSD: price.priceUSD, priceSource: 'generic', genericPriceInfo: { ...price.generic }, selectedSupplierInfo: undefined } };
  }
  return { kind: 'none', fields: { unitPriceUSD: undefined, priceSource: undefined, genericPriceInfo: undefined, selectedSupplierInfo: undefined } };
}

/** Parámetros del sistema y campos del grupo que escribe una selección del catálogo, por tipo. */
const SELECTION: Record<EquipmentKind, { system: (item: SolarEquipmentItem) => Partial<SystemSpecs>; group: (item: SolarEquipmentItem) => Record<string, unknown> }> = {
  panel: {
    system: (item) => ({
      panelEfficiency: item.efficiencyPct || DEFAULT_CATALOG_PANEL.efficiencyPct,
      tempCoeff: item.tempCoeff || DEFAULT_CATALOG_PANEL.tempCoeff,
      annualDegradation: item.annualDegradation || DEFAULT_CATALOG_PANEL.annualDegradation,
    }),
    // Los valores propios del modelo (degradación, eficiencia…) se reemplazan, nunca se heredan del anterior.
    group: (item) => ({ ...catalogPanelGroupPatch(item), powerW: item.powerW || DEFAULT_CATALOG_PANEL.powerW }),
  },
  inverter: {
    system: () => ({}),
    group: (item) => ({ powerKW: item.powerKW || DEFAULT_CATALOG_INVERTER_KW }),
  },
  battery: {
    system: () => ({}),
    group: (item) => ({
      capacityKWh: item.capacityKWh || DEFAULT_BATTERY_CAPACITY_KWH,
      dodPct: resolveBatteryDodPct(item.dodPct),
      efficiencyPct: resolveBatteryEfficiencyPct(item.batteryEfficiencyPct),
    }),
  },
};

/**
 * Parche de specs al elegir un modelo del catálogo como panel, inversor o batería principal (edición del grupo, nunca del
 * espejo). Con precio a mano se conserva el proveedor ya elegido que siga cotizando este modelo (con el precio del grupo);
 * si no, el precio sale del resolvedor único: oferta utilizable → genérico (`generic`, solo con sesión) → sin precio. El
 * precio del modelo anterior nunca se arrastra.
 */
export function buildCatalogSelectionUpdate(specs: SystemSpecs, kind: EquipmentKind, item: SolarEquipmentItem, generic?: GenericPriceInfo | null): Partial<SystemSpecs> {
  const { system, group } = SELECTION[kind];
  const suppliers = item.supplierPrices || [];
  const chosen: SupplierInfo = migrateLegacySpecs(specs)[LIST_KEY[kind]]?.[0]?.selectedSupplierInfo;
  const match = !specs.autoSupplierPricing && chosen
    ? suppliers.find((sp) => sp.id === chosen.supplierPriceId || sp.supplierName.toLowerCase().trim() === chosen.supplierName?.toLowerCase().trim())
    : undefined;
  const price = match
    ? { selectedSupplierInfo: { supplierName: match.supplierName, priceUSD: match.priceUSD, updatedAt: match.updatedAt, supplierPriceId: match.id } }
    : autoPriceFields(item, generic).fields;

  // El grupo principal toma la identidad del catálogo (catalogItemId para las fichas), sus campos, precio y proveedor.
  return {
    ...system(item),
    ...selectCatalogEquipment(specs, kind, 0, item, { ...group(item), ...price }),
  };
}

function itemsOf(specs: SystemSpecs, kind: EquipmentKind): Array<GroupItem[EquipmentKind]> {
  return readEquipment(specs)[LIST_KEY[kind]];
}

/** Campos de precio de `autoPriceFields` sin `unitPriceUSD` (que «+» resuelve con su estimación) y sin claves vacías. */
function withoutPrice(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => key !== 'unitPriceUSD' && value !== undefined));
}

/**
 * Modelo nuevo para «+»: el primer equipo del catálogo distinto del principal, o un valor por defecto. Su precio sale del
 * resolvedor único (oferta → genérico, ADR 0006) y, sin ninguno, de la estimación por W/kW/kWh.
 */
export function buildNewItem<K extends EquipmentKind>(kind: K, specs: SystemSpecs, catalog: readonly SolarEquipmentItem[], now: number, genericFor?: GenericPriceLookup): GroupItem[K] {
  const current = itemsOf(specs, kind)[0]?.brandModel;
  const candidate = catalog.find(entry => entry.type === kind && entry.displayName !== current);
  const auto = candidate ? autoPriceFields(candidate, genericFor?.(candidate.id)) : undefined;
  const priced = auto && auto.kind !== 'none' ? auto.fields : {};
  const price = priced.unitPriceUSD as number | undefined;
  if (kind === 'panel') {
    return {
      id: `panel-${now}`,
      catalogItemId: candidate?.id,
      // Con catálogo, los campos propios del modelo (degradación, eficiencia…) salen del mismo parche que la selección.
      ...(candidate ? catalogPanelGroupPatch(candidate) : { brandModel: 'Módulos JA Solar JAM66D45-630/LB (630W)', powerW: 630 }),
      count: 10,
      unitPriceUSD: price || (candidate?.powerW ? candidate.powerW * 0.17 : 105),
      ...withoutPrice(priced),
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
      ...withoutPrice(priced),
    } as GroupItem[K];
  }
  return {
    id: `battery-${now}`,
    catalogItemId: candidate?.id,
    brandModel: candidate?.displayName || 'Batería Dyness A48100 (5.12 kWh)',
    capacityKWh: candidate?.capacityKWh || 5.12,
    count: 1,
    unitPriceUSD: price || (candidate?.capacityKWh ? candidate.capacityKWh * 160 : 850),
    ...withoutPrice(priced),
    dodPct: resolveBatteryDodPct(candidate?.dodPct),
    efficiencyPct: resolveBatteryEfficiencyPct(candidate?.batteryEfficiencyPct),
  } as GroupItem[K];
}

/**
 * Campos que un modelo secundario toma del catálogo, más su precio del resolvedor único (oferta → genérico → sin precio);
 * nunca el precio del modelo anterior.
 */
function secondaryCatalogExtras(kind: EquipmentKind, item: SolarEquipmentItem, generic: ReturnType<GenericPriceLookup>): Record<string, unknown> {
  const price = autoPriceFields(item, generic).fields;
  if (kind === 'panel') return { ...catalogPanelGroupPatch(item), ...price };
  if (kind === 'inverter') return { powerKW: item.powerKW || 5.0, ...price };
  return { capacityKWh: item.capacityKWh || 5.12, ...price, dodPct: resolveBatteryDodPct(item.dodPct), efficiencyPct: resolveBatteryEfficiencyPct(item.batteryEfficiencyPct) };
}

/** Cantidad en unidades enteras, mínimo 1: el Stepper acepta fracciones y los equipos no se cuentan en fracciones. */
export function wholeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1;
}

// ── Parches de la lista (los mismos que arma «createGroupActions» del dock) ─────────────────────

/** «+»: añade un modelo; con varios paneles la cantidad ya no se calcula sola, y una batería nueva implica «con batería». */
export function groupAddPatch(kind: EquipmentKind, specs: SystemSpecs, catalog: readonly SolarEquipmentItem[], now: number, genericFor?: GenericPriceLookup): Partial<SystemSpecs> {
  const edit = editEquipmentGroup(specs, kind, { type: 'add', item: buildNewItem(kind, specs, catalog, now, genericFor) });
  return { ...edit, ...(kind === 'panel' ? { autoCalculatePanels: false } : {}), ...(kind === 'battery' ? { hasBattery: true } : {}) };
}

export const groupRemovePatch = (kind: EquipmentKind, specs: SystemSpecs, index: number): Partial<SystemSpecs> =>
  editEquipmentGroup(specs, kind, { type: 'remove', index });

export const groupUpdatePatch = <K extends EquipmentKind>(kind: K, specs: SystemSpecs, index: number, patch: Partial<GroupItem[K]>): Partial<SystemSpecs> =>
  editEquipmentGroup(specs, kind, { type: 'update', index, patch });

/** Elegir un modelo del catálogo en la fila `index` (la 0 es el modelo principal, con sus parámetros del sistema). */
export function groupSelectPatch(kind: EquipmentKind, specs: SystemSpecs, index: number, item: SolarEquipmentItem, generic?: GenericPriceInfo | null): Partial<SystemSpecs> {
  if (index === 0) return buildCatalogSelectionUpdate(specs, kind, item, generic);
  return selectCatalogEquipment(specs, kind, index, item, secondaryCatalogExtras(kind, item, generic) as never);
}

/** Marca y modelo a mano: el grupo suelta la identidad del catálogo, o toma la del equipo con ese nombre exacto. */
export function groupBrandPatch(kind: EquipmentKind, specs: SystemSpecs, index: number, brandModel: string, catalog: readonly SolarEquipmentItem[]): Partial<SystemSpecs> {
  const group = itemsOf(specs, kind)[index];
  return groupUpdatePatch(kind, specs, index, { brandModel, ...(group ? detachedCatalogIdentity(kind, group, brandModel, catalog as SolarEquipmentItem[], catalog.length > 0) : {}) } as never);
}

export const groupCountPatch = (kind: EquipmentKind, specs: SystemSpecs, index: number, count: number): Partial<SystemSpecs> =>
  groupUpdatePatch(kind, specs, index, { count: wholeCount(count) } as never);

export const groupMagnitudePatch = (kind: EquipmentKind, specs: SystemSpecs, index: number, value: number): Partial<SystemSpecs> =>
  groupUpdatePatch(kind, specs, index, { [MAGNITUDE_FIELD[kind]]: value } as never);
