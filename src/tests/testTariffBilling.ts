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
import { planApplyReference, planDistributorChange, planTariffChange, type ChangeContext } from '../components/simulator/params/sections/rates/ratesLogic';
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
    assert.equal(flatMonth.tariffBill, undefined, 'escalar: sin campos nuevos');
  });
  assert.equal(summary.year1SavingsUSD, r2(summary.monthlyBreakdown.reduce((total, m) => total + m.savingsUSD, 0)), 'año 1 = suma mensual');
  assert.equal(summary.cashFlow25Years[0].savingsUSD, summary.year1SavingsUSD, 'el flujo de caja sale de los ahorros nuevos');
  assert.equal(summary.annualCreditSettlementUSD, 0, 'liquidación con el precio de fábrica (0)');
  assert.notEqual(summary.year1SavingsUSD, flat.year1SavingsUSD, 'bloques ≠ escalar');
  assert.equal(flat.annualCreditSettlementUSD, undefined, 'escalar: sin campos nuevos en el resumen');

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
  withoutIndicator.monthlyBreakdown.forEach((m) => assert.equal(m.savingsUSD, r2(r2(m.effectiveSavedKWh * 0.218) - m.gridUseChargeUSD!)));

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
assert.equal(applyProjectEdit(reference, { kind: 'rates', patch: { tariffCode: 'BTS2' } }, editCtx).rates.energyRateSource, 'reference');
assert.equal(resolveAssumptions(applyProjectEdit(reference, { kind: 'rates', patch: { tariffCode: 'BTS2' } }, editCtx)).energyValuationMethod, 'flat_rate', 'cambio de tarifa sin fila nueva: escalar');
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
