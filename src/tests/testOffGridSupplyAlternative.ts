import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gridConnectionFields } from '../../shared/gridConnection';
import {
  GENERATOR_COST_WARNING_PER_KWH, MAX_GENERATOR_COST_PER_KWH, SUPPLY_ALTERNATIVES, generatorCostIssue, generatorCostNotice,
  isUnusuallyHighGeneratorCost, normalizeSupplyAlternativePatch, publishedSupplyFields, resolveGeneratorCostPerKWh, resolveSavingsBasis,
  resolveSupplyAlternative, savingsValuationCostPerKWh,
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
import { PDFPage2Quotation } from '../components/pdf/pages/PDFPage2Quotation';
import { EnergyAnalysisTab, energyTableLabels } from '../components/simulator/tabs/EnergyAnalysisTab';
import { supplyPresentation } from '../../shared/offGridSupply';
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
assert.equal(resolveGeneratorCostPerKWh({ generatorCostPerKWh: 25 }), 25, 'más de 10 USD/kWh es válido (solo advertencia)');
for (const bad of [undefined, null, 0, -1, Number.NaN, Infinity, '0.4', MAX_GENERATOR_COST_PER_KWH + 1]) assert.equal(resolveGeneratorCostPerKWh({ generatorCostPerKWh: bad }), null, String(bad));
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator' }).rates), 'generator_missing_cost', 'generador sin costo = incompleto');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0 }).rates), 'generator_missing_cost');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0.4 }).rates), 'generator');
assert.equal(resolveSavingsBasis(island({ supplyAlternative: 'no_comparison' }).rates), 'no_comparison');
assert.equal(savingsValuationCostPerKWh(island({ supplyAlternative: 'generator' }).rates), 0, 'incompleto: nunca cae a la tarifa');
assert.equal(savingsValuationCostPerKWh(island().rates), p.rates.energyCostPerKWh);
// Avisos del costo: falta, no positivo, fuera del tope técnico (errores) e inusualmente alto (advertencia).
assert.equal(GENERATOR_COST_WARNING_PER_KWH, 10);
assert.deepEqual([undefined, null, 0, -3, Number.NaN, 'x', 2000, 0.4, 25].map(generatorCostIssue), ['missing', 'missing', 'not_positive', 'not_positive', 'out_of_range', 'out_of_range', 'out_of_range', null, null]);
assert.deepEqual([0.4, 10, 10.01, 25, 2000].map(isUnusuallyHighGeneratorCost), [false, false, true, true, false]);
assert.equal(generatorCostNotice(0.4), null);
assert.equal(generatorCostNotice(25)?.tone, 'warning');
assert.ok(/inusualmente alto/i.test(generatorCostNotice(25)?.text ?? '') && /USD por kWh/.test(generatorCostNotice(25)?.text ?? ''));
assert.ok(/Falta/.test(generatorCostNotice(undefined)?.text ?? '') && /mayor que 0/.test(generatorCostNotice(0)?.text ?? '') && /tope técnico/.test(generatorCostNotice(5000)?.text ?? ''));
// Publicación: un costo inválido guardado se omite (el Worker usa el mismo predicado).
assert.deepEqual(publishedSupplyFields({ supplyAlternative: 'generator', generatorCostPerKWh: 0 }), { supplyAlternative: 'generator' });
assert.deepEqual(publishedSupplyFields({ supplyAlternative: 'generator', generatorCostPerKWh: 25 }), { supplyAlternative: 'generator', generatorCostPerKWh: 25 });
// Una alternativa desconocida guardada (otra versión, importación) se omite: el Worker la rechazaría con 400.
assert.deepEqual(publishedSupplyFields({ supplyAlternative: 'planta', generatorCostPerKWh: 0.4 }), { generatorCostPerKWh: 0.4 });
// Presentación del suministro: la distribuidora solo se muestra con la tarifa (o con red).
assert.deepEqual(supplyPresentation(island().rates), { kind: 'utility' });
assert.deepEqual(supplyPresentation({ supplyAlternative: 'no_comparison' }), { kind: 'utility' }, 'con red no cambia');
assert.deepEqual(supplyPresentation(island({ supplyAlternative: 'no_comparison' }).rates), { kind: 'no_grid' });
assert.deepEqual(supplyPresentation(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0.385 }).rates), { kind: 'generator', costPerKWh: 0.385 });
assert.deepEqual(supplyPresentation(island({ supplyAlternative: 'generator' }).rates), { kind: 'generator', costPerKWh: null });

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
// Por encima del umbral de aviso el costo se usa tal cual (no es un límite).
const expensive = summaryOf(island({ supplyAlternative: 'generator', generatorCostPerKWh: 25 }));
assert.equal(expensive.monthlyBreakdown[0].savingsUSD, Math.round(served(expensive)[0] * 25 * 100) / 100);

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
// Un número finito se guarda tal cual lo escribe el usuario (el dock no borra lo que se teclea: «0», «0.», 1500) y
// el predicado decide al leer; lo que no es un número finito se guarda como «sin dato».
for (const typed of [0, -2, MAX_GENERATOR_COST_PER_KWH + 500]) {
  const after = applyProjectEdit(edited, { kind: 'rates', patch: { generatorCostPerKWh: typed } }, ctx);
  assert.equal(after.rates.generatorCostPerKWh, typed, String(typed));
  assert.equal(resolveSavingsBasis(after.rates), 'generator_missing_cost', `${typed}: no cuenta como costo`);
  assert.deepEqual(summaryOf(after), summaryOf(island({ supplyAlternative: 'generator' })), `${typed}: mismas cifras que sin costo`);
}
for (const bad of [Number.NaN, Infinity, null, '0.4']) {
  const after = applyProjectEdit(edited, { kind: 'rates', patch: { generatorCostPerKWh: bad as number } }, ctx);
  assert.equal(after.rates.generatorCostPerKWh, undefined, String(bad));
}
assert.equal(applyProjectEdit(edited, { kind: 'rates', patch: { generatorCostPerKWh: 25 } }, ctx).rates.generatorCostPerKWh, 25, 'alto pero válido');
assert.deepEqual(normalizeSupplyAlternativePatch({ supplyAlternative: 'x', generatorCostPerKWh: Number.NaN, energyCostPerKWh: 0.2 }), { generatorCostPerKWh: undefined, energyCostPerKWh: 0.2 });
assert.deepEqual(normalizeSupplyAlternativePatch({ generatorCostPerKWh: 0 }), { generatorCostPerKWh: 0 });
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
// El contexto de la app lleva la alternativa del proyecto (con el resumen del mismo proyecto).
const genProject = island({ supplyAlternative: 'generator', generatorCostPerKWh: X });
const appCtx = buildDocumentTextContext(genProject, summaryOf(genProject), { currentDateStr: 'hoy' });
assert.deepEqual([appCtx.supplyAlternative, appCtx.generatorCostPerKWh], ['generator', X]);
assert.ok(/costo de generación propia/.test(regulatoryNoteDefault(appCtx)));
// Con red, el contexto puede llevar la alternativa, pero los textos la ignoran.
const gridProject = withRates({ supplyAlternative: 'no_comparison' });
const gridCtx = buildDocumentTextContext(gridProject, summaryOf(gridProject), { currentDateStr: 'hoy' });
const plainGrid = buildDocumentTextContext(p, summaryOf(p), { currentDateStr: 'hoy' });
assert.equal(regulatoryNoteDefault(gridCtx), regulatoryNoteDefault(plainGrid));
assert.equal(resolveDocumentText('executiveSummary.heading', {}, gridCtx).text, 'Cuadro Resumen de Inversión y Retorno');
// Las dos variantes son de fábrica: una guardada sigue al modo actual (no queda congelada).
for (const storedText of ['Cuadro Resumen de Inversión y Retorno', 'Cuadro Resumen de Inversión y Energía']) {
  const source = { customization: { texts: { 'executiveSummary.heading': storedText } } };
  assert.equal(resolveDocumentText('executiveSummary.heading', source, docCtx({ supplyAlternative: 'no_comparison' })).text, 'Cuadro Resumen de Inversión y Energía', storedText);
  assert.equal(resolveDocumentText('executiveSummary.heading', source, docCtx()).text, 'Cuadro Resumen de Inversión y Retorno', storedText);
  assert.equal(resolveDocumentText('executiveSummary.heading', source, docCtx()).isCustomized, false);
}

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
  // Generador sin costo: sin payback, fila de energía, y la fila 3 muestra el costo del generador (pendiente).
  const missing = execHtml(island({ supplyAlternative: 'generator' }));
  assert.ok(/data-savings-basis="generator_missing_cost"/.test(missing) && !/RETORNO DE INVERSIÓN|meses\)/.test(missing));
  assert.ok(/data-savings-reference="generator"[\s\S]*?Costo kWh Generador[\s\S]*?Sin dato/.test(missing), 'fila 3: costo del generador pendiente');
  // Generador con costo: la fila 3 muestra el costo del generador (RD$ y US$/kWh), no la tarifa.
  const gen = execHtml(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }));
  assert.ok(/data-savings-reference="generator"[\s\S]*?Costo kWh Generador[\s\S]*?RD\$ 23\.10[\s\S]*?US\$ 0\.385 \/ kWh/.test(gen), 'fila 3: costo del generador');
  assert.ok(!/Precio kWh Tarifa/.test(gen) && /Precio kWh Tarifa/.test(execHtml(island())));
  // Sin comparación: ni distribuidora ni tarifa; «Sin conexión a la red».
  const noComparison = execHtml(island({ supplyAlternative: 'no_comparison' }));
  assert.ok(/data-savings-reference="no_grid"[\s\S]*?Sin conexión a la red/.test(noComparison), 'fila 3: sin red');
  assert.ok(!/Precio kWh Tarifa|Tarifa BTS2|RD\$ 13\.26/.test(noComparison), 'fila 3 sin tarifa');
  assert.ok(!/EDE(?:ESTE|SUR|NORTE)/.test(noComparison) && !/EDE(?:ESTE|SUR|NORTE)/.test(missing), 'el cuadro resumen no nombra la distribuidora');
  // Sin baterías: texto editable del registro.
  const noBattery = island({ supplyAlternative: 'no_comparison' });
  noBattery.specs = { ...noBattery.specs, hasBattery: false, batteries: [] };
  assert.ok(/Sin baterías/.test(execHtml(noBattery)));
}

// ── Cotización del PDF: suministro en vez de distribuidora/tarifa ───────────────────────────
{
  const quotation = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(PDFPage2Quotation, { project, summary: summaryOf(project), activeTheme: theme, showHeadersFooters: true, currentDateStr: 'hoy', pageNum: 8, totalPages: 9 }));
  const tariff = quotation(island());
  assert.ok(/Distribuidor \/ Tarifa:/.test(tariff) && /EDE(?:ESTE|SUR|NORTE)/.test(tariff), `tarifa: igual que siempre ${tariff.slice(tariff.indexOf('data-supply') - 300, tariff.indexOf('data-supply') + 200)}`);
  for (const project of [island({ supplyAlternative: 'no_comparison' }), island({ supplyAlternative: 'generator' })]) {
    const html = quotation(project);
    assert.ok(!/EDE(?:ESTE|SUR|NORTE)|Distribuidor \/ Tarifa:/.test(html), `${project.rates.supplyAlternative}: sin distribuidora`);
    assert.ok(/Suministro:/.test(html));
  }
  assert.ok(/Sin conexión a la red/.test(quotation(island({ supplyAlternative: 'no_comparison' }))));
  assert.ok(/Generador[\s\S]{0,80}US\$ 0\.385\/kWh/.test(quotation(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }))));
}

// ── App: indicadores de ahorro con estado «sin comparación» ──────────────────────────────────
const financialHtml = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(FinancialReturnTab, { project, summary: summaryOf(project) }));
{
  const html = financialHtml(island({ supplyAlternative: 'no_comparison' }));
  assert.ok(/data-savings-state="no_comparison"/.test(html) && /Sin comparación/.test(html), 'estado sin comparación');
  assert.ok(!/PAYBACK|\(TIR\)|AHORRO ACUMULADO|VALOR ACTUAL NETO|RETORNO DE INVERSIÓN \(ROI\)|Flujo de Caja|FLUJO DE CAJA|Beneficio Acumulado|Tasa de descuento/.test(html), 'sin tarjetas de ahorro, VAN ni flujo');
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
  // Un 0 guardado (dato importado o de otra versión) se ve tal cual con su propio aviso.
  const zero = renderRates(island({ supplyAlternative: 'generator', generatorCostPerKWh: 0 }));
  assert.match(zero, /id="pd-rates-generator"[^>]*value="0"/);
  assert.match(zero, /role="alert"[^>]*>[\s\S]*debe ser mayor que 0/);
  assert.doesNotMatch(zero, /Falta el costo/);
  // Costo alto: advertencia no bloqueante, el valor se usa.
  const high = renderRates(island({ supplyAlternative: 'generator', generatorCostPerKWh: 25 }));
  assert.match(high, /role="status"[^>]*data-notice-tone="warning"[^>]*>[\s\S]*inusualmente alto/);
  assert.doesNotMatch(high, /role="alert"|aria-invalid/);
  const genOk = renderRates(island({ supplyAlternative: 'generator', generatorCostPerKWh: X }));
  assert.match(genOk, /id="pd-rates-generator"[^>]*value="0.385"/);
  assert.doesNotMatch(genOk, /role="alert"/);
  assert.match(renderRates(island({ supplyAlternative: 'no_comparison' })), /role="note"[^>]*>[\s\S]*Sin comparación/);
}

// ── Asistente y agentes externos (MCP): propose_project_update ───────────────────────────────
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'supplyAlternative', value: 'generator' }], 'project'), [{ section: 'rates', field: 'supplyAlternative', value: 'generator' }]);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'supplyAlternative', value: 'planta' }], 'project'));
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: 0 }], 'project'), /mayor que 0/);
assert.doesNotThrow(() => validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: 50 }], 'project'), 'alto pero válido');
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: MAX_GENERATOR_COST_PER_KWH + 1 }], 'project'), /tope técnico/);
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'generatorCostPerKWh', value: null }], 'project'), [{ section: 'rates', field: 'generatorCostPerKWh', value: null }], 'null borra el costo');
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
  for (const bad of [[['supplyAlternative', 'planta']], [['supplyAlternative', 3]], [['generatorCostPerKWh', -1]], [['generatorCostPerKWh', 0]], [['generatorCostPerKWh', 'caro']]] as [string, unknown][][]) {
    const result = await set(bad);
    assert.equal(result.status, 'error', `${JSON.stringify(bad)} se rechaza`);
  }
  assert.deepEqual([rates().supplyAlternative, rates().generatorCostPerKWh], ['generator', X], 'un valor rechazado no escribe nada');
  // get_project: estado del ahorro explícito y sin ceros que parezcan cifras reales.
  const read = async () => (await executeAgentTool({ name: 'get_project', args: { id: project.id } }, mcp)) as { status: string; data?: any };
  const withCost = await read();
  assert.deepEqual([withCost.data?.savings?.basis, withCost.data?.savings?.comparable, withCost.data?.savings?.generatorCostPerKWh], ['generator', true, X], JSON.stringify(withCost).slice(0, 300));
  assert.ok(withCost.data.summary.year1SavingsUSD > 0);
  // Borrar el costo (null): queda «generador sin costo».
  assert.equal((await set([['generatorCostPerKWh', null]])).status, 'applied');
  assert.equal(rates().generatorCostPerKWh, undefined);
  const cleared = await read();
  assert.equal(cleared.data.savings.basis, 'generator_missing_cost');
  assert.equal(cleared.data.savings.comparable, false);
  assert.ok(/Falta el costo/.test(cleared.data.savings.note));
  for (const field of ['year1SavingsUSD', 'total25YearSavingsUSD', 'paybackYears', 'irrPct', 'npvUSD', 'roi25YrPct']) assert.equal(cleared.data.summary[field], null, field);
  assert.deepEqual(cleared.data.summary.cashFlow25Years, [], 'sin flujo de caja anual');
  assert.ok(cleared.data.summary.monthlyBreakdown.every((m: any) => m.originalBillUSD === null && m.netBillUSD === null), 'sin facturas');
  assert.ok(cleared.data.summary.netInvestmentUSD > 0, 'la inversión sigue');
  assert.ok(cleared.data.energy.every((m: any) => m.savingsUSD === null) && cleared.data.summary.monthlyBreakdown.every((m: any) => m.savingsUSD === null));
  assert.equal((await set([['generatorCostPerKWh', 25]])).status, 'applied', 'costo alto aceptado');
  assert.equal((await set([['supplyAlternative', 'no_comparison']])).status, 'applied');
  assert.equal(rates().supplyAlternative, 'no_comparison');
  assert.equal((await read()).data.savings.basis, 'no_comparison');
}

// ── Dock: lo que se teclea no se borra y el aviso dice el motivo real ───────────────────────
{
  const dock = (cost: number) => renderToStaticMarkup(React.createElement(RatesFields, { project: applyProjectEdit(island({ supplyAlternative: 'generator' }), { kind: 'rates', patch: { generatorCostPerKWh: cost } }, ctx), projectionEnabled: false, updateRates: () => {} }));
  assert.match(dock(0), /id="pd-rates-generator"[^>]*value="0"/, '«0» sigue en el campo');
  assert.match(dock(0), /role="alert"[^>]*>[\s\S]*debe ser mayor que 0/);
  assert.match(dock(1500), /id="pd-rates-generator"[^>]*value="1500"/, '1500 sigue en el campo');
  assert.match(dock(1500), /role="alert"[^>]*>[\s\S]*tope técnico/);
  assert.match(dock(0.35), /value="0.35"/);
}

// ── Análisis energético con autoconsumo visible y sin comparación ───────────────────────────
// (el render en servidor usa el estado inicial del store, sin la proyección: se prueban los rótulos puros y el render.)
{
  for (const showSelf of [true, false]) {
    const labels = energyTableLabels(false, showSelf);
    assert.ok(!/AHORRO|Ahorro|Iny\. Neta/.test(JSON.stringify(labels)), `sin comparación (autoconsumo ${showSelf})`);
    assert.equal(labels.showMoney, false, 'sin montos mensuales ni total en USD');
    assert.equal(labels.savedColumnNote, null);
  }
  assert.deepEqual([energyTableLabels(true, true).savedColumn, energyTableLabels(true, true).showMoney, energyTableLabels(true, false).savedColumn], ['AHORRO FACTURABLE', true, 'AHORRO ENERG. (KWH)'], 'tarifa: igual que siempre');
  const energyHtml = (project: ProjectSimulation) => renderToStaticMarkup(React.createElement(EnergyAnalysisTab, { project, summary: summaryOf(project), openAIInvoiceModal: () => {}, updateMonthlyConsumption: () => {} }));
  const html = energyHtml(island({ supplyAlternative: 'no_comparison' }));
  assert.ok(/ENERGÍA SERVIDA \(KWH\)/.test(html) && /Resumen Mensual de Energía Entregada/.test(html));
  assert.ok(!/AHORRO|Ahorro|\$\d/.test(html), (html.match(/AHORRO|Ahorro|\$\d/) ?? [''])[0]);
}

console.log('Alternativa de suministro (aislado): lectura, motor, edición, documento, dock, pestaña y agentes.');
