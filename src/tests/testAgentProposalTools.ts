import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { findAgentTool } from '../../shared/agentTools/definitions';

const store = useSimulationStore;
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [
  { id: 'sp-cheap-oos', supplierName: 'A', priceUSD: 80, stockStatus: 'out_of_stock', updatedAt: '2026-10-01T00:00:00.000Z' },
  { id: 'sp-instock', supplierName: 'B', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' },
];
inverter.supplierPrices = [{ id: 'sp-inv', supplierName: 'B', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const existing = { ...structuredClone(BENCHMARK_PROJECT), id: 'tools-existing', status: 'Draft' as const, syncStatus: 'local_only' as const };
store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [existing], activeProjectId: existing.id, activeView: 'dashboard',
  equipmentCatalog: catalog, deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, agentPolicy: DEFAULT_AGENT_POLICY,
  agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const ctx = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'codex' });

// 1. Kinds follow the permission decision.
assert.equal(findAgentTool('create_proposal')?.kind, 'draft');
assert.equal(findAgentTool('duplicate_proposal')?.kind, 'draft');
for (const name of ['set_proposal_status', 'set_commercial_status', 'add_commercial_report', 'move_proposal_to_trash', 'update_supplier_price'])
  assert.equal(findAgentTool(name)?.kind, 'guarded', `${name} needs confirmation`);
assert.equal(findAgentTool('audit_catalog')?.kind, 'read');

// 2. create_proposal: catalog mode, real ids, supplier prices (in-stock preferred), no navigation, undo = trash.
const created = await executeAgentTool({ name: 'create_proposal', args: {
  clientName: 'Cliente MCP', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 800, phone: '809-555-0101',
  panels: [{ catalogItemId: panel.id, count: 14 }], inverters: [{ catalogItemId: inverter.id, count: 1 }],
} }, ctx());
assert(created.status === 'applied', JSON.stringify(created));
const proposalId = (created.data as { proposalId: string }).proposalId;
const proposal = store.getState().projects.find((p) => p.id === proposalId)!;
assert.equal(proposal.client.name, 'Cliente MCP');
assert.equal(proposal.client.contactPhone, '809-555-0101');
assert.equal(proposal.specs.isDetailed, false);
assert.equal(proposal.specs.pricingMode, 'cost_matrix');
assert.equal(proposal.specs.panels?.[0].id, panel.id);
assert.equal(proposal.specs.panels?.[0].unitPriceUSD, 95, 'cheapest in-stock offer, not the out-of-stock one');
assert.equal(proposal.monthlyConsumption.length, 12);
assert.equal(store.getState().activeView, 'dashboard', 'agents do not navigate the user away');
assert.equal(created.cards?.[0].type, 'proposal');
assert.equal(store.getState().undoAgentActivity(created.activityId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === proposalId)?.isDeleted, true, 'undoing a creation moves it to the trash');

// 3. Invalid creations are rejected without side effects.
const before = store.getState().projects.length;
const wrongType = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'X', distributor: 'EDESUR', tariffCode: 'BTS1', averageMonthlyKWh: 300,
  panels: [{ catalogItemId: inverter.id, count: 2 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, ctx());
assert.equal(wrongType.status, 'error');
const unknownId = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'X', distributor: 'EDESUR', tariffCode: 'BTS1', averageMonthlyKWh: 300,
  panels: [{ catalogItemId: 'nope', count: 2 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, ctx());
assert.equal(unknownId.status, 'error');
assert.equal(store.getState().projects.length, before);

// 4. duplicate_proposal returns the new id and links the family.
const dup = await executeAgentTool({ name: 'duplicate_proposal', args: { id: existing.id } }, ctx());
assert(dup.status === 'applied');
const dupId = (dup.data as { proposalId: string }).proposalId;
assert.equal(store.getState().projects.find((p) => p.id === dupId)?.proposalLink?.parentId, existing.id);

// 5. Guarded proposal tools wait; confirmation applies; trashed proposals are refused.
const status = await executeAgentTool({ name: 'set_proposal_status', args: { id: existing.id, status: 'Final' } }, ctx());
assert(status.status === 'pending_confirmation');
assert.equal(store.getState().projects.find((p) => p.id === existing.id)?.status, 'Draft');
assert.equal(store.getState().confirmAgentAction(status.actionId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === existing.id)?.status, 'Final');
const decision = await executeAgentTool({ name: 'set_commercial_status', args: { id: existing.id, status: 'approved' } }, ctx());
assert(decision.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(decision.actionId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === existing.id)?.commercial?.status, 'approved');
const report = await executeAgentTool({ name: 'add_commercial_report', args: { id: existing.id, note: 'Cliente pidió financiamiento.' } }, ctx());
assert(report.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(report.actionId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === existing.id)?.commercial?.reports?.at(-1)?.note, 'Cliente pidió financiamiento.');
const trash = await executeAgentTool({ name: 'move_proposal_to_trash', args: { id: dupId } }, ctx());
assert(trash.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(trash.actionId).success, true);
assert.equal(store.getState().projects.find((p) => p.id === dupId)?.isDeleted, true);
assert.equal((await executeAgentTool({ name: 'set_proposal_status', args: { id: dupId, status: 'Final' } }, ctx())).status, 'error', 'trashed proposals are read-only');

// 6. open_proposal navigates on request only.
const opened = await executeAgentTool({ name: 'open_proposal', args: { id: existing.id, view: 'pdf-preview' } }, ctx());
assert(opened.status === 'ok');
assert.equal(store.getState().activeProjectId, existing.id);
assert.equal(store.getState().activeView, 'pdf-preview');

// 7. Catalog: audit, offers and guarded price edits.
const audit = await executeAgentTool({ name: 'audit_catalog', args: {} }, ctx());
assert(audit.status === 'ok');
assert.equal(audit.cards?.[0].type, 'catalog-audit');
const offers = await executeAgentTool({ name: 'list_supplier_offers', args: { equipmentId: panel.id } }, ctx());
assert(offers.status === 'ok');
assert.equal((offers.data as { offers: unknown[] }).offers.length, 2);
const price = await executeAgentTool({ name: 'update_supplier_price', args: { equipmentId: panel.id, offerId: 'sp-instock', priceUSD: 91, stockStatus: 'on_order' } }, ctx());
assert(price.status === 'pending_confirmation');
assert.equal(store.getState().equipmentCatalog.find((e) => e.id === panel.id)?.supplierPrices?.find((o) => o.id === 'sp-instock')?.priceUSD, 95);
assert.equal(store.getState().confirmAgentAction(price.actionId).success, true);
const updatedOffer = store.getState().equipmentCatalog.find((e) => e.id === panel.id)?.supplierPrices?.find((o) => o.id === 'sp-instock');
assert.equal(updatedOffer?.priceUSD, 91);
assert.equal(updatedOffer?.stockStatus, 'on_order');
const badOffer = await executeAgentTool({ name: 'update_supplier_price', args: { equipmentId: panel.id, offerId: 'missing', priceUSD: 1 } }, ctx());
assert.equal(badOffer.status, 'error');

// 8. Readers cannot create proposals.
store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
  currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as never } });
const reader = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'X', distributor: 'EDESUR', tariffCode: 'BTS1', averageMonthlyKWh: 300,
  panels: [{ catalogItemId: panel.id, count: 2 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, ctx());
assert.equal(reader.status, 'error');

console.log('PASS: agent proposal and catalog tools: create (catalog mode), duplicate, guarded status/commercial/trash, navigation, audit and offers.');
