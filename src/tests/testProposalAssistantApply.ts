import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';

const store = useSimulationStore;
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
store.setState({ workspaceScope: 'local', projects: [], activeProjectId: '', activeView: 'dashboard', equipmentCatalog: catalog, deletedEquipmentIds: [], sessionGeneration: 0,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], appAssistantEnabled: false,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const draft = normalizeProposalDraft({ clientName: 'Asistente de propuestas', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: 28, marginOnSalePct: null, installationUnitPriceUSD: 150, installationTotalUSD: null, customItems: [], customDiscounts: [] } },
  catalog, { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(store.getState().tariffMatrix) });
const ctx = () => ({ source: 'proposal-assistant' as const, owner: assistantOwner() });

// 1. Create: applied, navigates like before, recorded as proposal-assistant activity, undo = trash.
const created = await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: true } }, ctx());
assert(created.status === 'applied', JSON.stringify(created));
const project = store.getState().getActiveProject();
assert.equal(project.client.name, 'Asistente de propuestas');
assert.equal(store.getState().activeView, 'simulator', 'the proposal assistant keeps opening the result');
assert.equal(project.specs.pricingMode, 'cost_matrix');
assert.equal(store.getState().agentActivity[0].source, 'proposal-assistant');
assert.equal(store.getState().undoAgentActivity(created.activityId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === project.id)?.isDeleted, true);

// 2. Under "confirm" the review click still counts as the confirmation; "deny" blocks it.
store.getState().setAgentPolicy({ internal: { read: 'allow', draft: 'confirm', guarded: 'confirm' } });
assert.equal((await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: true } }, ctx())).status, 'applied');
store.getState().setAgentPolicy({ internal: { read: 'allow', draft: 'deny', guarded: 'confirm' } });
assert.equal((await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: true } }, ctx())).status, 'error');

// 3. Not exposed to the general assistant or external agents.
store.getState().setAgentPolicy(DEFAULT_AGENT_POLICY);
const external = await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: true } }, { source: 'mcp', owner: assistantOwner() });
assert(external.status === 'error' && external.code === 'unknown_tool');
console.log('PASS: proposal assistant applies through the shared registry with activity, undo, policy and navigation preserved.');
