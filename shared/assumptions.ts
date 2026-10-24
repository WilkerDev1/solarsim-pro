/**
 * Supuestos efectivos de una propuesta (ADR 0003). Único lugar donde viven los valores por defecto de los supuestos
 * del proyecto (tasa de cambio, pérdidas, inflación, descuento, vida del proyecto, cobertura, retención de exportación,
 * vigencia, degradación, año de reemplazo de batería, $/W, margen y mano de obra) y la regla que decide si un dato
 * guardado es utilizable. Motor, PDF, visor (Worker), borradores de IA, importación y proyectos nuevos leen de aquí;
 * ningún otro archivo escribe esos literales (lo guarda `testNoAssumptionDefaultLiterals`).
 *
 * Reglas:
 * - Un valor ausente, no finito o fuera de rango se reemplaza por el default (`ASSUMPTION_RULES`, una sola tabla).
 * - Un 0 explícito se respeta donde la regla lo permite (`zeroIsMissing: false`: inflación, descuento, pérdidas,
 *   degradación, mano de obra, retención); en el resto, 0 equivale a «sin dato».
 * - Un dato que falta en una propuesta GUARDADA se resuelve a la constante compartida, nunca a los ajustes del usuario:
 *   la misma propuesta da las mismas cifras en cualquier equipo, en el Worker y en el servidor. Los ajustes del
 *   usuario (`DefaultSimulationSettings`) solo siembran propuestas NUEVAS (`assumptionFields`).
 * - La resolución ocurre al leer; no hay migración de datos.
 *
 * TypeScript puro, sin dependencias (lo compilan el cliente, el servidor con NodeNext y el Worker).
 */

// ── Valores por defecto ──
/** Tasa RD$ por US$. */
export const DEFAULT_DOP_RATE = 60;
/** Pérdidas del sistema (%) en modo simple. */
export const DEFAULT_SYSTEM_LOSSES_PCT = 25;
/** Pérdidas (%) en modo detallado (modelo de pérdidas desglosado). */
export const DEFAULT_DETAILED_SYSTEM_LOSSES_PCT = 14;
/** Inflación anual de la energía (%). */
export const DEFAULT_ENERGY_INFLATION_PCT = 3.5;
/** Tasa de descuento (%) del VAN. */
export const DEFAULT_DISCOUNT_RATE_PCT = 12;
/** Vida del proyecto (años) del flujo de caja. */
export const DEFAULT_PROJECT_LIFESPAN_YEARS = 25;
/** Cobertura objetivo (%). */
export const DEFAULT_TARGET_COVERAGE_PCT = 95;
/** Retención de exportación SIE (%). */
export const DEFAULT_GRID_EXPORT_FEE_PCT = 25;
/** Vigencia de la cotización (días). */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7;
/** Degradación anual de los paneles (%). */
export const DEFAULT_ANNUAL_DEGRADATION_PCT = 0.4;
/** Año del flujo de caja en que se repone el banco de baterías. */
export const DEFAULT_BATTERY_REPLACEMENT_YEAR = 10;
/** Precio directo por Wp (US$). Es el del motor (`financeEngine`), que determina los totales. */
export const DEFAULT_PRICE_PER_WATT_USD = 1.13;
/** Multiplicador de venta (1.25 = 25 % de margen). */
export const DEFAULT_SALE_MARGIN_MULTIPLIER = 1.25;
/** Mano de obra (US$ por kWp). */
export const DEFAULT_INSTALLATION_USD_PER_KWP = 170;
/** Factor de emisión de la red dominicana (kg CO₂ por kWh). */
export const DEFAULT_CO2_FACTOR_KG_PER_KWH = 0.481;

// ── Tabla de reglas ──
export interface AssumptionRule {
  /** Valor cuando el dato falta o no es utilizable. */
  default: number;
  /** Cota máxima válida (inclusive). */
  max: number;
  /** `true`: 0 equivale a «sin dato» (rango > 0). `false`: 0 es un valor válido (rango ≥ 0). */
  zeroIsMissing: boolean;
}

/** Rango válido de cada supuesto: la única tabla. */
export const ASSUMPTION_RULES = {
  dopExchangeRate: { default: DEFAULT_DOP_RATE, max: 10000, zeroIsMissing: true },
  systemLossesPct: { default: DEFAULT_SYSTEM_LOSSES_PCT, max: 99, zeroIsMissing: false },
  annualEnergyInflationPct: { default: DEFAULT_ENERGY_INFLATION_PCT, max: 100, zeroIsMissing: false },
  discountRatePct: { default: DEFAULT_DISCOUNT_RATE_PCT, max: 100, zeroIsMissing: false },
  projectLifespanYears: { default: DEFAULT_PROJECT_LIFESPAN_YEARS, max: 100, zeroIsMissing: true },
  targetCoveragePct: { default: DEFAULT_TARGET_COVERAGE_PCT, max: 300, zeroIsMissing: true },
  gridExportFeePct: { default: DEFAULT_GRID_EXPORT_FEE_PCT, max: 100, zeroIsMissing: false },
  quoteValidityDays: { default: DEFAULT_QUOTE_VALIDITY_DAYS, max: 3650, zeroIsMissing: true },
  annualDegradationPct: { default: DEFAULT_ANNUAL_DEGRADATION_PCT, max: 5, zeroIsMissing: false },
  batteryReplacementYear: { default: DEFAULT_BATTERY_REPLACEMENT_YEAR, max: 100, zeroIsMissing: true },
  pricePerWattUSD: { default: DEFAULT_PRICE_PER_WATT_USD, max: 1000, zeroIsMissing: true },
  saleMarginMultiplier: { default: DEFAULT_SALE_MARGIN_MULTIPLIER, max: 100, zeroIsMissing: true },
  installationUsdPerKwp: { default: DEFAULT_INSTALLATION_USD_PER_KWP, max: 100000, zeroIsMissing: false },
  co2FactorKgPerKWh: { default: DEFAULT_CO2_FACTOR_KG_PER_KWH, max: 10, zeroIsMissing: true },
} as const satisfies Record<string, AssumptionRule>;

export type AssumptionKey = keyof typeof ASSUMPTION_RULES;

type Maybe = number | null | undefined;

/** `true` si `value` es utilizable para `key`: finito y dentro del rango de la tabla. */
export function isValidAssumption(key: AssumptionKey, value: unknown): value is number {
  const rule: AssumptionRule = ASSUMPTION_RULES[key];
  return typeof value === 'number' && Number.isFinite(value) && (rule.zeroIsMissing ? value > 0 : value >= 0) && value <= rule.max;
}

/** Primer candidato utilizable para `key` (en orden de precedencia); si ninguno lo es, el default. */
export function resolveAssumption(key: AssumptionKey, ...candidates: Maybe[]): number {
  for (const candidate of candidates) if (isValidAssumption(key, candidate)) return candidate;
  return ASSUMPTION_RULES[key].default;
}

/** Pérdidas efectivas (%): las del proyecto (0 válido); si faltan, 14 en modo detallado y 25 en simple. */
export function resolveSystemLosses(specs: { systemLosses?: Maybe; isDetailed?: boolean } | null | undefined): number {
  if (isValidAssumption('systemLossesPct', specs?.systemLosses)) return specs.systemLosses;
  return specs?.isDetailed ? DEFAULT_DETAILED_SYSTEM_LOSSES_PCT : DEFAULT_SYSTEM_LOSSES_PCT;
}

// ── Proyecto → supuestos efectivos ──
/** Forma estructural mínima que lee `resolveAssumptions`; `ProjectSimulation` (cliente) y el JSON del Worker la cumplen. */
export interface AssumptionsProjectInput {
  client?: { quoteValidityDays?: Maybe } | null;
  specs?: {
    isDetailed?: boolean;
    systemLosses?: Maybe;
    annualDegradation?: Maybe;
    dopExchangeRate?: Maybe;
    saleMarginMultiplier?: Maybe;
    installationUnitPriceUSD?: Maybe;
    pricePerWattUSD?: Maybe;
    batteryLifespanYears?: Maybe;
    panels?: ReadonlyArray<{ powerW?: Maybe; count?: Maybe; annualDegradation?: Maybe }> | null;
  } | null;
  rates?: {
    usdExchangeRate?: Maybe;
    targetCoveragePct?: Maybe;
    gridExportFeePct?: Maybe;
    annualEnergyInflationPct?: Maybe;
  } | null;
  financials?: {
    discountRatePct?: Maybe;
    projectLifespanYears?: Maybe;
    pricePerWattUSD?: Maybe;
    co2FactorKgPerKWh?: Maybe;
  } | null;
}

export interface ResolvedAssumptions {
  dopExchangeRate: number;
  systemLossesPct: number;
  annualEnergyInflationPct: number;
  discountRatePct: number;
  projectLifespanYears: number;
  targetCoveragePct: number;
  gridExportFeePct: number;
  quoteValidityDays: number;
  annualDegradationPct: number;
  batteryReplacementYear: number;
  pricePerWattUSD: number;
  saleMarginMultiplier: number;
  installationUsdPerKwp: number;
  co2FactorKgPerKWh: number;
}

/**
 * Degradación anual (%) del flujo de caja. Modo detallado: la configurada. Modo simple: la de los grupos de paneles
 * del catálogo ponderada por su potencia DC, luego la configurada, luego el default.
 */
export function resolveAnnualDegradation(specs: AssumptionsProjectInput['specs']): number {
  if (!specs) return DEFAULT_ANNUAL_DEGRADATION_PCT;
  if (!specs.isDetailed) {
    let weighted = 0;
    let watts = 0;
    for (const group of specs.panels || []) {
      const groupWatts = (group.powerW || 0) * (group.count || 0);
      if (groupWatts <= 0 || !isValidAssumption('annualDegradationPct', group.annualDegradation)) continue;
      weighted += group.annualDegradation * groupWatts;
      watts += groupWatts;
    }
    if (watts > 0) return weighted / watts;
  }
  return resolveAssumption('annualDegradationPct', specs.annualDegradation);
}

/** Supuestos efectivos de una propuesta, guardada o nueva. Nunca lee los ajustes del usuario (regla de precedencia). */
export function resolveAssumptions(project: AssumptionsProjectInput | null | undefined): ResolvedAssumptions {
  const { client, specs, rates, financials } = project || {};
  return {
    // Cambio: el de los costos del proyecto; si falta, el de las tarifas; si falta, el default.
    dopExchangeRate: resolveAssumption('dopExchangeRate', specs?.dopExchangeRate, rates?.usdExchangeRate),
    systemLossesPct: resolveSystemLosses(specs),
    annualEnergyInflationPct: resolveAssumption('annualEnergyInflationPct', rates?.annualEnergyInflationPct),
    discountRatePct: resolveAssumption('discountRatePct', financials?.discountRatePct),
    projectLifespanYears: resolveAssumption('projectLifespanYears', financials?.projectLifespanYears),
    targetCoveragePct: resolveAssumption('targetCoveragePct', rates?.targetCoveragePct),
    gridExportFeePct: resolveAssumption('gridExportFeePct', rates?.gridExportFeePct),
    quoteValidityDays: resolveAssumption('quoteValidityDays', client?.quoteValidityDays),
    annualDegradationPct: resolveAnnualDegradation(specs),
    batteryReplacementYear: resolveAssumption('batteryReplacementYear', specs?.batteryLifespanYears),
    // $/Wp: el del proyecto, luego el de las finanzas, luego el default (la cadena del motor y del dock).
    pricePerWattUSD: resolveAssumption('pricePerWattUSD', specs?.pricePerWattUSD, financials?.pricePerWattUSD),
    saleMarginMultiplier: resolveAssumption('saleMarginMultiplier', specs?.saleMarginMultiplier),
    installationUsdPerKwp: resolveAssumption('installationUsdPerKwp', specs?.installationUnitPriceUSD),
    co2FactorKgPerKWh: resolveAssumption('co2FactorKgPerKWh', financials?.co2FactorKgPerKWh),
  };
}

// ── Fábrica: proyecto nuevo, importado y borrador de IA ──
/** Ajustes del usuario que siembran un proyecto NUEVO (los nombres de `DefaultSimulationSettings`). */
export interface AssumptionSeed {
  defaultQuoteValidityDays?: Maybe;
  defaultTargetCoveragePct?: Maybe;
  defaultSystemLosses?: Maybe;
  defaultAnnualDegradation?: Maybe;
  defaultDirectPriceUSDPerWp?: Maybe;
  defaultApplySieRetention?: boolean | null;
  discountRatePct?: Maybe;
  lifespanYears?: Maybe;
  annualEnergyTariffEscalationPct?: Maybe;
}

/** Campos de supuestos que se guardan en el proyecto. */
export interface AssumptionFields {
  client: { quoteValidityDays: number };
  specs: { systemLosses: number; annualDegradation: number; dopExchangeRate: number; saleMarginMultiplier: number; installationUnitPriceUSD: number; pricePerWattUSD: number };
  rates: { targetCoveragePct: number; gridExportFeePct: number; usdExchangeRate: number; annualEnergyInflationPct: number };
  financials: { discountRatePct: number; projectLifespanYears: number; pricePerWattUSD: number; co2FactorKgPerKWh: number };
}

const hasValue = (value: unknown): value is number => value !== undefined && value !== null;

/**
 * Campos de supuestos de un proyecto nuevo o importado. Para cada campo: el dato del proyecto si existe (se conserva
 * tal cual; la lectura lo valida), si no el ajuste del usuario (solo proyectos nuevos y borradores), si no la
 * constante compartida. Proyecto nuevo con los ajustes de fábrica ≡ proyecto importado vacío (`testResolvedAssumptions`).
 */
export function assumptionFields(existing?: AssumptionsProjectInput | null, seed?: AssumptionSeed | null): AssumptionFields {
  const { client, specs, rates, financials } = existing || {};
  const fee = seed?.defaultApplySieRetention;
  const wattPrice = resolveAssumption('pricePerWattUSD', seed?.defaultDirectPriceUSDPerWp);
  return {
    client: { quoteValidityDays: hasValue(client?.quoteValidityDays) ? client.quoteValidityDays : resolveAssumption('quoteValidityDays', seed?.defaultQuoteValidityDays) },
    specs: {
      systemLosses: hasValue(specs?.systemLosses)
        ? specs.systemLosses
        : isValidAssumption('systemLossesPct', seed?.defaultSystemLosses) ? seed.defaultSystemLosses : resolveSystemLosses({ isDetailed: specs?.isDetailed }),
      annualDegradation: hasValue(specs?.annualDegradation) ? specs.annualDegradation : resolveAssumption('annualDegradationPct', seed?.defaultAnnualDegradation),
      dopExchangeRate: hasValue(specs?.dopExchangeRate) ? specs.dopExchangeRate : resolveAssumption('dopExchangeRate', rates?.usdExchangeRate),
      saleMarginMultiplier: hasValue(specs?.saleMarginMultiplier) ? specs.saleMarginMultiplier : DEFAULT_SALE_MARGIN_MULTIPLIER,
      installationUnitPriceUSD: hasValue(specs?.installationUnitPriceUSD) ? specs.installationUnitPriceUSD : DEFAULT_INSTALLATION_USD_PER_KWP,
      pricePerWattUSD: resolveAssumption('pricePerWattUSD', specs?.pricePerWattUSD, financials?.pricePerWattUSD, wattPrice),
    },
    rates: {
      targetCoveragePct: hasValue(rates?.targetCoveragePct) ? rates.targetCoveragePct : resolveAssumption('targetCoveragePct', seed?.defaultTargetCoveragePct),
      gridExportFeePct: hasValue(rates?.gridExportFeePct) ? rates.gridExportFeePct : fee === false ? 0 : DEFAULT_GRID_EXPORT_FEE_PCT,
      usdExchangeRate: hasValue(rates?.usdExchangeRate) ? rates.usdExchangeRate : resolveAssumption('dopExchangeRate', specs?.dopExchangeRate),
      annualEnergyInflationPct: hasValue(rates?.annualEnergyInflationPct) ? rates.annualEnergyInflationPct : resolveAssumption('annualEnergyInflationPct', seed?.annualEnergyTariffEscalationPct),
    },
    financials: {
      discountRatePct: hasValue(financials?.discountRatePct) ? financials.discountRatePct : resolveAssumption('discountRatePct', seed?.discountRatePct),
      projectLifespanYears: hasValue(financials?.projectLifespanYears) ? financials.projectLifespanYears : resolveAssumption('projectLifespanYears', seed?.lifespanYears),
      pricePerWattUSD: resolveAssumption('pricePerWattUSD', financials?.pricePerWattUSD, wattPrice),
      co2FactorKgPerKWh: hasValue(financials?.co2FactorKgPerKWh) ? financials.co2FactorKgPerKWh : DEFAULT_CO2_FACTOR_KG_PER_KWH,
    },
  };
}
