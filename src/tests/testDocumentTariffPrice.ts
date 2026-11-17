import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentEditorProvider } from '../components/pdf/editor/DocumentEditorContext';
import { PDFExecutiveSummaryPage } from '../components/pdf/pages/PDFExecutiveSummaryPage';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { energyChargeDOP, tariffPricePresentation } from '../../shared/tariffBilling';
import { DEFAULT_RD_TARIFF_MATRIX, referenceBillingTariff } from '../data/rdTariffs';
import { executiveSummaryModel } from '../components/pdf/pages/executiveSummary/executiveSummaryModel';
import { PAGE_TEXT_DEFINITIONS } from '../../shared/documentTexts/pageTexts';
import { resolveDocumentText } from '../../shared/documentTexts';
import { createDocumentTextContext } from '../../shared/documentTexts/context';

/**
 * Fase 6: el documento dice cómo se valora la energía. Con facturación por bloques (`block_billing`) muestra el precio
 * medio de la factura y que es «según bloques tarifarios»; con el precio escalar, lo de siempre. La decisión sale de
 * `resolveEnergyValuationMethod`; el componente no tiene lógica tarifaria.
 */
const billingTariff = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1');
assert.ok(billingTariff, 'la matriz de fábrica trae la fila BTS-1 de EDESUR');
const blocks = { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78, energyRateSource: 'reference', billingTariff };

const projectWith = (rates: Record<string, unknown>) => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.rates = { ...p.rates, distributor: 'EDESUR', tariffCode: 'BTS1', ...rates } as typeof p.rates;
  return p;
};
const summaryOf = (rates: Record<string, unknown>) => calculateProjectFinancialSummary(projectWith(rates), 'legacy');
const modelOf = (rates: Record<string, unknown>) => executiveSummaryModel(projectWith(rates), summaryOf(rates));

// Precio escalar: sin cambios (régimen anterior, procedencia manual, sin fila).
for (const rates of [{}, { netMeteringRegime: 'legacy_retention' }, { ...blocks, energyRateSource: 'manual' }, { ...blocks, billingTariff: undefined }]) {
  const model = modelOf(rates);
  assert.equal(model.tariffPrice.method, 'flat_rate', JSON.stringify(rates));
  assert.equal(model.tariffPrice.averageDOPPerKWh, undefined);
  assert.equal(model.tariffDOP, model.tariffUSD * model.exchangeRate);
}

// Por bloques: precio medio de la factura sin sistema (RD$ por kWh consumido en el año).
const model = modelOf(blocks);
assert.equal(model.tariffPrice.method, 'block_billing');
const months = summaryOf(blocks).monthlyBreakdown.map((m) => m.consumptionKWh);
const expected = months.reduce((sum, kWh) => sum + energyChargeDOP(billingTariff!, kWh), 0) / months.reduce((sum, kWh) => sum + kWh, 0);
assert.ok(Math.abs((model.tariffPrice.averageDOPPerKWh as number) - expected) < 1e-9);
assert.ok((model.tariffPrice.averageDOPPerKWh as number) > 0);
assert.equal(tariffPricePresentation(blocks, [0, 0]).averageDOPPerKWh, undefined, 'sin consumo no hay precio medio');
assert.equal(tariffPricePresentation(null, months).method, 'flat_rate');
assert.equal(tariffPricePresentation({ ...blocks, gridConnection: 'off_grid' }, months).method, 'flat_rate', 'aislado: escalar');

// Textos nuevos: declarados en el registro y editables; el rótulo de siempre no cambia.
const definitions = new Map(PAGE_TEXT_DEFINITIONS.map((d) => [d.key, d]));
assert.equal(definitions.get('executiveSummary.row3.tariff')?.defaultText, 'Precio kWh Tarifa');
for (const key of ['executiveSummary.row3.tariffAverage', 'executiveSummary.row3.tariffBlocksNote']) assert.ok(definitions.has(key), key);
const ctx = createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', gridExportFeePct: 25, isZeroExport: false, hasBattery: false });
assert.equal(resolveDocumentText('executiveSummary.row3.tariffBlocksNote', { customization: {} }, ctx).text, 'Según bloques tarifarios');
// Un texto ya editado por el usuario no se toca.
const edited = { customization: { texts: { 'executiveSummary.row3.tariff': 'Mi precio', 'executiveSummary.row3.tariffBlocksNote': 'Nota propia' } } };
assert.equal(resolveDocumentText('executiveSummary.row3.tariff', edited, ctx).text, 'Mi precio');
assert.equal(resolveDocumentText('executiveSummary.row3.tariffBlocksNote', edited, ctx).text, 'Nota propia');

// El documento: render del cuadro resumen en ambos modos y sin consumo.
const theme = Object.values(PDF_COLOR_THEMES)[0] as never;
const renderSummary = (rates: Record<string, unknown>, mutate: (s: ReturnType<typeof summaryOf>) => void = () => {}) => {
  const project = projectWith(rates);
  const summary = structuredClone(calculateProjectFinancialSummary(project, 'legacy'));
  mutate(summary);
  return renderToStaticMarkup(React.createElement(DocumentEditorProvider, {
    project, summary, currentDateStr: '16/11/2026', mode: 'view', writable: false,
    children: React.createElement(PDFExecutiveSummaryPage, { project, summary, activeTheme: theme, showHeadersFooters: true, currentDateStr: '16/11/2026', pageNum: 2, totalPages: 12 }),
  }));
};
const blockHtml = renderSummary(blocks);
assert.ok(blockHtml.includes('data-doc-text="executiveSummary.row3.tariffAverage"') && blockHtml.includes('data-doc-text="executiveSummary.row3.tariffBlocksNote"'));
assert.ok(!blockHtml.includes('data-doc-text="executiveSummary.row3.tariff"'));
assert.ok(blockHtml.includes(`RD$ ${(model.tariffPrice.averageDOPPerKWh as number).toFixed(2)}`), 'precio medio impreso');
const flatHtml = renderSummary({});
assert.ok(flatHtml.includes('data-doc-text="executiveSummary.row3.tariff"') && !flatHtml.includes('tariffBlocksNote'), 'escalar: como siempre');
// Por bloques sin consumo (propuesta nueva): sin dato, «—»; nunca el precio escalar residual como si fuera el promedio.
const scalarDOP = (model.tariffDOP).toFixed(2);
for (const clear of [(s: ReturnType<typeof summaryOf>) => { s.monthlyBreakdown = []; }, (s: ReturnType<typeof summaryOf>) => { s.monthlyBreakdown.forEach((m) => { m.consumptionKWh = 0; }); }]) {
  const html = renderSummary(blocks, clear);
  assert.ok(html.includes('data-doc-text="executiveSummary.row3.tariffAverage"') && html.includes('data-doc-text="executiveSummary.row3.tariffBlocksNote"'));
  assert.ok(!html.includes(`RD$ ${scalarDOP}`), 'no imprime el precio escalar como promedio');
  assert.ok(html.includes('font-mono block mt-0.5">—<'), 'imprime «—»');
}

console.log('Documento: precio de la energía según el método de valoración.');
