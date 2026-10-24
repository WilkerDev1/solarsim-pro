import { LIST_KEY, type EquipmentGroups, type EquipmentKind, type LegacyEquipmentFields, type LegacySystemSpecs } from './types.js';

/**
 * Único lugar que conoce el «espejo heredado»: los campos sueltos de un solo modelo (`panelBrandModel`,
 * `panelCount`, …) que hasta 2.7.0 se escribían como copia del primer grupo. El resto del código debe
 * usar `readEquipment`/`editEquipment`, no estos campos.
 */

/** Campo del grupo → campo heredado, por tipo. */
export const MIRROR: { [K in EquipmentKind]: Partial<Record<keyof EquipmentGroups[K], keyof LegacyEquipmentFields>> } = {
  panel: { brandModel: 'panelBrandModel', powerW: 'panelPowerW', count: 'panelCount', unitPriceUSD: 'panelUnitPriceUSD', weightKilos: 'panelWeightKilos' },
  inverter: { brandModel: 'inverterBrandModel', powerKW: 'inverterPowerKW', count: 'inverterCount', unitPriceUSD: 'inverterUnitPriceUSD', weightKilos: 'inverterWeightKilos' },
  battery: { brandModel: 'batteryBrandModel', capacityKWh: 'batteryCapacityKWh', dodPct: 'batteryDOD', efficiencyPct: 'batteryEfficiencyPct', count: 'batteryCount', unitPriceUSD: 'batteryUnitPriceUSD', weightKilos: 'batteryWeightKilos' },
};

/** Campos sueltos que el módulo borra al migrar o editar. `selectedSupplierInfo` (por tipo) se trata aparte. */
export const LEGACY_MIRROR_FIELDS: readonly (keyof LegacyEquipmentFields)[] = [
  'panelBrandModel', 'panelPowerW', 'panelCount', 'panelUnitPriceUSD', 'panelWeightKilos',
  'inverterBrandModel', 'inverterPowerKW', 'inverterCount', 'inverterUnitPriceUSD', 'inverterWeightKilos',
  'batteryBrandModel', 'batteryCapacityKWh', 'batteryDOD', 'batteryEfficiencyPct', 'batteryCount', 'batteryUnitPriceUSD', 'batteryWeightKilos',
];

/** Campos de texto del espejo que el visor valida al recibir una publicación en el formato viejo (clientes 2.6.x/2.7.0). */
export const LEGACY_MIRROR_TEXT_FIELDS = ['panelBrandModel', 'inverterBrandModel', 'batteryBrandModel'] as const satisfies readonly (keyof LegacyEquipmentFields)[];
/** Campos numéricos del espejo que el visor valida al recibir una publicación en el formato viejo. */
export const LEGACY_MIRROR_NUMBER_FIELDS = ['panelCount', 'panelPowerW', 'inverterCount', 'inverterPowerKW', 'batteryCount', 'batteryCapacityKWh'] as const satisfies readonly (keyof LegacyEquipmentFields)[];

/** Precio unitario que la matriz de costos asume para un proyecto heredado sin precio propio. */
export const DEFAULT_UNIT_PRICE_USD: Record<EquipmentKind, number> = { panel: 103.32, inverter: 2300.0, battery: 1990.0 };

type GroupSupplier = EquipmentGroups[EquipmentKind]['selectedSupplierInfo'];
const supplierOf = (specs: LegacySystemSpecs, kind: EquipmentKind): GroupSupplier => {
  const saved = specs.selectedSupplierInfo?.[kind];
  return saved ? { supplierName: saved.supplierName, priceUSD: saved.priceUSD, updatedAt: saved.updatedAt, supplierPriceId: saved.supplierPriceId } : undefined;
};

/**
 * Grupo sintetizado desde los campos sueltos (sin precio por defecto). Es la derivación histórica de
 * `getProjectPanels/Inverters/Batteries`: los valores de reserva se conservan tal cual.
 */
export function deriveLegacyGroup<K extends EquipmentKind>(specs: LegacySystemSpecs, kind: K): EquipmentGroups[K] {
  if (kind === 'panel') {
    return {
      id: 'primary-panel',
      brandModel: specs.panelBrandModel || 'Módulo Canadian Solar TOPBiHiKu6 620W',
      powerW: specs.panelPowerW || 620,
      count: specs.panelCount || 0,
      unitPriceUSD: specs.panelUnitPriceUSD,
      weightKilos: specs.panelWeightKilos,
      efficiencyPct: specs.panelEfficiency,
      tempCoeff: specs.tempCoeff,
      annualDegradation: specs.annualDegradation,
      selectedSupplierInfo: supplierOf(specs, 'panel'),
    } as EquipmentGroups[K];
  }
  if (kind === 'inverter') {
    return {
      id: 'primary-inverter',
      brandModel: specs.inverterBrandModel || 'Inversor Solar Inteligente',
      powerKW: specs.inverterPowerKW || 8,
      count: specs.inverterCount !== undefined ? specs.inverterCount : 1,
      unitPriceUSD: specs.inverterUnitPriceUSD,
      weightKilos: specs.inverterWeightKilos,
      efficiencyPct: specs.inverterEfficiencyPct,
      selectedSupplierInfo: supplierOf(specs, 'inverter'),
    } as EquipmentGroups[K];
  }
  return {
    id: 'primary-battery',
    brandModel: specs.batteryBrandModel || 'Batería de Litio LiFePO4',
    capacityKWh: specs.batteryCapacityKWh || 16.08,
    count: specs.batteryCount !== undefined ? specs.batteryCount : 1,
    unitPriceUSD: specs.batteryUnitPriceUSD,
    weightKilos: specs.batteryWeightKilos,
    dodPct: specs.batteryDOD, // vacío permitido: el motor aplica el default (shared/projectDefaults)
    efficiencyPct: specs.batteryEfficiencyPct,
    lifespanYears: specs.batteryLifespanYears || 10,
    replacementCostUSD: specs.batteryReplacementCostUSD,
    selectedSupplierInfo: supplierOf(specs, 'battery'),
  } as EquipmentGroups[K];
}

/** Grupos guardados del tipo, o `undefined` si no hay (lista ausente o vacía). */
export function savedGroups<K extends EquipmentKind>(specs: LegacySystemSpecs, kind: K): EquipmentGroups[K][] | undefined {
  const saved = specs[LIST_KEY[kind]];
  return Array.isArray(saved) && saved.length > 0 ? (saved as EquipmentGroups[K][]) : undefined;
}

/** Grupo heredado con el precio por defecto de la matriz de costos, que se fija al volverse explícito. */
export function deriveLegacyGroupWithPrice<K extends EquipmentKind>(specs: LegacySystemSpecs, kind: K): EquipmentGroups[K] {
  const group = deriveLegacyGroup(specs, kind);
  return { ...group, unitPriceUSD: group.unitPriceUSD ?? DEFAULT_UNIT_PRICE_USD[kind] };
}

/** ¿Los campos sueltos de batería traen información propia (no solo los valores de reserva)? */
export function hasLegacyBatteryData(specs: LegacySystemSpecs): boolean {
  return Boolean(
    specs.batteryBrandModel || (specs.batteryCapacityKWh ?? 0) > 0 || (specs.batteryCount ?? 0) > 0 ||
    specs.batteryUnitPriceUSD !== undefined || specs.batteryWeightKilos !== undefined ||
    specs.batteryDOD !== undefined || specs.batteryEfficiencyPct !== undefined || specs.selectedSupplierInfo?.battery
  );
}

/** Copia de `specs` sin ningún campo heredado (incluido el proveedor por tipo). */
export function withoutMirror<S extends LegacySystemSpecs>(specs: S): S {
  const next: Record<string, unknown> = { ...(specs as Record<string, unknown>) };
  for (const field of LEGACY_MIRROR_FIELDS) delete next[field];
  delete next.selectedSupplierInfo;
  return next as unknown as S;
}

/** ¿Queda algún campo heredado (aunque sea con valor `undefined`) en `specs`? */
export function hasMirror(specs: LegacySystemSpecs): boolean {
  return 'selectedSupplierInfo' in specs || LEGACY_MIRROR_FIELDS.some((field) => field in specs);
}
