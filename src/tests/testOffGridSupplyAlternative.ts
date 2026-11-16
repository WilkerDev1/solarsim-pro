import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gridConnectionFields } from '../../shared/gridConnection';
import {
  SUPPLY_ALTERNATIVES, normalizeSupplyAlternativePatch, resolveGeneratorCostPerKWh, resolveSavingsBasis, resolveSupplyAlternative,
  savingsValuationCostPerKWh,
} from '../../shared/offGridSupply';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { applyProjectEdit } from '../domain/projectEdit';
import { createDocumentTextContext, regulatoryNoteDefault, resolveDocumentText } from '../../shared/documentTexts';
import { resolveSectionVisibility, savingsSectionsVisibility } from '../../shared/documentLayout';
import { buildDocumentTextContext } from '../utils/documentTextContext';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { validateAssistantEdits } from '../features/assistant/validation';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import { FinancialReturnTab } from '../components/simulator/tabs/FinancialReturnTab';
import { PDFExecutiveSummaryPage } from '../components/pdf/pages/PDFExecutiveSummaryPage';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import type { ProjectSimulation, UtilityRates } from '../types';

/**
 * Alternativa de suministro de un sistema aislado (`rates.supplyAlternative`): tarifa de distribuidora (por defecto,
 * comportamiento anterior), generador (`rates.generatorCostPerKWh`) o sin comparación.
 */

const p = BENCHMARK_PROJECT;
const withRates = (rates: Partial<UtilityRates> & Record<string, unknown>): ProjectSimulation => ({ ...structuredClone(p), rates: { ...p.rates, ...rates } as UtilityRates });
const island = (extra: Record<string, unknown> = {}) => withRates({ ...gridConnectionFields('off_grid'), ...extra });
const summaryOf = (project: ProjectSimulation) => calculateProjectFinancialSummary(project);
const served = (s: ReturnType<typeof summaryOf>) => s.monthlyBreakdown.map((m) => m.solarSelfConsumedKWh);

// ── Lectura tolerante ───────────────────────────────────────────────────────────────────────
assert.deepEqual(SUPPLY_ALTERNATIVES, ['utility_tariff', 'generator', 'no_comparison']);
assert.equal(resolveSupplyAlternative(undefined), 'utility_tariff');
assert.equal(resolveSupplyAlternative(island().rates), 'utility_tariff', 'aislado sin el campo = tarifa');
assert.equal(resolveSupplyAlternative({ ...island().rates, supplyAlternative: 'planta' }), 'utility_tariff', 'desconocido = tarifa');
assert.equal(resolveSupplyAlternative({ ...island().rates, supplyAlternative: 'generator' }), 'generator');
assert.equal(resolveSupplyAlternative({ supplyAlternative: 'no_comparison' }), 'utility_tariff', 'con red se ignora');
assert.equal(resolveSupplyAlternative({ supplyAlternative: 'no_comparison', ...gridConnectionFields('zero_export') }), 'utility_tariff');
assert.equal(resolveGeneratorCostPerKWh({ generatorCostPerKWh: 0.42 }), 0.42);
for (const bad of [undefined, null, 0, -1, Number.NaN, Infinity, '0.4', 11]) assert.equal(resolveGeneratorCostPerKWh({ generatorCostPerKWh: bad }), null, String(bad));
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator' }).rates), 'generator_missing_cost', 'generador sin costo = incompleto');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0 }).rates), 'generator_missing_cost');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0.4 }).rates), 'generator');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'no_comparison' }).rates), 'no_comparison');
assert.equal(savingsValuationCostPerKWh(island({ supplyAlternative: 'generator' }).rates), 0, 'incompleto: nunca cae a la tarifa');
assert.equal(savingsValuationCostPerKWh(island().rates), p.rates.energyCostPerKWh);

// ── Motor: por defecto y sin campo = cifras de hoy ───────────────────────────────────────────
const tariffIsland = summaryOf(island());
assert.deepEqual(summaryOf(island({ supplyAlternative: 'utility_tariff' })), tariffIsland, 'explícito = sin campo');
assert.deepEqual(summaryOf(island({ supplyAlternative: 'planta' })), tariffIsland, 'desconocido = sin campo');
assert.deepEqual(summaryOf(island({ generatorCostPerKWh: 0.9 })), tariffIsland, 'un costo de generador sin la alternativa no cambia nada');
for (const [i, m] of tariffIsland.monthlyBreakdown.entries()) {
  assert.equal(m.savingsUSD, Math.round(served(tariffIsland)[i] * p.rates.energyCostPerKWh * 100) / 100, 'tarifa: energía servida × precio kWh');
}
assert.ok(tariffIsland.year1SavingsUSD > 0 && tariffIsland.cashFlow25Years.length === 25 && tariffIsland.paybackYears > 0);

// ── Con red, el campo se ignora por completo ─────────────────────────────────────────────────
for (const mode of ['grid_export', 'zero_export'] as const) {
  const base = summaryOf(withRates(gridConnectionFields(mode)));
  for (const alternative of SUPPLY_ALTERNATIVES) {
    assert.deepEqual(summaryOf(withRates({ ...gridConnectionFields(mode), supplyAlternative: alternative, generatorCostPerKWh: 0.5 })), base, `${mode} + ${alternative}`);
  }
}
assert.deepEqual(summaryOf(withRates({ supplyAlternative: 'no_comparison' })), summaryOf(p), 'caso de referencia intacto');

// ── Generador con costo X: ahorro con X ──────────────────────────────────────────────────────
const X = 0.385;
const generator = summaryOf(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }));
assert.deepEqual(served(generator), served(tariffIsland), 'no cambia la energía servida (dimensionado intacto)');
assert.equal(generator.annualUnservedKWh, tariffIsland.annualUnservedKWh);
assert.equal(generator.batteryBackupAutonomyHours, tariffIsland.batteryBackupAutonomyHours, 'autonomía intacta');
assert.equal(generator.systemCapacityKWp, tariffIsland.systemCapacityKWp);
assert.equal(generator.netInvestmentUSD, tariffIsland.netInvestmentUSD);
for (const [i, m] of generator.monthlyBreakdown.entries()) {
  assert.equal(m.savingsUSD, Math.round(served(generator)[i] * X * 100) / 100, 'generador: energía servida × costo del generador');
}
const expectedYear1 = Math.round(generator.monthlyBreakdown.reduce((s, m) => s + m.savingsUSD, 0) * 100) / 100;
assert.equal(generator.year1SavingsUSD, expectedYear1);
assert.ok(generator.year1SavingsUSD > tariffIsland.year1SavingsUSD, 'una planta cara da más ahorro que la tarifa');
assert.ok(generator.paybackYears < tariffIsland.paybackYears);
assert.equal(generator.cashFlow25Years.length, 25);

// ── Generador sin costo y sin comparación: sin cifras de ahorro ──────────────────────────────
for (const [label, rates] of [
  ['generador sin costo', { supplyAlternative: 'generator' }],
  ['generador con costo 0', { supplyAlternative: 'generator', generatorCostPerKWh: 0 }],
  ['sin comparación', { supplyAlternative: 'no_comparison', generatorCostPerKWh: X }],
] as const) {
  const s = summaryOf(island(rates));
  assert.equal(s.year1SavingsUSD, 0, label);
  assert.equal(s.total25YearSavingsUSD, 0, label);
  assert.equal(s.paybackYears, 0, label);
  assert.equal(s.irrPct, 0, label);
  assert.equal(s.npvUSD, 0, label);
  assert.equal(s.roi25YrPct, 0, label);
  assert.deepEqual(s.cashFlow25Years, [], `${label}: sin flujo de caja`);
  assert.ok(s.monthlyBreakdown.every((m) => m.savingsUSD === 0 && m.originalBillUSD === 0 && m.netBillUSD === 0), `${label}: sin valores monetarios mensuales`);
  // Lo que sí se presenta: inversión, energía entregada, energía no servida y autonomía.
  assert.equal(s.netInvestmentUSD, tariffIsland.netInvestmentUSD, label);
  assert.equal(s.grossInvestmentUSD, tariffIsland.grossInvestmentUSD, label);
  assert.deepEqual(served(s), served(tariffIsland), label);
  assert.equal(s.annualUnservedKWh, tariffIsland.annualUnservedKWh, label);
  assert.equal(s.batteryBackupAutonomyHours, tariffIsland.batteryBackupAutonomyHours, label);
}

// ── Edición de proyecto (ADR 0004) y serialización ───────────────────────────────────────────
const ctx = { equipmentCatalog: [] };
const edited = applyProjectEdit(island(), { kind: 'rates', patch: { supplyAlternative: 'generator', generatorCostPerKWh: X } }, ctx);
assert.deepEqual([edited.rates.supplyAlternative, edited.rates.generatorCostPerKWh], ['generator', X]);
assert.equal(applyProjectEdit(edited, { kind: 'rates', patch: { generatorCostPerKWh: undefined } }, ctx).rates.generatorCostPerKWh, undefined, 'vaciar el campo');
assert.equal(applyProjectEdit(edited, { kind: 'rates', patch: { supplyAlternative: 'planta' as never } }, ctx).rates.supplyAlternative, 'generator', 'un valor desconocido no se guarda');
assert.equal(applyProjectEdit(edited, { kind: 'rates', patch: { generatorCostPerKWh: -2 } }, ctx).rates.generatorCostPerKWh, X, 'un costo negativo no se guarda');
assert.deepEqual(normalizeSupplyAlternativePatch({ supplyAlternative: 'x', generatorCostPerKWh: Number.NaN, energyCostPerKWh: 0.2 }), { energyCostPerKWh: 0.2 });
const unrelated = applyProjectEdit(island(), { kind: 'rates', patch: { energyCostPerKWh: 0.3 } }, ctx);
assert.equal('supplyAlternative' in unrelated.rates, false, 'una edición ajena no escribe la alternativa (mirar no escribe)');
// Volver a conectar a la red conserva la elección (se ignora mientras haya red) sin cambiar las cifras.
const regrid = applyProjectEdit(edited, { kind: 'rates', patch: gridConnectionFields('grid_export') }, ctx);
assert.equal(regrid.rates.supplyAlternative, 'generator');
assert.deepEqual(summaryOf(regrid), summaryOf(withRates({ ...gridConnectionFields('grid_export') })));
// Ida y vuelta: JSON e importación de `.json` conservan los campos y las cifras.
const roundTrip = JSON.parse(JSON.stringify(edited)) as ProjectSimulation;
assert.deepEqual([roundTrip.rates.supplyAlternative, roundTrip.rates.generatorCostPerKWh], ['generator', X]);
assert.deepEqual(summaryOf(roundTrip), summaryOf(edited));

// ── Textos del documento ─────────────────────────────────────────────────────────────────────
const docCtx = (extra: Record<string, unknown> = {}) => createDocumentTextContext({ ...gridConnectionFields('off_grid'), hasBattery: true, hasBatteryStorage: true, ...extra });
const tariffNote = regulatoryNoteDefault(docCtx());
assert.equal(regulatoryNoteDefault(docCtx({ supplyAlternative: 'utility_tariff' })), tariffNote, 'tarifa explícita = texto de hoy');
assert.ok(/costo de referencia por kWh/.test(tariffNote), 'texto de hoy');
const generatorNote = regulatoryNoteDefault(docCtx({ supplyAlternative: 'generator', generatorCostPerKWh: X }));
assert.notEqual(generatorNote, tariffNote);
assert.ok(/costo de generación propia/i.test(generatorNote), generatorNote);
assert.ok(/0\.385/.test(generatorNote), 'menciona el costo indicado');
for (const extra of [{ supplyAlternative: 'no_comparison' }, { supplyAlternative: 'generator' }]) {
  const note = regulatoryNoteDefault(docCtx(extra));
  assert.ok(!/ahorr|retorno|payback/i.test(note), `${JSON.stringify(extra)}: ${note}`);
  assert.ok(/aislad|modo isla/i.test(note) && /respaldo/.test(note), note);
}
assert.equal(regulatoryNoteDefault(createDocumentTextContext({ supplyAlternative: 'no_comparison' })), regulatoryNoteDefault(createDocumentTextContext({})), 'con red se ignora');
const heading = (extra: Record<string, unknown>) => resolveDocumentText('executiveSummary.heading', {}, docCtx(extra)).text;
assert.equal(heading({}), 'Cuadro Resumen de Inversión y Retorno');
assert.ok(!/retorno/i.test(heading({ supplyAlternative: 'no_comparison' })), heading({ supplyAlternative: 'no_comparison' }));
// El contexto de la app lleva la alternativa del proyecto.
const appCtx = buildDocumentTextContext(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }), summaryOf(island()), { currentDateStr: 'hoy' });
assert.deepEqual([appCtx.supplyAlternative, appCtx.generatorCostPerKWh], ['generator', X]);

// ── Documento PDF: secciones de ahorro ocultas sin comparación ───────────────────────────────
const visible = resolveSectionVisibility(undefined);
assert.deepEqual(savingsSectionsVisibility(visible, 'utility_tariff'), visible);
assert.deepEqual(savingsSectionsVisibility(visible, 'generator'), visible);
for (const basis of ['no_comparison', 'generator_missing_cost'] as const) {
  const v = savingsSectionsVisibility(visible, basis);
  assert.deepEqual([v.roi, v.cashFlow], [false, false], basis);
  assert.deepEqual({ ...v, roi: true, cashFlow: true }, visible, `${basis}: el resto no cambia`);
}
const theme = PDF_COLOR_THEMES[0];
const execHtml = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(PDFExecutiveSummaryPage, { project, summary: summaryOf(project), activeTheme: theme, showHeadersFooters: true, currentDateStr: 'hoy', pageNum: 3, totalPages: 9 }));
{
  const html = execHtml(island({ supplyAlternative: 'no_comparison' }));
  assert.ok(!/RETORNO DE INVERSIÓN|meses\)|libre de costo/.test(html), 'sin fila de payback');
  assert.ok(/data-savings-basis="no_comparison"/.test(html), 'fila de energía y autonomía');
  assert.ok(/Energía entregada/.test(html) && /No servida/i.test(html) && /Autonomía/.test(html));
  assert.ok(/RETORNO DE INVERSIÓN/.test(execHtml(island())), 'tarifa: payback como hoy');
}

// ── App: indicadores de ahorro con estado «sin comparación» ──────────────────────────────────
const financialHtml = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(FinancialReturnTab, { project, summary: summaryOf(project) }));
{
  const html = financialHtml(island({ supplyAlternative: 'no_comparison' }));
  assert.ok(/data-savings-state="no_comparison"/.test(html) && /Sin comparación/.test(html), 'estado sin comparación');
  assert.ok(!/PAYBACK|\(TIR\)|AHORRO ACUMULADO/.test(html), 'sin tarjetas de ahorro en cero');
  assert.ok(/Inversión Neta/i.test(html), 'la inversión sigue');
  const missing = financialHtml(island({ supplyAlternative: 'generator' }));
  assert.ok(/data-savings-state="generator_missing_cost"/.test(missing) && /Falta el costo por kWh del generador/.test(missing));
  assert.ok(/PAYBACK/.test(financialHtml(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }))));
}

// ── Dock: selector solo en aislado, costo del generador y aviso ──────────────────────────────
const renderRates = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(RatesFields, { project, projectionEnabled: false, updateRates: () => {} }));
{
  assert.doesNotMatch(renderRates(withRates({ supplyAlternative: 'no_comparison' })), /pd-rates-supply/, 'con red no hay selector');
  const tariff = renderRates(island());
  assert.match(tariff, /<label for="pd-rates-supply"[^>]*>Alternativa de suministro</);
  assert.match(tariff, /id="pd-rates-supply"[^>]*role="combobox"[\s\S]*?>Tarifa de distribuidora</);
  assert.doesNotMatch(tariff, /pd-rates-generator/);
  const gen = renderRates(island({ supplyAlternative: 'generator' }));
  assert.match(gen, /id="pd-rates-generator"[^>]*value=""/, 'sin valor por defecto');
  assert.match(gen, /role="alert"[^>]*>[\s\S]*Falta el costo por kWh del generador/);
  const genOk = renderRates(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }));
  assert.match(genOk, /id="pd-rates-generator"[^>]*value="0.385"/);
  assert.doesNotMatch(genOk, /role="alert"/);
  assert.match(renderRates(island({ supplyAlternative: 'no_comparison' })), /role="note"[^>]*>[\s\S]*Sin comparación/);
}

// ── Asistente y agentes externos (MCP): propose_project_update ───────────────────────────────
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'supplyAlternative', value: 'generator' }], 'project'), [{ section: 'rates', field: 'supplyAlternative', value: 'generator' }]);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'supplyAlternative', value: 'planta' }], 'project'));
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: 0 }], 'project'), /mayor que 0/);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: 50 }], 'project'));
{
  const store = useSimulationStore;
  const project = { ...island(), id: 'supply-mcp', syncStatus: 'local_only' as const };
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [project], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: [], deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, agentPolicy: DEFAULT_AGENT_POLICY,
    agentActivity: [], pendingAgentActions: [],
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  const mcp = { source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' };
  const set = (edits: [string, unknown][]) => executeAgentTool({ name: 'propose_project_update', args: { id: project.id, title: 'Suministro', edits: edits.map(([field, value]) => ({ section: 'rates', field, valueJson: JSON.stringify(value) })) } }, mcp);
  const rates = () => store.getState().projects.find((x) => x.id === project.id)!.rates;
  const ok = await set([['supplyAlternative', 'generator'], ['generatorCostPerKWh', X]]);
  assert.equal(ok.status, 'applied', JSON.stringify(ok));
  assert.deepEqual([rates().supplyAlternative, rates().generatorCostPerKWh], ['generator', X]);
  for (const bad of [[['supplyAlternative', 'planta']], [['supplyAlternative', 3]], [['generatorCostPerKWh', -1]], [['generatorCostPerKWh', 'caro']]] as [string, unknown][][]) {
    const result = await set(bad);
    assert.equal(result.status, 'error', `${JSON.stringify(bad)} se rechaza`);
  }
  assert.deepEqual([rates().supplyAlternative, rates().generatorCostPerKWh], ['generator', X], 'un valor rechazado no escribe nada');
  assert.equal((await set([['supplyAlternative', 'no_comparison']])).status, 'applied');
  assert.equal(rates().supplyAlternative, 'no_comparison');
}

console.log('Alternativa de suministro (aislado): lectura, motor, edición, documento, dock, pestaña y agentes.');
