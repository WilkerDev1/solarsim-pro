import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentEditorProvider } from '../components/pdf/editor/DocumentEditorContext';
import { PDFCoverPage } from '../components/pdf/pages/PDFCoverPage';
import { PDFTableOfContents } from '../components/pdf/pages/PDFTableOfContents';
import { PDFExecutiveSummaryPage } from '../components/pdf/pages/PDFExecutiveSummaryPage';
import { PDFAboutUsPage } from '../components/pdf/pages/PDFAboutUsPage';
import { PDFSolarBenefitsPage } from '../components/pdf/pages/PDFSolarBenefitsPage';
import { PDFTechnicalIntroPage } from '../components/pdf/pages/PDFTechnicalIntroPage';
import { PDFProjectDescriptionPage } from '../components/pdf/pages/PDFProjectDescriptionPage';
import { PDFPage1Energy } from '../components/pdf/pages/PDFPage1Energy';
import { PDFPage2Quotation } from '../components/pdf/pages/PDFPage2Quotation';
import { PDFPage3ROI } from '../components/pdf/pages/PDFPage3ROI';
import { PDFPage4CashFlow } from '../components/pdf/pages/PDFPage4CashFlow';
import { PDFPage5CostMatrix } from '../components/pdf/pages/PDFPage5CostMatrix';
import { RichText } from '../components/pdf/editor/RichText';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { buildPdfLayout } from '../utils/pdfLayout';
import { DEFAULT_PDF_SECTION_ORDER } from '../constants/pdfSections';
import { DOCUMENT_TEXT_DEFINITIONS } from '../../shared/documentTexts';
import type { ProjectSimulation } from '../types';

/*
 * Cobertura: cada texto del registro se dibuja en alguna página del documento (editable en la hoja).
 * Las excepciones son textos que solo existen según el estado de la propuesta.
 */
const theme = (Array.isArray(PDF_COLOR_THEMES) ? PDF_COLOR_THEMES[0] : Object.values(PDF_COLOR_THEMES)[0]) as any;
const project: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), customization: { companyName: 'Caribe Solar' } };
const summary = calculateProjectFinancialSummary(project);
const visibility = Object.fromEntries(DEFAULT_PDF_SECTION_ORDER.map((id) => [id, true])) as Record<(typeof DEFAULT_PDF_SECTION_ORDER)[number], boolean>;
const layout = buildPdfLayout(DEFAULT_PDF_SECTION_ORDER, visibility);
const base = { project, summary, activeTheme: theme, showHeadersFooters: true, currentDateStr: '21/10/2026', pageNum: 2, totalPages: 12 };

const pages: React.ReactElement[] = [
  React.createElement(PDFCoverPage, { project, summary, activeTheme: theme, currentDateStr: base.currentDateStr }),
  React.createElement(PDFTableOfContents, { ...base, tocItems: layout.tocItems }),
  React.createElement(PDFExecutiveSummaryPage, base),
  React.createElement(PDFAboutUsPage, base),
  React.createElement(PDFSolarBenefitsPage, base),
  React.createElement(PDFTechnicalIntroPage, base),
  React.createElement(PDFProjectDescriptionPage, base),
  React.createElement(PDFPage1Energy, base),
  React.createElement(PDFPage2Quotation, base),
  React.createElement(PDFPage3ROI, base),
  React.createElement(PDFPage4CashFlow, base),
  React.createElement(PDFPage5CostMatrix, base),
];

const rendered = new Set<string>();
for (const page of pages) {
  const html = renderToStaticMarkup(React.createElement(DocumentEditorProvider, {
    project, summary, currentDateStr: base.currentDateStr, mode: 'view', writable: false, children: page,
  }));
  for (const match of html.matchAll(/data-doc-text="([^"]+)"/g)) rendered.add(match[1]);
}

// Texts that depend on the proposal state (self-consumption view, logo present, optional rows).
const CONDITIONAL = new Set([
  'energy.table.savedBilled', 'energy.legend.selfConsumption', 'energy.table.selfConsumption', // solo con la vista de autoconsumo
  'company.slogan', // se imprime con el logo ausente (cabecera y portada de texto)
  'company.email', 'company.rnc', 'quotation.issuerRncLabel', 'client.email', // filas opcionales: se imprimen si tienen valor
  'quotation.label.email',
  'projectDescription.engineeringScope', // solo se edita (y se inserta en el párrafo 2)
]);
const missing = DOCUMENT_TEXT_DEFINITIONS.map((d) => d.key).filter((key) => !rendered.has(key) && !CONDITIONAL.has(key));
assert.deepEqual(missing, [], `Textos del registro sin lugar en la hoja:\n${missing.join('\n')}`);
assert.ok(rendered.size >= 180, `Se esperaban muchos textos editables en la hoja (hay ${rendered.size})`);
// Formatting survives: bold in a service list renders as <strong>, and bold inherits the colour of dark headers.
{
  const formatted: ProjectSimulation = { ...project, customization: { ...project.customization, texts: { 'aboutUs.service1.items': '- **Levantamiento** técnico\n- Planos' } } };
  const html = renderToStaticMarkup(React.createElement(DocumentEditorProvider, { project: formatted, summary, currentDateStr: base.currentDateStr, mode: 'view', children: React.createElement(PDFAboutUsPage, { ...base, project: formatted }) }));
  assert.ok(html.includes('<strong class="font-bold">Levantamiento</strong> técnico'), 'La negrita de una lista de servicios se conserva');
  assert.ok(!html.includes('**'));
  assert.ok(!renderToStaticMarkup(React.createElement(RichText, { text: 'a **b**' })).includes('text-slate-950'), 'La negrita hereda el color (cabeceras oscuras)');
}

console.log(`PASS: ${rendered.size} textos del registro se dibujan en las 12 páginas (${DOCUMENT_TEXT_DEFINITIONS.length} definidos).`);
