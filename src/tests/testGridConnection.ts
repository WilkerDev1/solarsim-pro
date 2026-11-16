import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GRID_CONNECTION_MODES, gridConnectionFields, normalizeGridConnectionPatch, resolveGridConnection,
} from '../../shared/gridConnection';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { applyProjectEdit } from '../domain/projectEdit';
import { createDocumentTextContext, FACTORY_TEXTS, regulatoryNoteDefault, resolveDocumentText } from '../../shared/documentTexts';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { validateAssistantEdits } from '../features/assistant/validation';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import { exportFeeValue } from '../components/simulator/params/sections/rates/ratesLogic';
import { projectType } from '../components/dashboard/projectPresentation';
import type { ProjectSimulation, UtilityRates } from '../types';

/**
 * Tipo de conexión con la red: conectado con exportación, inyección cero o aislado («modo isla»).
 * Compatibilidad: las propuestas, importaciones, historial y enlaces anteriores solo traen `isZeroExport`.
 */

// ── Resolución y compatibilidad ─────────────────────────────────────────────────────────────
assert.deepEqual(GRID_CONNECTION_MODES, ['grid_export', 'zero_export', 'off_grid']);
assert.equal(resolveGridConnection(undefined), 'grid_export');
assert.equal(resolveGridConnection({}), 'grid_export', 'sin datos: conectado a red, como hasta ahora');
assert.equal(resolveGridConnection({ isZeroExport: false }), 'grid_export');
assert.equal(resolveGridConnection({ isZeroExport: true }), 'zero_export', 'propuesta 2.7.x con inyección cero');
assert.equal(resolveGridConnection({ gridConnection: 'off_grid', isZeroExport: true }), 'off_grid');
assert.equal(resolveGridConnection({ gridConnection: 'zero_export', isZeroExport: true }), 'zero_export');
assert.equal(resolveGridConnection({ gridConnection: 'grid_export', isZeroExport: false }), 'grid_export');
// Una versión anterior que solo cambia `isZeroExport` deja `gridConnection` desfasado: manda `isZeroExport`.
assert.equal(resolveGridConnection({ gridConnection: 'off_grid', isZeroExport: false }), 'grid_export');
assert.equal(resolveGridConnection({ gridConnection: 'grid_export', isZeroExport: true }), 'zero_export');
assert.equal(resolveGridConnection({ gridConnection: 'isla', isZeroExport: true }), 'zero_export', 'valor desconocido');
assert.equal(resolveGridConnection({ gridConnection: 'off_grid' }), 'grid_export', 'aislado sin isZeroExport es incoherente');
assert.deepEqual(gridConnectionFields('off_grid'), { gridConnection: 'off_grid', isZeroExport: true });
assert.deepEqual(gridConnectionFields('grid_export'), { gridConnection: 'grid_export', isZeroExport: false });

assert.deepEqual(normalizeGridConnectionPatch({}, { gridConnection: 'off_grid' }), { gridConnection: 'off_grid', isZeroExport: true });
assert.deepEqual(normalizeGridConnectionPatch({ gridConnection: 'off_grid', isZeroExport: true }, { isZeroExport: true }), { gridConnection: 'off_grid', isZeroExport: true }, 'aislado se conserva');
assert.deepEqual(normalizeGridConnectionPatch({ gridConnection: 'off_grid', isZeroExport: true }, { isZeroExport: false }), { gridConnection: 'grid_export', isZeroExport: false });
assert.deepEqual(normalizeGridConnectionPatch({}, { isZeroExport: true }), { gridConnection: 'zero_export', isZeroExport: true });
assert.deepEqual(normalizeGridConnectionPatch({}, { energyCostPerKWh: 0.2 } as Partial<UtilityRates>), { energyCostPerKWh: 0.2 }, 'un parche ajeno no escribe el tipo');
assert.deepEqual(normalizeGridConnectionPatch({}, { gridConnection: 'otro' as never, isZeroExport: true }), { gridConnection: 'zero_export', isZeroExport: true });

// ── Motor solar ─────────────────────────────────────────────────────────────────────────────
const p = BENCHMARK_PROJECT;
const energy = (connection: Parameters<typeof calculateMonthlySolarProduction>[7], mode: 'legacy' | 'self_consumption' = 'legacy', specs = p.specs, consumption = p.monthlyConsumption) =>
  calculateMonthlySolarProduction(p.client.province, specs, consumption, p.rates.energyCostPerKWh, p.rates.gridExportFeePct, p.client.customMonthlyHSP, p.rates.tariffCode, connection, mode);

for (const mode of ['legacy', 'self_consumption'] as const) {
  // Caracterización: el booleano heredado y el modo equivalente dan exactamente lo mismo, sin campos nuevos.
  assert.deepEqual(energy('grid_export', mode), energy(false, mode), `${mode}: conectado = isZeroExport false`);
  assert.deepEqual(energy('zero_export', mode), energy(true, mode), `${mode}: inyección cero = isZeroExport true`);
  assert.deepEqual(energy(undefined, mode), energy(false, mode));
  for (const m of energy(true, mode)) assert.equal('unservedKWh' in m, false, 'los modos con red no informan energía no servida');

  const island = energy('off_grid', mode);
  const zero = energy('zero_export', mode);
  for (const [i, m] of island.entries()) {
    assert.equal(m.gridExportedKWh, 0, `${mode}: un sistema aislado nunca exporta`);
    assert.equal(m.netExportCreditKWh, 0);
    assert.equal(m.retainedExportKWh, 0, `${mode}: sin retención de exportación`);
    assert.ok(m.solarSelfConsumedKWh <= zero[i].solarSelfConsumedKWh + 1e-9, `${mode}: aislado nunca sirve más que inyección cero`);
    assert.equal(m.unservedKWh, Math.max(0, Math.round((m.consumptionKWh - m.solarSelfConsumedKWh) * 10) / 10), `${mode}: déficit = energía no servida`);
    assert.ok(m.solarSelfConsumedKWh + (m.unservedKWh ?? 0) >= m.consumptionKWh - 0.11, 'servida + no servida = consumo');
    assert.equal(m.savingsUSD, Math.round(m.solarSelfConsumedKWh * p.rates.energyCostPerKWh * 100) / 100, 'solo la energía servida se valora');
  }
}
// Una cadena desconocida no es «inyección cero»: cae como en resolveGridConnection (sin dato = conectado a red).
assert.deepEqual(energy('isla' as never), energy('grid_export'));
assert.deepEqual(energy('isla' as never, 'self_consumption'), energy(false, 'self_consumption'));
// En el modelo físico, aislado y con inyección cero sirven lo mismo; la diferencia es que el déficit no se importa.
assert.deepEqual(energy('off_grid', 'self_consumption').map((m) => m.solarSelfConsumedKWh), energy('zero_export', 'self_consumption').map((m) => m.solarSelfConsumedKWh));
// Clásico sin batería: el factor 0.75 supone red; aislado sin batería no puede cubrir la noche (se toma el menor).
{
  const noBattery = { ...p.specs, hasBattery: false, batteries: [] };
  const big = p.monthlyConsumption.map(() => 400); // consumo pequeño frente a la producción
  const legacyZero = energy('zero_export', 'legacy', noBattery, big);
  const legacyIsland = energy('off_grid', 'legacy', noBattery, big);
  const physicalIsland = energy('off_grid', 'self_consumption', noBattery, big);
  assert.ok(legacyZero.every((m) => m.solarSelfConsumedKWh === m.consumptionKWh), 'inyección cero clásico: todo cubierto (la red absorbe la noche)');
  assert.deepEqual(legacyIsland.map((m) => m.solarSelfConsumedKWh), physicalIsland.map((m) => m.solarSelfConsumedKWh), 'aislado clásico sin batería: solo la carga diurna');
  assert.ok(legacyIsland.every((m) => (m.unservedKWh ?? 0) > 0), 'la carga nocturna sin batería queda sin servir');
}

// ── Resumen financiero ─────────────────────────────────────────────────────────────────────
const withRates = (rates: Partial<UtilityRates>): ProjectSimulation => ({ ...p, rates: { ...p.rates, ...rates } });
const legacyZeroSummary = calculateProjectFinancialSummary(withRates({ isZeroExport: true }));
assert.deepEqual(calculateProjectFinancialSummary(withRates({ isZeroExport: true, gridConnection: 'zero_export' })), legacyZeroSummary, 'inyección cero explícita = heredada');
assert.equal('annualUnservedKWh' in legacyZeroSummary, false);
assert.equal('annualUnservedKWh' in calculateProjectFinancialSummary(p), false, 'el caso de referencia no cambia');
const islandSummary = calculateProjectFinancialSummary(withRates(gridConnectionFields('off_grid')));
assert.equal(islandSummary.annualUnservedKWh, Math.round(islandSummary.monthlyBreakdown.reduce((s, m) => s + (m.unservedKWh ?? 0), 0) * 10) / 10);
assert.ok(islandSummary.year1SavingsUSD <= legacyZeroSummary.year1SavingsUSD + 1e-6, 'el ahorro aislado nunca supera al de inyección cero');
// Una versión anterior que dejó `gridConnection` desfasado se lee como su `isZeroExport`.
assert.deepEqual(calculateProjectFinancialSummary(withRates({ gridConnection: 'off_grid', isZeroExport: false })), calculateProjectFinancialSummary(withRates({ isZeroExport: false })));

// ── Edición de proyecto (ADR 0004) ─────────────────────────────────────────────────────────
const ctx = { equipmentCatalog: [] };
const base = withRates({ isZeroExport: false, gridConnection: undefined });
const isl = applyProjectEdit(base, { kind: 'rates', patch: { gridConnection: 'off_grid' } }, ctx);
assert.equal(isl.rates.gridConnection, 'off_grid');
assert.equal(isl.rates.isZeroExport, true, 'aislado se guarda también como «no exporta» para versiones anteriores');
assert.equal(applyProjectEdit(isl, { kind: 'rates', patch: { isZeroExport: true } }, ctx).rates.gridConnection, 'off_grid');
const back = applyProjectEdit(isl, { kind: 'rates', patch: { isZeroExport: false } }, ctx);
assert.deepEqual([back.rates.gridConnection, back.rates.isZeroExport], ['grid_export', false]);
const unrelated = applyProjectEdit(base, { kind: 'rates', patch: { energyCostPerKWh: 0.3 } }, ctx);
assert.equal('gridConnection' in unrelated.rates && unrelated.rates.gridConnection !== undefined, false, 'una edición ajena no escribe el tipo de conexión');
// Datos contradictorios (una versión anterior cambió solo `isZeroExport`): la siguiente edición de tarifas los deja
// coherentes con lo que ya se leía (manda `isZeroExport`), sin cambiar el resultado. Mirar no escribe (ADR 0004).
for (const [stale, expected] of [
  [{ gridConnection: 'off_grid', isZeroExport: false }, 'grid_export'],
  [{ gridConnection: 'grid_export', isZeroExport: true }, 'zero_export'],
  [{ gridConnection: 'isla', isZeroExport: true }, 'zero_export'],
] as const) {
  const before = withRates(stale as Partial<UtilityRates>);
  const edited = applyProjectEdit(before, { kind: 'rates', patch: { energyCostPerKWh: before.rates.energyCostPerKWh } }, ctx);
  assert.deepEqual([edited.rates.gridConnection, edited.rates.isZeroExport], [expected, expected !== 'grid_export'], JSON.stringify(stale));
  assert.equal(resolveGridConnection(edited.rates), resolveGridConnection(before.rates), 'misma lectura antes y después');
  assert.deepEqual(calculateProjectFinancialSummary(edited), calculateProjectFinancialSummary(before), 'mismo resultado');
}

// ── Documento: un sistema aislado no promete medición neta ni inyección ─────────────────────
const docCtx = createDocumentTextContext({ gridConnection: 'off_grid', isZeroExport: true, hasBattery: true });
const note = regulatoryNoteDefault(docCtx);
assert.ok(/aislad|modo isla/i.test(note), note);
assert.ok(!/medición neta|inyecci|factura eléctrica|derecho de uso de la red|excedente se acreditar/i.test(note), note);
assert.ok(/respaldo/i.test(note), 'menciona el respaldo para el déficit');
assert.ok(/Medición Neta/.test(regulatoryNoteDefault(createDocumentTextContext({}))), 'conectado a red sin cambios');
assert.ok(/Inyección Cero/.test(regulatoryNoteDefault(createDocumentTextContext({ isZeroExport: true }))), 'inyección cero sin cambios');
// Un contexto antiguo (solo isZeroExport) nunca se lee como aislado.
assert.ok(!/aislad/i.test(regulatoryNoteDefault(createDocumentTextContext({ isZeroExport: true }))));
for (const key of ['quotation.servicesIncluded', 'executiveSummary.footnoteRight']) {
  const islandText = resolveDocumentText(key, {}, docCtx).text;
  const gridText = resolveDocumentText(key, {}, createDocumentTextContext({})).text;
  assert.ok(!/medición neta/i.test(islandText), `${key}: ${islandText}`);
  assert.ok(/medición neta/i.test(gridText), `${key} conectado conserva el texto de siempre`);
}
// Una propuesta que guardó el texto de fábrica anterior («…Medición Neta…») no cuenta como personalizada.
for (const source of [
  { customization: { servicesIncludedText: FACTORY_TEXTS.servicesIncludedText } },
  { customization: { texts: { 'executiveSummary.footnoteRight': 'Régimen de Medición Neta • Certificación CNE / SIE' } } },
]) {
  const key = 'servicesIncludedText' in source.customization ? 'quotation.servicesIncluded' : 'executiveSummary.footnoteRight';
  const resolved = resolveDocumentText(key, source, docCtx);
  assert.equal(resolved.source, 'default', key);
  assert.equal(resolved.isCustomized, false, key);
  assert.ok(!/medición neta/i.test(resolved.text), `${key}: ${resolved.text}`);
}

// ── Asistente y herramientas de agente ─────────────────────────────────────────────────────
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'gridConnection', value: 'off_grid' }], 'project'), [{ section: 'rates', field: 'gridConnection', value: 'off_grid' }]);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'gridConnection', value: 'isla' }], 'project'));

// ── Dock de parámetros ─────────────────────────────────────────────────────────────────────
const renderRates = (rates: Partial<UtilityRates>) => renderToStaticMarkup(React.createElement(RatesFields, {
  project: { ...p, rates: { ...p.rates, ...rates } } as ProjectSimulation, projectionEnabled: false, updateRates: () => {},
}));
{
  const html = renderRates({ isZeroExport: false, gridConnection: undefined, gridExportFeePct: 18 });
  assert.match(html, /<button[^>]*id="pd-rates-connection"[^>]*role="combobox"|<button[^>]*role="combobox"[^>]*id="pd-rates-connection"/);
  assert.match(html, /Red \(medición neta\)/);
  assert.match(html, />Precio kWh</);
  assert.doesNotMatch(html, /id="pd-rates-export"[^>]*disabled=""/);
  const zero = renderRates({ isZeroExport: true, gridConnection: undefined, gridExportFeePct: 18 });
  assert.match(zero, /Inyección cero/);
  assert.match(zero, /id="pd-rates-export"[^>]*disabled=""/);
  const island = renderRates({ ...gridConnectionFields('off_grid'), gridExportFeePct: 18 });
  assert.match(island, /Aislado \(modo isla\)/);
  assert.match(island, />Costo evitado kWh</, 'sin red, el precio es el costo que el sistema evita');
  // Sin red no hay retención, régimen ni cargo por uso de red: los campos no se muestran (la nota lo explica).
  assert.doesNotMatch(island, /pd-rates-export|pd-rates-regime|pd-rates-grid-charge/);
  assert.match(island, /energía no servida/, 'la nota explica el sistema aislado');
  assert.equal(exportFeeValue({ gridConnection: 'off_grid', isZeroExport: true, gridExportFeePct: 18 }), 0);
}
const typed = (hasBattery: boolean, rates: Partial<UtilityRates>) => projectType({ ...p, specs: { ...p.specs, hasBattery }, rates: { ...p.rates, ...rates } } as ProjectSimulation);
assert.equal(typed(true, gridConnectionFields('off_grid')), 'Híbrido aislado');
assert.equal(typed(false, gridConnectionFields('off_grid')), 'Aislado');
assert.equal(typed(false, { isZeroExport: true, gridConnection: undefined }), 'Inyección cero');
assert.equal(typed(true, { isZeroExport: false, gridConnection: undefined }), 'Híbrido');

// ── Agentes externos (MCP): propose_project_update vía executeAgentTool ───────────────────
{
  const store = useSimulationStore;
  const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'grid-mcp', syncStatus: 'local_only' as const, rates: { ...BENCHMARK_PROJECT.rates, isZeroExport: false } };
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [project], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: [], deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, agentPolicy: DEFAULT_AGENT_POLICY,
    agentActivity: [], pendingAgentActions: [],
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  const mcp = { source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' };
  const set = (value: unknown) => executeAgentTool({ name: 'propose_project_update', args: { id: project.id, title: 'Conexión', edits: [{ section: 'rates', field: 'gridConnection', valueJson: JSON.stringify(value) }] } }, mcp);
  const rates = () => store.getState().projects.find((x) => x.id === project.id)!.rates;
  for (const mode of ['off_grid', 'zero_export', 'grid_export'] as const) {
    const result = await set(mode);
    assert.equal(result.status, 'applied', JSON.stringify(result));
    // `isZeroExport` coherente solo lo escribe applyProjectEdit (normalizeGridConnectionPatch).
    assert.deepEqual([rates().gridConnection, rates().isZeroExport], [mode, mode !== 'grid_export'], mode);
  }
  for (const bad of ['isla', 'OFF_GRID', true, 3]) {
    const result = await set(bad);
    assert.equal(result.status, 'error', `${JSON.stringify(bad)} se rechaza`);
  }
  assert.equal(rates().gridConnection, 'grid_export', 'un valor rechazado no escribe nada');
}

console.log('Tipo de conexión: compatibilidad, motor, edición, documento, asistente y dock.');
