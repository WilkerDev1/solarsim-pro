import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { resolveAssumptions } from '../../shared/assumptions';
import { readEquipment } from '../../shared/equipment';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { PricingParamsSection } from '../components/simulator/sidebar/PricingParamsSection';
import { FinancialsParamsSection } from '../components/simulator/sidebar/FinancialsParamsSection';
import { EquipmentParamsSection } from '../components/simulator/sidebar/EquipmentParamsSection';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import { ProposalConsumptionReview } from '../components/common/ai-invoice/components/ProposalConsumptionReview';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import type { ProjectSimulation } from '../types';

/**
 * Revisión del PR #100: lo que el dock muestra como valor efectivo es el que usa el cálculo, y ambos salen de
 * `resolveAssumptions` sobre el proyecto completo (AGENTS.md, ADR 0003).
 */
const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const valueOf = (html: string, id: string): string | undefined => new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html)?.[1];
const clone = (): ProjectSimulation => structuredClone(BENCHMARK_PROJECT);
const variant = (patch: (p: ProjectSimulation) => void): ProjectSimulation => { const p = clone(); patch(p); return p; };
const without = <T extends object>(source: T, ...keys: string[]): T => { const copy = { ...source } as Record<string, unknown>; for (const k of keys) delete copy[k]; return copy as T; };

const variants: Record<string, ProjectSimulation> = {
  complete: clone(),
  exchangeInRatesOnly: variant((p) => { p.specs = without(p.specs, 'dopExchangeRate'); p.rates.usdExchangeRate = 58; }),
  exchangeZeroInSpecs: variant((p) => { p.specs.dopExchangeRate = 0; p.rates.usdExchangeRate = 57; }),
  coverageZero: variant((p) => { p.rates.targetCoveragePct = 0; }),
  coverageOutOfRange: variant((p) => { p.rates.targetCoveragePct = 900; }),
  exportFeeInvalid: variant((p) => { p.rates.gridExportFeePct = -5; }),
  exportFeeZero: variant((p) => { p.rates.gridExportFeePct = 0; }),
  installationInvalid: variant((p) => { p.specs.installationUnitPriceUSD = Number.NaN; }),
  installationZero: variant((p) => { p.specs.installationUnitPriceUSD = 0; }),
  marginZero: variant((p) => { p.specs.saleMarginMultiplier = 0; }),
  discountMissing: variant((p) => { p.financials = without(p.financials, 'discountRatePct'); }),
  discountOutOfRange: variant((p) => { p.financials.discountRatePct = 400; }),
  lossesOutOfRange: variant((p) => { p.specs.systemLosses = 150; }),
  lifespanFractional: variant((p) => { p.financials.projectLifespanYears = 25.5; }),
  batteryYearFractional: variant((p) => { p.specs.hasBattery = true; p.specs.batteryReplacementCostUSD = 3500; p.specs.batteryLifespanYears = 7.5; }),
  degradationOutOfRange: variant((p) => { p.specs.annualDegradation = 12; }),
};

for (const [name, project] of Object.entries(variants)) {
  const used = resolveAssumptions(project);
  const summary = calculateProjectFinancialSummary(project);
  const label = (field: string) => `${name}: ${field}`;

  // Precios: tasa, margen y mano de obra del dock = los de la matriz de costos del motor.
  const pricing = render(h(PricingParamsSection, { project, summary, updateSpecs: noop }));
  const installation = summary.costMatrix.items[summary.costMatrix.items.length - 1];
  assert.equal(Number(valueOf(pricing, 'pd-dop-rate')), summary.costMatrix.dopExchangeRate, label('tasa DOP/USD mostrada = tasa de la matriz'));
  assert.equal(summary.costMatrix.dopExchangeRate, used.dopExchangeRate, label('la matriz usa la tasa resuelta'));
  assert.equal(Number(valueOf(pricing, 'pd-margin')), Math.round((summary.costMatrix.saleMarginMultiplier - 1) * 100 * 10) / 10, label('margen mostrado = margen de la matriz'));
  assert.equal(Number(valueOf(pricing, 'pd-cost-installation')), installation.unitPriceUSD, label('mano de obra mostrada = la de la matriz'));
  assert.equal(installation.unitPriceUSD, used.installationUsdPerKwp, label('la matriz usa la mano de obra resuelta'));

  // Años enteros: el flujo recorre la vida resuelta y la reposición de baterías cae en el año resuelto (una fracción no la pierde).
  assert.equal(summary.cashFlow25Years.length, used.projectLifespanYears, label('el flujo recorre la vida resuelta'));
  assert.ok(Number.isInteger(used.projectLifespanYears) && Number.isInteger(used.batteryReplacementYear), label('años enteros'));
  if (project.specs.hasBattery && project.specs.batteryReplacementCostUSD) {
    const plain = calculateProjectFinancialSummary({ ...project, specs: { ...project.specs, batteryReplacementCostUSD: 0 } });
    const row = (s: typeof summary) => s.cashFlow25Years[used.batteryReplacementYear - 1].netCashFlowUSD;
    assert.ok(Math.abs(row(plain) - row(summary) - project.specs.batteryReplacementCostUSD) < 0.01, label('la reposición cae en el año resuelto'));
  }

  // Finanzas: la tasa de descuento mostrada es la del VAN.
  const finHtml = render(h(FinancialsParamsSection, { project, updateFinancials: noop }));
  const shownDiscount = Number(valueOf(finHtml, 'pd-discount-rate'));
  assert.equal(shownDiscount, used.discountRatePct, label('descuento mostrado = resuelto'));
  const npv = summary.cashFlow25Years.reduce((sum, row, i) => sum + row.netCashFlowUSD / Math.pow(1 + shownDiscount / 100, i + 1), -summary.grossInvestmentUSD);
  assert.ok(Math.abs(npv - summary.npvUSD) < 0.5, label(`el VAN usa la tasa mostrada (${npv} vs ${summary.npvUSD})`));

  // Tarifas: cobertura y retención mostradas = las resueltas.
  const rates = render(h(RatesFields, { project, projectionEnabled: false, updateRates: noop, updateSpecs: noop } as never));
  assert.equal(Number(valueOf(rates, 'pd-rates-coverage')), used.targetCoveragePct, label('cobertura mostrada = resuelta'));
  assert.equal(Number(valueOf(rates, 'pd-rates-export')), used.gridExportFeePct, label('retención mostrada = resuelta'));
  assert.match(rates, new RegExp(`retención del ${used.gridExportFeePct}%`), label('texto de retención = resuelto'));

  // Equipamiento: pérdidas, cobertura del texto y (modo detallado) degradación.
  const equipment = render(h(EquipmentParamsSection, { project, summary, updateSpecs: noop } as never));
  assert.equal(Number(valueOf(equipment, 'dock-equipment-losses')), used.systemLossesPct, label('pérdidas mostradas = resueltas'));
  if (project.specs.autoCalculatePanels) assert.match(equipment, new RegExp(`cubrir el ${used.targetCoveragePct}% del consumo`), label('texto de cobertura = resuelto'));
  const detailed = { ...project, specs: { ...project.specs, isDetailed: true } };
  const manual = render(h(EquipmentParamsSection, { project: detailed, summary, updateSpecs: noop } as never));
  const shownDegradation = valueOf(manual, 'dock-panel-degradation');
  if (shownDegradation !== undefined) assert.equal(Number(shownDegradation), resolveAssumptions(detailed).annualDegradationPct, label('degradación mostrada = resuelta'));
}

// 1. Cobertura en la ruta de actualización: 0 o fuera de rango dimensiona con el valor resuelto (95 %), no con 1 %.
{
  const original = store.getState();
  try {
    const auto = variant((p) => { p.specs.autoCalculatePanels = true; p.rates.targetCoveragePct = 95; });
    const expected = (coverage: number) => calculateRecommendedPanelCount(auto.client.province, auto.monthlyConsumption, readEquipment(auto.specs).panels[0].powerW, coverage, resolveAssumptions(auto).systemLossesPct, auto.client.customMonthlyHSP).recommendedPanelCount;
    const countAfter = (coverage: number) => {
      store.setState({ projects: [structuredClone(auto)], activeProjectId: auto.id });
      store.getState().updateRates({ targetCoveragePct: coverage });
      return readEquipment(store.getState().getActiveProject().specs).panels[0].count;
    };
    assert.equal(countAfter(95), expected(95));
    assert.notEqual(expected(95), expected(1), 'la prueba distingue 95 % de 1 %');
    assert.equal(countAfter(0), expected(95), 'cobertura 0 dimensiona con 95 %, no con 1 %');
    assert.equal(countAfter(900), expected(95), 'cobertura fuera de rango dimensiona con 95 %');
    assert.equal(countAfter(60), expected(60), 'una cobertura válida se respeta');
    // El mismo valor resuelto en las demás rutas que dimensionan (consumo mensual y cambio de provincia).
    store.setState({ projects: [{ ...structuredClone(auto), rates: { ...auto.rates, targetCoveragePct: 0 } }], activeProjectId: auto.id });
    store.getState().updateMonthlyConsumption(0, auto.monthlyConsumption[0]);
    const viaConsumption = readEquipment(store.getState().getActiveProject().specs).panels[0].count;
    const reference = (consumption: number[]) => calculateRecommendedPanelCount(auto.client.province, consumption, readEquipment(auto.specs).panels[0].powerW, 95, resolveAssumptions(auto).systemLossesPct, auto.client.customMonthlyHSP).recommendedPanelCount;
    assert.equal(viaConsumption, reference(store.getState().getActiveProject().monthlyConsumption), 'consumo con cobertura 0: dimensiona con 95 %');
  } finally {
    store.setState(original, true);
  }
}

// 2. Cobertura en los borradores de IA: la pantalla, el normalizador y el borrador usan la cobertura resuelta.
{
  const draft = { province: 'Santiago', monthlyConsumptionKWh: Array(12).fill(1000), observedMonthlyConsumptionKWh: Array(12).fill(1000), targetCoveragePct: 0, panels: [{ id: 'a', brandModel: 'P', powerW: 550, count: 1 }] } as never;
  const html = render(h(ProposalConsumptionReview, { draft, context: { province: 'Santiago' }, production: null, update: noop } as never));
  assert.equal(Number(/Cobertura objetivo \(%\)<input[^>]*value="([^"]*)"/.exec(html)?.[1]), 95, 'la pantalla muestra 95 % con cobertura 0');
  const target = (coverage: number) => { const s = calculateRecommendedPanelCount('Santiago', Array(12).fill(1000), 550, coverage, undefined, undefined); return (s.targetAnnualKWh / s.annualSpecificYieldKWhPerKWp).toFixed(2); };
  assert.notEqual(target(95), target(1), 'la prueba distingue 95 % de 1 %');
  assert.match(html, new RegExp(`Objetivo: <strong>${target(95)} kWp`), 'la pantalla dimensiona con la cobertura que muestra (95 %), no con 1 %');
  const normalized = normalizeProposalDraft({ targetCoveragePct: 0, clientName: 'C', hasBattery: false, monthlyConsumptionKWh: Array(12).fill(1000) } as never, [], { province: 'Santiago' } as never);
  assert.equal(normalized.targetCoveragePct, 95, 'el normalizador no convierte 0 en 1 %');
  const base = variant((p) => { p.rates.targetCoveragePct = 0; });
  const prepared = prepareProposalDraftProject(base, { monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', targetCoveragePct: 0, recommendedPanelCount: 12, selectedPanelWatts: 550 } as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: true });
  assert.equal(prepared.rates.targetCoveragePct, 95, 'el borrador guarda la cobertura resuelta');
}

// 3. Tasa en el editor de precios: solo en rates, el editor muestra la que usa la matriz y escribir 60 la corrige.
{
  const project = variants.exchangeInRatesOnly;
  const html = render(h(PricingParamsSection, { project, summary: calculateProjectFinancialSummary(project), updateSpecs: noop }));
  assert.equal(valueOf(html, 'pd-dop-rate'), '58', 'muestra 58, no 60');
  assert.equal(calculateProjectFinancialSummary(project).costMatrix.dopExchangeRate, 58);
}
console.log('PASS: el dock muestra los mismos supuestos efectivos que usa el cálculo.');
