import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { ClientSyncService } from '../services/clientSyncService';
import { clientContent } from '../../shared/clients';
import type { ClientRecord } from '../types/client';
import type { ProjectSimulation } from '../types';

const serverUrl = 'https://tombstone-clients.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const record = (id: string, name: string, version: number): ClientRecord => ({
  id, name, kind: 'persona', taxId: '', phone: '', email: '', address: '', province: '', notes: '',
  organizationId: user.organizationId, createdById: user.id, createdBy: user.name,
  version, baseVersion: version, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
});
let remote = new Map<string, ClientRecord>();
let deletedIds: string[] = [];
const puts: string[] = [];
let casConflictId: string | null = null;

ClientSyncService.setTransportFactory(() => async (path, init = {}) => {
  const method = init.method || 'GET';
  if (method === 'GET') return Response.json({ success: true, clients: [...remote.values()], deletedIds });
  const id = decodeURIComponent(path.slice(1).split('?')[0]);
  if (method === 'PUT') {
    puts.push(id);
    const body = JSON.parse(String(init.body));
    if (deletedIds.includes(id)) return Response.json({ error: 'borrado' }, { status: 409 });
    if (id === casConflictId) return Response.json({ error: 'conflicto', client: remote.get(id) }, { status: 409 });
    const saved = { ...record(id, body.name, (remote.get(id)?.version ?? 0) + 1), phone: body.phone ?? '' };
    remote.set(id, saved);
    return Response.json({ success: true, client: saved });
  }
  return Response.json({ error: 'no' }, { status: 404 });
});

const proposal = (id: string, clientId: string, status: ProjectSimulation['syncStatus']): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT), id, clientId, organizationId: user.organizationId, syncServerUrl: serverUrl,
  version: 1, baseVersion: 1, syncStatus: status,
});
const reset = (projects: ProjectSimulation[], clients: ClientRecord[] = []) => {
  store.getState().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  store.setState({ clients, clientChanges: {}, clientDeletionQueue: [], clientSyncFeedback: null, projects });
};

try {
  // 1. A tombstone never advances a proposal's CAS base by inference: the project pull delivers the authoritative revision.
  remote = new Map();
  deletedIds = ['client-gone'];
  reset([proposal('p-synced', 'client-gone', 'synced'), proposal('p-pending', 'client-gone', 'pending')]);
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  const synced = store.getState().projects.find((p) => p.id === 'p-synced')!;
  assert.equal(synced.baseVersion, 1, 'Synced proposal keeps its last confirmed server version');
  assert.equal(synced.version, 1);
  const pending = store.getState().projects.find((p) => p.id === 'p-pending')!;
  assert.equal(pending.clientId, undefined, 'Unsynced proposal drops the dead link locally');
  assert.equal(pending.baseVersion, 1, 'Local work keeps its base so the server arbitrates with CAS');
  assert.equal(pending.syncStatus, 'pending');

  // 2. A client edited offline and deleted by a teammate is preserved as a deletion conflict.
  const local = record('client-edited', 'Cliente editado', 1);
  remote = new Map();
  deletedIds = ['client-edited'];
  reset([proposal('p-link', 'client-edited', 'pending')], [local]);
  assert.ok(store.getState().updateClientRecord('client-edited', { phone: '809-555-1234' }).ok);
  puts.length = 0;
  const result = await store.getState().syncClientsWithServer();
  assert.equal(result.success, false, 'The unresolved deletion is surfaced');
  assert.deepEqual(puts, [], 'A tombstoned id is never pushed');
  const kept = store.getState().clients.find((c) => c.id === 'client-edited');
  assert.ok(kept, 'Unsynced edits are not dropped');
  assert.equal(kept.phone, '809-555-1234');
  assert.equal(store.getState().clientChanges['client-edited'].serverDeleted, true);
  assert.match(store.getState().clientSyncFeedback ?? '', /pendientes/);
  assert.equal(store.getState().projects[0].clientId, undefined);
  // The conflict survives later passes.
  await store.getState().syncClientsWithServer();
  assert.ok(store.getState().clients.some((c) => c.id === 'client-edited'));

  // 2a. Keep local: recreated as a new client carrying the edits.
  store.getState().resolveClientConflict('client-edited', 'keep_local');
  assert.ok(!store.getState().clients.some((c) => c.id === 'client-edited'));
  assert.equal(store.getState().clientChanges['client-edited'], undefined);
  const recreated = store.getState().clients.find((c) => c.name === 'Cliente editado');
  assert.ok(recreated && recreated.id !== 'client-edited');
  assert.equal(recreated.phone, '809-555-1234');
  assert.equal(store.getState().clientChanges[recreated.id].baseVersion, 0);
  assert.deepEqual(clientContent(recreated).phone, '809-555-1234');
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.ok(remote.has(recreated.id));

  // 2b. Accept the deletion: local copy discarded.
  remote = new Map();
  deletedIds = ['client-edited'];
  reset([], [local]);
  store.getState().updateClientRecord('client-edited', { phone: '809-555-9999' });
  await store.getState().syncClientsWithServer();
  store.getState().resolveClientConflict('client-edited', 'accept_server');
  assert.equal(store.getState().clients.length, 0);
  assert.deepEqual(store.getState().clientChanges, {});
  assert.equal((await store.getState().syncClientsWithServer()).success, true);

  // 2c. Clean (unedited) tombstoned clients still disappear silently.
  remote = new Map();
  deletedIds = ['client-clean'];
  reset([], [record('client-clean', 'Limpio', 1)]);
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.equal(store.getState().clients.length, 0);
  // 3. An unresolved CAS conflict followed by a teammate's deletion becomes a deletion conflict, never a silent loss.
  const base = record('client-cas', 'Cliente CAS', 1);
  const teammate = { ...record('client-cas', 'Cliente CAS', 2), phone: '809-000-0000', updatedAt: '2026-10-02T00:00:00.000Z' };
  remote = new Map([['client-cas', teammate]]);
  deletedIds = [];
  reset([], [base]);
  store.getState().updateClientRecord('client-cas', { phone: '809-555-4321' });
  puts.length = 0;
  casConflictId = 'client-cas';
  assert.equal((await store.getState().syncClientsWithServer()).success, false);
  casConflictId = null;
  assert.ok(store.getState().clientChanges['client-cas'].serverClient, 'The CAS conflict is recorded');
  remote = new Map();
  deletedIds = ['client-cas'];
  puts.length = 0;
  assert.equal((await store.getState().syncClientsWithServer()).success, false, 'The deletion conflict is surfaced');
  assert.deepEqual(puts, [], 'A tombstoned id is never pushed');
  const casKept = store.getState().clients.find((c) => c.id === 'client-cas');
  assert.ok(casKept, 'Local edits survive the tombstone');
  assert.equal(casKept.phone, '809-555-4321');
  assert.equal(store.getState().clientChanges['client-cas'].serverDeleted, true);
  assert.equal(store.getState().clientChanges['client-cas'].serverClient, undefined);
  await store.getState().syncClientsWithServer();
  assert.ok(store.getState().clients.some((c) => c.id === 'client-cas'), 'The deletion conflict survives later passes');
  store.getState().resolveClientConflict('client-cas', 'keep_local');
  const casCopy = store.getState().clients.find((c) => c.name === 'Cliente CAS');
  assert.ok(casCopy && casCopy.id !== 'client-cas' && casCopy.phone === '809-555-4321', 'Keep local recreates the client with the edits');
  assert.equal(store.getState().clientChanges[casCopy.id].baseVersion, 0);

  // 4. A teammate's retained pending edit is kept as a deletion conflict for its owner; the other account neither pushes nor resolves it.
  const other = { ...user, id: 'teammate', name: 'Otro', email: 'otro@example.invalid' };
  remote = new Map();
  deletedIds = ['client-foreign'];
  reset([], [record('client-foreign', 'Cliente ajeno', 1)]);
  assert.ok(store.getState().updateClientRecord('client-foreign', { phone: '809-555-7777' }).ok);
  assert.equal(store.getState().clientChanges['client-foreign'].ownerId, user.id);
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: other } });
  puts.length = 0;
  await store.getState().syncClientsWithServer();
  assert.deepEqual(puts, [], "Another account never uploads the owner's change");
  assert.ok(store.getState().clients.some((c) => c.id === 'client-foreign' && c.phone === '809-555-7777'), "The owner's edits are not lost");
  assert.equal(store.getState().clientChanges['client-foreign']?.serverDeleted, true, 'The tombstone is recorded for the retained change');
  store.getState().resolveClientConflict('client-foreign', 'accept_server');
  assert.ok(store.getState().clients.some((c) => c.id === 'client-foreign'), 'Another account cannot resolve the conflict');
  await store.getState().syncClientsWithServer();
  assert.ok(store.getState().clientChanges['client-foreign']?.serverDeleted, 'The conflict survives later passes');
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: user } });
  await store.getState().syncClientsWithServer();
  assert.equal(store.getState().clientChanges['client-foreign'].serverDeleted, true, 'The owner sees the deletion conflict');
  assert.deepEqual(puts, [], 'The tombstoned id is never pushed');

  console.log('Client tombstone reconciliation OK');
} finally {
  ClientSyncService.setTransportFactory(null);
}
