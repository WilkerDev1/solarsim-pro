import { resolveGridConnection, type GridConnectionFields } from './gridConnection';

/**
 * Alternativa de suministro de un sistema aislado (`gridConnection: 'off_grid'`): contra qué gasto actual se
 * compara el sistema para calcular el ahorro. Vive en `rates`, junto a `gridConnection`.
 *
 * - `utility_tariff`: tarifa de la distribuidora (`rates.energyCostPerKWh`). Valor por defecto y comportamiento
 *   anterior: el cliente tiene servicio y quiere desconectarse. Propuestas sin el campo se leen así.
 * - `generator`: hoy usa planta eléctrica; el ahorro valora la energía servida a `rates.generatorCostPerKWh`
 *   (USD/kWh, misma moneda que el precio del kWh del dock). No tiene valor por defecto: sin un costo > 0 la
 *   propuesta queda incompleta (`generator_missing_cost`) y no se calcula ningún ahorro (nunca se cae a la tarifa).
 * - `no_comparison`: no hay red ni planta; no existe gasto actual contra el que comparar, así que no hay ahorro,
 *   payback, TIR, VAN ni ROI. Se presentan inversión, energía entregada, energía no servida y autonomía.
 *
 * Con una conexión distinta de `off_grid` el campo se ignora por completo (cifras idénticas a la tarifa).
 * Lectura tolerante: ausente o desconocido = tarifa de distribuidora; nada se repara al hidratar ni al importar
 * (mirar no escribe, ADR 0004). El costo del generador no es un supuesto de `resolveAssumptions` (ADR 0003)
 * porque no tiene default: se resuelve aquí, al leer.
 */
export type SupplyAlternative = 'utility_tariff' | 'generator' | 'no_comparison';

export const SUPPLY_ALTERNATIVES: readonly SupplyAlternative[] = ['utility_tariff', 'generator', 'no_comparison'];

export const SUPPLY_ALTERNATIVE_LABELS: Readonly<Record<SupplyAlternative, string>> = {
  utility_tariff: 'Tarifa de distribuidora',
  generator: 'Generador',
  no_comparison: 'Sin comparación',
};

/** Tope de cordura del costo del generador (USD/kWh); un valor mayor es un error de captura. */
export const MAX_GENERATOR_COST_PER_KWH = 10;

/**
 * Base con la que se valora el ahorro.
 * - `utility_tariff` / `generator`: hay comparación y cifras de ahorro.
 * - `generator_missing_cost`: generador sin costo por kWh válido (> 0): incompleto, sin cifras de ahorro.
 * - `no_comparison`: sin cifras de ahorro por decisión del usuario.
 */
export type SavingsBasis = 'utility_tariff' | 'generator' | 'generator_missing_cost' | 'no_comparison';

export interface SupplyAlternativeFields extends GridConnectionFields {
  supplyAlternative?: unknown;
  generatorCostPerKWh?: unknown;
}

export const isSupplyAlternative = (value: unknown): value is SupplyAlternative =>
  typeof value === 'string' && (SUPPLY_ALTERNATIVES as readonly string[]).includes(value);

export const isValidGeneratorCost = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_GENERATOR_COST_PER_KWH;

/** Alternativa guardada (sin mirar la conexión): ausente o desconocida = tarifa de distribuidora. */
export function storedSupplyAlternative(rates: SupplyAlternativeFields | null | undefined): SupplyAlternative {
  return isSupplyAlternative(rates?.supplyAlternative) ? rates.supplyAlternative : 'utility_tariff';
}

/** Alternativa efectiva: solo cuenta en un sistema aislado; con red siempre es la tarifa. */
export function resolveSupplyAlternative(rates: SupplyAlternativeFields | null | undefined): SupplyAlternative {
  return resolveGridConnection(rates) === 'off_grid' ? storedSupplyAlternative(rates) : 'utility_tariff';
}

/** Costo por kWh del generador guardado, o `null` si falta o no es válido (no hay default). */
export function resolveGeneratorCostPerKWh(rates: SupplyAlternativeFields | null | undefined): number | null {
  return isValidGeneratorCost(rates?.generatorCostPerKWh) ? rates.generatorCostPerKWh : null;
}

export function resolveSavingsBasis(rates: SupplyAlternativeFields | null | undefined): SavingsBasis {
  const alternative = resolveSupplyAlternative(rates);
  if (alternative === 'generator') return resolveGeneratorCostPerKWh(rates) === null ? 'generator_missing_cost' : 'generator';
  return alternative;
}

/** Hay un gasto actual contra el que comparar: se muestran ahorro, payback, TIR, VAN y ROI. */
export const hasSavingsComparison = (basis: SavingsBasis): boolean => basis === 'utility_tariff' || basis === 'generator';

/**
 * Costo por kWh con el que el motor valora la energía servida: la tarifa del proyecto, el costo del generador o 0
 * cuando no hay comparación (el resumen deja entonces el ahorro y el flujo vacíos).
 */
export function savingsValuationCostPerKWh(rates: SupplyAlternativeFields & { energyCostPerKWh: number }): number {
  const basis = resolveSavingsBasis(rates);
  if (basis === 'utility_tariff') return rates.energyCostPerKWh;
  if (basis === 'generator') return resolveGeneratorCostPerKWh(rates) as number;
  return 0;
}

/**
 * Normaliza un parche de tarifas: una alternativa desconocida no se guarda, y un costo del generador que no es un
 * número finito ≥ 0 tampoco (`undefined` sí se guarda: vaciar el campo). Un 0 se conserva y se lee como «falta».
 */
export function normalizeSupplyAlternativePatch<T extends SupplyAlternativeFields>(patch: T): T {
  let next = patch;
  if ('supplyAlternative' in patch && patch.supplyAlternative !== undefined && !isSupplyAlternative(patch.supplyAlternative)) {
    next = { ...next };
    delete next.supplyAlternative;
  }
  const cost = patch.generatorCostPerKWh;
  if ('generatorCostPerKWh' in patch && cost !== undefined && !(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)) {
    next = { ...next };
    delete next.generatorCostPerKWh;
  }
  return next;
}

/** Aviso del estado incompleto (dock, pestañas y vista del documento). */
export const GENERATOR_MISSING_COST_NOTE =
  'Falta el costo por kWh del generador: sin él no se calcula el ahorro, el payback ni la TIR/VAN. Indícalo en Tarifas (Alternativa de suministro → Generador).';

/** Estado «sin comparación» (tarjetas e indicadores de ahorro). */
export const NO_COMPARISON_NOTE =
  'Sin comparación: el cliente no tiene red ni planta, así que no hay gasto actual contra el que calcular ahorro, payback ni TIR/VAN. La propuesta presenta inversión, energía entregada, energía no servida y autonomía.';

/** Nota corta del estado sin cifras de ahorro, según la base. */
export function noSavingsNote(basis: SavingsBasis): string {
  return basis === 'generator_missing_cost' ? GENERATOR_MISSING_COST_NOTE : NO_COMPARISON_NOTE;
}
