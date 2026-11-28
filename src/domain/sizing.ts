/**
 * Dimensionado del sistema (F2b; ADR 0009). Funciones puras: paneles, inversor por relación DC/AC objetivo, banco de
 * baterías y elección de equipo con su precio. Los supuestos viven en UN solo sitio (`SIZING_ASSUMPTIONS`) y cada resultado
 * dice cuáles usó (`assumptions`), para que la interfaz, el asistente y el PDF los puedan citar.
 *
 * El motor sigue siendo el que recomienda la cantidad de paneles (`calculateRecommendedPanelCount`); este módulo decide con
 * qué consumo se le pide (la base de dimensionado) y es su único llamador fuera del motor (guarda del ADR 0004): el resto
 * dimensiona con `recommendPanelCount` y lee el rendimiento específico con `annualSpecificYieldKWhPerKWp`. La energía
 * útil del banco sale solo de `batteryBank` (ADR 0002): aquí se busca la cantidad, nunca se copia la fórmula.
 */
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { batteryBank, readEquipment } from '../../shared/equipment';
import { resolveAutoPrice, usableOffers, type GenericPriceInfo } from '../../shared/equipmentPrices';
import type { SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import type { EquipmentKind } from '../../shared/equipment';

/** Base con que se dimensionan los paneles: `average` = consumo real del año (lo heredado); `peak_month` = 12 × mes pico. */
export type SizingBasis = 'average' | 'peak_month';
export type BatterySizingRule = 'peak_daily_fraction' | 'night_profile';

/**
 * Supuestos del dimensionado. Cambiar uno aquí cambia el dimensionado de las propuestas NUEVAS y de lo que se dimensione
 * con estas funciones; lo guardado no cambia al abrirlo (la base vive en la propuesta, `specs.sizingBasis`).
 */
export const SIZING_ASSUMPTIONS = {
  /**
   * Base de las propuestas nuevas. Decisión del dueño: el sistema se dimensiona como si el mes de MAYOR consumo del año
   * fuera el promedio (consumo anual de diseño = 12 × mes pico), para dejar holgura.
   */
  newProposalBasis: 'peak_month' as SizingBasis,
  /** Base de lo guardado sin el campo: el consumo real del año, como siempre. */
  legacyBasis: 'average' as SizingBasis,
  /**
   * Desempate del «mes pico» cuando varios meses tienen el mismo consumo: el de mayor consumo DIARIO (el mes con menos días).
   * Con doce meses iguales (el consumo estimado de fábrica) es febrero, el más exigente para la batería (1.000 / 28 días).
   * Supuesto del equipo de desarrollo: se confirma con el dueño junto con la regla del 75 %.
   */
  peakMonthTieBreak: 'highest_daily' as const,
  /**
   * Relación DC/AC objetivo (kWp de paneles por kW de inversor). 1,20 es un supuesto de diseño del equipo de desarrollo, no
   * una decisión del dueño: se cambia aquí o por parámetro (`targetRatio`).
   */
  targetDcAcRatio: 1.2,
  battery: {
    /**
     * Regla por defecto (propuesta, pendiente de que el dueño la confirme con su jefe): el banco debe durar toda la noche con
     * consumo intensivo, así que su energía ÚTIL (con profundidad de descarga y eficiencia) cubre este porcentaje del
     * consumo diario del mes pico (kWh del mes pico / días de ese mes).
     */
    activeRule: 'peak_daily_fraction' as BatterySizingRule,
    peakDailyFraction: 0.75,
    /**
     * Alternativa preparada y SIN activar (`rule: 'night_profile'`): la noche real según el perfil horario (la parte del
     * consumo diario fuera del consumo diurno) más este margen.
     */
    nightProfileMargin: 0.25,
  },
} as const;

/** Supuesto usado por un resultado, para citarlo. */
export interface SizingAssumptionUsed {
  key: string;
  label: string;
  value: string | number;
}

/** Días de cada mes (año no bisiesto), los mismos que usa el motor. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Base guardada en la propuesta; lo que no es una base conocida (o falta) es la heredada. */
export function resolveSizingBasis(specs: Pick<SystemSpecs, 'sizingBasis'> | undefined): SizingBasis {
  return specs?.sizingBasis === 'peak_month' ? 'peak_month' : SIZING_ASSUMPTIONS.legacyBasis;
}

export interface DesignConsumption {
  basis: SizingBasis;
  /** Los doce meses con que se dimensiona. */
  monthly: number[];
  annualKWh: number;
  /** Mes de mayor consumo (0 = enero) y su consumo; ante empate, `SIZING_ASSUMPTIONS.peakMonthTieBreak`. */
  peakMonthIndex: number;
  peakMonthKWh: number;
}

/** Consumo de diseño según la base. Valores no finitos o negativos cuentan como 0. */
export function designConsumption(monthlyConsumption: readonly number[], basis: SizingBasis): DesignConsumption {
  const months = Array.from({ length: 12 }, (_, i) => (finite(monthlyConsumption[i]) ? Math.max(0, monthlyConsumption[i]) : 0));
  let peakMonthIndex = 0;
  months.forEach((value, i) => {
    const best = months[peakMonthIndex];
    if (value > best || (value === best && value / DAYS_IN_MONTH[i] > best / DAYS_IN_MONTH[peakMonthIndex])) peakMonthIndex = i;
  });
  const peakMonthKWh = months[peakMonthIndex];
  const monthly = basis === 'peak_month' ? Array(12).fill(peakMonthKWh) : months;
  return { basis, monthly, annualKWh: monthly.reduce((sum, value) => sum + value, 0), peakMonthIndex, peakMonthKWh };
}

const BASIS_LABEL: Record<SizingBasis, string> = { average: 'Consumo real del año', peak_month: 'Mes de mayor consumo como promedio (12 × mes pico)' };

export interface PanelSizingInput {
  province: string;
  monthlyConsumption: readonly number[];
  panelPowerW: number;
  /** Cobertura ya resuelta (`resolveAssumption('targetCoveragePct', …)`). */
  coveragePct: number;
  /** Sin dato, el valor resuelto del motor (ADR 0003). */
  lossesPct: number | undefined;
  customMonthlyHSP?: number[];
  basis: SizingBasis;
}

export interface PanelSizing {
  count: number;
  capacityKWp: number;
  annualSpecificYieldKWhPerKWp: number;
  designAnnualKWh: number;
  targetAnnualKWh: number;
  basis: SizingBasis;
  assumptions: SizingAssumptionUsed[];
}

/** Cantidad de paneles que recomienda el motor para el consumo de diseño. */
export function recommendPanelCount(input: PanelSizingInput): PanelSizing {
  const design = designConsumption(input.monthlyConsumption, input.basis);
  // La base heredada pasa el consumo tal cual (también si no tiene doce meses): exactamente lo que hacía la edición.
  const consumption = input.basis === 'average' ? [...input.monthlyConsumption] : design.monthly;
  const rec = calculateRecommendedPanelCount(input.province, consumption, input.panelPowerW, input.coveragePct, input.lossesPct, input.customMonthlyHSP);
  return {
    count: rec.recommendedPanelCount,
    capacityKWp: rec.recommendedCapacityKWp,
    annualSpecificYieldKWhPerKWp: rec.annualSpecificYieldKWhPerKWp,
    designAnnualKWh: input.basis === 'average' ? consumption.reduce((sum, value) => sum + (Number(value) || 0), 0) : design.annualKWh,
    targetAnnualKWh: rec.targetAnnualKWh,
    basis: input.basis,
    assumptions: [
      { key: 'sizingBasis', label: BASIS_LABEL[input.basis], value: input.basis },
      { key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: input.coveragePct },
    ],
  };
}

export interface InverterSizing {
  count: number;
  /** Potencia AC que pide la relación objetivo. */
  targetAcKW: number;
  /** Potencia AC instalada y la relación DC/AC que resulta. */
  acKW: number;
  dcAcRatio: number;
  targetRatio: number;
  assumptions: SizingAssumptionUsed[];
}

/**
 * Rendimiento específico anual (kWh por kWp instalado) de la provincia, con pérdidas y HSP propios. Depende solo del sitio,
 * no del consumo ni del panel: es el dato que el borrador de IA y sus pantallas leen para dimensionar o estimar producción.
 */
export function annualSpecificYieldKWhPerKWp(province: string, lossesPct?: number, customMonthlyHSP?: number[]): number {
  return calculateRecommendedPanelCount(province, Array(12).fill(0), 620, undefined, lossesPct, customMonthlyHSP).annualSpecificYieldKWhPerKWp;
}

/** Inversores de `unitPowerKW` para `dcKWp` de paneles con la relación DC/AC objetivo (mínimo uno si hay paneles). */
export function recommendInverterCount(input: { dcKWp: number; unitPowerKW: number; targetRatio?: number }): InverterSizing {
  const targetRatio = input.targetRatio ?? SIZING_ASSUMPTIONS.targetDcAcRatio;
  const assumptions = [{ key: 'targetDcAcRatio', label: 'Relación DC/AC objetivo', value: targetRatio }];
  if (!(input.dcKWp > 0) || !(input.unitPowerKW > 0) || !(targetRatio > 0)) return { count: 0, targetAcKW: 0, acKW: 0, dcAcRatio: 0, targetRatio, assumptions };
  const targetAcKW = input.dcKWp / targetRatio;
  // Tolerancia de coma flotante: 20 kW / 10 kW son 2 inversores, no 3.
  const count = Math.max(1, Math.ceil(targetAcKW / input.unitPowerKW - 1e-9));
  const acKW = count * input.unitPowerKW;
  return { count, targetAcKW, acKW, dcAcRatio: input.dcKWp / acKW, targetRatio, assumptions };
}

/** Una unidad de batería: capacidad nominal y, si los tiene, su DOD y eficiencia (si no, los de fábrica del banco). */
export interface BatteryUnit {
  capacityKWh: number;
  dodPct?: number;
  efficiencyPct?: number;
}

export interface BatterySizing {
  count: number;
  rule: BatterySizingRule;
  /** Energía útil que exige la regla y la que da el banco recomendado. */
  requiredKWh: number;
  usableKWh: number;
  assumptions: SizingAssumptionUsed[];
}

/** Consumo diario del mes pico (kWh/día). */
function peakDailyKWh(monthlyConsumption: readonly number[]): number {
  const design = designConsumption(monthlyConsumption, 'average');
  return design.peakMonthKWh / DAYS_IN_MONTH[design.peakMonthIndex];
}

/** Alternativa sin activar: la noche real del perfil horario (consumo diario fuera del diurno) más el margen. */
export function nightProfileBatteryRequirementKWh(input: { monthlyConsumption: readonly number[]; daytimeLoadRatioPct: number }): number {
  const nightShare = 1 - Math.min(100, Math.max(0, input.daytimeLoadRatioPct)) / 100;
  return peakDailyKWh(input.monthlyConsumption) * nightShare * (1 + SIZING_ASSUMPTIONS.battery.nightProfileMargin);
}

/** Energía útil de `count` unidades, de `batteryBank` (la única fórmula del banco; ADR 0002). */
function usableOf(unit: BatteryUnit, count: number): number {
  const group = { id: 'sizing', brandModel: 'sizing', capacityKWh: unit.capacityKWh, dodPct: unit.dodPct, efficiencyPct: unit.efficiencyPct, count };
  return batteryBank(readEquipment({ hasBattery: true, batteries: [group] } as SystemSpecs)).usableKWh;
}

/** Unidades de batería necesarias para la regla (por defecto la activa). Sin consumo o sin capacidad, 0. */
export function recommendBatteryCount(input: { unit: BatteryUnit; monthlyConsumption: readonly number[]; rule?: BatterySizingRule; daytimeLoadRatioPct?: number }): BatterySizing {
  const rule = input.rule ?? SIZING_ASSUMPTIONS.battery.activeRule;
  const assumptions: SizingAssumptionUsed[] = rule === 'night_profile'
    ? [{ key: 'nightProfileMargin', label: 'Noche real del perfil horario + margen', value: SIZING_ASSUMPTIONS.battery.nightProfileMargin }]
    : [{ key: 'peakDailyFraction', label: 'Energía útil sobre el consumo diario del mes pico', value: SIZING_ASSUMPTIONS.battery.peakDailyFraction }];
  assumptions.push({ key: 'peakMonthTieBreak', label: 'Mes pico ante empate: el de mayor consumo diario', value: SIZING_ASSUMPTIONS.peakMonthTieBreak });
  const requiredKWh = rule === 'night_profile'
    ? nightProfileBatteryRequirementKWh({ monthlyConsumption: input.monthlyConsumption, daytimeLoadRatioPct: input.daytimeLoadRatioPct ?? 0 })
    : peakDailyKWh(input.monthlyConsumption) * SIZING_ASSUMPTIONS.battery.peakDailyFraction;
  const perUnit = usableOf(input.unit, 1);
  if (!(requiredKWh > 0) || !(perUnit > 0)) return { count: 0, rule, requiredKWh: Math.max(0, requiredKWh || 0), usableKWh: 0, assumptions };
  // Estimación por unidad y comprobación con el banco entero (el banco pondera por capacidad: con unidades iguales es lineal).
  let count = Math.max(1, Math.ceil(requiredKWh / perUnit - 1e-9));
  for (let guard = 0; guard < 1000 && usableOf(input.unit, count) + 1e-9 < requiredKWh; guard++) count++;
  for (let guard = 0; guard < 1000 && count > 1 && usableOf(input.unit, count - 1) + 1e-9 >= requiredKWh; guard++) count--;
  return { count, rule, requiredKWh, usableKWh: usableOf(input.unit, count), assumptions };
}

// ── Elección de equipo ──────────────────────────────────────────────────────────────────────

export interface EquipmentPriceChoice {
  kind: 'supplier' | 'generic' | 'none';
  priceUSD?: number;
  /** Texto para citar el precio («oferta de X», «precio genérico, sin proveedor», «sin precio»). */
  label: string;
  offerId?: string;
  supplierName?: string;
  generic?: GenericPriceInfo;
}

export interface EquipmentChoice {
  item?: SolarEquipmentItem;
  price: EquipmentPriceChoice;
  /** Por qué se eligió este equipo. */
  reason: string;
}

const MAGNITUDE: Record<EquipmentKind, (item: SolarEquipmentItem) => number> = {
  panel: (item) => (item.powerW ?? 0),
  inverter: (item) => (item.powerKW ?? 0) * 1000,
  battery: (item) => item.capacityKWh ?? 0,
};

/** Precio de un equipo con el resolvedor único (oferta preferida → la más barata utilizable → genérico → nada). */
export function equipmentPrice(item: SolarEquipmentItem, genericFor?: (id: string) => GenericPriceInfo | null | undefined): EquipmentPriceChoice {
  const price = resolveAutoPrice(item, genericFor?.(item.id));
  if (price?.kind === 'supplier') return { kind: 'supplier', priceUSD: price.priceUSD, label: `Oferta de ${price.offer.supplierName}`, offerId: price.offer.id, supplierName: price.offer.supplierName };
  if (price?.kind === 'generic') return { kind: 'generic', priceUSD: price.priceUSD, label: 'Precio genérico, sin proveedor', generic: price.generic };
  return { kind: 'none', label: 'Sin precio: sin oferta de proveedor ni precio genérico' };
}

/**
 * Equipo del catálogo para una propuesta nueva (o para dimensionar): el modelo pedido (ajustes) si tiene precio; si no, el de
 * la oferta preferida de su proveedor; si no, el más barato en stock (por W, kW o kWh, sin ofertas agotadas); sin ofertas, el
 * de precio genérico (señalado como tal); sin nada, el modelo pedido sin precio. Nunca se inventa un precio.
 */
export function chooseCatalogEquipment(
  catalog: readonly SolarEquipmentItem[],
  kind: EquipmentKind,
  options: { preferredName?: string; genericFor?: (id: string) => GenericPriceInfo | null | undefined },
): EquipmentChoice {
  const items = catalog.filter((item) => item.type === kind);
  const requested = options.preferredName ? items.find((item) => item.displayName === options.preferredName) : undefined;
  if (requested) {
    const price = equipmentPrice(requested, options.genericFor);
    if (price.kind !== 'none') return { item: requested, price, reason: 'Modelo de los ajustes' };
  }
  const preferred = items.filter((item) => item.preferredSupplierId && usableOffers(item).some((offer) => offer.id === item.preferredSupplierId));
  const cheapest = (list: SolarEquipmentItem[]) => {
    let best: { item: SolarEquipmentItem; price: EquipmentPriceChoice; perUnit: number } | undefined;
    for (const item of list) {
      const price = equipmentPrice(item, options.genericFor);
      const magnitude = MAGNITUDE[kind](item);
      if (price.priceUSD === undefined) continue;
      const perUnit = magnitude > 0 ? price.priceUSD / magnitude : Number.POSITIVE_INFINITY;
      if (!best || perUnit < best.perUnit) best = { item, price, perUnit };
    }
    return best;
  };
  const byPreferred = cheapest(preferred);
  if (byPreferred) return { item: byPreferred.item, price: byPreferred.price, reason: 'Oferta preferida del proveedor' };
  const inStock = cheapest(items.filter((item) => usableOffers(item).length > 0));
  if (inStock) return { item: inStock.item, price: inStock.price, reason: 'Oferta más barata en stock' };
  const generic = cheapest(items);
  if (generic) return { item: generic.item, price: generic.price, reason: 'Precio genérico del catálogo (sin oferta de proveedor)' };
  return { item: requested, price: { kind: 'none', label: 'Sin precio: sin oferta de proveedor ni precio genérico' }, reason: requested ? 'Modelo de los ajustes, sin precio' : 'Sin equipos de este tipo en el catálogo' };
}

// ── Cantidad sugerida de un grupo (la revisión del borrador de IA) ───────────────────────────────

/**
 * Paneles del grupo `index` para cubrir lo que falta de la meta anual con los demás grupos tal cual. 0 si los demás ya la
 * cubren o el grupo no tiene potencia.
 */
export function suggestedGroupPanelCount(input: { targetAnnualKWh: number; annualSpecificYieldKWhPerKWp: number; groups: readonly { powerW: number; count: number }[]; index: number }): number {
  const chosen = input.groups[input.index];
  const otherKWp = input.groups.reduce((sum, group, i) => sum + (i === input.index ? 0 : group.powerW * group.count / 1000), 0);
  const remainingKWh = input.targetAnnualKWh - otherKWp * input.annualSpecificYieldKWhPerKWp;
  return chosen?.powerW && remainingKWh > 0 ? Math.ceil(remainingKWh / (input.annualSpecificYieldKWhPerKWp * chosen.powerW / 1000)) : 0;
}

