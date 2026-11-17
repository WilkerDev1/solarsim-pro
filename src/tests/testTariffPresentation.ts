import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { FACTORY_GRID_USE_CHARGES } from '../../shared/netMetering';
import { gridConnectionFields } from '../../shared/gridConnection';
import { DEFAULT_FIXED_CHARGE_TIER_BASIS, type BillingTariff } from '../../shared/tariffBilling';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { referenceRatesPatch } from '../components/simulator/params/sections/rates/ratesLogic';
import { fieldDisplayValue } from '../components/simulator/params/ui/Field';
import { commitNumberDraft } from '../components/simulator/params/logic/commitNumberDraft';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import {
  UNVERIFIED_ESTIMATE_LABEL, buildBillBreakdown, describeValuationMethod, factoryChargeRows, formatDOP, unverifiedAssumptions,
} from '../components/simulator/params/sections/rates/tariffPresentation';
import type { LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';

/**
 * Fase 4 del plan tarifario: la interfaz solo presenta lo que ya calculan `shared/tariffBilling.ts`, `shared/netMetering.ts`
 * y el motor. Estas pruebas fijan la lógica de presentación (método vigente, desglose antes/después, supuestos no
 * verificados) y que el dock la muestre sin inventar reglas.
 */

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const close = (actual: number, expected: number, message: string, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);

const specs = migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 600, panelCount: 4, autoCalculatePanels: false, panelBrandModel: 'Panel (600W)',
  inverterPowerKW: 5, inverterCount: 1, inverterBrandModel: 'Inversor (5 kW)', hasBattery: false, batteryCapacityKWh: 0, batteryCount: 0,
  dopExchangeRate: 60, saleMarginMultiplier: 1.25, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 1500, batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90,
} as LegacyProjectSpecs);

const referencePatch = referenceRatesPatch({ matrix: DEFAULT_RD_TARIFF_MATRIX, avgMonthlyConsumption: 250, dopExchangeRate: 60 }, 'EDESUR', 'BTS1');
assert.equal(referencePatch.energyRateSource, 'reference');
assert.ok(referencePatch.billingTariff, 'la matriz de fábrica trae la fila de EDESUR BTS-1');

const project = (rates: Partial<UtilityRates> = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'tariff-presentation',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS1' },
  specs,
  rates: {
    distributor: 'EDESUR', tariffCode: 'BTS1', targetCoveragePct: 95, currency: 'USD', usdExchangeRate: 60, gridExportFeePct: 25, annualEnergyInflationPct: 3.5,
    netMeteringRegime: 'sie007_2026', ...referencePatch, ...rates,
  } as UtilityRates,
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array(12).fill(250),
});

// 1. Método de valoración: bloques solo con régimen SIE-007, red, precio de referencia y fila guardada.
{
  const block = describeValuationMethod(project().rates);
  assert.equal(block.method, 'block_billing');
  assert.equal(block.label, 'Factura por bloques de la tarifa');
  assert.match(block.detail, /BTS1/);
  assert.match(block.detail, /SIE-121-2026-TF/);

  const manual = describeValuationMethod(project({ energyRateSource: 'manual' }).rates);
  assert.equal(manual.method, 'flat_rate');
  assert.equal(manual.label, 'Precio por kWh de la propuesta');
  assert.match(manual.detail, /tecleado a mano/);
  assert.match(describeValuationMethod(project({ energyRateSource: 'invoice' }).rates).detail, /factura/);
  assert.match(describeValuationMethod(project({ netMeteringRegime: 'legacy_retention' }).rates).detail, /Régimen anterior/);
  assert.match(describeValuationMethod(project({ billingTariff: undefined }).rates).detail, /no guarda la fila/);
  assert.match(describeValuationMethod(project({ ...gridConnectionFields('off_grid') }).rates).detail, /aislado/);
  assert.match(describeValuationMethod(project({ energyRateSource: undefined }).rates).detail, /anterior/);
}

// 2. Desglose: coincide con lo que valora el motor (misma energía y mismas funciones puras).
for (const mode of ['legacy', 'self_consumption'] as const) {
  const p = project();
  const breakdown = buildBillBreakdown(p, mode);
  assert.ok(breakdown, `${mode}: hay desglose con facturación por bloques`);
  const summary = calculateProjectFinancialSummary(p, mode);
  const fx = resolveAssumptions(p).dopExchangeRate;
  const engineBefore = summary.monthlyBreakdown.reduce((sum, m) => sum + m.originalBillUSD, 0) / 12 * fx;
  const engineAfter = summary.monthlyBreakdown.reduce((sum, m) => sum + m.netBillUSD, 0) / 12 * fx;
  // El motor redondea cada mes a centavos de USD (≤ 0.005 × 60 = RD$0.30 por mes).
  close(breakdown.totalBeforeDOP, engineBefore, `${mode}: factura sin sistema = la del motor`, 0.4);
  close(breakdown.totalAfterDOP, engineAfter, `${mode}: factura con sistema = la del motor`, 0.4);
  const sum = (key: 'beforeDOP' | 'afterDOP') => breakdown.lines.reduce((total, line) => total + line[key], 0);
  close(sum('beforeDOP'), breakdown.totalBeforeDOP, `${mode}: las líneas suman el total sin sistema`, 1e-6);
  close(sum('afterDOP'), breakdown.totalAfterDOP, `${mode}: las líneas suman el total con sistema`, 1e-6);
  assert.deepEqual(breakdown.lines.map((line) => line.id), ['fixed', 'energy', 'gridUse']);
  assert.equal(breakdown.lines[2].beforeDOP, 0, 'sin sistema no se inyecta: sin cargo por uso de la red');
  assert.ok(breakdown.lines[0].afterDOP > 0, 'el cargo fijo se cobra siempre');
  assert.ok(breakdown.totalAfterDOP < breakdown.totalBeforeDOP, `${mode}: el sistema baja la factura`);
  // Con el precio de liquidación de fábrica (0) el remanente no suma; el ahorro es antes − después.
  assert.equal(breakdown.settlementPerMonthDOP, 0, 'precio de liquidación de fábrica: 0');
  close(breakdown.savingsPerMonthDOP, summary.year1SavingsUSD / 12 * fx, `${mode}: ahorro mensual = ahorro del año 1 / 12`, 0.4);
}

// 3. El cargo por uso de la red aparece solo con inyección y tarifa de un solo precio; cambia con el valor editado.
{
  // Poco consumo frente a la producción: hay excedente inyectado.
  const exporting = { ...project({ gridUseChargeDOPPerKWh: 4 }), monthlyConsumption: Array(12).fill(150) } as ProjectSimulation;
  const withCharge = buildBillBreakdown(exporting);
  const free = buildBillBreakdown({ ...exporting, rates: { ...exporting.rates, gridUseChargeDOPPerKWh: 0 } });
  assert.ok(withCharge && free);
  assert.ok(withCharge.lines[2].afterDOP > 0, 'con excedente y cargo de RD$4/kWh hay cargo por uso de la red');
  assert.equal(free.lines[2].afterDOP, 0, 'cargo 0 explícito: sin cargo');
  assert.ok(withCharge.totalAfterDOP > free.totalAfterDOP, 'el cargo sube la factura con sistema');
  // Inyección cero: sin inyección no hay cargo, aunque el valor guardado sea alto.
  const zero = buildBillBreakdown({ ...exporting, rates: { ...exporting.rates, ...gridConnectionFields('zero_export') } });
  assert.ok(zero);
  assert.equal(zero.lines[2].afterDOP, 0, 'inyección cero: sin cargo');
}

// 4. Sin facturación por bloques no hay desglose.
assert.equal(buildBillBreakdown(project({ energyRateSource: 'manual' })), null, 'precio tecleado: escalar');
assert.equal(buildBillBreakdown(project({ netMeteringRegime: 'legacy_retention' })), null, 'régimen anterior: escalar');
assert.equal(buildBillBreakdown(project({ ...gridConnectionFields('off_grid') })), null, 'aislado: sin factura');

// 5. Supuestos no verificados: los cuatro, con su valor vigente y sin cambiar los de fábrica.
{
  const items = unverifiedAssumptions(project().rates);
  assert.deepEqual(items.map((item) => item.id), ['annual_settlement_price', 'fixed_charge_tier_basis', 'net_consumption_blocks', 'gross_injection_charge'], 'BTS-1 con red y bloques: los cuatro');
  assert.equal(items[0].valueText, 'RD$0.00/kWh', 'precio de liquidación de fábrica = 0');
  assert.equal(items[0].editable, true);
  assert.equal(items.filter((item) => item.editable).length, 1, 'solo el precio de liquidación tiene parámetro');
  assert.equal(DEFAULT_FIXED_CHARGE_TIER_BASIS, 'withdrawn', 'el supuesto de fábrica del rango del cargo fijo no cambia');
  assert.match(items[1].valueText, /retirada/);
  assert.equal(unverifiedAssumptions(project({ annualCreditSettlementDOPPerKWh: 7.5 }).rates)[0].valueText, 'RD$7.50/kWh', 'refleja el valor editado');

  // Solo se listan los que afectan a la propuesta.
  assert.deepEqual(unverifiedAssumptions(project({ energyRateSource: 'manual' }).rates).map((item) => item.id), ['gross_injection_charge'], 'precio escalar: solo el cargo sobre inyección bruta');
  assert.deepEqual(unverifiedAssumptions(project({ netMeteringRegime: 'legacy_retention' }).rates), [], 'régimen anterior: ninguno');
  assert.deepEqual(unverifiedAssumptions(project({ ...gridConnectionFields('zero_export') }).rates).map((item) => item.id), [], 'inyección cero: nada se inyecta, ningún supuesto tiene efecto');
  assert.deepEqual(unverifiedAssumptions(project({ ...gridConnectionFields('off_grid') }).rates), [], 'aislado: ninguno');
  const singleRange: BillingTariff = { ...(project().rates.billingTariff as BillingTariff), fixedChargeTiers: undefined };
  assert.ok(!unverifiedAssumptions(project({ billingTariff: singleRange }).rates).some((item) => item.id === 'fixed_charge_tier_basis'), 'sin cargo fijo por rango, el supuesto del rango no aplica');
}

// 6. Campos numéricos con valor guardado distinto de 0 (liquidación, cargo): `Field` solo no deja vaciarlos; el borrador
// de `CommitNumberField` sí (se confirma en blur/Enter; vacío o incompleto conserva el valor; el resto se acota).
assert.equal(fieldDisplayValue('', 3.78, true), 3.78, 'Field solo repone el valor al vaciar: por eso no se usa en estos campos');
assert.equal(fieldDisplayValue('', '', true), '', 'con el borrador como valor (CommitNumberField) el campo queda vacío');
assert.equal(commitNumberDraft('', 3.78, { min: 0, max: 100 }), 3.78, 'vacío conserva el valor');
assert.equal(commitNumberDraft('.', 3.78, { min: 0, max: 100 }), 3.78, 'incompleto conserva el valor');
assert.equal(commitNumberDraft('4.5', 3.78, { min: 0, max: 100 }), 4.5);
assert.equal(commitNumberDraft('-3', 3.78, { min: 0, max: 100 }), 0);
assert.equal(commitNumberDraft('1000', 3.78, { min: 0, max: 100 }), 100);
assert.equal(formatDOP(1234.5), 'RD$1,234.50');

// 7. Cargos de fábrica para Ajustes: los mismos de `FACTORY_GRID_USE_CHARGES`.
{
  const rows = factoryChargeRows();
  assert.deepEqual(rows.map((row) => [row.distributor, row.dopPerKWh]), Object.entries(FACTORY_GRID_USE_CHARGES).map(([key, value]) => [key, value.dopPerKWh]));
  assert.ok(rows.every((row) => row.resolutionCode && row.period));
}

// 8. Dock: el método, el desglose y los supuestos se ven; con inyección cero o aislado no se muestra el cargo.
{
  const html = render(h(RatesFields, { project: project(), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(html, /Factura por bloques de la tarifa/);
  assert.match(html, /data-tariff-bill-breakdown/);
  assert.match(html, /Cargo fijo/);
  assert.match(html, /Energía por bloques/);
  assert.match(html, /Cargo por uso de la red/);
  assert.match(html, /Sin sistema/);
  assert.match(html, /Con sistema/);
  assert.match(html, /id="pd-rates-settlement"/, 'el precio de liquidación es editable');
  assert.equal((html.match(new RegExp(UNVERIFIED_ESTIMATE_LABEL, 'g')) ?? []).length >= 4, true, 'cada supuesto lleva «estimado, no verificado con facturas»');
  for (const title of ['Precio de liquidación anual del crédito', 'Rango del cargo fijo', 'Bloques sobre consumo neto', 'Cargo sobre inyección bruta']) assert.match(html, new RegExp(title), title);

  const flat = render(h(RatesFields, { project: project({ energyRateSource: 'manual' }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(flat, /Precio por kWh de la propuesta/);
  assert.doesNotMatch(flat, /data-tariff-bill-breakdown/, 'precio escalar: sin desglose');
  assert.doesNotMatch(flat, /pd-rates-settlement/, 'precio escalar: la liquidación no aplica');

  assert.doesNotMatch(render(h(RatesFields, { project: project({ ...gridConnectionFields('zero_export') }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never)), /pd-rates-settlement|data-tariff-unverified/, 'inyección cero: sin liquidación ni supuestos');
  const zero = render(h(RatesFields, { project: project({ ...gridConnectionFields('zero_export') }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.doesNotMatch(zero, /Cargo sobre inyección bruta/, 'inyección cero: sin cargo sobre inyección');
  assert.match(zero, /no se inyecta energía/, 'inyección cero: la nota explica que no hay cargo');
  assert.doesNotMatch(zero, /id="pd-rates-grid-charge"/, 'inyección cero: sin campo del cargo');

  const offGrid = render(h(RatesFields, { project: project({ ...gridConnectionFields('off_grid') }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.doesNotMatch(offGrid, /data-tariff-bill-breakdown|Cargo sobre inyección bruta|pd-rates-grid-charge|pd-rates-settlement/, 'aislado: sin cargo ni desglose');

  const legacy = render(h(RatesFields, { project: project({ netMeteringRegime: 'legacy_retention' }), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(legacy, /id="pd-rates-export"/, 'régimen anterior: retención %');
  assert.doesNotMatch(legacy, /pd-rates-grid-charge|data-tariff-bill-breakdown/, 'régimen anterior: sin cargo en RD$/kWh ni desglose');

  const sie = render(h(RatesFields, { project: project(), projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.match(sie, /id="pd-rates-grid-charge"/, 'SIE-007: cargo en RD$/kWh');
  assert.doesNotMatch(sie, /id="pd-rates-export"/, 'SIE-007: sin retención %');
}

// 9. Un solo origen del modo de cálculo: `projectionEnabled` decide el desglose (autoconsumo físico o legado).
{
  const p = project();
  const totalOf = (mode: 'legacy' | 'self_consumption') => formatDOP(buildBillBreakdown(p, mode)!.totalAfterDOP);
  assert.notEqual(totalOf('legacy'), totalOf('self_consumption'), 'la prueba distingue los dos modos');
  const on = render(h(RatesFields, { project: p, projectionEnabled: true, updateRates: noop, updateSpecs: noop } as never));
  const off = render(h(RatesFields, { project: p, projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.ok(on.includes(totalOf('self_consumption')), 'proyección activa: desglose del autoconsumo físico');
  assert.ok(off.includes(totalOf('legacy')), 'proyección inactiva: desglose legado');
}

console.log('testTariffPresentation: OK');
