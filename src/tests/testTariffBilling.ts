import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import {
  BLOCK_BILLING_RATE_SOURCES, FACTORY_ANNUAL_CREDIT_SETTLEMENT, calculateBillingYear, calculateMonthlyBill, energyChargeDOP, fixedChargeDOP,
  isValidBillingTariff, proposalBillingTariff, reconcileEnergyRateSource, resolveAnnualCreditSettlementDOPPerKWh, resolveEnergyValuationMethod,
  type BillingTariff,
} from '../../shared/tariffBilling';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD, referenceBillingTariff } from '../data/rdTariffs';
import { applyProjectEdit } from '../domain/projectEdit';
import { isReferenceApplied, planApplyReference, planDistributorChange, planTariffChange, type ChangeContext } from '../components/simulator/params/sections/rates/ratesLogic';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import type { LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';

/**
 * Fase 3 del plan tarifario: en el régimen SIE-007-2026 el ahorro se valora como factura sin sistema − factura con
 * sistema (bloques con la regla de 701 kWh, cargo fijo por rango, neteo kWh contra kWh con arrastre del crédito,
 * cargo por uso de la red y liquidación anual del remanente). Solo cuando la propuesta tiene la fila de su tarifa y
 * el precio del kWh no se fijó a mano ni desde una factura. El régimen anterior no cambia (`testNetMeteringRegime`).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (actual: number, expected: number, message: string, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);

const edesurBts1 = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1') as BillingTariff;
const edesurBtd = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTD') as BillingTariff;
assert.ok(isValidBillingTariff(edesurBts1), 'fila BTS-1 de EDESUR');
assert.ok(isValidBillingTariff(edesurBtd), 'fila BTD de EDESUR');
assert.equal(edesurBts1.resolutionCode, 'SIE-121-2026-TF');
assert.equal(referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS-1')?.tariffCode, 'BTS1', 'código normalizado');
assert.equal(referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'XYZ'), undefined, 'sin fila: sin facturación por bloques');
assert.equal(referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'RMT-1'), undefined, 'tarifa en US$: sin bloques en RD$');
assert.equal(referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'BTS1')?.tariffCode, 'RBT-1', 'alias de CEPM');
for (const invalid of [undefined, null, {}, { ...edesurBts1, energyBlocks: [] }, { ...edesurBts1, fixedChargeDOP: -1 }, { ...edesurBts1, energyBlocks: [{ fromKWh: 0, toKWh: 200, rateDOP: 6 }] }]) {
  assert.equal(isValidBillingTariff(invalid), false, JSON.stringify(invalid));
}

// 1. Factura mensual por bloques, casos de mano (EDESUR BTS-1, SIE-121-2026-TF: 6.05 / 8.59 / 12.89 / 13.09;
//    cargo fijo 42.10 de 0 a 100 kWh y 128.59 desde 101 kWh).
const bill = (kWh: number) => calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: kWh });
close(bill(250).energyChargeDOP, 200 * 6.05 + 50 * 8.59, '250 kWh: escalonado');
close(bill(250).totalDOP, 1639.5 + 128.59, '250 kWh: total');
close(bill(700).energyChargeDOP, 200 * 6.05 + 100 * 8.59 + 400 * 12.89, '700 kWh: escalonado');
close(bill(700).totalDOP, 7225 + 128.59, '700 kWh: total');
close(bill(701).energyChargeDOP, 701 * 13.09, '701 kWh: todo al 4.º rango (art. 4.d)');
close(bill(1000).energyChargeDOP, 13090, '1,000 kWh: todo a 13.09');
close(bill(1000).totalDOP, 13218.59, '1,000 kWh: total');
close(bill(100).fixedChargeDOP, 42.1, '100 kWh: cargo fijo del rango 0–100');
close(bill(101).fixedChargeDOP, 128.59, '101 kWh: cargo fijo del rango ≥101');
close(bill(0).totalDOP, 42.1, 'consumo nulo: solo el cargo fijo (art. 19.1.a)');
close(energyChargeDOP(edesurBts1, 80), 484, 'energía 80 kWh');
close(fixedChargeDOP(edesurBts1, 80), 42.1, 'cargo fijo 80 kWh');
close(calculateMonthlyBill({ tariff: edesurBtd, withdrawnKWh: 3000 }).totalDOP, 3000 * 9.02 + 210.15, 'BTD: precio único + cargo fijo, sin potencia');

// 2. Neteo kWh contra kWh dentro del mes (art. 19.1.b y definición de consumo neto, art. 6.10).
const netted = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 400, injectedKWh: 200, gridUseChargeDOPPerKWh: 3.78 });
assert.equal(netted.netKWh, 200);
close(netted.energyChargeDOP, 1210, 'neto 200 kWh al 1.er rango');
close(netted.gridUseChargeDOP, 756, 'cargo por uso de la red: 200 kWh inyectados × 3.78');
close(netted.totalDOP, 2094.59, 'factura con sistema del ejemplo de la auditoría (C.4)');
const surplus = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 100, injectedKWh: 300, creditInKWh: 50, gridUseChargeDOPPerKWh: 3.78 });
assert.equal(surplus.netKWh, 0, 'balance a favor: sin cargo de energía');
assert.equal(surplus.energyChargeDOP, 0);
assert.equal(surplus.creditCarriedKWh, 250, 'el excedente (300 − 100) más el crédito anterior pasa al mes siguiente');
assert.equal(surplus.creditAppliedKWh, 0, 'el crédito anterior no se usa en un mes con excedente');
close(surplus.fixedChargeDOP, 42.1, 'cargo fijo siempre');
close(surplus.gridUseChargeDOP, 300 * 3.78, 'cargo sobre todo lo inyectado');
const usesCredit = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 500, injectedKWh: 100, creditInKWh: 250 });
assert.equal(usesCredit.netKWh, 150);
assert.equal(usesCredit.creditAppliedKWh, 250);
assert.equal(usesCredit.creditCarriedKWh, 0);
const partialCredit = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 300, injectedKWh: 100, creditInKWh: 500 });
assert.deepEqual([partialCredit.netKWh, partialCredit.creditAppliedKWh, partialCredit.creditCarriedKWh], [0, 200, 300]);

// 3. Doce meses: arrastre del crédito y liquidación anual del remanente (art. 19.2).
const months = [
  { withdrawnKWh: 100, injectedKWh: 400 }, // +300
  { withdrawnKWh: 300, injectedKWh: 100 }, // usa 200 → quedan 100
  ...Array.from({ length: 9 }, () => ({ withdrawnKWh: 200, injectedKWh: 200 })), // neto 0, el crédito se conserva
  { withdrawnKWh: 50, injectedKWh: 250 }, // +200 → 300 al cierre
];
const year = calculateBillingYear(edesurBts1, months, { gridUseChargeDOPPerKWh: 0, settlementDOPPerKWh: 5 });
assert.deepEqual(year.months.map((m) => m.creditCarriedKWh), [300, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300]);
assert.deepEqual(year.months.map((m) => m.creditInKWh), [0, 300, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], 'enero empieza sin crédito: el del año previo se pagó');
assert.equal(year.settlement.creditKWh, 300);
close(year.settlement.amountDOP, 1500, 'remanente × precio de liquidación');
assert.equal(calculateBillingYear(edesurBts1, months, { gridUseChargeDOPPerKWh: 0 }).settlement.amountDOP, 0, 'sin precio: valor de fábrica');
close(year.billsDOP, year.months.reduce((t, m) => t + m.totalDOP, 0), 'billsDOP: suma bruta de las doce facturas');
close(year.netCostDOP, year.billsDOP - 1500, 'netCostDOP: facturas − liquidación');
assert.throws(() => calculateBillingYear(edesurBts1, months.slice(0, 11)), RangeError, 'un año son doce meses');
assert.throws(() => calculateBillingYear(edesurBts1, [...months, months[0]]), RangeError, 'el crédito no cruza de año');
assert.equal(FACTORY_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh, 0, 'precio CNE no confirmado: valor conservador');
assert.equal(FACTORY_ANNUAL_CREDIT_SETTLEMENT.confirmed, false);
assert.match(FACTORY_ANNUAL_CREDIT_SETTLEMENT.source, /19\.2/);
assert.equal(resolveAnnualCreditSettlementDOPPerKWh({}), 0);
assert.equal(resolveAnnualCreditSettlementDOPPerKWh({ annualCreditSettlementDOPPerKWh: 4.2 }), 4.2);
assert.equal(resolveAnnualCreditSettlementDOPPerKWh({ annualCreditSettlementDOPPerKWh: -1 }), 0, 'no válido: fábrica');

// 4. Regla de decisión: bloques solo en SIE-007, con la fila de la tarifa y precio de referencia.
const blockRates = (overrides: Partial<UtilityRates> = {}): Partial<UtilityRates> => ({
  distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026', energyRateSource: 'reference', billingTariff: edesurBts1, ...overrides,
});
assert.deepEqual([...BLOCK_BILLING_RATE_SOURCES], ['reference']);
assert.equal(resolveEnergyValuationMethod(blockRates()), 'block_billing');
assert.equal(resolveEnergyValuationMethod(blockRates({ tariffCode: 'BTS-1' })), 'block_billing', 'código con guion');
assert.equal(resolveEnergyValuationMethod(blockRates({ netMeteringRegime: 'legacy_retention' })), 'flat_rate', 'régimen anterior');
assert.equal(resolveEnergyValuationMethod(blockRates({ netMeteringRegime: undefined })), 'flat_rate', 'sin régimen = anterior');
assert.equal(resolveEnergyValuationMethod(blockRates({ energyRateSource: 'manual' })), 'flat_rate', 'precio tecleado');
assert.equal(resolveEnergyValuationMethod(blockRates({ energyRateSource: 'invoice' })), 'flat_rate', 'precio de factura');
assert.equal(resolveEnergyValuationMethod(blockRates({ energyRateSource: undefined })), 'flat_rate', 'sin indicador: escalar (como hoy)');
assert.equal(resolveEnergyValuationMethod(blockRates({ billingTariff: undefined })), 'flat_rate', 'sin fila guardada');
assert.equal(resolveEnergyValuationMethod(blockRates({ tariffCode: 'BTS2' })), 'flat_rate', 'fila de otra tarifa');
assert.equal(resolveEnergyValuationMethod(blockRates({ distributor: 'EDENORTE' })), 'flat_rate', 'fila de otra distribuidora');
assert.equal(resolveEnergyValuationMethod(blockRates({ gridConnection: 'off_grid', isZeroExport: true })), 'flat_rate', 'aislado: su propia valoración');
assert.equal(resolveEnergyValuationMethod(blockRates({ gridConnection: 'zero_export', isZeroExport: true })), 'block_billing', 'inyección cero: bloques');
assert.equal(proposalBillingTariff(blockRates({ tariffCode: 'BTS2' })), undefined);
assert.equal(resolveAssumptions({ rates: blockRates() }).energyValuationMethod, 'block_billing', 'expuesto en los supuestos efectivos');
assert.equal(resolveAssumptions({}).energyValuationMethod, 'flat_rate');
assert.equal(resolveAssumptions({}).annualCreditSettlementDOPPerKWh, 0);

// 5. Motor.
const specs = (overrides: Partial<LegacyProjectSpecs>) => migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 600, panelCount: 10, autoCalculatePanels: false, panelBrandModel: 'Panel (600W)',
  inverterPowerKW: 5, inverterCount: 1, inverterBrandModel: 'Inversor (5 kW)', hasBattery: false, batteryCapacityKWh: 0, batteryCount: 0,
  dopExchangeRate: 60, saleMarginMultiplier: 1.25, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 1500, batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90, ...overrides,
} as LegacyProjectSpecs);
const project = (rates: Partial<UtilityRates>, monthlyKWh: number | number[] = 1000, specOverrides: Partial<LegacyProjectSpecs> = { panelCount: 9 }): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'tariff-billing',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS1' },
  specs: specs(specOverrides),
  rates: { energyCostPerKWh: 0.218, distributor: 'EDESUR', targetCoveragePct: 95, tariffCode: 'BTS1', currency: 'USD', usdExchangeRate: 60, gridExportFeePct: 25, annualEnergyInflationPct: 3.5, ...rates },
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array.isArray(monthlyKWh) ? monthlyKWh : Array(12).fill(monthlyKWh),
});
const MODES: EnergyCalculationMode[] = ['legacy', 'self_consumption'];

for (const mode of MODES) {
  // 5a. Ahorro SIE-007 por bloques = factura sin sistema − factura con sistema, calculadas con la función compartida.
  const p = project(blockRates());
  const summary = calculateProjectFinancialSummary(p, mode);
  const flat = calculateProjectFinancialSummary(project(blockRates({ energyRateSource: 'manual' })), mode);
  const expectedYear = calculateBillingYear(edesurBts1, summary.monthlyBreakdown.map((m) => ({ withdrawnKWh: Math.max(0, m.consumptionKWh - m.solarSelfConsumedKWh), injectedKWh: m.gridExportedKWh })), { gridUseChargeDOPPerKWh: 3.78, settlementDOPPerKWh: 0 });
  summary.monthlyBreakdown.forEach((m, i) => {
    const flatMonth = flat.monthlyBreakdown[i];
    assert.equal(m.productionKWh, flatMonth.productionKWh, 'el modelo energético no cambia');
    assert.equal(m.solarSelfConsumedKWh, flatMonth.solarSelfConsumedKWh, 'autoconsumo legacy igual');
    assert.equal(m.gridExportedKWh, flatMonth.gridExportedKWh, 'inyección igual');
    assert.equal(m.retainedExportKWh, 0, 'SIE-007: sin retención');
    const without = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: m.consumptionKWh });
    assert.equal(m.originalBillUSD, r2(without.totalDOP / 60), `${mode} ${m.month}: factura sin sistema`);
    assert.equal(m.netBillUSD, r2(expectedYear.months[i].totalDOP / 60), `${mode} ${m.month}: factura con sistema`);
    assert.equal(m.savingsUSD, r2(m.originalBillUSD - m.netBillUSD), `${mode} ${m.month}: ahorro = diferencia de facturas`);
    assert.ok(m.tariffBill, 'desglose de la factura presente');
    assert.equal(m.tariffBill!.creditCarriedKWh, expectedYear.months[i].creditCarriedKWh);
    assert.equal(m.tariffBill!.netBilledKWh, expectedYear.months[i].netKWh);
    assert.equal(m.gridUseChargeUSD, r2(expectedYear.months[i].gridUseChargeDOP / 60));
    // Precio tecleado en SIE-007: misma facturación neta a precio único (sin cargo fijo), ver `testRegimeConsistency`.
    assert.equal(flatMonth.tariffBill?.fixedChargeUSD, 0, 'escalar SIE-007: precio único sin cargo fijo');
  });
  assert.equal(summary.year1SavingsUSD, r2(summary.monthlyBreakdown.reduce((total, m) => total + m.savingsUSD, 0)), 'año 1 = suma mensual');
  assert.equal(summary.cashFlow25Years[0].savingsUSD, summary.year1SavingsUSD, 'el flujo de caja sale de los ahorros nuevos');
  assert.equal(summary.annualCreditSettlementUSD, 0, 'liquidación con el precio de fábrica (0)');
  assert.notEqual(summary.year1SavingsUSD, flat.year1SavingsUSD, 'bloques ≠ escalar');
  assert.equal(flat.annualCreditSettlementUSD, 0, 'escalar SIE-007: remanente liquidado al precio de fábrica (0)');

  // 5b. Liquidación anual con precio: sistema sobredimensionado (remanente al cierre) suma remanente × precio en diciembre.
  const oversized = project(blockRates({ annualCreditSettlementDOPPerKWh: 4 }), 300, { panelCount: 9 });
  const over = calculateProjectFinancialSummary(oversized, mode);
  const dec = over.monthlyBreakdown[11];
  assert.ok(over.annualCreditSettlementKWh! > 0, 'hay remanente al cierre del año');
  assert.equal(over.annualCreditSettlementUSD, r2(over.annualCreditSettlementKWh! * 4 / 60));
  assert.equal(dec.savingsUSD, r2(dec.originalBillUSD - dec.netBillUSD + over.annualCreditSettlementUSD!), 'la liquidación entra en diciembre');
  assert.equal(dec.tariffBill!.creditSettlementUSD, over.annualCreditSettlementUSD);

  // 5c. Precio manual o de factura: se valora con el escalar (más el cargo por uso de la red), como en la fase 2.
  const withoutIndicator = calculateProjectFinancialSummary(project({ netMeteringRegime: 'sie007_2026' }), mode);
  assert.deepEqual(calculateProjectFinancialSummary(project(blockRates({ energyRateSource: 'manual' })), mode).monthlyBreakdown, withoutIndicator.monthlyBreakdown, 'manual ≡ fase 2');
  assert.deepEqual(calculateProjectFinancialSummary(project(blockRates({ energyRateSource: 'invoice' })), mode).monthlyBreakdown, withoutIndicator.monthlyBreakdown, 'factura ≡ fase 2');
  withoutIndicator.monthlyBreakdown.forEach((m) => {
    // Facturación neta a precio único (SIE-007): ahorro = diferencia de facturas; sin crédito arrastrado coincide con la
    // fórmula de la fase 2 (kWh evitados × precio − cargo) salvo el redondeo de cada factura a centavos.
    assert.equal(m.savingsUSD, r2(m.originalBillUSD! - m.netBillUSD!));
    if (!m.tariffBill?.creditInKWh && !m.tariffBill?.creditCarriedKWh) close(m.savingsUSD, r2(m.effectiveSavedKWh * 0.218) - m.gridUseChargeUSD!, 'sin crédito: como la fase 2', 0.011);
  });

  // 5d. BTD con precio de referencia: energía a su precio único, cargo de potencia fuera del ahorro, sin cargo por uso de red.
  const btdP = project({ ...blockRates(), tariffCode: 'BTD', billingTariff: edesurBtd, energyCostPerKWh: 0.15 }, 3000, { panelCount: 60, inverterPowerKW: 15, inverterCount: 2 });
  const btd = calculateProjectFinancialSummary(btdP, mode);
  const btdYear = calculateBillingYear(edesurBtd, btd.monthlyBreakdown.map((m) => ({ withdrawnKWh: Math.max(0, m.consumptionKWh - m.solarSelfConsumedKWh), injectedKWh: m.gridExportedKWh })), { gridUseChargeDOPPerKWh: 0 });
  btd.monthlyBreakdown.forEach((m, i) => {
    assert.equal(m.gridUseChargeUSD, 0, 'BTD: sin cargo por uso de red');
    assert.equal(m.originalBillUSD, r2((m.consumptionKWh * 9.02 + 210.15) / 60));
    assert.equal(m.netBillUSD, r2(btdYear.months[i].totalDOP / 60));
  });

  // 5e. Inyección cero: sin crédito ni cargo, pero sí bloques.
  const zero = calculateProjectFinancialSummary(project(blockRates({ gridConnection: 'zero_export', isZeroExport: true })), mode);
  zero.monthlyBreakdown.forEach((m) => {
    assert.equal(m.gridExportedKWh, 0);
    assert.equal(m.tariffBill!.creditCarriedKWh, 0);
    assert.equal(m.gridUseChargeUSD, 0);
    const withdrawn = Math.max(0, m.consumptionKWh - m.solarSelfConsumedKWh);
    assert.equal(m.netBillUSD, r2(calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: withdrawn }).totalDOP / 60), 'bloques sobre lo retirado');
  });

  // 5f. Aislado: sin cambios (su valoración por alternativa de suministro).
  const islandFields = { gridConnection: 'off_grid' as const, isZeroExport: true };
  assert.deepEqual(calculateProjectFinancialSummary(project(blockRates(islandFields)), mode), calculateProjectFinancialSummary(project({ ...islandFields, netMeteringRegime: 'sie007_2026' }), mode), 'aislado no lee la tarifa por bloques');

  // 5g. Régimen anterior: los campos nuevos no cambian nada.
  const legacyFields = { energyRateSource: 'reference' as const, billingTariff: edesurBts1 };
  assert.deepEqual(calculateProjectFinancialSummary(project(legacyFields), mode), calculateProjectFinancialSummary(project({}), mode), 'legacy_retention sin cambios');

  // 5h. Serialización: la propuesta guardada (JSON) da las mismas cifras.
  const saved = JSON.parse(JSON.stringify(p)) as ProjectSimulation;
  assert.deepEqual(calculateProjectFinancialSummary(saved, mode), summary, 'JSON ida y vuelta');
  // 5i. La matriz de fábrica no entra en el cálculo de una propuesta guardada: manda su fila guardada.
  const original = structuredClone(DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.tariffs.BTS1);
  DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.tariffs.BTS1.blocks = original.blocks?.map((block) => ({ ...block, rateDOP: 999 }));
  try {
    assert.deepEqual(calculateProjectFinancialSummary(p, mode), summary, 'la matriz no entra en el cálculo');
  } finally {
    DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.tariffs.BTS1 = original;
  }
}

// 6. Indicador del precio y fila guardada (ADR 0004: la regla vive en applyProjectEdit y en la planificación del dock).
const ctx = (rates: Pick<UtilityRates, 'distributor' | 'tariffCode'>): ChangeContext => ({ matrix: DEFAULT_RD_TARIFF_MATRIX, avgMonthlyConsumption: 1000, dopExchangeRate: 60, rates, canWriteSpecs: false });
const tariffPlan = planTariffChange(ctx({ distributor: 'EDESUR', tariffCode: 'BTS2' }), 'BTS1');
assert.equal(tariffPlan.rates.energyRateSource, 'reference');
assert.deepEqual(tariffPlan.rates.billingTariff, edesurBts1);
assert.equal(tariffPlan.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1', 1000, 60));
const distributorPlan = planDistributorChange(ctx({ distributor: 'EDESUR', tariffCode: 'BTS1' }), 'EDENORTE');
assert.equal(distributorPlan.rates.billingTariff?.distributor, 'EDENORTE');
assert.equal(distributorPlan.rates.energyRateSource, 'reference');
const applyPlan = planApplyReference(ctx({ distributor: 'EDESUR', tariffCode: 'BTS1' }));
assert.equal(applyPlan.energyRateSource, 'reference');
assert.deepEqual(applyPlan.billingTariff, edesurBts1);
assert.equal(planTariffChange(ctx({ distributor: 'EDESUR', tariffCode: 'BTS1' }), 'XYZ').rates.billingTariff, undefined, 'sin fila: sin bloques');

const editCtx = { equipmentCatalog: [] };
const reference = project(blockRates());
const typed = applyProjectEdit(reference, { kind: 'rates', patch: { energyCostPerKWh: 0.25 } }, editCtx);
assert.equal(typed.rates.energyRateSource, 'manual', 'precio tecleado: manual');
assert.equal(resolveAssumptions(typed).energyValuationMethod, 'flat_rate');
assert.equal(applyProjectEdit(reference, { kind: 'rates', patch: { energyCostPerKWh: reference.rates.energyCostPerKWh } }, editCtx).rates.energyRateSource, 'reference', 'mismo precio: sin cambio');
assert.equal(applyProjectEdit(reference, { kind: 'rates', patch: { targetCoveragePct: 90 } }, editCtx).rates.energyRateSource, 'reference', 'otro campo: sin cambio');
const reapplied = applyProjectEdit(typed, { kind: 'rates', patch: applyPlan }, editCtx);
assert.equal(reapplied.rates.energyRateSource, 'reference', 'aplicar tarifa oficial: de nuevo referencia');
assert.equal(resolveAssumptions(reapplied).energyValuationMethod, 'block_billing');
// Cambio de tarifa sin fila en el parche (asistente, agentes): con precio de referencia se siembra la fila nueva
// (`testRegimeConsistency` cubre el resto: precio tecleado, distribuidora, matriz activa).
const retariffed = applyProjectEdit(reference, { kind: 'rates', patch: { tariffCode: 'BTS2' } }, editCtx);
assert.equal(retariffed.rates.energyRateSource, 'reference');
assert.equal(retariffed.rates.billingTariff?.tariffCode, 'BTS2', 'cambio de tarifa: fila de la tarifa nueva');
assert.equal(resolveAssumptions(retariffed).energyValuationMethod, 'block_billing', 'cambio de tarifa: sigue por bloques');
assert.deepEqual(reconcileEnergyRateSource({ energyCostPerKWh: 0.2 }, { energyCostPerKWh: 0.3, energyRateSource: 'invoice' }, { energyCostPerKWh: 0.3, energyRateSource: 'invoice' }), { energyCostPerKWh: 0.3, energyRateSource: 'invoice' }, 'el cambio explícito manda');
assert.equal(reconcileEnergyRateSource({ energyCostPerKWh: 0.2 }, { energyCostPerKWh: 0.3, energyRateSource: 'nuevo' as never }, { energyRateSource: 'nuevo' as never }).energyRateSource, undefined, 'valor desconocido: no se guarda');

// 7. Propuesta nueva: nace con el precio de referencia y la fila de su tarifa (bloques en SIE-007).
store.setState({ projects: [], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultDistributor: 'EDESUR', defaultTariffCode: 'BTS1' } } as never);
store.getState().createNewProject({ name: 'Bloques', distributor: 'EDESUR', tariffCode: 'BTS1' } as never);
const created = store.getState().projects[0];
assert.equal(created.rates.netMeteringRegime, 'sie007_2026');
assert.equal(created.rates.energyRateSource, 'reference');
assert.deepEqual(created.rates.billingTariff, referenceBillingTariff(store.getState().tariffMatrix, 'EDESUR', 'BTS1'));
const createdAverage = created.monthlyConsumption.reduce((a, b) => a + b, 0) / 12;
assert.equal(created.rates.energyCostPerKWh, getReferenceEnergyRateUSD(store.getState().tariffMatrix, 'EDESUR', 'BTS1', createdAverage, resolveAssumptions(created).dopExchangeRate));
assert.equal(resolveAssumptions(created).energyValuationMethod, 'block_billing');

// 8. Borrador de IA: referencia → fila guardada; precio de factura → escalar.
const draftBase = createAIProposalBase(BENCHMARK_PROJECT, DEFAULT_SIMULATION_SETTINGS, 'Santiago');
const rawDraft = { responseKind: 'proposal', assistantMessage: 'ok', clientName: 'Cliente', monthlyConsumptionKWh: Array(12).fill(1000), consumptionSource: 'invoice', distributor: 'EDESUR', tariffCode: 'BTS-1', dopExchangeRate: 60, confidenceScore: 90 };
const refDraft = normalizeProposalDraft({ ...rawDraft, energyCostPerKWhDOP: null, energyRateSource: 'reference', panels: [], inverters: [], batteries: [] }, []);
const aiReference = prepareProposalDraftProject(draftBase, refDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
assert.equal(aiReference.rates.energyRateSource, 'reference');
assert.deepEqual(aiReference.rates.billingTariff, edesurBts1);
assert.equal(resolveAssumptions(aiReference).energyValuationMethod, 'block_billing');
const invoiceDraft = normalizeProposalDraft({ ...rawDraft, energyCostPerKWhDOP: 12.5, panels: [], inverters: [], batteries: [] }, []);
const aiInvoice = prepareProposalDraftProject(draftBase, invoiceDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
assert.equal(aiInvoice.rates.energyRateSource, 'invoice');
assert.equal(resolveAssumptions(aiInvoice).energyValuationMethod, 'flat_rate');

// 10. Revisión (segunda tanda).
// 10.1 Procedencia inválida o null junto con un precio nuevo: cuenta como ausente y el precio tecleado es manual.
for (const bad of [null, 'nuevo', 7]) {
  const edited = reconcileEnergyRateSource({ energyCostPerKWh: 0.2, energyRateSource: 'reference' }, { energyCostPerKWh: 0.3, energyRateSource: bad as never }, { energyCostPerKWh: 0.3, energyRateSource: bad });
  assert.equal(edited.energyRateSource, 'manual', `procedencia ${String(bad)} con precio nuevo`);
  const untouched = reconcileEnergyRateSource({ energyCostPerKWh: 0.2, energyRateSource: 'reference' }, { energyCostPerKWh: 0.2, energyRateSource: bad as never }, { energyRateSource: bad });
  assert.equal(untouched.energyRateSource, 'reference', `procedencia ${String(bad)} sin precio: se conserva la anterior`);
}
// 10.3 Sin redondeo prematuro: umbrales de 701 kWh y del cargo fijo, y conservación del crédito.
close(bill(700.96).energyChargeDOP, 7225 + 0.96 * 13.09, '700.96 kWh: escalonado (no llega a 701)');
close(bill(700.4).energyChargeDOP, 7225 + 0.4 * 13.09, '700.4 kWh: escalonado');
close(bill(701).energyChargeDOP, 701 * 13.09, '701 kWh: todo al 4.º rango');
const netTier = (net: number) => calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: net, fixedChargeTierBasis: 'net' }).fixedChargeDOP;
close(netTier(100.04), 128.59, 'neto 100.04 kWh: rango ≥101 (pasa de 100)');
close(netTier(100), 42.1, 'neto 100 kWh: rango 0–100');
close(netTier(101), 128.59, 'neto 101 kWh: rango ≥101');
close(calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 800.96, injectedKWh: 100 }).energyChargeDOP, 7225 + 0.96 * 13.09, 'neto 700.96 tras netear: escalonado');
{
  const fractional = Array.from({ length: 12 }, (_, i) => ({ withdrawnKWh: 150.37 + i * 13.11, injectedKWh: i % 3 === 0 ? 240.29 : 101.07 }));
  const y = calculateBillingYear(edesurBts1, fractional);
  let credit = 0;
  y.months.forEach((m, i) => {
    assert.ok(Math.abs(m.creditInKWh - credit) < 1e-9, `mes ${i}: entra el crédito arrastrado sin redondear`);
    const surplus = Math.max(0, m.injectedKWh - m.withdrawnKWh);
    assert.ok(Math.abs(m.creditCarriedKWh - (m.creditInKWh - m.creditAppliedKWh + surplus)) < 1e-9, `mes ${i}: crédito conservado`);
    assert.ok(Math.abs(m.netKWh - Math.max(0, m.withdrawnKWh - m.injectedKWh - m.creditInKWh)) < 1e-9, `mes ${i}: neto sin redondear`);
    credit = m.creditCarriedKWh;
  });
  const totalIn = fractional.reduce((t, m) => t + m.injectedKWh, 0);
  const used = y.months.reduce((t, m) => t + Math.min(m.withdrawnKWh, m.injectedKWh) + m.creditAppliedKWh, 0);
  assert.ok(Math.abs(totalIn - used - y.settlement.creditKWh) < 1e-6, 'lo inyectado = lo neteado + el remanente liquidado');
}
// 10.4 Meses con ahorro negativo (consumo 0 o inyección alta): la suma anual y las métricas siguen siendo finitas.
for (const mode of MODES) {
  const zeroMonths = calculateProjectFinancialSummary(project(blockRates(), [0, 0, 0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000], { panelCount: 9 }), mode);
  assert.ok(zeroMonths.monthlyBreakdown.slice(0, 3).every((m) => m.savingsUSD < 0), `${mode}: sin consumo, el cargo fijo y el de red dan ahorro negativo`);
  assert.equal(zeroMonths.year1SavingsUSD, r2(zeroMonths.monthlyBreakdown.reduce((t, m) => t + m.savingsUSD, 0)), 'la suma anual incluye los meses negativos');
  for (const key of ['year1SavingsUSD', 'paybackYears', 'irrPct', 'npvUSD', 'roi25YrPct', 'total25YearSavingsUSD'] as const) assert.ok(Number.isFinite(zeroMonths[key]), `${mode} ${key} finito`);
  const idle = calculateProjectFinancialSummary(project(blockRates(), 0, { panelCount: 9 }), mode);
  assert.ok(idle.year1SavingsUSD <= 0, 'sin consumo en todo el año: ahorro ≤ 0');
  for (const key of ['year1SavingsUSD', 'paybackYears', 'irrPct', 'npvUSD', 'roi25YrPct'] as const) assert.ok(Number.isFinite(idle[key]), `${mode} sin consumo: ${key} finito`);
}
// 10.5 Distribuidora con el mismo criterio que el código; contigüidad impresa inclusiva; energía a precio 0 no es una fila válida.
assert.equal(resolveEnergyValuationMethod(blockRates({ distributor: ' edesur ' as never })), 'block_billing', 'distribuidora en minúsculas o con espacios');
// Tercera tanda: también límites compartidos (0–200, 200–…), que acepta el escáner de resoluciones y `averageBlockEnergyRateDOP`.
const sharedLimits = { ...edesurBts1, energyBlocks: [{ fromKWh: 0, toKWh: 200, rateDOP: 6.05 }, { fromKWh: 200, toKWh: 300, rateDOP: 8.59 }, { fromKWh: 300, toKWh: 700, rateDOP: 12.89 }, { fromKWh: 700, toKWh: null, rateDOP: 13.09 }], fixedChargeTiers: [{ fromKWh: 0, toKWh: 100, chargeDOP: 42.1 }, { fromKWh: 100, toKWh: null, chargeDOP: 128.59 }] };
assert.equal(isValidBillingTariff(sharedLimits), true, 'límites compartidos: fila válida, no cae al escalar');
close(calculateMonthlyBill({ tariff: sharedLimits, withdrawnKWh: 250 }).totalDOP, 1639.5 + 128.59, 'límites compartidos: mismo importe que los impresos');
close(fixedChargeDOP(sharedLimits, 100), 42.1, 'límites compartidos: 100 kWh en el primer rango');
assert.equal(isValidBillingTariff({ ...edesurBts1, energyBlocks: [{ fromKWh: 0, toKWh: 200, rateDOP: 6 }, { fromKWh: 250, toKWh: null, rateDOP: 8 }] }), false, 'hueco entre tramos');
assert.equal(isValidBillingTariff({ ...edesurBts1, energyBlocks: [{ fromKWh: 0, toKWh: null, rateDOP: 0 }] }), false, 'energía a 0 RD$: dato faltante, no una tarifa');
assert.equal(isValidBillingTariff({ ...edesurBts1, fixedChargeTiers: [{ fromKWh: 0, toKWh: 100, chargeDOP: 0 }, { fromKWh: 101, toKWh: null, chargeDOP: 128.59 }] }), true, 'cargo fijo 0 en un rango: válido');
// 10.6 Los supuestos tipados leen distribuidora, código y conexión solo desde rates.
assert.equal(resolveAssumptions({ rates: { ...blockRates(), gridConnection: 'off_grid', isZeroExport: true } }).energyValuationMethod, 'flat_rate', 'aislado detectado desde rates');
assert.equal(resolveAssumptions({ rates: { ...blockRates(), gridConnection: 'zero_export', isZeroExport: true } }).energyValuationMethod, 'block_billing');
// 10.8 Borrador de IA: precio explícito manda con su procedencia; sin precio sobre una propuesta existente no toca nada salvo cambio de tarifa.
{
  const templateManual = { ...draftBase, rates: { ...draftBase.rates, energyCostPerKWh: 0.5, energyRateSource: 'manual' as const } };
  const fresh = prepareProposalDraftProject(templateManual, refDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
  assert.equal(fresh.rates.energyRateSource, 'reference', '(a) nuevo: no hereda ni compara con la plantilla');
  const freshNoPrice = prepareProposalDraftProject(templateManual, { ...refDraft, tariffCode: 'XYZ', energyRateSource: undefined }, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
  assert.equal(freshNoPrice.rates.energyRateSource, undefined, '(a) nuevo sin precio ni referencia: sin procedencia heredada');
  const mixedDraft = { ...refDraft, energyCostPerKWhDOP: 20 };
  const mixed = prepareProposalDraftProject(draftBase, mixedDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
  assert.equal(mixed.rates.energyRateSource, 'reference', '(b) referencia');
  assert.equal(mixed.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1', 1000, 60), '(b) con referencia, el escalar es el de la referencia (coherente con la fila)');
  const existingManual = { ...project({ netMeteringRegime: 'sie007_2026', energyRateSource: 'manual', energyCostPerKWh: 0.31 }), monthlyConsumption: Array(12).fill(1000) };
  const noPriceDraft = { ...invoiceDraft, energyCostPerKWhDOP: undefined, energyCostPerKWhUSD: undefined, energyRateSource: undefined };
  const kept = prepareProposalDraftProject(existingManual, noPriceDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.deepEqual([kept.rates.energyCostPerKWh, kept.rates.energyRateSource], [0.31, 'manual'], '(c) sin precio y misma tarifa: no se toca');
  const switched = prepareProposalDraftProject(existingManual, { ...noPriceDraft, tariffCode: 'BTS2' }, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.equal(switched.rates.energyRateSource, 'reference', '(c) sin precio con cambio de tarifa: referencia de la nueva');
  assert.equal(switched.rates.billingTariff?.tariffCode, 'BTS2');
  const usdDraft = { ...noPriceDraft, energyCostPerKWhUSD: 0.27 };
  assert.equal(prepareProposalDraftProject(existingManual, usdDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false }).rates.energyRateSource, 'manual', 'precio en USD sin procedencia: manual');
  assert.equal(prepareProposalDraftProject(existingManual, invoiceDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false }).rates.energyRateSource, 'invoice', 'precio de factura');
}
// 10.9 Propuesta nueva sin matriz cargada: respaldo de la matriz de fábrica.
store.setState({ projects: [], tariffMatrix: undefined } as never);
store.getState().createNewProject({ name: 'Sin matriz', distributor: 'EDENORTE', tariffCode: 'BTS1' } as never);
assert.deepEqual(store.getState().projects[0].rates.billingTariff, referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS1'), 'respaldo de fábrica');
assert.equal(store.getState().projects[0].rates.energyRateSource, 'reference');
store.setState({ tariffMatrix: DEFAULT_RD_TARIFF_MATRIX } as never);
// 10.10 Dock: «Tarifa oficial aplicada» sale de la procedencia en SIE-007, no de la igualdad numérica.
const refPrice = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1', 1000, 60);
assert.equal(isReferenceApplied({ ...blockRates(), energyCostPerKWh: 0.111 }, refPrice), true, 'referencia activa aunque cambie el consumo medio');
assert.equal(isReferenceApplied({ ...blockRates({ energyRateSource: 'manual' }), energyCostPerKWh: refPrice }, refPrice), false, 'manual que coincide por casualidad: no aplicada');
assert.equal(isReferenceApplied({ ...blockRates({ billingTariff: undefined }), energyCostPerKWh: refPrice }, refPrice), false, 'sin fila: no aplicada');
assert.equal(isReferenceApplied({ distributor: 'EDESUR', tariffCode: 'BTS1', energyCostPerKWh: refPrice }, refPrice), true, 'régimen anterior: igualdad numérica, como antes');
assert.equal(isReferenceApplied({ distributor: 'EDESUR', tariffCode: 'BTS1', energyCostPerKWh: 0.3 }, refPrice), false);
// 10.11 Tasa no válida: nunca 1:1; se usa la tasa por defecto compartida.
{
  const p = project(blockRates());
  const run = (dopPerUSD: number) => calculateMonthlySolarProduction(p.client.province, p.specs, p.monthlyConsumption, 0.218, 25, undefined, 'BTS1', 'grid_export', 'legacy', { usdPerKWh: 3.78 / 60 }, { tariff: edesurBts1, dopPerUSD, gridUseChargeDOPPerKWh: 3.78, settlementDOPPerKWh: 0 });
  assert.deepEqual(run(Number.NaN), run(60), 'tasa NaN → 60 (DEFAULT_DOP_RATE), no 1');
}

// 11. Revisión (tercera tanda).
{
  const existing = (rates: Partial<UtilityRates>) => ({ ...project({ netMeteringRegime: 'sie007_2026', ...rates }), monthlyConsumption: Array(12).fill(1000) });
  const noPrice = { ...invoiceDraft, energyCostPerKWhDOP: undefined, energyCostPerKWhUSD: undefined, energyRateSource: undefined };
  // 11.1 Misma tarifa escrita de otra forma (distribuidora en minúsculas, código con guion): no se pisa el precio manual.
  const manual = existing({ energyRateSource: 'manual', energyCostPerKWh: 0.31 });
  const spelled = prepareProposalDraftProject(manual, { ...noPrice, distributor: 'edesur' as never, tariffCode: 'BTS-1' }, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.deepEqual([spelled.rates.energyCostPerKWh, spelled.rates.energyRateSource], [0.31, 'manual'], 'misma tarifa normalizada: sin cambio');
  const hyphen = prepareProposalDraftProject(manual, { ...noPrice, distributor: 'EDESUR', tariffCode: 'BTS-1' }, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.deepEqual([hyphen.rates.energyCostPerKWh, hyphen.rates.energyRateSource], [0.31, 'manual'], 'BTS-1 resuelto a BTS1: misma tarifa, sin cambio');
  // 11.2a De referencia a precio explícito: la fila se limpia.
  const referenced = existing(blockRates());
  const toInvoice = prepareProposalDraftProject(referenced, invoiceDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.equal(toInvoice.rates.energyRateSource, 'invoice');
  assert.equal(toInvoice.rates.billingTariff, undefined, 'precio de factura: sin fila de referencia pegada');
  // 11.2b Cambio a una tarifa que no está en la matriz, sin precio: el escalar queda como dato sin procedencia ni fila.
  const unknown = prepareProposalDraftProject(referenced, { ...noPrice, tariffCode: 'XYZ' }, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
  assert.equal(unknown.rates.energyCostPerKWh, referenced.rates.energyCostPerKWh, 'el escalar se conserva');
  assert.equal(unknown.rates.energyRateSource, undefined, 'sin procedencia');
  assert.equal(unknown.rates.billingTariff, undefined, 'sin la fila de la tarifa anterior');
  assert.equal(resolveAssumptions(unknown).energyValuationMethod, 'flat_rate');
}
// 11.3 Matriz activa vacía (sin pliegos): respaldo de fábrica también.
store.setState({ projects: [], tariffMatrix: {} } as never);
store.getState().createNewProject({ name: 'Matriz vacía', distributor: 'EDESUR', tariffCode: 'BTS1' } as never);
assert.deepEqual(store.getState().projects[0].rates.billingTariff, edesurBts1, 'matriz {}: respaldo de fábrica');
store.setState({ projects: [], tariffMatrix: { ...DEFAULT_RD_TARIFF_MATRIX, schedules: {} } } as never);
store.getState().createNewProject({ name: 'Sin pliegos', distributor: 'EDESUR', tariffCode: 'BTS1' } as never);
assert.deepEqual(store.getState().projects[0].rates.billingTariff, edesurBts1, 'schedules vacío: respaldo de fábrica');
store.setState({ tariffMatrix: DEFAULT_RD_TARIFF_MATRIX } as never);

// 9. Ejemplo del informe: EDESUR BTS-1, 1,000 kWh/mes, sistema que cubre ~100 %.
const coverage100 = (rates: Partial<UtilityRates>) => calculateProjectFinancialSummary(project(rates, 1000, { panelCount: 12 }), 'legacy');
const legacyEx = coverage100({});
const flatEx = coverage100({ netMeteringRegime: 'sie007_2026' });
const blockEx = coverage100(blockRates());
assert.ok(legacyEx.energyCoveragePct >= 95 && legacyEx.energyCoveragePct <= 110, `cobertura ${legacyEx.energyCoveragePct}`);
console.log(JSON.stringify({
  coveragePct: legacyEx.energyCoveragePct,
  annualProductionKWh: legacyEx.annualProductionKWh,
  legacy_retention: { year1SavingsUSD: legacyEx.year1SavingsUSD, paybackYears: legacyEx.paybackYears, irrPct: legacyEx.irrPct, npvUSD: legacyEx.npvUSD },
  sie007_flat: { year1SavingsUSD: flatEx.year1SavingsUSD, paybackYears: flatEx.paybackYears, irrPct: flatEx.irrPct, npvUSD: flatEx.npvUSD },
  sie007_blocks: { year1SavingsUSD: blockEx.year1SavingsUSD, paybackYears: blockEx.paybackYears, irrPct: blockEx.irrPct, npvUSD: blockEx.npvUSD, january: blockEx.monthlyBreakdown[0], settlementKWh: blockEx.annualCreditSettlementKWh },
}, null, 1));

console.log('Facturación por bloques SIE-007-2026: factura mensual, neteo, arrastre, liquidación anual y valoración del ahorro verificados.');
