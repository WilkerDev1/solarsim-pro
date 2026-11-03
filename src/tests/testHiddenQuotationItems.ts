import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { visibleQuotationItems, isItemHiddenInQuotation, preserveHiddenInQuotation } from '../../shared/quotationItems';
import { COMMERCIAL_SCHEMA, normalizeCommercial } from '../../shared/aiProposalCommercial';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { PDFPage2Quotation } from '../components/pdf/pages/PDFPage2Quotation';
import { QuotationEquipmentsTab } from '../components/simulator/tabs/QuotationEquipmentsTab';
import { ItemsList } from '../components/simulator/params/sections/finance/ItemsList';
import { ProposalCommercialReview } from '../components/common/ai-invoice/components/ProposalCommercialReview';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { assistantOwner, executeAssistantTool, applyAssistantAction } from '../features/assistant/tools';
import { validateAssistantEdits } from '../features/assistant/validation';
import type { CustomQuotationItem, ProjectSimulation } from '../types';

const VISIBLE_ROW = 'Herrajes de montaje especiales';
const HIDDEN_ROW = 'Comision de venta confidencial';
const item = (over: Partial<CustomQuotationItem>): CustomQuotationItem => ({
  id: 'x', description: 'x', quantity: 1, unit: 'UD', unitPriceUSD: 100, exonerateITBIS: false, applyMargin: true, ...over,
});
const withItems = (items: CustomQuotationItem[]): ProjectSimulation => {
  const project = structuredClone(BENCHMARK_PROJECT);
  project.financials = { ...project.financials, customItems: structuredClone(items) };
  return project;
};
const hiddenFlag = (hidden: boolean | undefined): CustomQuotationItem[] => [
  item({ id: 'visible', description: VISIBLE_ROW, unitPriceUSD: 240, exonerateITBIS: true }),
  item({ id: 'fee', description: HIDDEN_ROW, quantity: 2, unitPriceUSD: 375, ...(hidden === undefined ? {} : { hideInQuotation: hidden }) }),
];

// 1. La regla compartida: ausente o false = visible; solo true oculta.
assert.equal(isItemHiddenInQuotation({}), false);
assert.equal(isItemHiddenInQuotation({ hideInQuotation: false }), false);
assert.equal(isItemHiddenInQuotation({ hideInQuotation: true }), true);
assert.deepEqual(visibleQuotationItems(hiddenFlag(true)).map(i => i.id), ['visible']);
assert.deepEqual(visibleQuotationItems(hiddenFlag(false)).map(i => i.id), ['visible', 'fee']);
assert.deepEqual(visibleQuotationItems(hiddenFlag(undefined)).map(i => i.id), ['visible', 'fee'], 'propuestas existentes siguen visibles');
assert.deepEqual(visibleQuotationItems(undefined), []);
assert.deepEqual(visibleQuotationItems(null as never), []);

// 2. Los importes no dependen del flag: motor idéntico con el ítem oculto o visible.
const strip = (summary: ReturnType<typeof calculateProjectFinancialSummary>) => JSON.parse(JSON.stringify({ ...summary, customItemsList: undefined }));
for (const mode of ['legacy', 'self_consumption'] as const) {
  const open = calculateProjectFinancialSummary(withItems(hiddenFlag(false)), mode);
  const hidden = calculateProjectFinancialSummary(withItems(hiddenFlag(true)), mode);
  assert.deepEqual(strip(hidden), strip(open), `totales, ITBIS, margen y $/W idénticos (${mode})`);
  assert(hidden.customItemsTotalUSD > 0 && hidden.listGrossInvestmentUSD > 0);
  const base = calculateProjectFinancialSummary(withItems(hiddenFlag(false).slice(0, 1)), mode);
  assert(hidden.listGrossInvestmentUSD > base.listGrossInvestmentUSD, 'el ítem oculto sigue cobrándose');
}

// 3. PDF (cotización): la fila oculta no aparece; los importes del recuadro no cambian.
const theme = (Array.isArray(PDF_COLOR_THEMES) ? PDF_COLOR_THEMES[0] : Object.values(PDF_COLOR_THEMES)[0]) as never;
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const renderPdf = (project: ProjectSimulation) => {
  const summary = calculateProjectFinancialSummary(project);
  const html = renderToStaticMarkup(React.createElement(PDFPage2Quotation, { project, summary, activeTheme: theme, showHeadersFooters: true, currentDateStr: 'hoy', pageNum: 2, totalPages: 8 }));
  return { html, summary };
};
{
  const open = renderPdf(withItems(hiddenFlag(false)));
  const hidden = renderPdf(withItems(hiddenFlag(true)));
  assert(open.html.includes(HIDDEN_ROW) && open.html.includes(VISIBLE_ROW), 'sin ocultar, ambas filas se listan');
  assert(!hidden.html.includes(HIDDEN_ROW), 'el PDF no lista la fila oculta');
  assert(hidden.html.includes(VISIBLE_ROW), 'el PDF sigue listando las demás');
  const totalsOf = (r: { summary: ReturnType<typeof calculateProjectFinancialSummary> }) => [
    money(r.summary.commercialPreTaxSubtotalUSD),
    money(r.summary.listGrossInvestmentUSD + (BENCHMARK_PROJECT.financials.applyITBISExemption ? r.summary.itbisSavedUSD : 0)),
    money(r.summary.itbisSavedUSD),
  ];
  assert.deepEqual(totalsOf(hidden), totalsOf(open));
  for (const amount of totalsOf(hidden)) assert(hidden.html.includes(amount), `PDF muestra ${amount} con el ítem oculto`);
  assert.equal(hidden.summary.salePricePerWattUSD, open.summary.salePricePerWattUSD, 'precio por watt idéntico');
}

// 4. Vista de cotización del simulador: el desglose de factura omite la fila; el ítem de extras sigue en la hoja de costos.
{
  const project = withItems(hiddenFlag(true));
  const summary = calculateProjectFinancialSummary(project);
  const html = renderToStaticMarkup(React.createElement(QuotationEquipmentsTab, { project, summary, costTableCurrency: 'USD', setCostTableCurrency: () => {} }));
  const invoiceSection = html.slice(html.indexOf('EQUIPOS Y MATERIALES'), html.indexOf('SUB-TOTAL'));
  assert(invoiceSection.includes(VISIBLE_ROW) && !invoiceSection.includes(HIDDEN_ROW), 'el desglose de factura omite la fila oculta');
}

// 5. Ficha del ítem: tercer interruptor accesible y pista visual.
{
  const render = (items: CustomQuotationItem[]) => renderToStaticMarkup(React.createElement(ItemsList, {
    items, marginMultiplier: 1.4, totals: { itemsSubtotalUSD: 0, chargedITBISUSD: 0, exoneratedITBISUSD: 0 }, onAdd() {}, onUpdate() {}, onRemove() {},
  }));
  const toggle = (html: string) => html.match(/<button[^>]*aria-pressed="(true|false)"[^>]*>(?:<svg[^>]*>.*?<\/svg>)?Oculto en factura<\/button>/s)?.[1];
  assert.equal(toggle(render(hiddenFlag(true))), 'true');
  assert.equal(toggle(render(hiddenFlag(false))), 'false');
  assert.equal(toggle(render(hiddenFlag(undefined))), 'false');
  assert.equal((render(hiddenFlag(true)).match(/No se lista en el documento/g) || []).length, 1, 'pista solo en el ítem oculto');
  assert(render(hiddenFlag(true)).includes(HIDDEN_ROW), 'el ítem oculto sigue visible en la edición');
  assert(!render(hiddenFlag(false)).includes('No se lista en el documento'));
}

// 6. Revisión del borrador de IA: el ítem oculto se ve, marcado.
{
  const render = (hide: boolean | undefined) => renderToStaticMarkup(React.createElement(ProposalCommercialReview, {
    draft: { commercial: { customItems: [item({ id: 'i', description: HIDDEN_ROW, ...(hide === undefined ? {} : { hideInQuotation: hide }) })] } } as never, update: () => {},
  }));
  const checked = (html: string) => /<input type="checkbox"( checked="")?\/>Oculto en factura/.exec(html)?.[1] === ' checked=""';
  assert(render(true).includes(HIDDEN_ROW));
  assert(checked(render(true)));
  assert(!checked(render(false)) && render(false).includes('Oculto en factura'));
  assert(!checked(render(undefined)));
}

// 7. IA: el flag sobrevive a la normalización de condiciones comerciales.
const issues: string[] = [];
const onIssue = (code: string) => { issues.push(code); };
const rows = (commercial: { customItems?: unknown[] }) => commercial.customItems as CustomQuotationItem[];
const row = (over: Record<string, unknown> = {}) => ({ id: 'fee', description: HIDDEN_ROW, quantity: 1, unit: 'UD', unitPriceUSD: 500, exonerateITBIS: false, applyMargin: true, ...over });
const schemaItem = (COMMERCIAL_SCHEMA.properties.customItems as { items: { properties: Record<string, unknown>; required: string[] } }).items;
assert.equal((schemaItem.properties.hideInQuotation as { type: string }).type, 'BOOLEAN', 'el esquema declara el flag');
assert(!schemaItem.required.includes('hideInQuotation'), 'y es opcional');
{
  const out = normalizeCommercial({ customItems: [row({ hideInQuotation: true })] }, undefined, onIssue);
  assert.equal(rows(out)[0].hideInQuotation, true);
  const visible = normalizeCommercial({ customItems: [row()] }, undefined, onIssue);
  assert.equal('hideInQuotation' in visible.customItems![0], false, 'sin flag no se inventa uno');
  const base = { customItems: [item({ id: 'fee', description: HIDDEN_ROW, hideInQuotation: true })] };
  const reworded = normalizeCommercial({ customItems: [row({ unitPriceUSD: 650 })] }, base, onIssue);
  assert.equal(rows(reworded)[0].hideInQuotation, true, 'reescribir la lista no vuelve visible un ítem oculto');
  const unhidden = normalizeCommercial({ customItems: [row({ hideInQuotation: false })] }, base, onIssue);
  assert.equal(rows(unhidden)[0].hideInQuotation, false, 'false explícito sí lo muestra');
  const { id: _omit, ...withoutId } = row({ description: `  ${HIDDEN_ROW.toUpperCase()} `, unitPriceUSD: 700 });
  const recovered = normalizeCommercial({ customItems: [withoutId] }, base, onIssue);
  assert.equal(rows(recovered)[0].id, 'fee', 'una fila sin id recupera el id del ítem anterior con la misma descripción');
  assert.equal(rows(recovered)[0].hideInQuotation, true, 'y conserva el oculto en factura');
  const twins = { customItems: [item({ id: 'fee', description: HIDDEN_ROW, hideInQuotation: true }), item({ id: 'fee2', description: HIDDEN_ROW })] };
  const ambiguous = normalizeCommercial({ customItems: [withoutId] }, twins, onIssue);
  assert.equal(rows(ambiguous)[0].id, 'ai-customItems-0', 'con descripciones repetidas no se adivina el id');
  assert.deepEqual(issues, [], 'ningún aviso por el campo opcional');
  normalizeCommercial({ customItems: [row({ hideInQuotation: 'si' })] }, undefined, onIssue);
  assert.deepEqual(issues, ['invalid_extra'], 'un valor no booleano bloquea');
}
assert.deepEqual(preserveHiddenInQuotation([{ id: 'a' }, { id: 'b', hideInQuotation: false }, { id: 'c' }] as CustomQuotationItem[], [
  { id: 'a', hideInQuotation: true }, { id: 'b', hideInQuotation: true }, { id: 'z', hideInQuotation: true },
] as CustomQuotationItem[]), [{ id: 'a', hideInQuotation: true }, { id: 'b', hideInQuotation: false }, { id: 'c' }]);

// 8. Asistente y herramientas de agente: la edición completa de customItems conserva el flag.
assert.doesNotThrow(() => validateAssistantEdits([{ section: 'financials', field: 'customItems', value: [row({ hideInQuotation: true })] }], 'project'));
assert.throws(() => validateAssistantEdits([{ section: 'financials', field: 'customItems', value: [row({ hideInQuotation: 'si' })] }], 'project'), /inválido/);
{
  const state = useSimulationStore;
  const project = { ...withItems(hiddenFlag(true)), id: 'hidden-flag-project', syncStatus: 'local_only' as const };
  state.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [project], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [],
    syncSettings: { ...state.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false }, sessionGeneration: 0,
  });
  const owner = assistantOwner();
  const stored = () => state.getState().getActiveProject().financials.customItems!;
  const propose = (value: unknown[]) => applyAssistantAction(executeAssistantTool({
    name: 'propose_project_update',
    args: { id: project.id, edits: [{ section: 'financials', field: 'customItems', value }] },
  }, owner).action!);
  // La IA reescribe la lista completa subiendo el precio de la comisión y sin repetir el flag.
  propose([row({ id: 'visible', description: VISIBLE_ROW, unitPriceUSD: 240, exonerateITBIS: true }), row({ unitPriceUSD: 800 })]);
  assert.equal(stored().find(i => i.id === 'fee')!.unitPriceUSD, 800);
  assert.equal(stored().find(i => i.id === 'fee')!.hideInQuotation, true, 'el ítem oculto sigue oculto tras la edición de la IA');
  assert.equal(stored().find(i => i.id === 'visible')!.hideInQuotation, undefined);
  // Mostrarlo de nuevo es una decisión explícita.
  propose([row({ id: 'visible', description: VISIBLE_ROW, unitPriceUSD: 240, exonerateITBIS: true }), row({ hideInQuotation: false })]);
  assert.equal(stored().find(i => i.id === 'fee')!.hideInQuotation, false);
  // Un flag enviado de vuelta (lo devuelve get_project) se acepta tal cual.
  propose([row({ hideInQuotation: true })]);
  assert.equal(stored()[0].hideInQuotation, true);
}

console.log('Hidden quotation items: listed rows, unchanged totals, and flag preserved through AI and agent edits.');
