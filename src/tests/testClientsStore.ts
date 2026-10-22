import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { captureWorkspace, changeWorkspace } from '../store/sync/organizationWorkspace';
import { projectDifferences } from '../store/sync/projectDifferences';
import { findDuplicateClients } from '../../shared/clients';
import type { ProjectSimulation } from '../types';

const proposal = (id: string, extra: Partial<ProjectSimulation> = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  client: { ...BENCHMARK_PROJECT.client, name: 'Nombre impreso en la propuesta' },
  syncStatus: 'local_only',
  ...extra,
});

store.setState({
  projects: [proposal('p-local'), proposal('p-trash', { isDeleted: true })],
  clients: [],
  clientChanges: {},
  clientDeletionQueue: [],
});

// Local mode: the user owns the workspace; the API is pure-callable for agent tools.
const created = store.getState().createClientRecord({ kind: 'empresa', name: '  Hotel Las Palmas ', taxId: '1-31-12345-6' });
assert.ok(created.ok);
const client = created.client;
assert.match(client.id, /^client-/);
assert.equal(client.name, 'Hotel Las Palmas');
assert.equal(client.taxId, '131123456');
assert.equal(client.kind, 'empresa');
assert.equal(client.baseVersion, 0);
assert.equal(store.getState().clientChanges[client.id].baseVersion, 0);
assert.equal(store.getState().clients.length, 1);

const invalid = store.getState().createClientRecord({ name: '   ' });
assert.equal(invalid.ok, false);
assert.equal(store.getState().clients.length, 1);
assert.equal(store.getState().createClientRecord({ name: 'Ana', email: 'sin-arroba' }).ok, false);

const updated = store.getState().updateClientRecord(client.id, { phone: '809-555-0101', notes: 'Visita técnica pendiente' });
assert.ok(updated.ok);
assert.equal(updated.client.phone, '809-555-0101');
assert.equal(updated.client.name, 'Hotel Las Palmas', 'Omitted fields are kept');
assert.equal(store.getState().updateClientRecord('missing', { name: 'X' }).ok, false);
assert.equal(store.getState().updateClientRecord(client.id, { name: '' }).ok, false);

// Duplicate warnings by tax id or normalized name; never blocking.
const second = store.getState().createClientRecord({ name: 'hotel las palmas' });
assert.ok(second.ok);
assert.deepEqual(findDuplicateClients(store.getState().clients, { name: 'Hotel  Las Palmas!', taxId: '' }).map((m) => m.reason), ['name', 'name']);
assert.deepEqual(findDuplicateClients(store.getState().clients, { id: second.client.id, name: 'Otro', taxId: '131-12345-6' }).map((m) => [m.client.id, m.reason]), [[client.id, 'taxId']]);

// Linking changes only the link: the printed client data stays as written.
const linked = store.getState().linkProposalToClient('p-local', client.id);
assert.deepEqual(linked, { ok: true });
let project = store.getState().projects.find((p) => p.id === 'p-local')!;
assert.equal(project.clientId, client.id);
assert.equal(project.client.name, 'Nombre impreso en la propuesta');
assert.equal(project.syncStatus, 'pending');
assert.ok(projectDifferences(proposal('p-local'), project).some((d) => d.field === 'Cliente vinculado'));
assert.equal(store.getState().linkProposalToClient('p-local', 'unknown-client').ok, false);
assert.equal(store.getState().linkProposalToClient('missing', client.id).ok, false);
assert.equal(store.getState().linkProposalToClient('p-trash', client.id).ok, false, 'Trash is read-only');
assert.equal(store.getState().projects.find((p) => p.id === 'p-trash')!.clientId, undefined);

// Deleting a client queues the server command and unlinks proposals without touching printed data.
store.getState().linkProposalToClient('p-local', second.client.id);
assert.deepEqual(store.getState().linkProposalToClient('p-local', null), { ok: true });
assert.equal(store.getState().projects.find((p) => p.id === 'p-local')!.clientId, undefined);
store.getState().linkProposalToClient('p-local', client.id);
assert.equal(store.getState().deleteClientRecord(client.id), true);
assert.equal(store.getState().deleteClientRecord(client.id), false);
assert.ok(!store.getState().clients.some((c) => c.id === client.id));
assert.equal(store.getState().clientChanges[client.id], undefined);
assert.deepEqual(store.getState().clientDeletionQueue, [{ id: client.id, ownerId: undefined, baseVersion: 0 }]);
project = store.getState().projects.find((p) => p.id === 'p-local')!;
assert.equal(project.clientId, undefined);
assert.equal(project.client.name, 'Nombre impreso en la propuesta');

// Durable data is serialized and isolated per workspace.
const serialized = serializeSimulationStore(store.getState());
assert.equal(serialized.clients.length, 1);
assert.ok(serialized.clientChanges[second.client.id]);
assert.equal(serialized.clientDeletionQueue.length, 1);
assert.equal(captureWorkspace(store.getState()).clients.length, 1);
const reader = { id: 'reader', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR' as const, organizationId: 'org-a' };
const orgSession = { ...store.getState().syncSettings, serverUrl: 'https://clients.invalid', currentUser: reader, authToken: 'synthetic' };
const orgWorkspace = changeWorkspace(store.getState(), orgSession);
assert.deepEqual(orgWorkspace.clients, [], 'Local clients are never assigned to an organization');
assert.deepEqual(orgWorkspace.clientChanges, {});
store.setState({ ...orgWorkspace, syncSettings: orgSession });
assert.equal(store.getState().createClientRecord({ name: 'Bloqueado' }).ok, false, 'Readers cannot create clients');
const back = changeWorkspace(store.getState(), { ...orgSession, currentUser: null, authToken: null });
assert.equal(back.clients?.[0].id, second.client.id, 'The local directory is restored on logout');

console.log('✅ Clients store: CRUD, links, duplicates, deletion and workspace isolation passed.');
