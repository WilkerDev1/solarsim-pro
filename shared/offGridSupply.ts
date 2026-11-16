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

/**
 * Umbral de aviso del costo del generador (USD/kWh). No es un límite: un costo mayor se guarda y se usa en el
 * cálculo; el dock solo advierte (p. ej., un costo capturado en RD$ en lugar de USD).
 */
export const GENERATOR_COST_WARNING_PER_KWH = 10;

/** Tope técnico, solo contra valores absurdos (no es una regla de negocio): por encima el dato no es válido. */
export const MAX_GENERATOR_COST_PER_KWH = 1000;

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

/**
 * Predicado único del costo del generador (motor, `applyProjectEdit`, asistente/agentes, publicación y Worker):
 * número finito > 0 y no mayor que el tope técnico. Por encima del umbral de aviso sigue siendo válido.
 */
export const isValidGeneratorCost = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_GENERATOR_COST_PER_KWH;

/** Problema de un costo guardado: falta, no es > 0, supera el tope técnico; o `null` si es válido. */
export type GeneratorCostIssue = 'missing' | 'not_positive' | 'out_of_range';
export function generatorCostIssue(value: unknown): GeneratorCostIssue | null {
  if (isValidGeneratorCost(value)) return null;
  if (value === undefined || value === null || value === '') return 'missing';
  if (typeof value === 'number' && Number.isFinite(value) && value <= 0) return 'not_positive';
  return 'out_of_range';
}

/** Costo válido pero inusualmente alto: advertencia no bloqueante. */
export const isUnusuallyHighGeneratorCost = (value: unknown): boolean =>
  isValidGeneratorCost(value) && value > GENERATOR_COST_WARNING_PER_KWH;

/** Mensaje de validación del costo (asistente, agentes y Worker), coherente con `isValidGeneratorCost`. */
export const GENERATOR_COST_RULE_MESSAGE =
  `El costo del generador debe ser un número mayor que 0 USD/kWh (tope técnico de ${MAX_GENERATOR_COST_PER_KWH} USD/kWh, solo contra valores absurdos); si aún no se conoce, omítelo o déjalo vacío.`;

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
 * Normaliza un parche de tarifas: una alternativa desconocida no se guarda. Un costo del generador que es un número
 * finito se guarda tal cual lo escribe el usuario (aunque sea 0, negativo o pase del tope técnico): el dock no borra lo
 * que se está tecleando («0» → «0.35», 1500) y su aviso dice el motivo real; `isValidGeneratorCost` decide al leer,
 * así que un costo así nunca entra en el cálculo ni se publica. Lo que no es un número finito (vacío, `null`, NaN,
 * Infinity, texto) se guarda como «sin dato» (`undefined`).
 */
export function normalizeSupplyAlternativePatch<T extends SupplyAlternativeFields>(patch: T): T {
  let next = patch;
  if ('supplyAlternative' in patch && patch.supplyAlternative !== undefined && !isSupplyAlternative(patch.supplyAlternative)) {
    next = { ...next };
    delete next.supplyAlternative;
  }
  const cost = patch.generatorCostPerKWh;
  if ('generatorCostPerKWh' in patch && cost !== undefined && !(typeof cost === 'number' && Number.isFinite(cost))) {
    next = { ...next, generatorCostPerKWh: undefined };
  }
  return next;
}

/**
 * Tarifas tal como se publican en un enlace: un costo del generador inválido o una alternativa desconocida (dato
 * antiguo o importado) se omiten, de modo que el Worker no rechaza la publicación; el visor los lee como «generador
 * sin costo» (sin comparación) o como tarifa, igual que la app.
 */
export function publishedSupplyFields<T extends SupplyAlternativeFields>(rates: T): T {
  const badCost = rates.generatorCostPerKWh !== undefined && !isValidGeneratorCost(rates.generatorCostPerKWh);
  const badAlternative = rates.supplyAlternative !== undefined && !isSupplyAlternative(rates.supplyAlternative);
  if (!badCost && !badAlternative) return rates;
  const next = { ...rates };
  if (badCost) delete next.generatorCostPerKWh;
  if (badAlternative) delete next.supplyAlternative;
  return next;
}

/**
 * Cómo se presenta el suministro actual del cliente (cuadro resumen, cotización, hub, tablero, visor). La distribuidora
 * y su tarifa solo se muestran con `utility` (con red, o aislado comparado con la tarifa); con generador se muestra el
 * costo de generación propia (o «pendiente»); «sin comparación» se rotula «Sin conexión a la red».
 */
export type SupplyPresentation = { kind: 'utility' } | { kind: 'generator'; costPerKWh: number | null } | { kind: 'no_grid' };
export function supplyPresentation(rates: SupplyAlternativeFields | null | undefined): SupplyPresentation {
  const alternative = resolveSupplyAlternative(rates);
  if (alternative === 'generator') return { kind: 'generator', costPerKWh: resolveGeneratorCostPerKWh(rates) };
  return alternative === 'no_comparison' ? { kind: 'no_grid' } : { kind: 'utility' };
}

/** Rótulo de la app (fuera del documento) para un sistema aislado sin comparación. */
export const NO_GRID_SUPPLY_LABEL = 'Sin conexión a la red';

/** Suministro en una línea para vistas de la app (hub, tablero, cotización): nunca nombra la distribuidora sin `utility`. */
export function supplySummaryText(rates: SupplyAlternativeFields | null | undefined, utility: string): string {
  const supply = supplyPresentation(rates);
  if (supply.kind === 'utility') return utility;
  if (supply.kind === 'no_grid') return NO_GRID_SUPPLY_LABEL;
  return supply.costPerKWh === null ? 'Generador · costo pendiente' : `Generador · US$ ${supply.costPerKWh.toFixed(3)}/kWh`;
}

/** Aviso del estado incompleto (dock, pestañas y vista del documento). */
export const GENERATOR_MISSING_COST_NOTE =
  'Falta el costo por kWh del generador: sin él no se calcula el ahorro, el payback ni la TIR/VAN. Indícalo en Tarifas (Alternativa de suministro → Generador).';

/** Aviso del dock según el costo guardado (un dato importado o de otra versión puede ser 0 o estar fuera de rango). */
export function generatorCostNotice(value: unknown): { tone: 'error' | 'warning'; text: string } | null {
  switch (generatorCostIssue(value)) {
    case 'missing': return { tone: 'error', text: GENERATOR_MISSING_COST_NOTE };
    case 'not_positive': return { tone: 'error', text: 'El costo por kWh del generador debe ser mayor que 0: con este valor no se calcula el ahorro, el payback ni la TIR/VAN.' };
    case 'out_of_range': return { tone: 'error', text: `El costo por kWh del generador no es válido (tope técnico de ${MAX_GENERATOR_COST_PER_KWH} USD/kWh): no se calcula el ahorro, el payback ni la TIR/VAN.` };
    default:
      return isUnusuallyHighGeneratorCost(value)
        ? { tone: 'warning', text: `Costo inusualmente alto (más de ${GENERATOR_COST_WARNING_PER_KWH} USD/kWh): confirma que está en USD por kWh. Se usa tal cual en el cálculo.` }
        : null;
  }
}

/** Estado «sin comparación» (tarjetas e indicadores de ahorro). */
export const NO_COMPARISON_NOTE =
  'Sin comparación: el cliente no tiene red ni planta, así que no hay gasto actual contra el que calcular ahorro, payback ni TIR/VAN. La propuesta presenta inversión, energía entregada, energía no servida y autonomía.';

/** Nota corta del estado sin cifras de ahorro, según la base. */
export function noSavingsNote(basis: SavingsBasis): string {
  return basis === 'generator_missing_cost' ? GENERATOR_MISSING_COST_NOTE : NO_COMPARISON_NOTE;
}
