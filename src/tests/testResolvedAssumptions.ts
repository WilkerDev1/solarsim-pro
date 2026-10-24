import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { executiveSummaryModel } from '../components/pdf/pages/executiveSummary/executiveSummaryModel';
import type { ProjectSimulation } from '../types';

/**
 * Caracterización del ADR 0003 (supuestos resueltos). Fija los resultados del motor financiero y del resumen
 * ejecutivo del PDF antes de centralizar los defaults en `shared/assumptions.ts`. Tras el refactor todo queda igual
 * salvo los cambios decididos, cada uno anotado con «ADR 0003 (x)».
 */
const clone = (): ProjectSimulation => structuredClone(BENCHMARK_PROJECT);
const hash = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

function snapshot(project: ProjectSimulation) {
  const summary = calculateProjectFinancialSummary(project);
  const pdf = executiveSummaryModel(project, summary);
  return {
    gross: summary.grossInvestmentUSD,
    production: summary.annualProductionKWh,
    payback: summary.paybackYears,
    npv: summary.npvUSD,
    irr: summary.irrPct,
    roi: summary.roi25YrPct,
    savings25: summary.total25YearSavingsUSD,
    years: summary.cashFlow25Years.length,
    cashFlow: hash(summary.cashFlow25Years),
    costRate: summary.costMatrix.dopExchangeRate,
    costMargin: summary.costMatrix.saleMarginMultiplier,
    pdfLosses: pdf.lossesPercent,
    pdfRatio: pdf.performanceRatio,
    pdfRate: pdf.exchangeRate,
    pdfTariffDOP: pdf.tariffDOP,
  };
}

const withoutKeys = <T extends object>(source: T, keys: string[]): T => {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
};

const cases: Record<string, ProjectSimulation> = {};
cases.complete = clone();
{
  // Como los proyectos antiguos de producción: sin inflación, retención, cobertura ni vigencia.
  const p = clone();
  p.rates = withoutKeys(p.rates, ['annualEnergyInflationPct', 'gridExportFeePct', 'targetCoveragePct']) as never;
  p.client = withoutKeys(p.client, ['quoteValidityDays']);
  cases.legacyMissing = p;
}
{
  const p = clone();
  p.financials = withoutKeys(p.financials, ['discountRatePct', 'projectLifespanYears']) as never;
  cases.missingDiscountAndLifespan = p;
}
{
  const p = clone();
  p.specs = withoutKeys(p.specs, ['systemLosses']) as never; // BENCHMARK es modo detallado
  cases.detailedWithoutLosses = p;
}
{
  const p = clone();
  p.specs = { ...withoutKeys(p.specs, ['systemLosses']), isDetailed: false } as never;
  cases.simpleWithoutLosses = p;
}
{
  const p = clone();
  p.specs = withoutKeys(p.specs, ['dopExchangeRate']) as never;
  p.rates = { ...p.rates, usdExchangeRate: 58 };
  cases.exchangeInRatesOnly = p;
}
{
  const p = clone();
  p.specs = { ...p.specs, systemLosses: 0, annualDegradation: 0, installationUnitPriceUSD: 0, panels: p.specs.panels!.map((g) => ({ ...g, annualDegradation: 0 })) };
  p.rates = { ...p.rates, annualEnergyInflationPct: 0 };
  p.financials = { ...p.financials, discountRatePct: 0 };
  cases.explicitZeros = p;
}
{
  // El 0 vale «sin dato» para tasa de cambio, margen, vida del proyecto, cobertura y $/W.
  const p = clone();
  p.specs = { ...p.specs, dopExchangeRate: 0, saleMarginMultiplier: 0, pricePerWattUSD: 0 };
  p.rates = { ...p.rates, usdExchangeRate: 0, targetCoveragePct: 0 };
  p.financials = { ...p.financials, projectLifespanYears: 0, pricePerWattUSD: 0 };
  p.client = { ...p.client, quoteValidityDays: 0 };
  cases.zerosAsMissing = p;
}

/** Resultados medidos sobre `beta` antes del refactor (8455ece). */
const EXPECTED: Record<string, ReturnType<typeof snapshot>> = {
  complete: { gross: 25371.12, production: 39067.99999999999, payback: 2.3, npv: 77958.87, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: "7ae04a9daeda", costRate: 60, costMargin: 1.25, pdfLosses: 14, pdfRatio: 86, pdfRate: 60, pdfTariffDOP: 13.26 },
  legacyMissing: { gross: 25371.12, production: 39067.99999999999, payback: 2.3, npv: 77958.87, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: "7ae04a9daeda", costRate: 60, costMargin: 1.25, pdfLosses: 14, pdfRatio: 86, pdfRate: 60, pdfTariffDOP: 13.26 },
  missingDiscountAndLifespan: { gross: 25371.12, production: 39067.99999999999, payback: 25, npv: -25371.12, irr: 15, roi: -100, savings25: 0, years: 0, cashFlow: "97d170e1550e", costRate: 60, costMargin: 1.25, pdfLosses: 14, pdfRatio: 86, pdfRate: 60, pdfTariffDOP: 13.26 },
  detailedWithoutLosses: { gross: 25371.12, production: 39067.99999999999, payback: 2.3, npv: 77958.87, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: "7ae04a9daeda", costRate: 60, costMargin: 1.25, pdfLosses: 25, pdfRatio: 75, pdfRate: 60, pdfTariffDOP: 13.26 },
  simpleWithoutLosses: { gross: 26739.92, production: 34070.9, payback: 2.6, npv: 64547.07, irr: 36.07, roi: 929.38, savings25: 267050.07, years: 25, cashFlow: "72d302de4254", costRate: 60, costMargin: 1.3174, pdfLosses: 25, pdfRatio: 75, pdfRate: 60, pdfTariffDOP: 13.26 },
  exchangeInRatesOnly: { gross: 25371.12, production: 39067.99999999999, payback: 2.3, npv: 77958.87, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: "7ae04a9daeda", costRate: 60, costMargin: 1.25, pdfLosses: 14, pdfRatio: 86, pdfRate: 58, pdfTariffDOP: 12.818 },
  explicitZeros: { gross: 19463.45, production: 45427.899999999994, payback: 1.6, npv: 365068.31, irr: 62.87, roi: 1875.66, savings25: 376746.37, years: 25, cashFlow: "b8f447506424", costRate: 60, costMargin: 1.25, pdfLosses: 0, pdfRatio: 100, pdfRate: 60, pdfTariffDOP: 13.26 },
  zerosAsMissing: { gross: 25371.12, production: 39067.99999999999, payback: 25, npv: -25371.12, irr: 15, roi: -100, savings25: 0, years: 0, cashFlow: "97d170e1550e", costRate: 60, costMargin: 1.25, pdfLosses: 14, pdfRatio: 86, pdfRate: 60, pdfTariffDOP: 13.26 },
};

/**
 * Cambios decididos en el ADR 0003; el resto de las expectativas de arriba queda idéntico.
 */
const INTENDED: Record<string, ReturnType<typeof snapshot>> = {
  // (c) Sin vida del proyecto ni tasa de descuento, el flujo ya no queda vacío (0 años, VAN = -inversión): usa 25 años y 12 %.
  missingDiscountAndLifespan: { ...EXPECTED.missingDiscountAndLifespan, payback: 2.3, npv: 62766.86, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: EXPECTED.complete.cashFlow },
  // (e) Modo detallado sin pérdidas: el PDF muestra 14 % (el que usa el motor), no 25 %.
  detailedWithoutLosses: { ...EXPECTED.detailedWithoutLosses, pdfLosses: 14, pdfRatio: 86 },
  // (e) Cambio solo en rates: el motor de costos lo usa igual que el PDF (rates.usdExchangeRate cuando falta specs.dopExchangeRate).
  exchangeInRatesOnly: { ...EXPECTED.exchangeInRatesOnly, costRate: 58 },
  // (b) Inflación 0 explícita se respeta (antes pasaba a 3.5 %); el resto de ceros explícitos ya se respetaba.
  explicitZeros: { ...EXPECTED.explicitZeros, npv: 230136.94, irr: 59.76, roi: 1182.41, savings25: 241815, cashFlow: "7466b7fbfc7b" },
  // (b) Vida del proyecto 0 = sin dato: 25 años en vez de un flujo vacío; los demás ceros equivalen a «sin dato» como antes.
  zerosAsMissing: { ...EXPECTED.zerosAsMissing, payback: 2.3, npv: 77958.87, irr: 42.37, roi: 1137.64, savings25: 306216.79, years: 25, cashFlow: EXPECTED.complete.cashFlow },
};

if (process.env.ASSUMPTIONS_PROBE) {
  const actual = Object.fromEntries(Object.entries(cases).map(([name, project]) => [name, snapshot(project)]));
  console.log(JSON.stringify(actual, null, 2));
} else {
  for (const [name, project] of Object.entries(cases)) assert.deepEqual(snapshot(project), INTENDED[name] ?? EXPECTED[name], `caso «${name}»`);
  console.log('PASS: los supuestos resueltos conservan los resultados de los motores.');
}
