import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { gridConnectionFields } from '../../shared/gridConnection';
import {
  FACTORY_LEGACY_FIRST_BLOCK,
  LEGACY_SETTLEMENT_SHARE,
  legacyAnnualSettlementApplies,
  legacySettlementDOPPerKWh,
} from '../../shared/netMetering';
import {
  ESTIMATED_ANNUAL_CREDIT_SETTLEMENT,
  FACTORY_ANNUAL_CREDIT_SETTLEMENT,
  fixedChargeDOP,
  proposalBillingTariff,
  resolveAnnualCreditSettlementDOPPerKWh,
  resolveFixedChargeTierBasis,
} from '../../shared/tariffBilling';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { referenceRatesPatch } from '../components/simulator/params/sections/rates/ratesLogic';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import { buildBillBreakdown, settlementPriceOptions, unverifiedAssumptions } from '../components/simulator/params/sections/rates/tariffPresentation';
import type { LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';

/**
 * Tres opciones de la medición neta que ninguna factura ni publicación confirmó todavía:
 * 1. Estimación del precio CNE de la liquidación anual SIE-007 (~RD$5/kWh), a un clic y sin cambiar el de fábrica (0).
 * 2. Régimen anterior: liquidación anual del crédito sobrante al 75 % del primer bloque BTS-1 (Reglamento de Medición
 *    Neta, art. 11.3.c.i), opcional; sin activarla, las cifras guardadas no cambian.
 * 3. Rango del cargo fijo según la energía retirada (de fábrica, conservador) o el consumo neto facturado.
 */

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const close = (actual: number, expected: number, message: string, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const specsFor = (panelCount: number) => migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 600, panelCount, autoCalculatePanels: false, panelBrandModel: 'Panel (600W)',
  inverterPowerKW: 5, inverterCount: 1, inverterBrandModel: 'Inversor (5 kW)', hasBattery: false, batteryCapacityKWh: 0, batteryCount: 0,
  dopExchangeRate: 60, saleMarginMultiplier: 1.25, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 1500, batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90,
} as LegacyProjectSpecs);

const referencePatch = referenceRatesPatch({ matrix: DEFAULT_RD_TARIFF_MATRIX, avgMonthlyConsumption: 400, dopExchangeRate: 60 }, 'EDESUR', 'BTS1');

const project = (rates: Partial<UtilityRates> = {}, options: { panels?: number; consumption?: number } = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'settlement-options',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS1' },
  specs: specsFor(options.panels ?? 4),
  rates: {
    distributor: 'EDESUR', tariffCode: 'BTS1', targetCoveragePct: 95, currency: 'USD', usdExchangeRate: 60, gridExportFeePct: 25, annualEnergyInflationPct: 3.5,
    netMeteringRegime: 'sie007_2026', ...referencePatch, ...rates,
  } as UtilityRates,
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array(12).fill(options.consumption ?? 400),
});

const legacy = (rates: Partial<UtilityRates> = {}, options: { panels?: number; consumption?: number } = {}) =>
  project({ netMeteringRegime: 'legacy_retention', energyRateSource: 'manual', billingTariff: undefined, ...rates }, options);

// ── 1. Estimación del precio de liquidación SIE-007 ──
{
  assert.equal(FACTORY_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh, 0, 'el de fábrica sigue en 0: la estimación no lo cambia');
  assert.equal(ESTIMATED_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh, 5);
  assert.equal(ESTIMATED_ANNUAL_CREDIT_SETTLEMENT.lowDOPPerKWh, 4);
  assert.equal(ESTIMATED_ANNUAL_CREDIT_SETTLEMENT.highDOPPerKWh, 6);
  assert.equal(ESTIMATED_ANNUAL_CREDIT_SETTLEMENT.confirmed, false);
  assert.equal(resolveAnnualCreditSettlementDOPPerKWh({}), 0, 'sin dato: el de fábrica, no la estimación');

  const atFactory = settlementPriceOptions(0);
  assert.deepEqual(atFactory.map((o) => o.dopPerKWh), [0, 5]);
  assert.deepEqual(atFactory.map((o) => o.checked), [true, false]);
  assert.match(atFactory[1].label, /estimad/i);
  assert.match(atFactory[1].hint, /RD\$5\.00/);
  assert.deepEqual(settlementPriceOptions(5).map((o) => o.checked), [false, true]);
  assert.deepEqual(settlementPriceOptions(4.2).map((o) => o.checked), [false, false], 'un precio tecleado no marca ninguna opción');

  const note = unverifiedAssumptions(project().rates).find((item) => item.id === 'annual_settlement_price');
  assert.ok(note, 'SIE-007 con red: el supuesto de liquidación se lista');
  assert.match(note.note, /RD\$4\.00–6\.00/, 'la nota da el rango estimado');
  assert.match(note.note, /RD\$5\.00/, 'y la estimación central');

  // Con la estimación, el remanente anual suma ahorro (sistema sobredimensionado: sobra crédito al cierre).
  const big = { panels: 10, consumption: 250 };
  const base = calculateProjectFinancialSummary(project({}, big));
  const estimated = calculateProjectFinancialSummary(project({ annualCreditSettlementDOPPerKWh: ESTIMATED_ANNUAL_CREDIT_SETTLEMENT.dopPerKWh }, big));
  assert.ok((base.annualCreditSettlementKWh ?? 0) > 0, 'sobra crédito al cierre del año');
  assert.equal(base.annualCreditSettlementUSD, 0, 'de fábrica el remanente no suma');
  close(estimated.annualCreditSettlementUSD ?? 0, ((estimated.annualCreditSettlementKWh ?? 0) * 5) / 60, 'remanente × RD$5 / tasa', 0.06);
  close(estimated.year1SavingsUSD - base.year1SavingsUSD, estimated.annualCreditSettlementUSD ?? 0, 'el ahorro del año 1 sube exactamente la liquidación', 0.02);
}

// ── 2. Régimen anterior: liquidación del 75 % al primer bloque BTS-1 ──
{
  assert.equal(LEGACY_SETTLEMENT_SHARE, 0.75);
  // El primer bloque de fábrica es el de BTS-1 de la matriz de cada EDE (misma resolución).
  for (const distributor of ['EDESUR', 'EDENORTE', 'EDEESTE'] as const) {
    const firstBlock = DEFAULT_RD_TARIFF_MATRIX.schedules[distributor].tariffs.BTS1.blocks?.[0]?.rateDOP;
    assert.equal(FACTORY_LEGACY_FIRST_BLOCK[distributor].dopPerKWh, firstBlock, `${distributor}: primer bloque BTS-1 igual a la matriz`);
    close(legacySettlementDOPPerKWh(distributor), 0.75 * (firstBlock as number), `${distributor}: 75 % del primer bloque`, 1e-9);
  }
  const lowest = Math.min(...Object.values(FACTORY_LEGACY_FIRST_BLOCK).map((row) => row.dopPerKWh));
  close(legacySettlementDOPPerKWh('CEPM'), 0.75 * lowest, 'distribuidora sin BTS-1 de fábrica: el menor (a la baja)', 1e-9);
  close(legacySettlementDOPPerKWh(undefined), 0.75 * lowest, 'sin distribuidora: el menor', 1e-9);
  close(legacySettlementDOPPerKWh(' edesur '), 0.75 * 6.05, 'normaliza la distribuidora', 1e-9);

  // Cuándo aplica: solo activada, en el régimen anterior y con inyección a la red.
  assert.equal(legacyAnnualSettlementApplies(legacy().rates), false, 'sin el campo: no (lo guardado no cambia)');
  assert.equal(legacyAnnualSettlementApplies(legacy({ legacyAnnualSettlement: true }).rates), true);
  assert.equal(legacyAnnualSettlementApplies(project({ legacyAnnualSettlement: true }).rates), false, 'SIE-007 tiene su propia liquidación');
  assert.equal(legacyAnnualSettlementApplies(legacy({ legacyAnnualSettlement: true, ...gridConnectionFields('zero_export') }).rates), false, 'inyección cero: no hay crédito');
  assert.equal(legacyAnnualSettlementApplies(legacy({ legacyAnnualSettlement: true, ...gridConnectionFields('off_grid') }).rates), false, 'aislado: no hay crédito');
  assert.equal(legacyAnnualSettlementApplies(legacy({ legacyAnnualSettlement: 'yes' as never }).rates), false, 'solo true activa');
  assert.equal(resolveAssumptions(legacy()).legacyAnnualSettlementDOPPerKWh, null);
  close(resolveAssumptions(legacy({ legacyAnnualSettlement: true })).legacyAnnualSettlementDOPPerKWh as number, 0.75 * 6.05, 'supuesto resuelto', 1e-9);

  // Sistema sobredimensionado: produce más de lo que consume, sobra crédito al cierre.
  const big = { panels: 10, consumption: 250 };
  const off = calculateProjectFinancialSummary(legacy({}, big));
  const offExplicit = calculateProjectFinancialSummary(legacy({ legacyAnnualSettlement: false }, big));
  assert.deepEqual(offExplicit.monthlyBreakdown, off.monthlyBreakdown, 'false explícito = sin el campo');
  assert.equal(off.annualCreditSettlementKWh, undefined, 'sin activar: sin liquidación (como antes)');
  assert.ok(off.monthlyBreakdown.every((m) => m.tariffBill === undefined), 'sin activar: sin factura neta');

  const on = calculateProjectFinancialSummary(legacy({ legacyAnnualSettlement: true }, big));
  const price = 0.75 * 6.05;
  const fx = 60;
  const rateUSD = legacy().rates.energyCostPerKWh;
  // Neteo kWh contra kWh del crédito reconocido (75 % de lo exportado, la retención del régimen se conserva), con arrastre.
  let carried = 0;
  let expectedSavedKWh = 0;
  on.monthlyBreakdown.forEach((m) => {
    const withdrawn = Math.max(0, m.consumptionKWh - m.solarSelfConsumedKWh);
    const available = carried + m.netExportCreditKWh;
    const applied = Math.min(available, withdrawn);
    carried = available - applied;
    expectedSavedKWh += m.solarSelfConsumedKWh + applied;
  });
  assert.ok(carried > 0, 'sobra crédito al cierre del año');
  close(on.annualCreditSettlementKWh ?? 0, carried, 'remanente = crédito que no se consumió', 0.11);
  close(on.annualCreditSettlementUSD ?? 0, (carried * price) / fx, 'remanente × 75 % del primer bloque / tasa', 0.06);
  close(on.year1SavingsUSD, expectedSavedKWh * rateUSD + (carried * price) / fx, 'ahorro = (autoconsumo + crédito aplicado) × precio + liquidación', 0.3);
  assert.ok(on.year1SavingsUSD < off.year1SavingsUSD, 'el excedente ya no se valora a la tarifa completa');
  assert.deepEqual(on.monthlyBreakdown.map((m) => m.gridExportedKWh), off.monthlyBreakdown.map((m) => m.gridExportedKWh), 'la energía no cambia');
  assert.deepEqual(on.monthlyBreakdown.map((m) => m.netExportCreditKWh), off.monthlyBreakdown.map((m) => m.netExportCreditKWh), 'la retención no cambia');
  assert.ok(on.monthlyBreakdown.every((m) => (m.gridUseChargeUSD ?? 0) === 0), 'el régimen anterior no cobra cargo por uso de la red');

  // Sistema que nunca cubre el consumo del mes: todo el crédito se consume, la opción no cambia el ahorro.
  const small = { panels: 4, consumption: 900 };
  const smallOff = calculateProjectFinancialSummary(legacy({}, small));
  const smallOn = calculateProjectFinancialSummary(legacy({ legacyAnnualSettlement: true }, small));
  assert.equal(smallOn.annualCreditSettlementKWh, 0, 'no sobra crédito');
  close(smallOn.year1SavingsUSD, smallOff.year1SavingsUSD, 'sin remanente el ahorro es el mismo', 0.3);

  // Inyección cero o SIE-007: el campo se ignora.
  const zeroOff = calculateProjectFinancialSummary(legacy({ ...gridConnectionFields('zero_export') }, big));
  const zeroOn = calculateProjectFinancialSummary(legacy({ ...gridConnectionFields('zero_export'), legacyAnnualSettlement: true }, big));
  assert.deepEqual(zeroOn.monthlyBreakdown, zeroOff.monthlyBreakdown, 'inyección cero: sin efecto');
  const sieOff = calculateProjectFinancialSummary(project({}, big));
  const sieOn = calculateProjectFinancialSummary(project({ legacyAnnualSettlement: true }, big));
  assert.deepEqual(sieOn.monthlyBreakdown, sieOff.monthlyBreakdown, 'SIE-007: sin efecto');

  // Dock: el interruptor solo en el régimen anterior con red.
  const dock = (p: ProjectSimulation) => render(h(RatesFields, { project: p, projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(dock(legacy()), /id="pd-rates-legacy-settlement"[^>]*aria-checked="false"|aria-checked="false"[^>]*id="pd-rates-legacy-settlement"/, 'régimen anterior: interruptor apagado');
  assert.match(dock(legacy({ legacyAnnualSettlement: true })), /aria-checked="true"[^>]*id="pd-rates-legacy-settlement"|id="pd-rates-legacy-settlement"[^>]*aria-checked="true"/, 'activada: encendido');
  assert.doesNotMatch(dock(project()), /pd-rates-legacy-settlement/, 'SIE-007: sin interruptor');
  assert.doesNotMatch(dock(legacy({ ...gridConnectionFields('zero_export') })), /pd-rates-legacy-settlement/, 'inyección cero: sin interruptor');
}

// ── 3. Rango del cargo fijo: energía retirada o consumo neto ──
{
  assert.equal(resolveFixedChargeTierBasis({}), 'withdrawn', 'de fábrica: la energía retirada (conservador)');
  assert.equal(resolveFixedChargeTierBasis({ fixedChargeTierBasis: 'net' }), 'net');
  assert.equal(resolveFixedChargeTierBasis({ fixedChargeTierBasis: 'gross' as never }), 'withdrawn', 'valor desconocido: el de fábrica');
  assert.equal(resolveAssumptions(project()).fixedChargeTierBasis, 'withdrawn');
  assert.equal(resolveAssumptions(project({ fixedChargeTierBasis: 'net' })).fixedChargeTierBasis, 'net');

  // 400 kWh/mes y 2.4 kWp: se retiran más de 100 kWh, pero el neto facturado queda en 100 o menos algunos meses.
  const withdrawn = calculateProjectFinancialSummary(project());
  const net = calculateProjectFinancialSummary(project({ fixedChargeTierBasis: 'net' }));
  const tariff = proposalBillingTariff(project().rates);
  assert.ok(tariff?.fixedChargeTiers?.length, 'EDESUR BTS-1 tiene cargo fijo por rango');
  const usd = (dop: number) => Math.round((dop / 60) * 100) / 100;
  let differs = 0;
  withdrawn.monthlyBreakdown.forEach((m, i) => {
    const bill = m.tariffBill!;
    const netBill = net.monthlyBreakdown[i].tariffBill!;
    assert.equal(bill.fixedChargeUSD, usd(fixedChargeDOP(tariff!, bill.withdrawnKWh)), `${m.month}: rango por energía retirada`);
    assert.equal(netBill.fixedChargeUSD, usd(fixedChargeDOP(tariff!, netBill.netBilledKWh)), `${m.month}: rango por consumo neto`);
    if (netBill.fixedChargeUSD !== bill.fixedChargeUSD) differs++;
  });
  assert.ok(differs > 0, 'el caso de prueba cruza el límite de 100 kWh en algún mes');
  assert.ok(net.year1SavingsUSD > withdrawn.year1SavingsUSD, 'por consumo neto la factura con sistema es menor');
  close(net.year1SavingsUSD - withdrawn.year1SavingsUSD, sum(withdrawn.monthlyBreakdown.map((m, i) => m.tariffBill!.fixedChargeUSD - net.monthlyBreakdown[i].tariffBill!.fixedChargeUSD)), 'la diferencia es solo el cargo fijo', 0.02);

  // El desglose del dock usa el mismo criterio que el motor.
  const breakdownWithdrawn = buildBillBreakdown(project())!;
  const breakdownNet = buildBillBreakdown(project({ fixedChargeTierBasis: 'net' }))!;
  const fixedLine = (b: typeof breakdownNet) => b.lines.find((line) => line.id === 'fixed')!;
  assert.ok(fixedLine(breakdownNet).afterDOP < fixedLine(breakdownWithdrawn).afterDOP, 'desglose: cargo fijo con sistema menor por consumo neto');
  assert.equal(fixedLine(breakdownNet).beforeDOP, fixedLine(breakdownWithdrawn).beforeDOP, 'sin sistema no cambia (retirado = neto)');

  // Supuesto editable con su valor vigente; el dock muestra el selector.
  const item = (rates: UtilityRates) => unverifiedAssumptions(rates).find((a) => a.id === 'fixed_charge_tier_basis')!;
  assert.equal(item(project().rates).editable, true);
  assert.match(item(project().rates).valueText, /retirada/);
  assert.match(item(project({ fixedChargeTierBasis: 'net' }).rates).valueText, /neto/);
  const dock = render(h(RatesFields, { project: project(), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(dock, /data-fixed-charge-tier-basis="withdrawn"/, 'el dock muestra el criterio vigente');
  assert.match(dock, /Energía retirada/);
  assert.match(dock, /Consumo neto/);
  const flatDock = render(h(RatesFields, { project: project({ energyRateSource: 'manual' }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.doesNotMatch(flatDock, /data-fixed-charge-tier-basis/, 'precio único sin cargo por rango: sin selector');
}

console.log('testSettlementOptions: OK');
