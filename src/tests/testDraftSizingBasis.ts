// F2b, revisión (hallazgo 1): una propuesta nueva del asistente nace dimensionada con la MISMA base que guarda
// (`specs.sizingBasis = 'peak_month'`, ADR 0009). Si nace con una base y guarda otra, activar después el autodimensionado
// hace saltar la cantidad de paneles. Lo guardado sin base (el comportamiento de siempre) no cambia.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { buildProjectFromDraft } from '../domain/proposalDraft';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { readEquipment } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { recommendPanelCount, annualSpecificYieldKWhPerKWp } from '../domain/sizing';
import { sizeDraftPanelsWithBasis } from '../utils/proposalDraftProject';
import type { ExtractedInvoiceData, ProjectSimulation } from '../types';

const store = useSimulationStore;
const s = () => store.getState();
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const original: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), id: 'draft-basis-original', syncStatus: 'local_only' };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(original)], activeProjectId: original.id, activeView: 'dashboard',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const months = [600, 650, 700, 800, 900, 1100, 1300, 1250, 1000, 850, 700, 650]; // pico en julio: 1.300
const panelCount = (p: ProjectSimulation) => readEquipment(p.specs).panels.reduce((sum, g) => sum + g.count, 0);
/** Lo que daría activar el autodimensionado: la cantidad con la base guardada, por la transacción. */
const autoSized = (p: ProjectSimulation) => {
  store.setState({ projects: [p], activeProjectId: p.id });
  s().commitProjectEdits(p.id, [{ path: 'specs.autoCalculatePanels', value: true }], { source: 'user' });
  return panelCount(s().projects.find((x) => x.id === p.id)!);
};

// 1. Borrador sin grupos (selección única; camino heredado del asistente): nace con la base que guarda.
reset();
const single = buildProjectFromDraft(s(), { selectedPanelModel: panel.displayName, selectedPanelWatts: 590, monthlyConsumptionKWh: months, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1' } as unknown as ExtractedInvoiceData, true);
if ('error' in single) throw new Error(single.error);
assert.equal(single.project.specs.sizingBasis, 'peak_month');
const singleCount = panelCount(single.project);
assert.equal(singleCount, autoSized(structuredClone(single.project)), 'la cantidad con que nace es la que da el autodimensionado con su base');
assert.ok(singleCount > calculateRecommendedPanelCount('Santiago', months, 590, 95, resolveAssumptions(single.project).systemLossesPct).recommendedPanelCount, 'con el mes pico hay más paneles que con el promedio');

// 2. Borrador con grupos que pide dimensionar (un modelo con cantidad 0): lo que llega a `buildProjectFromDraft` desde el
// borrador del modal (apply_proposal_draft). `create_proposal` exige cantidad ≥ 1 (sus definiciones viven en shared/).
reset();
const groundedDraft = (quantity: number) => ({ clientName: 'Base', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', monthlyConsumptionKWh: months, consumptionSource: 'observed',
  panels: [{ equipmentId: panel.id, quantity }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: null, marginOnSalePct: null, installationUnitPriceUSD: null, installationTotalUSD: null, customItems: [], customDiscounts: [] } }) as unknown as ExtractedInvoiceData;
const grounded = buildProjectFromDraft(s(), groundedDraft(0), true);
if ('error' in grounded) throw new Error(grounded.error);
assert.equal(grounded.project.specs.sizingBasis, 'peak_month');
assert.equal(panelCount(grounded.project), autoSized(structuredClone(grounded.project)), 'un borrador con cantidad 0 dimensiona con la base que guarda');
// Con una cantidad explícita no se dimensiona: manda la del borrador.
reset();
const explicit = buildProjectFromDraft(s(), groundedDraft(7), true);
if ('error' in explicit) throw new Error(explicit.error);
assert.equal(panelCount(explicit.project), 7);
reset();
const created = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'Explícita', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', monthlyConsumptionKWh: months,
  panels: [{ catalogItemId: panel.id, count: 7 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, { source: 'app-assistant', owner: assistantOwner() });
assert.equal(created.status, 'applied', JSON.stringify(created));
assert.equal(panelCount(s().projects.find((p) => p.id === ((created as { data: { proposalId: string } }).data).proposalId)!), 7, 'create_proposal: la cantidad del agente');

// 3. La función pura que comparten la vista previa del modal y la aplicación.
const raw = { province: 'Santiago', monthlyConsumptionKWh: months, consumptionSource: 'observed', panels: [{ equipmentId: panel.id, quantity: 0 }], inverters: [], batteries: [] };
const ctx = { province: 'Santiago', systemLosses: 14, annualSpecificYieldKWhPerKWp: annualSpecificYieldKWhPerKWp('Santiago', 14) };
const normalized = normalizeProposalDraft(raw, catalog, ctx);
const peakCount = recommendPanelCount({ province: 'Santiago', monthlyConsumption: months, panelPowerW: panel.powerW!, coveragePct: 95, lossesPct: 14, basis: 'peak_month' }).count;
const peaked = sizeDraftPanelsWithBasis(raw, normalized, { province: 'Santiago', lossesPct: 14, basis: 'peak_month' });
assert.equal(peaked.panels?.[0].count, peakCount);
assert.equal(peaked.recommendedPanelCount, peakCount);
assert.deepEqual(sizeDraftPanelsWithBasis(raw, normalized, { province: 'Santiago', lossesPct: 14, basis: 'average' }), normalized, 'con la base heredada, el borrador tal cual');
const withCount = { ...raw, panels: [{ equipmentId: panel.id, quantity: 9 }] };
const normalizedCount = normalizeProposalDraft(withCount, catalog, ctx);
assert.deepEqual(sizeDraftPanelsWithBasis(withCount, normalizedCount, { province: 'Santiago', lossesPct: 14, basis: 'peak_month' }), normalizedCount, 'una cantidad pedida no se toca');

// 4. Una propuesta guardada sin base (todo lo anterior a F2b) dimensiona un borrador exactamente como antes.
reset();
const legacy = { ...structuredClone(original), specs: { ...structuredClone(original.specs), sizingBasis: undefined } };
store.setState({ projects: [legacy], activeProjectId: legacy.id });
const updated = buildProjectFromDraft(s(), { selectedPanelModel: panel.displayName, selectedPanelWatts: 590, monthlyConsumptionKWh: months, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1' } as unknown as ExtractedInvoiceData, false);
if ('error' in updated) throw new Error(updated.error);
assert.equal(panelCount(updated.project), calculateRecommendedPanelCount('Santiago', months, 590, resolveAssumptions(legacy).targetCoveragePct, resolveAssumptions(legacy).systemLossesPct, legacy.client.customMonthlyHSP).recommendedPanelCount);

console.log('PASS: el borrador de IA nace dimensionado con la base que guarda; lo guardado sin base, como antes.');
