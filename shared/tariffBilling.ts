/**
 * Factura mensual de la distribuidora con medición neta (Reglamento SIE-007-2026-REG) y valoración del ahorro por
 * diferencia de facturas. TypeScript puro, sin dependencias fuera de `shared/` (lo compilan el cliente, la API y el Worker).
 *
 * Reglas confirmadas en las fuentes (OCR del reglamento y de la Res. SIE-121-2026-TF):
 * - Consumo neto = kWh consumidos (retirados de la red) − kWh exportados − crédito del mes anterior (art. 6, def. 10).
 * - Cargo fijo: se cobra siempre, aunque el consumo sea nulo (art. 19, E.1.a).
 * - Cargo por energía: consumo neto × precio de la tarifa asignada. Con balance a favor del cliente no hay cargo de
 *   energía y la energía se acredita a la próxima facturación (art. 19, E.1.b): el neteo es kWh contra kWh y el
 *   excedente se arrastra mes a mes.
 * - Cargo por potencia: solo tarifas binómicas (art. 19, E.1.c). Queda fuera del ahorro: el sistema FV no reduce de
 *   forma garantizada la demanda máxima (la potencia facturable compara retiro e inyección con las dos mayores
 *   demandas de los últimos 12 meses), así que estas tarifas se valoran solo por su energía, a su precio único.
 * - Cargo por uso de la red: kWh inyectados × RD$/kWh, solo tarifas monómicas (art. 19, E.1.e; `shared/netMetering.ts`).
 * - Liquidación anual: el crédito que sobra al cierre del año se paga al 100 % antes del 31 de enero, valorado al precio
 *   promedio de referencia de contratos de compra de energía a 10 años publicado por la CNE para la tecnología
 *   (art. 19, E.2.ii–iv). Enero empieza sin crédito (el del año previo ya se liquidó).
 * - Bloques BTS-1/BTS-2: 0–200, 201–300 y 301–700 escalonados; con 701 kWh o más, todos los kWh al 4.º rango
 *   (Res. SIE-121-2026-TF, art. 4.d; `averageBlockEnergyRateDOP`). Cargo fijo por rango de consumo (art. 2).
 *
 * No confirmado en las fuentes (parametrizado con el valor conservador, ver el informe de la fase 3):
 * - El precio CNE de la liquidación anual: no se encontró publicado; valor de fábrica 0 (`FACTORY_ANNUAL_CREDIT_SETTLEMENT`).
 * - Qué consumo elige el rango del cargo fijo con medición neta: se usa la energía retirada (`fixedChargeTierBasis`
 *   `withdrawn`), que da la factura con sistema más alta (ahorro a la baja); `net` usa el consumo neto facturado.
 * - Los bloques se aplican al consumo neto facturado (lectura de E.1.b: «cantidad de energía neta… por el precio de
 *   la energía, conforme a la tarifa asignada»).
 */
import { averageBlockEnergyRateDOP, tariffMatrixKey, type EnergyBlock } from './tariffRules.js';
import { resolveGridConnection } from './gridConnection.js';
import { resolveNetMeteringRegime } from './netMetering.js';

/** Rango del cargo fijo con límites impresos inclusivos (0–100, 101–…); `toKWh: null` es el último rango abierto. */
export interface FixedChargeTier {
  fromKWh: number;
  toKWh: number | null;
  chargeDOP: number;
}

/**
 * Fila de la tarifa con la que se factura una propuesta, guardada en ella (`rates.billingTariff`) al fijar el precio de
 * referencia: la misma propuesta da las mismas cifras en cualquier equipo aunque cambie la matriz (ADR 0003).
 */
export interface BillingTariff {
  distributor: string;
  /** Clave de la fila en la matriz (BTS1, BTD, RBT-1…). */
  tariffCode: string;
  /** Tramos de energía en RD$/kWh; una tarifa de precio único es un solo tramo abierto desde 0. */
  energyBlocks: EnergyBlock[];
  /** Cargo fijo mensual (RD$) cuando no hay rangos. */
  fixedChargeDOP: number;
  /** Cargo fijo por rango de consumo (BTS-1). */
  fixedChargeTiers?: FixedChargeTier[];
  resolutionCode?: string;
  effectiveDate?: string;
}

const finiteNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Tramos contiguos desde 0, ascendentes y con el último abierto. */
function validRanges(ranges: unknown, priceKey: 'rateDOP' | 'chargeDOP'): boolean {
  if (!Array.isArray(ranges) || ranges.length === 0) return false;
  let previousTo = -1;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (!isRecord(range) || !finiteNonNegative(range[priceKey]) || !finiteNonNegative(range.fromKWh)) return false;
    const last = i === ranges.length - 1;
    if (last ? range.toKWh !== null : !finiteNonNegative(range.toKWh)) return false;
    if (i === 0 ? range.fromKWh !== 0 : range.fromKWh !== previousTo && range.fromKWh !== previousTo + 1) return false;
    if (!last && (range.toKWh as number) <= range.fromKWh) return false;
    previousTo = last ? Infinity : (range.toKWh as number);
  }
  return true;
}

export function isValidBillingTariff(value: unknown): value is BillingTariff {
  if (!isRecord(value)) return false;
  if (typeof value.distributor !== 'string' || !value.distributor || typeof value.tariffCode !== 'string' || !value.tariffCode) return false;
  if (!finiteNonNegative(value.fixedChargeDOP)) return false;
  if (value.fixedChargeTiers !== undefined && !validRanges(value.fixedChargeTiers, 'chargeDOP')) return false;
  return validRanges(value.energyBlocks, 'rateDOP');
}

/** Forma mínima de una fila de la matriz (`UtilityTariffDetails`) que se convierte en `BillingTariff`. */
export interface TariffRowInput {
  code: string;
  currency?: string;
  baseEnergyRateDOP?: number;
  fixedChargeDOP?: number;
  blocks?: ReadonlyArray<{ minKWh: number; maxKWh: number; rateDOP: number }>;
  fixedChargeTiersDOP?: ReadonlyArray<{ minKWh: number; maxKWh: number | null; chargeDOP: number }>;
  source?: { resolutionCode?: string; effectiveDate?: string };
}

/**
 * Fila de facturación de una fila de la matriz. `undefined` si la tarifa no se puede facturar en RD$ (en US$, sin
 * precio de energía o con datos no válidos): entonces la propuesta se valora con el precio escalar.
 */
export function billingTariffFromRow(distributor: string, row: TariffRowInput | null | undefined, provenance?: { resolutionCode?: string; effectiveDate?: string }): BillingTariff | undefined {
  if (!row || row.currency === 'USD') return undefined;
  const energyBlocks: EnergyBlock[] = row.blocks?.length
    ? row.blocks.map((block) => ({ fromKWh: block.minKWh, toKWh: Number.isFinite(block.maxKWh) ? block.maxKWh : null, rateDOP: block.rateDOP }))
    : finiteNonNegative(row.baseEnergyRateDOP) && row.baseEnergyRateDOP > 0 ? [{ fromKWh: 0, toKWh: null, rateDOP: row.baseEnergyRateDOP }] : [];
  const fixedChargeTiers = row.fixedChargeTiersDOP?.length
    ? row.fixedChargeTiersDOP.map((tier) => ({ fromKWh: tier.minKWh, toKWh: tier.maxKWh === null || !Number.isFinite(tier.maxKWh) ? null : tier.maxKWh, chargeDOP: tier.chargeDOP }))
    : undefined;
  const source = row.source ?? provenance;
  const tariff: BillingTariff = {
    distributor,
    tariffCode: row.code,
    energyBlocks,
    fixedChargeDOP: finiteNonNegative(row.fixedChargeDOP) ? row.fixedChargeDOP : 0,
    ...(fixedChargeTiers ? { fixedChargeTiers } : {}),
    ...(source?.resolutionCode ? { resolutionCode: source.resolutionCode } : {}),
    ...(source?.effectiveDate ? { effectiveDate: source.effectiveDate } : {}),
  };
  return isValidBillingTariff(tariff) ? tariff : undefined;
}

/** Cargo por energía (RD$) de un consumo facturado: bloques escalonados y, en BTS-1/BTS-2, la regla de 701 kWh. */
export function energyChargeDOP(tariff: BillingTariff, kWh: number): number {
  if (!(kWh > 0) || !Number.isFinite(kWh)) return 0;
  const average = averageBlockEnergyRateDOP(tariff.energyBlocks, kWh, tariff.tariffCode);
  return average === undefined ? 0 : average * kWh;
}

/** Cargo fijo (RD$) del rango en que cae el consumo (límites impresos inclusivos: 100 → 0–100; 100.5 → ≥101). */
export function fixedChargeDOP(tariff: BillingTariff, kWh: number): number {
  const tiers = tariff.fixedChargeTiers;
  if (!tiers?.length) return tariff.fixedChargeDOP;
  const consumption = Number.isFinite(kWh) ? Math.max(0, kWh) : 0;
  return (tiers.find((tier) => tier.toKWh === null || consumption <= tier.toKWh) ?? tiers[tiers.length - 1]).chargeDOP;
}

/** Qué consumo elige el rango del cargo fijo con medición neta (no confirmado; por defecto el conservador). */
export type FixedChargeTierBasis = 'withdrawn' | 'net';
export const DEFAULT_FIXED_CHARGE_TIER_BASIS: FixedChargeTierBasis = 'withdrawn';

export interface MonthlyBillInput {
  tariff: BillingTariff;
  /** Energía retirada (importada) de la red en el mes. Sin sistema, el consumo del mes. */
  withdrawnKWh: number;
  /** Energía inyectada a la red en el mes (bruta, medidor bidireccional). */
  injectedKWh?: number;
  /** Crédito de energía disponible del mes anterior (kWh). */
  creditInKWh?: number;
  /** Cargo por uso de la red que se cobra (RD$/kWh inyectado): 0 si no aplica. */
  gridUseChargeDOPPerKWh?: number;
  fixedChargeTierBasis?: FixedChargeTierBasis;
}

export interface MonthlyBill {
  withdrawnKWh: number;
  injectedKWh: number;
  creditInKWh: number;
  /** Consumo neto facturado (≥ 0). */
  netKWh: number;
  /** Parte del crédito anterior que se consumió este mes. */
  creditAppliedKWh: number;
  /** Crédito que pasa al mes siguiente. */
  creditCarriedKWh: number;
  energyChargeDOP: number;
  fixedChargeDOP: number;
  gridUseChargeDOP: number;
  totalDOP: number;
}

const kWhOf = (value: unknown): number => (finiteNonNegative(value) ? value : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Factura de un mes con medición neta (SIE-007-2026-REG, art. 19). Sin inyección ni crédito es la factura sin sistema. */
export function calculateMonthlyBill(input: MonthlyBillInput): MonthlyBill {
  const withdrawnKWh = kWhOf(input.withdrawnKWh);
  const injectedKWh = kWhOf(input.injectedKWh);
  const creditInKWh = kWhOf(input.creditInKWh);
  const balance = withdrawnKWh - injectedKWh - creditInKWh;
  const netKWh = balance > 0 ? round1(balance) : 0;
  const creditCarriedKWh = balance < 0 ? round1(-balance) : 0;
  // El crédito anterior solo cubre lo que lo inyectado en el mes no alcanzó a cubrir.
  const creditAppliedKWh = round1(Math.min(creditInKWh, Math.max(0, withdrawnKWh - injectedKWh)));
  const energy = energyChargeDOP(input.tariff, netKWh);
  const tierKWh = (input.fixedChargeTierBasis ?? DEFAULT_FIXED_CHARGE_TIER_BASIS) === 'net' ? netKWh : withdrawnKWh;
  const fixed = fixedChargeDOP(input.tariff, tierKWh);
  const gridUse = injectedKWh * kWhOf(input.gridUseChargeDOPPerKWh);
  return {
    withdrawnKWh,
    injectedKWh,
    creditInKWh,
    netKWh,
    creditAppliedKWh,
    creditCarriedKWh,
    energyChargeDOP: energy,
    fixedChargeDOP: fixed,
    gridUseChargeDOP: gridUse,
    totalDOP: energy + fixed + gridUse,
  };
}

export interface BillingYearOptions {
  gridUseChargeDOPPerKWh?: number;
  /** Precio de liquidación del remanente anual (RD$/kWh); sin dato, el de fábrica. */
  settlementDOPPerKWh?: number;
  fixedChargeTierBasis?: FixedChargeTierBasis;
}

export interface BillingYear {
  months: MonthlyBill[];
  settlement: { creditKWh: number; priceDOPPerKWh: number; amountDOP: number };
  totalDOP: number;
}

/** Doce facturas (enero a diciembre) con el crédito arrastrado mes a mes y la liquidación del remanente al cierre (art. 19.2). */
export function calculateBillingYear(tariff: BillingTariff, months: ReadonlyArray<{ withdrawnKWh: number; injectedKWh: number }>, options: BillingYearOptions = {}): BillingYear {
  let credit = 0;
  const bills = months.map((month) => {
    const bill = calculateMonthlyBill({
      tariff,
      withdrawnKWh: month.withdrawnKWh,
      injectedKWh: month.injectedKWh,
      creditInKWh: credit,
      gridUseChargeDOPPerKWh: options.gridUseChargeDOPPerKWh,
      fixedChargeTierBasis: options.fixedChargeTierBasis,
    });
    credit = bill.creditCarriedKWh;
    return bill;
  });
  const priceDOPPerKWh = isValidSettlementPrice(options.settlementDOPPerKWh) ? options.settlementDOPPerKWh : FACTORY_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh;
  return {
    months: bills,
    settlement: { creditKWh: credit, priceDOPPerKWh, amountDOP: credit * priceDOPPerKWh },
    totalDOP: bills.reduce((total, bill) => total + bill.totalDOP, 0),
  };
}

// ── Liquidación anual del crédito ──

/** Tope de un precio de liquidación editado (RD$/kWh). */
export const MAX_SETTLEMENT_DOP_PER_KWH = 100;

/**
 * Precio de fábrica con que se valora el crédito que sobra al cierre del año. El reglamento manda el precio promedio de
 * referencia de contratos a 10 años de la CNE para solar FV (art. 19, E.2.iv), pero no se encontró publicado: hasta
 * confirmarlo vale 0 (el remanente no suma ahorro: estimación a la baja). Editable por propuesta
 * (`rates.annualCreditSettlementDOPPerKWh`).
 */
export const FACTORY_ANNUAL_CREDIT_SETTLEMENT = {
  dopPerKWh: 0,
  confirmed: false,
  source: 'Res. SIE-007-2026-REG, art. 19, numeral 2 (19.2): precio promedio de referencia de contratos de compra de energía a 10 años publicado por la CNE (Solar Fotovoltaica de inclinación fija). No se encontró publicado; valor conservador hasta confirmarlo.',
} as const;

export function isValidSettlementPrice(value: unknown): value is number {
  return finiteNonNegative(value) && value <= MAX_SETTLEMENT_DOP_PER_KWH;
}

export function resolveAnnualCreditSettlementDOPPerKWh(rates: { annualCreditSettlementDOPPerKWh?: unknown } | null | undefined): number {
  return isValidSettlementPrice(rates?.annualCreditSettlementDOPPerKWh) ? rates.annualCreditSettlementDOPPerKWh : FACTORY_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh;
}

// ── Indicador del precio del kWh y regla de decisión ──

/** De dónde salió `rates.energyCostPerKWh`: tarifa de referencia de la matriz, factura escaneada o tecleado a mano. */
export const ENERGY_RATE_SOURCES = ['reference', 'invoice', 'manual'] as const;
export type EnergyRateSource = (typeof ENERGY_RATE_SOURCES)[number];
export const isEnergyRateSource = (value: unknown): value is EnergyRateSource =>
  typeof value === 'string' && (ENERGY_RATE_SOURCES as readonly string[]).includes(value);

/**
 * Procedencias del precio con las que se factura por bloques. Decisión abierta de la fase 3, en un solo lugar: hoy solo el
 * precio de referencia; un precio de factura o tecleado se respeta como escalar. Sin indicador (lo guardado antes de la
 * fase 3) también es escalar.
 */
export const BLOCK_BILLING_RATE_SOURCES: readonly EnergyRateSource[] = ['reference'];

/** Cómo se valora en dinero la energía que el sistema evita. */
export type EnergyValuationMethod = 'block_billing' | 'flat_rate';

export interface TariffBillingRatesInput {
  distributor?: string | null;
  tariffCode?: string | null;
  isZeroExport?: unknown;
  gridConnection?: unknown;
  netMeteringRegime?: unknown;
  energyRateSource?: unknown;
  billingTariff?: unknown;
  annualCreditSettlementDOPPerKWh?: unknown;
}

/** Fila de facturación guardada en la propuesta, si es válida y corresponde a su distribuidora y tarifa actuales. */
export function proposalBillingTariff(rates: TariffBillingRatesInput | null | undefined): BillingTariff | undefined {
  const tariff = rates?.billingTariff;
  if (!isValidBillingTariff(tariff)) return undefined;
  const distributor = typeof rates?.distributor === 'string' ? rates.distributor : '';
  if (tariff.distributor !== distributor) return undefined;
  return tariffMatrixKey(distributor, rates?.tariffCode ?? '') === tariffMatrixKey(distributor, tariff.tariffCode) ? tariff : undefined;
}

/**
 * Regla única: factura por bloques solo en `sie007_2026`, con red (no aislado), con la fila de la tarifa guardada y el
 * precio de una procedencia de `BLOCK_BILLING_RATE_SOURCES`. En cualquier otro caso, el precio escalar (como hasta la fase 2).
 */
export function resolveEnergyValuationMethod(rates: TariffBillingRatesInput | null | undefined): EnergyValuationMethod {
  if (resolveNetMeteringRegime(rates?.netMeteringRegime) !== 'sie007_2026') return 'flat_rate';
  if (resolveGridConnection(rates) === 'off_grid') return 'flat_rate';
  if (!isEnergyRateSource(rates?.energyRateSource) || !BLOCK_BILLING_RATE_SOURCES.includes(rates.energyRateSource)) return 'flat_rate';
  return proposalBillingTariff(rates) ? 'block_billing' : 'flat_rate';
}

export const ENERGY_VALUATION_METHOD_LABELS: Record<EnergyValuationMethod, string> = {
  block_billing: 'Factura por bloques de la tarifa',
  flat_rate: 'Precio por kWh de la propuesta',
};

/**
 * Procedencia del precio tras un cambio de tarifas (edición del dock, de agentes o borrador): regla pura de ADR 0004.
 * 1. Una procedencia en el propio cambio manda (la escribe quien fija el precio de referencia junto con la fila).
 *    Un valor desconocido no se guarda.
 * 2. Si cambia el precio sin procedencia, es un precio tecleado: `manual`.
 * 3. En otro caso no cambia. Cambiar de distribuidora o tarifa sin fila nueva deja la fila guardada sin efecto (no
 *    coincide), y la propuesta se valora con el escalar.
 */
export function reconcileEnergyRateSource<R extends { energyCostPerKWh?: number; energyRateSource?: unknown }>(
  before: R,
  after: R,
  change: { energyCostPerKWh?: number; energyRateSource?: unknown },
): R {
  if (change.energyRateSource !== undefined) {
    if (isEnergyRateSource(change.energyRateSource)) return after;
    const { energyRateSource: _drop, ...rest } = after;
    return (isEnergyRateSource(before.energyRateSource) ? { ...rest, energyRateSource: before.energyRateSource } : rest) as R;
  }
  if (change.energyCostPerKWh !== undefined && change.energyCostPerKWh !== before.energyCostPerKWh) return { ...after, energyRateSource: 'manual' };
  return after;
}
