import type { Equipment, EquipmentGroups, EquipmentKind } from './types.js';

const LIST = { panel: 'panels', inverter: 'inverters', battery: 'batteries' } as const;
const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

export interface EquipmentTotals {
  panelCount: number;
  /** Potencia DC pico (kWp), a 3 decimales. */
  capacityKWp: number;
  inverterCount: number;
  /** Potencia nominal de inversores (kW), a 2 decimales. */
  inverterKW: number;
  batteryCount: number;
  /** Capacidad nominal del banco (kWh), a 2 decimales. No es energía útil. */
  batteryNominalKWh: number;
  /** Costo de equipos (US$) sin margen ni ITBIS: Σ cantidad × precio unitario, como la matriz de costos. */
  equipmentCostUSD: number;
  /** Cantidad de modelos (grupos) por tipo. */
  modelCount: Record<EquipmentKind, number>;
}

/**
 * Totales que consumen el motor, el servidor y los resúmenes. Reproducen las sumas históricas de
 * `equipmentSpecsUtils` y de la matriz de costos (inversores y baterías sin cantidad cuentan 1 en el costo;
 * un grupo sin precio aporta 0).
 *
 * TODO(candidato #1): la energía útil del banco (capacidad × DOD × eficiencia por grupo) no se calcula aquí;
 * vivirá en un único módulo de energía útil y no debe duplicarse en este.
 */
export function equipmentTotals(equipment: Equipment): EquipmentTotals {
  const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);
  const { panels, inverters, batteries } = equipment;
  return {
    panelCount: sum(panels, (p) => p.count || 0),
    capacityKWp: round(sum(panels, (p) => (p.powerW || 0) * (p.count || 0)) / 1000, 3),
    inverterCount: sum(inverters, (i) => i.count || 0),
    inverterKW: round(sum(inverters, (i) => (i.powerKW || 0) * (i.count || 0)), 2),
    batteryCount: sum(batteries, (b) => b.count || 0),
    batteryNominalKWh: round(sum(batteries, (b) => (b.capacityKWh || 0) * (b.count || 0)), 2),
    equipmentCostUSD:
      sum(panels, (p) => (p.count || 0) * (p.unitPriceUSD ?? 0)) +
      sum(inverters, (i) => (i.count ?? 1) * (i.unitPriceUSD ?? 0)) +
      sum(batteries, (b) => (b.count ?? 1) * (b.unitPriceUSD ?? 0)),
    modelCount: { panel: panels.length, inverter: inverters.length, battery: batteries.length },
  };
}

/** Nombre unificado cuando el modelo no trae marca/modelo. */
export const EQUIPMENT_FALLBACK_NAME: Record<EquipmentKind, string> = {
  panel: 'Módulos Monocristalinos Tier-1 TOPCon',
  inverter: 'Inversor Solar On-Grid / Híbrido',
  battery: 'Banco de Baterías de Litio LiFePO4',
};

const magnitudeOf = (kind: EquipmentKind, group: EquipmentGroups[EquipmentKind]): number => {
  const unit = kind === 'panel' ? (group as EquipmentGroups['panel']).powerW : kind === 'inverter' ? (group as EquipmentGroups['inverter']).powerKW : (group as EquipmentGroups['battery']).capacityKWh;
  return (Number(unit) || 0) * (Number(group.count) || 0);
};

/** Modelo principal: el de mayor cantidad × potencia (o capacidad); con empate, el primero. */
export function mainEquipmentGroup<K extends EquipmentKind>(equipment: Equipment, kind: K): EquipmentGroups[K] | undefined {
  const groups = equipment[LIST[kind]] as EquipmentGroups[K][];
  let main: EquipmentGroups[K] | undefined;
  let best = -Infinity;
  for (const group of groups) {
    const size = magnitudeOf(kind, group);
    if (size > best) { main = group; best = size; }
  }
  return main;
}

const modelKey = (name: string | undefined) => (name ?? '').trim().toLowerCase();

/**
 * Texto para frases y resúmenes: el modelo principal y, si hay más modelos distintos, «y N modelo(s) más».
 * Dos grupos con el mismo nombre cuentan como un modelo. Sin grupos devuelve `''`; un modelo sin nombre usa
 * `opts.fallback` o el nombre unificado de `EQUIPMENT_FALLBACK_NAME`. Las tablas listan todos los modelos y no usan esta función.
 */
export function describeEquipment(equipment: Equipment, kind: EquipmentKind, opts: { fallback?: string } = {}): string {
  const main = mainEquipmentGroup(equipment, kind);
  if (!main) return '';
  const name = main.brandModel?.trim() || opts.fallback || EQUIPMENT_FALLBACK_NAME[kind];
  const mainKey = modelKey(main.brandModel);
  const others = new Set((equipment[LIST[kind]] as EquipmentGroups[EquipmentKind][]).map((g) => modelKey(g.brandModel)).filter((key) => key !== mainKey));
  return others.size === 0 ? name : `${name} y ${others.size} ${others.size === 1 ? 'modelo' : 'modelos'} más`;
}
