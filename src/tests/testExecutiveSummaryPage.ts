import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PDFExecutiveSummaryPage } from '../components/pdf/pages/PDFExecutiveSummaryPage';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';

// "Base computable deducible" is the engine's Ley 57-07 equipment base over the gross investment.
const theme = (Array.isArray(PDF_COLOR_THEMES) ? PDF_COLOR_THEMES[0] : Object.values(PDF_COLOR_THEMES)[0]) as any;
for (const applyLey5707 of [true, false]) {
  const project = { ...structuredClone(BENCHMARK_PROJECT), financials: { ...BENCHMARK_PROJECT.financials, applyLey5707 } };
  const summary = calculateProjectFinancialSummary(project);
  const html = renderToStaticMarkup(React.createElement(PDFExecutiveSummaryPage, { project, summary, activeTheme: theme, showHeadersFooters: true, currentDateStr: 'hoy', pageNum: 3, totalPages: 11 }));
  const shown = Number(html.match(/(\d+)%<\/span><span[^>]*>Base computable deducible/)?.[1]);
  const expected = Math.round((summary.equipmentPortionUSD / summary.grossInvestmentUSD) * 100);
  assert.equal(shown, expected, `Ley 57-07 ${applyLey5707 ? 'activa' : 'inactiva'}: base computable ${expected}% (mostrado ${shown}%)`);
}
console.log('Executive summary shows the engine equipment base share.');
