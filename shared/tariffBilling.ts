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
 *   (art. 19, E.2, incisos i–ii: se paga el 100 % antes del 31 de enero). Enero empieza sin crédito (el del año previo ya se liquidó).
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
import { exportsToGrid, resolveGridConnection } from './gridConnection.js';
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

/**
 * Tramos contiguos desde 0 con el último abierto, con la misma convención que `averageBlockEnergyRateDOP`: cada uno empieza
 * en el final del anterior + 1 (límites impresos, 0–200, 201–300…) o en el mismo final (límites compartidos, 0–200,
 * 200–300…, que acepta el escáner de resoluciones). En ambos, un tramo cubre (fin del anterior, su fin]: 100.5 kWh ya cae
 * en el rango siguiente (`fixedChargeDOP`). Un precio de energía 0 no es una
 * tarifa sino un dato que falta (`requirePositive`); un cargo fijo 0 sí es válido.
 */
function validRanges(ranges: unknown, priceKey: 'rateDOP' | 'chargeDOP', requirePositive: boolean): boolean {
  if (!Array.isArray(ranges) || ranges.length === 0) return false;
  let previousTo = -1;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (!isRecord(range) || !finiteNonNegative(range[priceKey]) || !finiteNonNegative(range.fromKWh)) return false;
    if (requirePositive && !((range[priceKey] as number) > 0)) return false;
    const last = i === ranges.length - 1;
    if (last ? range.toKWh !== null : !finiteNonNegative(range.toKWh)) return false;
    const contiguous = i === 0 ? range.fromKWh === 0 : range.fromKWh === previousTo + 1 || range.fromKWh === previousTo;
    if (!contiguous) return false;
    if (!last && (range.toKWh as number) <= range.fromKWh) return false;
    previousTo = last ? Infinity : (range.toKWh as number);
  }
  return true;
}

export function isValidBillingTariff(value: unknown): value is BillingTariff {
  if (!isRecord(value)) return false;
  if (typeof value.distributor !== 'string' || !value.distributor || typeof value.tariffCode !== 'string' || !value.tariffCode) return false;
  if (!finiteNonNegative(value.fixedChargeDOP)) return false;
  if (value.fixedChargeTiers !== undefined && !validRanges(value.fixedChargeTiers, 'chargeDOP', false)) return false;
  return validRanges(value.energyBlocks, 'rateDOP', true);
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
/**
 * Limpia solo el ruido de coma flotante (p. ej. 700.9999999999 → 701) sin redondear kWh reales: el cálculo y el arrastre
 * del crédito van sin redondear y se redondea solo al presentar. Así 700.96 kWh no salta a «todo al 4.º rango».
 */
const clean = (n: number) => Math.round(n * 1e9) / 1e9;

/** Factura de un mes con medición neta (SIE-007-2026-REG, art. 19). Sin inyección ni crédito es la factura sin sistema. */
export function calculateMonthlyBill(input: MonthlyBillInput): MonthlyBill {
  const withdrawnKWh = kWhOf(input.withdrawnKWh);
  const injectedKWh = kWhOf(input.injectedKWh);
  const creditInKWh = kWhOf(input.creditInKWh);
  const balance = withdrawnKWh - injectedKWh - creditInKWh;
  const netKWh = balance > 0 ? clean(balance) : 0;
  const creditCarriedKWh = balance < 0 ? clean(-balance) : 0;
  // El crédito anterior solo cubre lo que lo inyectado en el mes no alcanzó a cubrir.
  const creditAppliedKWh = clean(Math.min(creditInKWh, Math.max(0, withdrawnKWh - injectedKWh)));
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
  /** Remanente de crédito al cierre del año y su pago por la distribuidora (un ingreso del cliente). */
  settlement: { creditKWh: number; priceDOPPerKWh: number; amountDOP: number };
  /** Suma bruta de las doce facturas (lo que se paga a la distribuidora), sin descontar la liquidación. */
  billsDOP: number;
  /** Costo neto del año para el cliente: `billsDOP − settlement.amountDOP`. */
  netCostDOP: number;
}

/**
 * Doce facturas (enero a diciembre) con el crédito arrastrado mes a mes y la liquidación del remanente al cierre (art. 19, E.2; no confundir con el 19.2, transición de los clientes de medición neta existentes).
 * Exige exactamente doce meses: el crédito nunca cruza de un año a otro dentro de una llamada.
 */
export function calculateBillingYear(tariff: BillingTariff, months: ReadonlyArray<{ withdrawnKWh: number; injectedKWh: number }>, options: BillingYearOptions = {}): BillingYear {
  if (months.length !== 12) throw new RangeError(`Un año de facturación tiene 12 meses (recibidos: ${months.length}).`);
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
  const amountDOP = credit * priceDOPPerKWh;
  const billsDOP = bills.reduce((total, bill) => total + bill.totalDOP, 0);
  return { months: bills, settlement: { creditKWh: credit, priceDOPPerKWh, amountDOP }, billsDOP, netCostDOP: billsDOP - amountDOP };
}

// ── Liquidación anual del crédito ──

/** Tope de un precio de liquidación editado (RD$/kWh). */
export const MAX_SETTLEMENT_DOP_PER_KWH = 100;

/**
 * Precio de fábrica con que se valora el crédito que sobra al cierre del año. El reglamento manda el precio promedio de
 * referencia de contratos a 10 años de la CNE para solar FV (art. 19, E.2.ii), pero no se encontró publicado: hasta
 * confirmarlo vale 0 (el remanente no suma ahorro: estimación a la baja). Editable por propuesta
 * (`rates.annualCreditSettlementDOPPerKWh`).
 */
export const FACTORY_ANNUAL_CREDIT_SETTLEMENT = {
  dopPerKWh: 0,
  confirmed: false,
  source: 'Res. SIE-007-2026-REG, art. 19, E.2.ii: precio promedio de referencia de contratos de compra de energía a 10 años publicado por la CNE (Solar Fotovoltaica de inclinación fija). No se encontró publicado; valor conservador hasta confirmarlo.',
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

/** Distribuidora con el mismo criterio que el código de tarifa: sin espacios y en mayúsculas («edesur » → EDESUR). */
const normalizeDistributor = (value: unknown): string => (typeof value === 'string' ? value.trim().toUpperCase() : '');

/** Fila de facturación guardada en la propuesta, si es válida y corresponde a su distribuidora y tarifa actuales. */
export function proposalBillingTariff(rates: TariffBillingRatesInput | null | undefined): BillingTariff | undefined {
  const tariff = rates?.billingTariff;
  if (!isValidBillingTariff(tariff)) return undefined;
  const distributor = normalizeDistributor(rates?.distributor);
  if (!distributor || normalizeDistributor(tariff.distributor) !== distributor) return undefined;
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

/**
 * ¿Se factura con medición neta (neteo, arrastre del crédito y liquidación anual del remanente)? En SIE-007-2026 con
 * inyección a la red: por bloques con la fila de la tarifa, o a precio único sin ella (`engineBlockBilling`). La misma
 * regla decide si el dock muestra el precio de liquidación.
 */
export function usesNetBilling(rates: TariffBillingRatesInput | null | undefined): boolean {
  return resolveNetMeteringRegime(rates?.netMeteringRegime) === 'sie007_2026' && exportsToGrid(resolveGridConnection(rates));
}

export interface TariffPricePresentation {
  method: EnergyValuationMethod;
  /**
   * Solo con `block_billing`: precio medio de la energía de la factura sin sistema (RD$ por kWh consumido en el año,
   * bloques y regla de 701 kWh por mes). `undefined` sin consumo.
   */
  averageDOPPerKWh?: number;
}

/**
 * Cómo presentar el precio de la energía en el documento: con facturación por bloques no hay un precio escalar, sino un
 * precio medio resultante de los bloques; en los demás casos, el precio escalar de la propuesta. Es la misma decisión
 * del motor (`resolveEnergyValuationMethod`); los componentes no la repiten.
 */
export function tariffPricePresentation(rates: TariffBillingRatesInput | null | undefined, monthlyConsumptionKWh: readonly number[]): TariffPricePresentation {
  const tariff = resolveEnergyValuationMethod(rates) === 'block_billing' ? proposalBillingTariff(rates) : undefined;
  if (!tariff) return { method: 'flat_rate' };
  const total = monthlyConsumptionKWh.reduce((sum, kWh) => sum + kWhOf(kWh), 0);
  if (!(total > 0)) return { method: 'block_billing' };
  const chargeDOP = monthlyConsumptionKWh.reduce((sum, kWh) => sum + energyChargeDOP(tariff, kWhOf(kWh)), 0);
  return { method: 'block_billing', averageDOPPerKWh: chargeDOP / total };
}

export const ENERGY_VALUATION_METHOD_LABELS:Record<EnergyValuationMethod, string> = {
  block_billing: 'Factura por bloques de la tarifa',
  flat_rate: 'Precio por kWh de la propuesta',
};

/**
 * Procedencia del precio tras un cambio de tarifas (edición del dock, de agentes o borrador): regla pura de ADR 0004.
 * 1. Una procedencia válida en el propio cambio manda (la escribe quien fija el precio de referencia junto con la fila).
 *    Una inválida (o `null`) cuenta como ausente: no se guarda y queda la anterior, salvo que la regla 2 marque `manual`.
 * 2. Si cambia el precio sin procedencia, es un precio tecleado: `manual`.
 * 3. En otro caso no cambia. Un cambio de distribuidora o tarifa sin fila nueva lo reconcilia antes `applyProjectEdit`
 *    (`src/domain/projectEdit.ts`): con precio de referencia siembra la fila y el precio de la tarifa nueva; con un precio
 *    tecleado o de factura suelta la fila de la tarifa anterior.
 */
export function reconcileEnergyRateSource<R extends { energyCostPerKWh?: number; energyRateSource?: unknown }>(
  before: R,
  after: R,
  change: { energyCostPerKWh?: number; energyRateSource?: unknown },
): R {
  if (isEnergyRateSource(change.energyRateSource)) return after;
  let next = after;
  if (change.energyRateSource !== undefined) {
    // Procedencia no válida: como si no viniera (se restaura la anterior).
    const { energyRateSource: _drop, ...rest } = after;
    next = (isEnergyRateSource(before.energyRateSource) ? { ...rest, energyRateSource: before.energyRateSource } : rest) as R;
  }
  if (change.energyCostPerKWh !== undefined && change.energyCostPerKWh !== before.energyCostPerKWh) return { ...next, energyRateSource: 'manual' };
  return next;
}
