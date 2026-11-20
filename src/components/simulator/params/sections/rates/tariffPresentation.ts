/**
 * Presentación de la valoración tarifaria en el dock (fase 4 del plan tarifario). Funciones puras: solo ordenan y
 * rotulan lo que ya calculan `shared/tariffBilling.ts`, `shared/netMetering.ts` y el motor. No hay reglas tarifarias
 * nuevas aquí.
 */
import { resolveAssumptions } from '../../../../../../shared/assumptions';
import { exportsToGrid, resolveGridConnection } from '../../../../../../shared/gridConnection';
import { FACTORY_GRID_USE_CHARGES, gridUseChargeApplies, resolveNetMeteringRegime } from '../../../../../../shared/netMetering';
import {
  DEFAULT_FIXED_CHARGE_TIER_BASIS,
  ENERGY_VALUATION_METHOD_LABELS,
  FACTORY_ANNUAL_CREDIT_SETTLEMENT,
  calculateBillingYear,
  calculateMonthlyBill,
  proposalBillingTariff, usesNetBilling,
  resolveAnnualCreditSettlementDOPPerKWh,
  resolveEnergyValuationMethod,
  tariffPricePresentation,
  type EnergyValuationMethod,
} from '../../../../../../shared/tariffBilling';
import type { EnergyCalculationMode } from '../../../../../../shared/applicationFeatures';
import { calculateProjectFinancialSummary } from '../../../../../engine/financeEngine';
import type { ProjectSimulation, UtilityRates } from '../../../../../types';

/** Rótulo común de todo supuesto tarifario que todavía no se contrastó con facturas reales. */
export const UNVERIFIED_ESTIMATE_LABEL = 'Estimado, no verificado con facturas';

// ── Método de valoración vigente ──

/** ¿La tarifa tiene escalones de energía? Una de precio único es un solo tramo abierto desde 0. */
const hasEnergyBlocks = (tariff: { energyBlocks: readonly unknown[] }): boolean => tariff.energyBlocks.length > 1;

export interface ValuationMethodView {
  method: EnergyValuationMethod;
  label: string;
  /** Por qué se valora así (una frase). */
  detail: string;
}

/** Método con el que se valora la energía evitada y la razón, a partir de la regla única `resolveEnergyValuationMethod`. */
export function describeValuationMethod(rates: UtilityRates): ValuationMethodView {
  const method = resolveEnergyValuationMethod(rates);
  const label = ENERGY_VALUATION_METHOD_LABELS[method];
  if (method === 'block_billing') {
    const tariff = proposalBillingTariff(rates);
    const code = tariff?.tariffCode ?? 'la tarifa';
    const source = tariff?.resolutionCode ?? 'fila guardada';
    // Tarifa de precio único (BTD, MTD…): un solo tramo; el cargo de potencia queda fuera del ahorro (`shared/tariffBilling.ts`).
    if (tariff && !hasEnergyBlocks(tariff)) return { method, label, detail: `Factura sin sistema menos factura con sistema, con el precio único de energía y el cargo fijo de ${code} (${source}). El cargo por potencia no entra en el ahorro.` };
    return { method, label, detail: `Factura sin sistema menos factura con sistema, con los bloques y el cargo fijo de ${code} (${source}).` };
  }
  let detail: string;
  // SIE-007 con red y precio escalar: mismo neteo, arrastre y liquidación que con bloques (`engineBlockBilling`).
  const netted = !exportsToGrid(resolveGridConnection(rates)) ? '' : ' Con medición neta el excedente solo descuenta consumo; el crédito que sobra al cierre del año se liquida al precio de liquidación.';
  if (resolveGridConnection(rates) === 'off_grid') detail = 'Sistema aislado: se compara contra su alternativa de suministro, sin factura de la distribuidora.';
  else if (resolveNetMeteringRegime(rates.netMeteringRegime) !== 'sie007_2026') detail = 'Régimen anterior (retención %): cada kWh autoconsumido y lo exportado, menos la retención, se valoran al precio por kWh.';
  else if (rates.energyRateSource === 'manual') detail = 'Precio tecleado a mano: se respeta como precio único. «Aplicar tarifa oficial» devuelve la factura por bloques.' + netted;
  else if (rates.energyRateSource === 'invoice') detail = 'Precio tomado de una factura: se respeta como precio único.' + netted;
  else if (!proposalBillingTariff(rates)) detail = 'La propuesta no guarda la fila de esta tarifa (código desconocido, tarifa en US$ o tarifa cambiada). «Aplicar tarifa oficial» la guarda.' + netted;
  else detail = 'Sin procedencia del precio guardada (propuesta anterior): se valora al precio por kWh.' + netted;
  return { method, label, detail };
}

/**
 * Precio de energía que muestra el campo de la revisión del borrador: la referencia de la matriz (promedio por bloques del
 * mes promedio, sin redondear) se presenta con 2 decimales; un precio de factura o tecleado, tal cual. Solo presentación:
 * el escalar guardado conserva su precisión (como `referenceRatesPatch`).
 */
export function draftEnergyRateDisplayDOP(draft: { energyRateSource?: string; energyCostPerKWhDOP?: number }): number | undefined {
  const value = draft.energyCostPerKWhDOP;
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return draft.energyRateSource === 'reference' ? Math.round(value * 100) / 100 : value;
}

/**
 * Nota de la revisión del borrador bajo «Tarifa de energía» cuando la propuesta se factura por bloques escalonados: tarifa,
 * resolución, precio medio de la energía en el año (`tariffPricePresentation`, la misma decisión del motor) y qué es el
 * precio del campo (`fieldDOP`). `null` en otro caso.
 */
export function blockValuationNote(rates: UtilityRates, monthlyConsumptionKWh: readonly number[], fieldDOP?: number): string | null {
  const presentation = tariffPricePresentation(rates, monthlyConsumptionKWh);
  const tariff = presentation.method === 'block_billing' ? proposalBillingTariff(rates) : undefined;
  if (!tariff || !hasEnergyBlocks(tariff)) return null;
  const average = presentation.averageDOPPerKWh;
  return [
    `Se valora mes a mes con los bloques oficiales de ${tariff.tariffCode} (${tariff.resolutionCode ?? 'fila guardada'}).`,
    average !== undefined ? `Precio medio de la energía en el año: RD$${average.toFixed(2)}/kWh (sin cargo fijo).` : '',
    fieldDOP !== undefined && Number.isFinite(fieldDOP) ? `El campo de arriba (RD$${fieldDOP.toFixed(2)}/kWh) es el precio por bloques del mes promedio y solo sirve de referencia.` : '',
  ].filter(Boolean).join(' ');
}

// ── Desglose de la factura mensual estimada ──

export interface BillBreakdownLine {
  id: 'fixed' | 'energy' | 'gridUse';
  label: string;
  /** Promedio mensual (RD$) de la factura sin sistema. */
  beforeDOP: number;
  /** Promedio mensual (RD$) de la factura con sistema. */
  afterDOP: number;
}

export interface BillBreakdown {
  lines: BillBreakdownLine[];
  totalBeforeDOP: number;
  totalAfterDOP: number;
  /** Remanente de crédito liquidado al cierre del año, repartido por mes (RD$; 0 con el precio de fábrica). */
  settlementPerMonthDOP: number;
  /** Ahorro mensual promedio: antes − después + liquidación. */
  savingsPerMonthDOP: number;
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);

/**
 * Factura mensual promedio estimada sin y con sistema (RD$), con las funciones puras de `shared/tariffBilling.ts` y la
 * misma energía mensual que usa el motor. `null` si la propuesta no se valora por bloques (precio escalar o aislado).
 */
export function buildBillBreakdown(project: ProjectSimulation, calculationMode: EnergyCalculationMode = 'legacy'): BillBreakdown | null {
  if (resolveEnergyValuationMethod(project.rates) !== 'block_billing') return null;
  const tariff = proposalBillingTariff(project.rates);
  if (!tariff) return null;
  const assumptions = resolveAssumptions(project);
  const monthly = calculateProjectFinancialSummary(project, calculationMode).monthlyBreakdown;
  if (monthly.length !== 12) return null;
  const year = calculateBillingYear(
    tariff,
    // Misma energía que `withBlockBilling` del motor: retirada = consumo − autoconsumo; inyectada = exportada bruta.
    monthly.map((m) => ({ withdrawnKWh: Math.max(0, Math.round((m.consumptionKWh - m.solarSelfConsumedKWh) * 1e9) / 1e9), injectedKWh: m.gridExportedKWh })),
    { gridUseChargeDOPPerKWh: assumptions.appliedGridUseChargeDOPPerKWh, settlementDOPPerKWh: assumptions.annualCreditSettlementDOPPerKWh },
  );
  const before = monthly.map((m) => calculateMonthlyBill({ tariff, withdrawnKWh: m.consumptionKWh }));
  const lines: BillBreakdownLine[] = [
    { id: 'fixed', label: 'Cargo fijo', beforeDOP: average(before.map((b) => b.fixedChargeDOP)), afterDOP: average(year.months.map((b) => b.fixedChargeDOP)) },
    { id: 'energy', label: hasEnergyBlocks(tariff) ? 'Energía por bloques' : 'Energía (precio único)', beforeDOP: average(before.map((b) => b.energyChargeDOP)), afterDOP: average(year.months.map((b) => b.energyChargeDOP)) },
    { id: 'gridUse', label: 'Cargo por uso de la red', beforeDOP: 0, afterDOP: average(year.months.map((b) => b.gridUseChargeDOP)) },
  ];
  const totalBeforeDOP = average(before.map((b) => b.totalDOP));
  const totalAfterDOP = year.billsDOP / 12;
  const settlementPerMonthDOP = year.settlement.amountDOP / 12;
  return { lines, totalBeforeDOP, totalAfterDOP, settlementPerMonthDOP, savingsPerMonthDOP: totalBeforeDOP - totalAfterDOP + settlementPerMonthDOP };
}

// ── Supuestos no verificados ──

export interface UnverifiedAssumption {
  id: 'annual_settlement_price' | 'fixed_charge_tier_basis';
  title: string;
  /** Valor vigente, legible. */
  valueText: string;
  /** Qué se asume y por qué es conservador. */
  note: string;
  /** Solo el precio de liquidación tiene hoy un parámetro de la propuesta (`rates.annualCreditSettlementDOPPerKWh`). */
  editable: boolean;
}

/**
 * Supuestos de la fase 3 que ninguna factura confirmó todavía, con su valor vigente: el precio de liquidación del
 * remanente anual (con facturación neta, `usesNetBilling`) y el rango del cargo fijo (con bloques y cargo por rango).
 * La factura EDESUR NIC 2084605 (nov-2026) confirmó los otros dos: bloques sobre el consumo neto y cargo sobre la
 * inyección bruta al 25 % de la tarifa de referencia, que ya no se listan.
 */
export function unverifiedAssumptions(rates: UtilityRates): UnverifiedAssumption[] {
  const items: UnverifiedAssumption[] = [];
  // Sin inyección (inyección cero) no hay neteo, crédito ni liquidación: ningún supuesto tiene efecto.
  const injects = exportsToGrid(resolveGridConnection(rates));
  const tariff = injects && resolveEnergyValuationMethod(rates) === 'block_billing' ? proposalBillingTariff(rates) : undefined;
  // El remanente anual se liquida siempre que hay facturación neta: con bloques o a precio único (`usesNetBilling`).
  if (usesNetBilling(rates)) {
    const settlement = resolveAnnualCreditSettlementDOPPerKWh(rates);
    items.push({
      id: 'annual_settlement_price',
      title: 'Precio de liquidación anual del crédito',
      valueText: `RD$${settlement.toFixed(2)}/kWh`,
      note: `El crédito que sobra al cierre del año se paga al precio de referencia de la CNE a 10 años, que no se encontró publicado; de fábrica ${FACTORY_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh} (el remanente no suma ahorro).`,
      editable: true,
    });
  }
  if (tariff) {
    if (tariff.fixedChargeTiers?.length) {
      items.push({
        id: 'fixed_charge_tier_basis',
        title: 'Rango del cargo fijo',
        valueText: DEFAULT_FIXED_CHARGE_TIER_BASIS === 'withdrawn' ? 'Según la energía retirada de la red' : 'Según el consumo neto facturado',
        note: 'Con medición neta no está confirmado qué consumo elige el rango; se usa la energía retirada, que da la factura con sistema más alta (ahorro a la baja).',
        editable: false,
      });
    }
  }
  return items;
}

/** RD$ con separador de miles y dos decimales. */
export const formatDOP = (value: number): string => `RD$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Cargos de fábrica (Ajustes) ──

export interface FactoryChargeRow {
  distributor: string;
  dopPerKWh: number;
  resolutionCode: string;
  period: string;
}

/** Cargo por uso de la red de fábrica de cada distribuidora, tal como lo siembra una propuesta nueva. */
export function factoryChargeRows(): FactoryChargeRow[] {
  return Object.entries(FACTORY_GRID_USE_CHARGES).map(([distributor, source]) => ({ distributor, ...source }));
}
