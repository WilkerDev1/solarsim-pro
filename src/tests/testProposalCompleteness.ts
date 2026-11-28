// F2b: estado «incompleta» (ADR 0009). Lo que antes impedía crear una propuesta es un estado derivado: si faltan los mínimos
// para calcular, `proposalCompleteness` dice por qué (en español), los resultados no se muestran (nunca en cero) y no se
// puede exportar el PDF, compartir ni convertir a cotización. Una propuesta completa no cambia en nada.
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { contractPriceForTotals, PENDING_VALUE, proposalActionBlock, proposalCompleteness, proposalResults, shownMetric } from '../domain/proposalCompleteness';
import { proposalDocumentSections } from '../utils/pdfLayout';
import { DEFAULT_PDF_SECTION_ORDER } from '../constants/pdfSections';
import { readFileSync } from 'node:fs';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { createQuotationFromProposal } from '../features/quotations/proposalConversion';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { DEFAULT_RD_TARIFF_MATRIX, referenceBillingTariff } from '../data/rdTariffs';
import { ALL_CONVERSION_BLOCKS } from '../features/quotations/proposalSource';
import type { ProjectSimulation } from '../types';

const base = (): ProjectSimulation => ({ ...structuredClone(BENCHMARK_PROJECT), id: 'complete-base' });
const codes = (p: ProjectSimulation) => proposalCompleteness(p).reasons.map((r) => r.code);

// 1. Completa: el caso de referencia (y cualquier propuesta con los mínimos) no cambia en nada.
const complete = base();
assert.deepEqual(proposalCompleteness(complete), { incomplete: false, reasons: [] });
const results = proposalResults(complete);
assert.equal(results.incomplete, false);
assert.deepEqual(results.summary, calculateProjectFinancialSummary(complete), 'los resultados son los del motor, tal cual');
assert.deepEqual(proposalActionBlock(complete), { blocked: false, reason: null });

// 2. Cada mínimo que falta da su motivo.
const without = (edit: (p: ProjectSimulation) => void) => { const p = base(); edit(p); return p; };
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = []; })), ['missing_consumption'], 'sin consumo (el motor asumiría 36.000 kWh/año)');
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = Array(12).fill(0); })), ['missing_consumption']);
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = [100, 200]; })), ['missing_consumption'], 'menos de doce meses');
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 0 } }) }; })), ['missing_panel']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { count: 0 } }) }; })), ['missing_panel']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, inverters: [] }; })), ['missing_inverter']);
assert.deepEqual(codes(without((p) => { p.rates = { ...p.rates, energyCostPerKWh: 0 }; })), ['missing_energy_price']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; })), ['missing_equipment_price']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0 } }) }; })), ['missing_equipment_price'], 'una batería en uso sin precio');
// Una batería apagada no está en uso: su precio no cuenta.
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, hasBattery: false, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0 } }) }; })), []);
// En precio directo ($/W) los costos unitarios no fijan el precio: no se exigen.
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, pricingMode: 'direct_watt', pricePerWattUSD: 1.2, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; })), []);
// Con la fila de la tarifa (factura por bloques) el precio escalar no es el único dato de energía.
assert.deepEqual(codes(without((p) => { p.rates = { ...p.rates, energyCostPerKWh: 0, billingTariff: referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, p.rates.distributor!, p.rates.tariffCode!) }; })), []);
// Varios motivos a la vez, cada uno con su texto en español y la ruta del registro donde se corrige.
const many = proposalCompleteness(without((p) => { p.monthlyConsumption = []; p.specs = { ...p.specs, inverters: [] }; p.rates = { ...p.rates, energyCostPerKWh: 0 }; }));
assert.equal(many.incomplete, true);
assert.deepEqual(many.reasons.map((r) => r.code), ['missing_consumption', 'missing_inverter', 'missing_energy_price']);
for (const reason of many.reasons) {
  assert.match(reason.message, /^[A-ZÁÉÍÓÚÑ¿]/, 'mensaje en español, con mayúscula');
  assert.ok(reason.path, 'cada motivo dice dónde se corrige');
}
const unpricedInverter = proposalCompleteness(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; }));
assert.match(unpricedInverter.reasons[0].message, /Inversor Lux Power/, 'el motivo nombra el equipo sin precio');

// 3. Incompleta ⇒ sin métricas (nunca ceros) y acciones bloqueadas con su motivo.
const incomplete = without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; });
const pending = proposalResults(incomplete);
assert.equal(pending.incomplete, true);
assert.equal(pending.summary, null, 'los resultados se muestran vacíos, no en cero');
assert.ok(pending.reasons.length > 0);
const block = proposalActionBlock(incomplete);
assert.equal(block.blocked, true);
assert.match(block.reason!, /Completa la propuesta/);

// 4. Las acciones lo respetan también fuera de los botones: convertir a cotización y compartir.
store.setState({
  projects: [incomplete, { ...complete, id: 'complete-ok' }], activeProjectId: incomplete.id, activeView: 'project-hub', workspaceScope: 'local',
  undoHistory: EMPTY_UNDO_HISTORY, isShareModalOpen: false, saveFeedbackMessage: null,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const converted = createQuotationFromProposal(incomplete.id, ALL_CONVERSION_BLOCKS);
assert.equal(converted.ok, false);
assert.match((converted as { error: string }).error, /incompleta/i);
store.getState().openShareModal();
assert.equal(store.getState().isShareModalOpen, false, 'una propuesta incompleta no se comparte');
assert.match(store.getState().saveFeedbackMessage ?? '', /incompleta/i);
store.setState({ activeProjectId: 'complete-ok', saveFeedbackMessage: null });
store.getState().openShareModal();
assert.equal(store.getState().isShareModalOpen, true, 'una completa se comparte como siempre');

// ── Revisión de F2b ─────────────────────────────────────────────────────────────────────────
// 5. Un 0 tecleado a mano es un precio dado (equipo que aporta el cliente, cortesía): no es «sin precio» (hallazgo 3). Un 0
// sin procedencia manual (lo heredado, lo que dejó un catálogo sin precio) sigue faltando.
const manualZero = without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0, priceSource: 'manual' } }) }; });
assert.deepEqual(codes(manualZero), [], 'precio 0 escrito a mano: precio dado');
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0, priceSource: 'supplier' } }) }; })), ['missing_equipment_price'], 'una oferta a 0 no es un precio');
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: undefined, priceSource: 'manual' } }) }; })), ['missing_equipment_price'], 'manual sin cifra sigue faltando');

// 6. Las decisiones de mostrar son funciones puras y las usa la interfaz (hallazgo 8).
const computed = calculateProjectFinancialSummary(complete);
assert.equal(proposalResults(complete, 'legacy', computed).summary, computed, 'con el resumen ya calculado, ese mismo objeto');
assert.equal(proposalResults(incomplete, 'legacy', computed).summary, null, 'incompleta: ninguno, aunque el motor haya calculado');
assert.equal(shownMetric(proposalCompleteness(complete), '12,5 kWp'), '12,5 kWp');
assert.equal(shownMetric(proposalCompleteness(incomplete), '12,5 kWp'), PENDING_VALUE);
assert.equal(PENDING_VALUE, '—');
// Totales de ventas: una incompleta no suma su contrato de relleno (hallazgo 6).
assert.equal(contractPriceForTotals(complete), computed.contractPriceUSD);
assert.equal(contractPriceForTotals(incomplete), 0);
// Documento (vista del PDF y visor de la cotización, hallazgo 2): incompleta ⇒ solo las páginas sin cifras, más el motivo.
const visibility = Object.fromEntries(DEFAULT_PDF_SECTION_ORDER.map((id) => [id, true])) as Record<(typeof DEFAULT_PDF_SECTION_ORDER)[number], boolean>;
assert.deepEqual(proposalDocumentSections(DEFAULT_PDF_SECTION_ORDER, visibility, false), { sections: DEFAULT_PDF_SECTION_ORDER, pending: false }, 'completa: el documento de siempre');
const pendingDoc = proposalDocumentSections(DEFAULT_PDF_SECTION_ORDER, visibility, true);
assert.equal(pendingDoc.pending, true);
assert.deepEqual(pendingDoc.sections, ['tableOfContents', 'aboutUs', 'benefits', 'techIntro'], 'sin portada, resumen, descripción, energía, cotización, retorno, flujo ni costos');
assert.deepEqual(proposalDocumentSections(DEFAULT_PDF_SECTION_ORDER, { ...visibility, aboutUs: false }, true).sections, ['tableOfContents', 'benefits', 'techIntro'], 'respeta las ocultas');
// La interfaz decide con esas funciones (no con condicionales propios que ninguna prueba ve).
const uses: Record<string, string[]> = {
  'src/components/simulator/SimulatorView.tsx': ['proposalResults('],
  'src/components/simulator/tabs/EnergyAnalysisTab.tsx': ['shownMetric('],
  'src/components/hub/ProjectHubView.tsx': ['proposalResults(', 'shownMetric('],
  'src/components/pdf/PDFProposalView.tsx': ['proposalResults(', 'proposalDocumentSections('],
  'src/components/quotations/editor/ProposalViewer.tsx': ['proposalResults('],
  'src/components/quotations/editor/ProposalViewerDocument.tsx': ['proposalDocumentSections('],
  'src/components/simulator/sidebar/PricingParamsSection.tsx': ['shownMetric('],
  'src/components/simulator/params/sections/pricing/DirectPrice.tsx': ['shownMetric('],
  'src/components/simulator/sidebar/BatteryEquipmentSection.tsx': ['shownMetric('],
  'src/components/clients/ClientDetailPanel.tsx': ['contractPriceForTotals('],
  'src/features/proposals/ProposalSalesSummary.tsx': ['contractPriceForTotals('],
};
for (const [file, needles] of Object.entries(uses)) {
  const source = readFileSync(file, 'utf8');
  for (const needle of needles) assert.ok(source.includes(needle), `${file} decide qué mostrar con ${needle.slice(0, -1)} (ADR 0009)`);
}

console.log('PASS: propuesta incompleta: motivos en español, resultados vacíos (no en cero) y PDF, compartir y cotización bloqueados; una completa no cambia.');
