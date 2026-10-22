/**
 * Bugs de `||` y defaults inconsistentes anotados en la PR #69. Cada bloque falla con el código anterior.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateCostMatrixSummary, calculateProjectFinancialSummary } from '../engine/financeEngine';
import { getProjectBatteries } from '../utils/equipmentSpecsUtils';
import type { ProjectSimulation, SystemSpecs } from '../types';
import * as shared from '../../shared/projectDefaults';
import * as dockDefaults from '../components/simulator/params/logic/dockDefaults';
import { commitNumberDraft } from '../components/simulator/params/logic/commitNumberDraft';
import { computeLoadProfilePreview } from '../components/simulator/params/logic/loadProfilePreview';
import { PricingParamsSection } from '../components/simulator/sidebar/PricingParamsSection';
import { BatteryEquipmentSection } from '../components/simulator/sidebar/BatteryEquipmentSection';
import { DirectPrice } from '../components/simulator/params/sections/pricing/DirectPrice';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const valueOf = (html: string, id: string): string | undefined => new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html)?.[1];
const base = structuredClone(BENCHMARK_PROJECT);
const projectOf = (specs: Partial<SystemSpecs> = {}): ProjectSimulation => ({ ...base, specs: { ...base.specs, ...specs } });

// ── Bug 1: borrador de DOD/eficiencia ───────────────────────────────────────────────────────
{
  const range = { min: 1, max: 100 };
  assert.equal(commitNumberDraft('', 90, range), 90, 'vacío conserva el anterior');
  assert.equal(commitNumberDraft('   ', 90, range), 90);
  assert.equal(commitNumberDraft('abc', 90, range), 90, 'no numérico conserva el anterior');
  assert.equal(commitNumberDraft('0', 90, range), 1, '0 se limita al mínimo');
  assert.equal(commitNumberDraft('-5', 90, range), 1);
  assert.equal(commitNumberDraft('150', 90, range), 100);
  assert.equal(commitNumberDraft('85.5', 90, range), 85.5);
  assert.equal(commitNumberDraft('0', 60, { min: 0.01, belowMin: 'revert' }), 60, 'belowMin revert: el 0 no se confirma');
  assert.equal(commitNumberDraft('55', 60, { min: 0.01, belowMin: 'revert' }), 55);
}

// ── Bug 6: una sola eficiencia/DOD por defecto, en un módulo neutral ───────────────────────
{
  assert.equal(shared.DEFAULT_BATTERY_EFFICIENCY_PCT, 90, 'valor del motor de energía');
  assert.equal(shared.DEFAULT_BATTERY_DOD_PCT, 90);
  assert.equal(dockDefaults.DEFAULT_BATTERY_EFFICIENCY_PCT, shared.DEFAULT_BATTERY_EFFICIENCY_PCT);
  assert.equal(dockDefaults.DEFAULT_BATTERY_DOD_PCT, shared.DEFAULT_BATTERY_DOD_PCT);
  const battery = (specs: object) => render(h(BatteryEquipmentSection, {
    project: projectOf({ hasBattery: true, batteryDOD: undefined, batteryEfficiencyPct: undefined, ...specs } as Partial<SystemSpecs>),
    summary: { batteryUsableKWh: 0, batteryBackupAutonomyHours: 0 } as never, isDetailed: true, updateSpecs: noop,
  }));
  assert.equal(valueOf(battery({}), 'dock-battery-efficiency'), '90', 'el campo muestra lo que usa el motor');
  assert.equal(valueOf(battery({ batteryDOD: 0, batteryEfficiencyPct: 0 }), 'dock-battery-dod'), '90');
  assert.equal(valueOf(battery({ batteryDOD: 0, batteryEfficiencyPct: 0 }), 'dock-battery-efficiency'), '90');
  assert.equal(valueOf(battery({ batteryDOD: 70, batteryEfficiencyPct: 88 }), 'dock-battery-efficiency'), '88');

  const withBattery = (specs: Partial<SystemSpecs>) => ({ ...base.specs, hasBattery: true, batteries: undefined, batteryCapacityKWh: 10, batteryCount: 1, ...specs } as SystemSpecs);
  const usable = (specs: Partial<SystemSpecs>) => calculateProjectFinancialSummary(projectOf(withBattery(specs))).batteryUsableKWh;
  const reference = usable({ batteryDOD: 90, batteryEfficiencyPct: 90 });
  assert.equal(usable({ batteryDOD: 90, batteryEfficiencyPct: undefined }), reference, 'financeEngine usa 90, no 92');
  assert.equal(usable({ batteryDOD: undefined, batteryEfficiencyPct: 90 }), reference, 'DOD ausente: 90, no 80');
  assert.equal(usable({ batteryDOD: 0, batteryEfficiencyPct: 0 }), reference);
  const unset = getProjectBatteries(withBattery({ batteryEfficiencyPct: undefined, batteryDOD: undefined }))[0];
  assert.equal(unset.efficiencyPct, 90);
  assert.equal(unset.dodPct, 90);
  const preview = (specs: Partial<SystemSpecs>) => computeLoadProfilePreview(projectOf(withBattery(specs)), 'BTS2', 900);
  assert.deepEqual(preview({ batteryEfficiencyPct: undefined, batteryDOD: undefined }), preview({ batteryEfficiencyPct: 90, batteryDOD: 90 }));
}

// ── Bug 2: costo y venta por Wp reales ─────────────────────────────────────────────────────
{
  const pricing = (summary: unknown) => render(h(PricingParamsSection, { project: projectOf({ pricingMode: 'cost_matrix' }), summary: summary as never, updateSpecs: noop }));
  const stat = (html: string, label: string) => new RegExp(`${label}[\\s\\S]*?(\\+?\\$[\\d.,]+|—)`).exec(html)?.[1];
  const zeros = pricing({ costMatrix: { costPerWattUSD: 0, salePricePerWattUSD: 0, precioKilosVentasUSD: 0 } });
  assert.equal(stat(zeros, 'Costo /Wp'), '$0.00', 'costo real 0, no 0.86');
  assert.equal(stat(zeros, 'Venta /Wp'), '$0.00', 'venta real 0, no 1.08');
  assert.doesNotMatch(zeros, /0\.86|1\.08|1,080/);
  const none = pricing({});
  for (const label of ['Costo /Wp', 'Ganancia /Wp', 'Venta /Wp', 'Venta /kWp']) assert.equal(stat(none, label), '—', `${label} sin matriz`);
  assert.equal(stat(pricing({ costMatrix: { costPerWattUSD: NaN, salePricePerWattUSD: Infinity } }), 'Venta /Wp'), '—', 'no calculable');
  const real = pricing({ costMatrix: { costPerWattUSD: 0.9, salePricePerWattUSD: 1.2, precioKilosVentasUSD: 1200 } });
  assert.equal(stat(real, 'Costo /Wp'), '$0.90');
  assert.equal(stat(real, 'Venta /Wp'), '$1.20');
  assert.equal(stat(real, 'Ganancia /Wp'), '+$0.30');
}

// ── Bug 3: precio directo coherente ─────────────────────────────────────────────────────────
{
  const direct = (specs: object) => render(h(DirectPrice, {
    specs: { ...base.specs, pricingMode: 'direct_watt', pricePerWattUSD: undefined, pricePerKWpUSD: undefined, ...specs } as unknown as SystemSpecs,
    summary: { systemCapacityKWp: 10 } as never, updateSpecs: noop,
  }));
  for (const zero of [0, -1]) {
    const html = direct({ pricePerWattUSD: zero });
    assert.equal(valueOf(html, 'pd-price-w'), '1.15', '$/W ≤ 0 no es válido (el motor lo ignora): default');
    assert.equal(valueOf(html, 'pd-price-kwp'), '1150', '$/kWp sale del mismo valor');
  }
  assert.equal(valueOf(direct({ pricePerWattUSD: 0.5 }), 'pd-price-kwp'), '500');
  assert.equal(valueOf(direct({ pricePerWattUSD: 0.5, pricePerKWpUSD: 0 }), 'pd-price-kwp'), '500', '$/kWp 0 también cae al valor derivado');
  assert.equal(valueOf(direct({ pricePerWattUSD: 0.5, pricePerKWpUSD: 520 }), 'pd-price-kwp'), '520');
}

// ── Bugs 4 y 5: tasa y multiplicador con una sola regla ────────────────────────────────────
{
  assert.equal(shared.resolveDopRate(undefined), 60);
  assert.equal(shared.resolveDopRate(0), 60);
  assert.equal(shared.resolveDopRate(-3), 60);
  assert.equal(shared.resolveDopRate(NaN), 60);
  assert.equal(shared.resolveDopRate(58.5), 58.5);
  assert.equal(shared.resolveSaleMarginMultiplier(undefined), 1.25);
  assert.equal(shared.resolveSaleMarginMultiplier(0), 1.25);
  assert.equal(shared.resolveSaleMarginMultiplier(-1), 1.25);
  assert.equal(shared.resolveSaleMarginMultiplier(1.3), 1.3);
  const pricing = (specs: object) => render(h(PricingParamsSection, { project: projectOf({ pricingMode: 'cost_matrix', ...specs } as Partial<SystemSpecs>), summary: {} as never, updateSpecs: noop }));
  for (const rate of [0, -5]) assert.equal(valueOf(pricing({ dopExchangeRate: rate }), 'pd-dop-rate'), '60', 'la vista usa la misma regla que el cálculo');
  assert.equal(valueOf(pricing({ dopExchangeRate: 58 }), 'pd-dop-rate'), '58');
  const matrix = (specs: Partial<SystemSpecs>) => calculateCostMatrixSummary({ ...base.specs, ...specs } as SystemSpecs, 5);
  assert.equal(matrix({ dopExchangeRate: -5 }).dopExchangeRate, 60, 'el motor ignora una tasa negativa');
  assert.equal(matrix({ saleMarginMultiplier: -1 }).saleMarginMultiplier, 1.25, 'el motor ignora un multiplicador negativo');
  assert.equal(matrix({ saleMarginMultiplier: 0 }).saleMarginMultiplier, 1.25);
}

// ── Bug 7: sin duplicados fuera del dock ───────────────────────────────────────────────────
{
  const quotation = readFileSync('src/components/simulator/tabs/QuotationEquipmentsTab.tsx', 'utf8');
  for (const literal of ['C-0030', '555-0199', 'Lux Power LXP', 'Hinaess', 'TOPHIKU6', '|| 1.25']) assert(!quotation.includes(literal), `QuotationEquipmentsTab repite «${literal}»`);
  const finance = readFileSync('src/engine/financeEngine.ts', 'utf8');
  for (const literal of ['60.0', '170.0', '|| 1.25', '|| 80', '|| 92']) assert(!finance.includes(literal), `financeEngine repite «${literal}»`);
  const utils = readFileSync('src/utils/equipmentSpecsUtils.ts', 'utf8');
  for (const literal of ['|| 90', '|| 95']) assert(!utils.includes(literal), `equipmentSpecsUtils repite «${literal}»`);
  for (const file of ['src/components/common/EquipmentEditorModal.tsx', 'src/components/common/EquipmentManagerSettingsTab.tsx']) {
    const text = readFileSync(file, 'utf8');
    assert(!/batteryEfficiencyPct(\s*\|\|\s*|\s*\?\s*)95|"battery" \? 95/.test(text) && !text.includes('batteryEfficiencyPct || 95') && !text.includes('"battery" ? 95'), `${file} repite la eficiencia 95`);
  }
  assert.match(quotation, /QUOTATION_PANEL_BRAND_FALLBACK/, 'la cotización conserva su marca de panel sin nombre (620 W), ahora con nombre');
  assert.equal(shared.QUOTATION_PANEL_BRAND_FALLBACK, 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)');
  assert.equal(dockDefaults.MANUAL_BRAND_PLACEHOLDER, shared.MANUAL_BRAND_PLACEHOLDER);
  assert.equal(dockDefaults.SAMPLE_QUOTE_NUMBER, shared.SAMPLE_QUOTE_NUMBER);
  assert.equal(dockDefaults.DEFAULT_DOP_RATE, shared.DEFAULT_DOP_RATE);
  assert.equal(dockDefaults.DEFAULT_INSTALLATION_USD_PER_KWP, shared.DEFAULT_INSTALLATION_USD_PER_KWP);
}

console.log('testDockDefaultBugFixes: ok');
