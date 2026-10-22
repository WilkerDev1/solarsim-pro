import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { findAgentTool } from '../../shared/agentTools/definitions';

const store = useSimulationStore;
const p1 = { ...structuredClone(BENCHMARK_PROJECT), id: 'cl-p1', status: 'Draft' as const, syncStatus: 'local_only' as const };
const p2 = { ...structuredClone(BENCHMARK_PROJECT), id: 'cl-p2', status: 'Final' as const, syncStatus: 'local_only' as const,
  commercial: { status: 'approved' as const, note: '' } };
store.setState({ workspaceScope: 'local', projects: [p1, p2], activeProjectId: 'none', sessionGeneration: 0, clients: [], clientChanges: {}, clientDeletionQueue: [],
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const ctx = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' });
const project = (id: string) => store.getState().projects.find((p) => p.id === id)!;

assert.equal(findAgentTool('create_client')?.kind, 'draft');
assert.equal(findAgentTool('link_proposal_to_client')?.kind, 'draft');
assert.equal(findAgentTool('delete_client')?.kind, 'guarded');

// 1. Create with optional basic info; validation errors are reported.
const created = await executeAgentTool({ name: 'create_client', args: { name: 'Hotel Caribe SRL', kind: 'empresa', taxId: '1-31-12345-6', phone: '809-555-1010', email: 'compras@hotel.invalid' } }, ctx());
assert(created.status === 'applied', JSON.stringify(created));
const clientId = (created.data as { clientId: string }).clientId;
assert.equal(store.getState().clients.find((c) => c.id === clientId)?.name, 'Hotel Caribe SRL');
assert.equal((await executeAgentTool({ name: 'create_client', args: { name: 'X', email: 'no-es-correo' } }, ctx())).status, 'error');

// 2. Link two proposals; the printed client name in the proposal is untouched.
const printed = project('cl-p1').client.name;
for (const id of ['cl-p1', 'cl-p2']) assert.equal((await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: id, clientId } }, ctx())).status, 'applied');
assert.equal(project('cl-p1').clientId, clientId);
assert.equal(project('cl-p1').client.name, printed, 'linking never rewrites the printed client data');

// 3. Search and detail with the status summary.
const found = await executeAgentTool({ name: 'search_clients', args: { query: '131123456' } }, ctx());
assert(found.status === 'ok');
assert.equal((found.data as any).clients[0].id, clientId);
assert.equal((found.data as any).clients[0].proposalCount, 2);
const detail = await executeAgentTool({ name: 'get_client', args: { id: clientId } }, ctx());
assert(detail.status === 'ok');
const summary = (detail.data as any).summary;
assert.equal(summary.total, 2);
assert.equal(summary.documents.Final, 1);
assert.equal(summary.decisions.approved, 1);
assert.equal((detail.data as any).proposals.length, 2);
assert.equal(detail.cards?.[0].type, 'client');

// 4. Update; unlink with undo.
assert.equal((await executeAgentTool({ name: 'update_client', args: { id: clientId, phone: '809-555-2020', notes: 'Prefiere WhatsApp' } }, ctx())).status, 'applied');
assert.equal(store.getState().clients.find((c) => c.id === clientId)?.phone, '809-555-2020');
const unlink = await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: 'cl-p2', clientId: null } }, ctx());
assert(unlink.status === 'applied');
assert.equal(project('cl-p2').clientId, undefined);
assert.equal(store.getState().undoAgentActivity(unlink.activityId).success, true);
assert.equal(project('cl-p2').clientId, clientId);
assert.equal((await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: 'cl-p1', clientId: 'ghost' } }, ctx())).status, 'error');

// 4b. Undo of an unlink is refused once the previous client was deleted.
const tmp = await executeAgentTool({ name: 'create_client', args: { name: 'Temporal' } }, ctx());
const tmpId = (tmp as any).data.clientId;
await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: 'cl-p2', clientId: tmpId } }, ctx());
const tmpUnlink = await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: 'cl-p2', clientId: null } }, ctx());
assert(tmpUnlink.status === 'applied');
store.getState().deleteClientRecord(tmpId);
assert.equal(store.getState().undoAgentActivity(tmpUnlink.activityId).success, false);
assert.equal(project('cl-p2').clientId, undefined, 'no dangling link to a deleted client');
await executeAgentTool({ name: 'link_proposal_to_client', args: { proposalId: 'cl-p2', clientId } }, ctx());

// 4c. Search stays within the payload budget with long notes (compact projection).
for (let i = 0; i < 20; i++) store.getState().createClientRecord({ name: `Cliente ${i}`, notes: 'n'.repeat(3900) });
const many = await executeAgentTool({ name: 'search_clients', args: {} }, ctx());
assert(many.status === 'ok', JSON.stringify(many).slice(0, 200));
assert.equal((many.data as any).clients[0].notes, undefined);

// 5. Deletion is guarded and unlinks local proposals.
const removal = await executeAgentTool({ name: 'delete_client', args: { id: clientId } }, ctx());
assert(removal.status === 'pending_confirmation');
assert(store.getState().clients.some((c) => c.id === clientId));
assert.equal(store.getState().confirmAgentAction(removal.actionId).success, true);
assert(!store.getState().clients.some((c) => c.id === clientId));
assert.equal(project('cl-p1').clientId, undefined);

// 6. Readers can search but not create.
store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
  currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as never } });
assert.equal((await executeAgentTool({ name: 'search_clients', args: {} }, ctx())).status, 'ok');
assert.equal((await executeAgentTool({ name: 'create_client', args: { name: 'Nuevo' } }, ctx())).status, 'error');
console.log('PASS: agent client tools: create, validate, link/unlink with undo, search by tax id, status summary, guarded delete and readers.');
