// LEGADO: se elimina en F6 junto con applyExtractedInvoice (aiSlice) y el modal ai-invoice.
// Lo que de testAIProposalCommercial y testAIProposalConversation solo prueba el punto de entrada applyExtractedInvoice: que escribe en el store
// el mismo proyecto que construye buildProjectFromDraft (precio de contrato, ITBIS, desglose mensual y procedencia del consumo) y no toca el catálogo.
// Parte de dos suites mixtas partidas en F0: el proyecto construido sigue verificándose allí con buildProjectFromDraft, que sobrevive.
import assert from 'node:assert/strict';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { useSimulationStore } from '../store/useSimulationStore';
import { buildProjectFromDraft } from '../store/slices/aiSlice';

const state = useSimulationStore.getState();
const catalog = structuredClone(state.equipmentCatalog);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
const context = { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(state.tariffMatrix) };
const draft = normalizeProposalDraft({ clientName: 'QA comercial', province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS2', averageMonthlyKWh: 500,
  panels: [{ equipmentId: panel.id, quantity: 10, unitPriceUSD: 0 }], inverters: [{ equipmentId: inverter.id, quantity: 1, unitPriceUSD: 1000 }], batteries: [], hasBattery: false,
  commercial: { marginOnSalePct: 30, installationTotalUSD: 300, customDiscounts: [{ description: 'Cortesía', type: 'percentage', value: 10, target: 'general' }] } }, catalog, context);
assert.equal(draft.requiresReview, false);

const original = { ...state };
useSimulationStore.setState({ equipmentCatalog: catalog, projects: [], activeProjectId: '', syncSettings: { ...state.syncSettings, authToken: null, currentUser: null, autoSyncEnabled: false } });
const built = buildProjectFromDraft(useSimulationStore.getState(), draft, true);
assert('project' in built);
useSimulationStore.getState().applyExtractedInvoice(draft, true);
const committed = useSimulationStore.getState().projects[0];
assert(committed, 'el borrador se crea de verdad en el store');
assert.equal(useSimulationStore.getState().activeProjectId, committed.id);
for (const mode of ['legacy', 'self_consumption'] as const) {
  const preview = calculateProjectFinancialSummary(built.project, mode), actual = calculateProjectFinancialSummary(committed, mode);
  assert.equal(actual.contractPriceUSD, preview.contractPriceUSD, 'vista previa y aplicación usan un solo adaptador');
  assert.equal(actual.itbisSavedUSD, preview.itbisSavedUSD);
  assert.deepEqual(actual.monthlyBreakdown, preview.monthlyBreakdown);
}
assert.deepEqual(committed.monthlyConsumption, built.project.monthlyConsumption);
assert.equal(committed.aiSource?.consumptionSource, built.project.aiSource?.consumptionSource, 'la procedencia del consumo se conserva al escribir');
assert.deepEqual(useSimulationStore.getState().equipmentCatalog, catalog, 'aplicar la propuesta no cambia el catálogo');
useSimulationStore.setState(original);
console.log('PASS (legado): applyExtractedInvoice escribe en el store el proyecto que construye buildProjectFromDraft.');
