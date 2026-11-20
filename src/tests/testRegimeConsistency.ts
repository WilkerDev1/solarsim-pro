import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary, calculateIRR, calculateProjectFinancialSummary } from '../engine/financeEngine';
import { calculateMonthlyBill, type BillingTariff } from '../../shared/tariffBilling';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD, referenceBillingTariff } from '../data/rdTariffs';
import { applyProjectEdit } from '../domain/projectEdit';
import { resolveAssumptions } from '../../shared/assumptions';
import { publishedSummary } from '../services/shareProposalService';
import type { FinancialParams, ProjectSimulation, SystemSpecs, UtilityRates } from '../types';

/**
 * Coherencia de los dos regímenes de medición neta y de los datos de tarifa de una propuesta.
 *
 * 1. Factura real de EDESUR (NIC 2084605, 08-oct → 07-nov-2026, BTS-1) con su anexo del cargo por uso de la red: confirma
 *    que los bloques se aplican al consumo NETO (retirado − inyectado) y que el cargo es 25 % de la tarifa de referencia
 *    (RD$ 15.12) sobre la energía inyectada BRUTA.
 * 2. SIE-007-2026 sin fila de bloques (precio tecleado, de factura o fila de otra tarifa) se valora con el mismo neteo,
 *    arrastre del crédito y liquidación anual que con bloques: el excedente no se paga al precio de venta.
 * 3. Cambiar la tarifa o la distribuidora por cualquier camino (dock, asistente, agentes) no deja la fila ni el precio de
 *    la tarifa anterior.
 * 4. Un sistema que nunca recupera la inversión no publica una TIR absurda ni un payback de 25 años.
 */

const close = (actual: number, expected: number, message: string, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);

// ── 1. Factura EDESUR NIC 2084605 ──
const edesurBts1 = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1') as BillingTariff;
const invoice = calculateMonthlyBill({ tariff: edesurBts1, withdrawnKWh: 1089, injectedKWh: 692, creditInKWh: 0, gridUseChargeDOPPerKWh: 0.25 * 15.12 });
assert.equal(invoice.netKWh, 397, 'energía para facturar = retirada − inyectada');
close(invoice.energyChargeDOP, 1210 + 859 + 1250.33, 'energía: 200 × 6.05 + 100 × 8.59 + 97 × 12.89');
close(invoice.fixedChargeDOP, 128.59, 'cargo fijo');
close(invoice.gridUseChargeDOP, 2615.76, 'cargo por uso de la red: 25 % × 15.12 × 692 kWh inyectados');
close(invoice.totalDOP, 6063.68, 'importe total de la factura');
assert.equal(invoice.creditCarriedKWh, 0, 'sin crédito sobrante');

// ── Propuesta real sobredimensionada (SP-2026-149-V2): 63 × 635 W, 2 × 16 kW, 6 × 16.06 kWh, EDEESTE BTS1 ──
const romeroSpecs = {
  isDetailed: false, pricingMode: 'cost_matrix', hasBattery: true, pricePerWattUSD: 1.05,
  dopExchangeRate: 61, saleMarginMultiplier: 1.4, installationUnitPriceUSD: 180,
  panelEfficiency: 22.72, tempCoeff: -0.29, systemLosses: undefined, annualDegradation: 0.4,
  panels: [{ id: 'p', count: 63, powerW: 635, tempCoeff: -0.29, brandModel: 'JinkoSolar 635W', unitPriceUSD: 102, efficiencyPct: 22.72, annualDegradation: 0.4, weightKilos: 34 }],
  inverters: [{ id: 'i', count: 2, powerKW: 16, brandModel: 'WECO XT-16K', unitPriceUSD: 2350, efficiencyPct: 97.2, weightKilos: 41 }],
  batteries: [{ id: 'b', count: 6, dodPct: 90, capacityKWh: 16.06, brandModel: 'WeCo 16K0-LV', unitPriceUSD: 2350, efficiencyPct: 90, weightKilos: 130 }],
} as unknown as SystemSpecs;
const edeesteBts1 = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDEESTE', 'BTS1') as BillingTariff;
const edeesteBts2 = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDEESTE', 'BTS2') as BillingTariff;
const romeroRates = (overrides: Partial<UtilityRates> = {}): UtilityRates => ({
  currency: 'USD', tariffCode: 'BTS1', distributor: 'EDEESTE', isZeroExport: false, usdExchangeRate: 61, energyCostPerKWh: 0.223,
  energyRateSource: 'reference', billingTariff: edeesteBts1, gridExportFeePct: 25, targetCoveragePct: 95, gridUseChargeDOPPerKWh: 3.88,
  annualEnergyInflationPct: 3.5, netMeteringRegime: 'sie007_2026', ...overrides,
});
const romeroFinancials: FinancialParams = {
  customItems: [{ id: 'w', unit: 'unidad', quantity: 1, applyMargin: true, description: 'Wifi Stick', unitPriceUSD: 40, exonerateITBIS: false, hideInQuotation: false }],
  applyLey5707: true, customDiscounts: [], discountRatePct: 12, pricePerWattUSD: 1.05, co2FactorKgPerKWh: 0.481, applyITBISExemption: true, projectLifespanYears: 25,
};
const romero = (rates: UtilityRates, monthlyKWh = 2885) =>
  calculateFinancialSummary('Santo Domingo / Distrito Nacional', romeroSpecs, rates, romeroFinancials, Array(12).fill(monthlyKWh));

// La propuesta publicada (régimen anterior) sigue dando exactamente lo mismo.
const legacy = romero(romeroRates({ netMeteringRegime: 'legacy_retention', billingTariff: edeesteBts2 }));
close(legacy.year1SavingsUSD, 11605.94, 'régimen anterior: ahorro año 1 de la propuesta publicada');
assert.equal(legacy.paybackYears, 3, 'régimen anterior: payback publicado');
assert.equal(legacy.paybackReached, true);
assert.equal(legacy.irrDefined, true);

// ── 2. SIE-007 sin fila válida ──
const blocks = romero(romeroRates());
assert.equal(resolveAssumptions({ rates: romeroRates() }).energyValuationMethod, 'block_billing');
const annualBillWithout = blocks.monthlyBreakdown.reduce((sum, m) => sum + (m.originalBillUSD ?? 0), 0);
assert.ok(blocks.year1SavingsUSD <= annualBillWithout + 0.01, 'bloques: el ahorro no supera la factura sin sistema (liquidación 0)');

const sieWithoutRow: Array<[string, Partial<UtilityRates>]> = [
  ['fila de otra tarifa (copia BTS2 → BTS1)', { billingTariff: edeesteBts2 }],
  ['precio tecleado', { energyRateSource: 'manual' }],
  ['precio de factura', { energyRateSource: 'invoice', energyCostPerKWh: 13.26 / 61 }],
  ['sin fila', { billingTariff: undefined }],
];
for (const [label, overrides] of sieWithoutRow) {
  const rates = romeroRates(overrides);
  const summary = romero(rates);
  assert.equal(resolveAssumptions({ rates }).energyValuationMethod, 'flat_rate', `${label}: precio escalar`);
  const fx = 61;
  const price = rates.energyCostPerKWh;
  // Sin sistema la factura escalar es consumo × precio; con el sistema el excedente solo anula consumo y paga el cargo.
  const ceiling = 2885 * 12 * price;
  assert.ok(summary.year1SavingsUSD <= ceiling + 0.01, `${label}: ahorro ${summary.year1SavingsUSD} ≤ factura sin sistema ${ceiling.toFixed(2)}`);
  assert.ok(summary.year1SavingsUSD < legacy.year1SavingsUSD, `${label}: SIE-007 sobredimensionado ahorra menos que el régimen anterior`);
  const exported = summary.monthlyBreakdown.reduce((sum, m) => sum + m.gridExportedKWh, 0);
  assert.ok(exported > 20000, `${label}: el caso exporta mucho excedente`);
  close(summary.monthlyBreakdown.reduce((sum, m) => sum + (m.gridUseChargeUSD ?? 0), 0), (exported * 3.88) / fx, `${label}: cargo sobre lo inyectado`, 1);
  assert.equal(summary.annualCreditSettlementUSD, 0, `${label}: el remanente se liquida al precio de fábrica (0)`);
}

// Con un sistema que no llega a cubrir el consumo, el precio escalar valora igual que antes (sin excedente que liquidar).
{
  const small = { ...romeroSpecs, panels: [{ ...(romeroSpecs.panels as object[])[0], count: 10 }], batteries: [], hasBattery: false } as unknown as SystemSpecs;
  const rates = romeroRates({ energyRateSource: 'manual' });
  const summary = calculateFinancialSummary('Santo Domingo / Distrito Nacional', small, rates, romeroFinancials, Array(12).fill(2885));
  const valued = summary.monthlyBreakdown.reduce((sum, m) => sum + (m.solarSelfConsumedKWh + m.gridExportedKWh) * rates.energyCostPerKWh - m.gridExportedKWh * (3.88 / 61), 0);
  close(summary.year1SavingsUSD, valued, 'sin excedente: producción × precio − cargo', 0.5);
}

// ── 3. Cambio de tarifa por cualquier camino ──
const editCtx = { equipmentCatalog: [] };
const base = (rates: Partial<UtilityRates>): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'regime-consistency',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), distributor: 'EDEESTE', tariffCode: 'BTS2' },
  rates: { ...structuredClone(BENCHMARK_PROJECT.rates), ...romeroRates({ tariffCode: 'BTS2', billingTariff: edeesteBts2, energyCostPerKWh: 13.59 / 61 }), ...rates },
  monthlyConsumption: Array(12).fill(2885),
});
const fxOf = (p: ProjectSimulation) => resolveAssumptions(p).dopExchangeRate;

{
  const copy = base({});
  const changed = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'BTS1' } }, editCtx);
  assert.equal(changed.rates.tariffCode, 'BTS1');
  assert.equal(changed.rates.energyRateSource, 'reference', 'referencia: sigue siendo referencia');
  assert.deepEqual(changed.rates.billingTariff, edeesteBts1, 'referencia: fila de la tarifa nueva');
  close(changed.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDEESTE', 'BTS1', 2885, fxOf(copy)), 'referencia: precio de la tarifa nueva', 1e-9);
  assert.equal(resolveAssumptions(changed).energyValuationMethod, 'block_billing', 'vuelve a facturarse por bloques');

  // La matriz activa del store manda sobre la de fábrica.
  const matrix = structuredClone(DEFAULT_RD_TARIFF_MATRIX);
  matrix.schedules.EDEESTE.tariffs.BTS1 = { ...matrix.schedules.EDEESTE.tariffs.BTS1, fixedChargeDOP: 999 } as never;
  const withMatrix = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'BTS1' } }, { ...editCtx, tariffMatrix: matrix });
  assert.deepEqual(withMatrix.rates.billingTariff, referenceBillingTariff(matrix, 'EDEESTE', 'BTS1'), 'fila de la matriz activa');

  const otherDistributor = applyProjectEdit(copy, { kind: 'rates', patch: { distributor: 'EDESUR' } }, editCtx);
  assert.equal(otherDistributor.rates.billingTariff?.distributor, 'EDESUR', 'cambio de distribuidora: fila nueva');
  assert.equal(otherDistributor.rates.energyRateSource, 'reference');

  // Un parche que ya trae su fila (el dock) se respeta tal cual.
  const explicit = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'BTS1', energyCostPerKWh: 0.2, energyRateSource: 'reference', billingTariff: edeesteBts1 } }, editCtx);
  assert.equal(explicit.rates.energyCostPerKWh, 0.2, 'el parche explícito manda');

  // Otro campo no toca precio ni fila.
  const other = applyProjectEdit(copy, { kind: 'rates', patch: { targetCoveragePct: 90 } }, editCtx);
  assert.deepEqual(other.rates.billingTariff, edeesteBts2);
  assert.equal(other.rates.energyCostPerKWh, copy.rates.energyCostPerKWh);

  // La misma tarifa escrita distinto (BTS-2) no es un cambio.
  const same = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'BTS-2' } }, editCtx);
  assert.deepEqual(same.rates.billingTariff, edeesteBts2, 'misma tarifa normalizada: sin cambio');
  assert.equal(same.rates.energyCostPerKWh, copy.rates.energyCostPerKWh);
}
for (const source of ['manual', 'invoice'] as const) {
  const copy = base({ energyRateSource: source, energyCostPerKWh: 0.25 });
  const changed = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'BTS1' } }, editCtx);
  assert.equal(changed.rates.energyCostPerKWh, 0.25, `${source}: el precio se conserva`);
  assert.equal(changed.rates.energyRateSource, source, `${source}: procedencia intacta`);
  assert.equal(changed.rates.billingTariff, undefined, `${source}: la fila de la tarifa anterior se suelta`);
}
{
  // Tarifa sin fila en la matriz: ni fila vieja ni precio de otra tarifa con procedencia de referencia.
  const copy = base({});
  const changed = applyProjectEdit(copy, { kind: 'rates', patch: { tariffCode: 'XYZ' } }, editCtx);
  assert.equal(changed.rates.billingTariff, undefined, 'sin fila nueva: la vieja no se queda');
  assert.equal(changed.rates.energyRateSource, undefined, 'sin fila: el precio no se marca como referencia');
  assert.equal(changed.rates.energyCostPerKWh, copy.rates.energyCostPerKWh, 'sin fila: no se pone el precio de otra tarifa');
  assert.equal(resolveAssumptions(changed).energyValuationMethod, 'flat_rate');
  // Distribuidora escrita en minúsculas: misma fila que en mayúsculas.
  const lower = applyProjectEdit(copy, { kind: 'rates', patch: { distributor: 'edenorte' as never } }, editCtx);
  assert.deepEqual(lower.rates.billingTariff, referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS2'), 'distribuidora normalizada');
  close(lower.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS2', 2885, fxOf(copy)), 'precio de EDENORTE, no del respaldo', 1e-9);
}

// ── 4. Sistema que nunca recupera la inversión ──
{
  const never = romero(romeroRates(), 385);
  assert.ok(never.year1SavingsUSD < 0, 'consumo real 385 kWh/mes: el cargo supera el ahorro');
  assert.equal(never.paybackReached, false, 'no se recupera');
  assert.equal(never.irrDefined, false, 'TIR no aplica');
  assert.ok(Number.isFinite(never.irrPct) && Math.abs(never.irrPct) <= 1000, `TIR acotada (${never.irrPct})`);
}
{
  // Caso normal: la TIR anula el VAN de los flujos y el payback se alcanza.
  const ok = calculateProjectFinancialSummary(BENCHMARK_PROJECT);
  assert.equal(ok.paybackReached, true);
  assert.equal(ok.irrDefined, true);
  const rate = ok.irrPct / 100;
  const npv = ok.cashFlow25Years.reduce((sum, cf) => sum + cf.netCashFlowUSD / Math.pow(1 + rate, cf.year), -ok.initialOutflowUSD);
  assert.ok(Math.abs(npv) < ok.initialOutflowUSD * 0.001, `VAN a la TIR ≈ 0 (${npv})`);
}

// TIR con un flujo final negativo (reemplazo de baterías en el último año): sigue existiendo y anula el VAN.
{
  const flows = [5000, 5000, 5000, 4000, 4000, 4000, 4000, 4000, 4000, -2000];
  const irr = calculateIRR(15000, flows);
  assert.ok(irr !== undefined, 'flujo final negativo: hay TIR');
  const npv = flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + irr! / 100, t + 1), -15000);
  assert.ok(Math.abs(npv) < 15, `VAN a la TIR ≈ 0, salvo el redondeo a 0.01 % (${npv})`);
  assert.ok(irr! > 20 && irr! < 30, `TIR ≈ 26 % (${irr})`);
  assert.equal(calculateIRR(0, Array(25).fill(0)), undefined, 'sin inversión ni flujos: no hay TIR');
  const negative = calculateIRR(10000, Array(25).fill(300));
  assert.ok(negative !== undefined && negative < 0, `recupera menos de lo invertido: TIR negativa (${negative})`);
}

// Resumen publicado: las marcas solo viajan si son false y hay comparación de ahorro (un visor 2.8.1 rechaza booleanos).
{
  const never = romero(romeroRates(), 385);
  const published = publishedSummary(never, romeroRates()) as unknown as Record<string, unknown>;
  assert.equal(published.paybackReached, false);
  assert.equal(published.irrDefined, false);
  const ok = publishedSummary(legacy, romeroRates({ netMeteringRegime: 'legacy_retention' })) as unknown as Record<string, unknown>;
  assert.ok(!('paybackReached' in ok) && !('irrDefined' in ok), 'se recupera: mismo resumen que 2.8.1');
  const offGrid = romeroRates({ gridConnection: 'off_grid', isZeroExport: true, supplyAlternative: 'no_comparison' } as Partial<UtilityRates>);
  const noComparison = publishedSummary(calculateFinancialSummary('Santo Domingo / Distrito Nacional', romeroSpecs, offGrid, romeroFinancials, Array(12).fill(385)), offGrid) as unknown as Record<string, unknown>;
  assert.ok(!('paybackReached' in noComparison) && !('irrDefined' in noComparison), 'aislado sin comparación: sin marcas');
}

console.log('testRegimeConsistency: OK');
