import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { ClientSyncService } from '../services/clientSyncService';
import type { ClientRecord } from '../types/client';
import type { ProjectSimulation } from '../types';

const serverUrl = 'https://offline-clients.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const record = (id: string, name: string, version: number, extra: Partial<ClientRecord> = {}): ClientRecord => ({
  id, name, kind: 'persona', taxId: '', phone: '', email: '', address: '', province: '', notes: '',
  organizationId: user.organizationId, createdById: user.id, createdBy: user.name,
  version, baseVersion: version, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra,
});
let remote = new Map<string, ClientRecord>([['client-a', record('client-a', 'Cliente A', 1)]]);
let deletedIds = ['client-gone'];
let online = true;
let failPutFor: string | null = null;
const calls: string[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });

ClientSyncService.setTransportFactory((url, token) => async (path, init = {}) => {
  assert.equal(url, serverUrl, 'Only the session server');
  assert.equal(token(), 'synthetic');
  const method = init.method || 'GET';
  calls.push(`${method} ${path}`);
  if (!online) throw new Error('Sin conexión');
  if (method === 'GET') return json({ success: true, clients: [...remote.values()], deletedIds });
  const id = decodeURIComponent(path.slice(1).split('?')[0]);
  const current = remote.get(id);
  if (method === 'DELETE') {
    const baseVersion = Number(new URLSearchParams(path.split('?')[1]).get('baseVersion'));
    if (!current) return json({ error: 'Cliente no encontrado' }, 404);
    if (current.version !== baseVersion) return json({ error: 'conflicto', client: current }, 409);
    remote.delete(id);
    deletedIds = [...deletedIds, id];
    return json({ success: true });
  }
  if (id === failPutFor) throw new Error('Conexión interrumpida');
  const body = JSON.parse(String(init.body));
  if (deletedIds.includes(id) || (current ? body.baseVersion !== current.version : body.baseVersion !== 0))
    return json({ error: 'conflicto', client: current ?? null }, 409);
  const saved = record(id, body.name, (current?.version ?? 0) + 1, { phone: body.phone ?? '', taxId: body.taxId ?? '' });
  remote.set(id, saved);
  return json({ success: true, client: saved });
});

const proposal = (id: string, clientId?: string): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT), id, clientId, organizationId: user.organizationId, syncServerUrl: serverUrl,
  version: 1, baseVersion: 1, syncStatus: 'pending',
});

try {
  store.getState().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  store.setState({ clients: [], clientChanges: {}, clientDeletionQueue: [], projects: [proposal('p-gone', 'client-gone'), proposal('p-kept', 'client-a')] });

  // Pull: server records replace the list and links to deleted clients are dropped locally.
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.deepEqual(store.getState().clients.map((c) => c.id), ['client-a']);
  assert.equal(store.getState().projects.find((p) => p.id === 'p-gone')!.clientId, undefined);
  assert.equal(store.getState().projects.find((p) => p.id === 'p-kept')!.clientId, 'client-a');

  // Offline creation is durable and published once the connection returns.
  online = false;
  const offline = store.getState().createClientRecord({ name: 'Cliente sin conexión', phone: '809-555-0000' });
  assert.ok(offline.ok);
  const offlineId = offline.client.id;
  const failed = await store.getState().syncClientsWithServer();
  assert.equal(failed.success, false);
  assert.ok(store.getState().clientSyncFeedback);
  await store.persist.rehydrate();
  assert.ok(store.getState().clients.some((c) => c.id === offlineId));
  assert.equal(store.getState().clientChanges[offlineId].baseVersion, 0);
  online = true;
  calls.length = 0;
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.deepEqual(calls, ['GET ', `PUT /${encodeURIComponent(offlineId)}`]);
  assert.equal(store.getState().clientChanges[offlineId], undefined);
  assert.equal(store.getState().clients.find((c) => c.id === offlineId)!.version, 1);
  assert.equal(store.getState().clientSyncFeedback, null);

  // A partial failure keeps each acknowledged version: later edits do not conflict with this device's own write.
  const first = store.getState().createClientRecord({ name: 'Primero en cola' });
  const second = store.getState().createClientRecord({ name: 'Segundo en cola' });
  assert.ok(first.ok && second.ok);
  failPutFor = second.client.id;
  assert.equal((await store.getState().syncClientsWithServer()).success, false);
  failPutFor = null;
  const acknowledged = store.getState().clients.find((c) => c.id === first.client.id)!;
  assert.equal(acknowledged.version, 1);
  assert.equal(acknowledged.baseVersion, 1);
  assert.equal(store.getState().clientChanges[first.client.id], undefined);
  store.getState().updateClientRecord(first.client.id, { phone: '809-555-1111' });
  assert.equal(store.getState().clientChanges[first.client.id].baseVersion, 1);
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.equal(remote.get(first.client.id)!.version, 2);
  assert.ok(remote.has(second.client.id));

  // A lost creation receipt with identical content is acknowledged without a second write.
  const lost = store.getState().createClientRecord({ name: 'Recibo perdido' });
  assert.ok(lost.ok);
  remote.set(lost.client.id, record(lost.client.id, 'Recibo perdido', 1));
  calls.length = 0;
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.deepEqual(calls, ['GET ']);

  // Concurrent edits conflict through CAS; the user chooses which version survives.
  remote.set('client-a', record('client-a', 'Cliente A (otro equipo)', 2));
  store.getState().updateClientRecord('client-a', { name: 'Cliente A (local)' });
  assert.equal((await store.getState().syncClientsWithServer()).success, false);
  assert.equal(store.getState().clientChanges['client-a'].serverClient?.name, 'Cliente A (otro equipo)');
  assert.match(store.getState().clientSyncFeedback!, /cliente/i);
  store.getState().resolveClientConflict('client-a', 'keep_local');
  assert.equal(store.getState().clientChanges['client-a'].baseVersion, 2);
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.equal(remote.get('client-a')!.name, 'Cliente A (local)');
  assert.equal(remote.get('client-a')!.version, 3);
  remote.set('client-a', record('client-a', 'Servidor gana', 4));
  store.getState().updateClientRecord('client-a', { name: 'Se descarta' });
  await store.getState().syncClientsWithServer();
  store.getState().resolveClientConflict('client-a', 'accept_server');
  assert.equal(store.getState().clients.find((c) => c.id === 'client-a')!.name, 'Servidor gana');
  assert.equal(store.getState().clientChanges['client-a'], undefined);

  // Deletions use the acknowledged version; a stale deletion restores the server record for review.
  // Published clients are unlinked only once the server confirms the deletion.
  store.setState((s) => ({ projects: [...s.projects, proposal('p-offline', offlineId)] }));
  store.getState().deleteClientRecord(offlineId);
  assert.equal(store.getState().projects.find((p) => p.id === 'p-offline')!.clientId, offlineId);
  remote.set('client-a', record('client-a', 'Servidor gana', 5));
  store.getState().deleteClientRecord('client-a');
  assert.equal((await store.getState().syncClientsWithServer()).success, false);
  assert.equal(store.getState().projects.find((p) => p.id === 'p-offline')!.clientId, undefined, 'Confirmed deletion unlinks');
  assert.equal(store.getState().projects.find((p) => p.id === 'p-kept')!.clientId, 'client-a', 'A rejected deletion keeps its links');
  assert.ok(!remote.has(offlineId));
  assert.ok(!store.getState().clients.some((c) => c.id === offlineId));
  assert.equal(store.getState().clients.find((c) => c.id === 'client-a')!.version, 5, 'Stale deletion is not applied blindly');
  assert.deepEqual(store.getState().clientDeletionQueue, []);
  assert.ok(store.getState().clientChanges['client-a'].serverClient);

  // A member demoted to reader can still discard local work in favour of the server record, never keep it.
  store.getState().setSyncSettings({ currentUser: { ...user, role: 'LECTOR' } });
  store.getState().resolveClientConflict('client-a', 'keep_local');
  assert.ok(store.getState().clientChanges['client-a'].serverClient);
  store.getState().resolveClientConflict('client-a', 'accept_server');
  assert.equal(store.getState().clientChanges['client-a'], undefined);
  store.getState().setSyncSettings({ currentUser: user });

  // Never-published clients are deleted locally without a server request.
  online = false;
  const draft = store.getState().createClientRecord({ name: 'Borrador' });
  assert.ok(draft.ok);
  store.getState().deleteClientRecord(draft.client.id);
  online = true;
  calls.length = 0;
  assert.equal((await store.getState().syncClientsWithServer()).success, true);
  assert.deepEqual(calls, ['GET ']);
  assert.deepEqual(store.getState().clientDeletionQueue, []);

  // A session change during a pass discards its results.
  remote.set('client-late', record('client-late', 'Tardío', 1));
  const pass = store.getState().syncClientsWithServer();
  store.setState({ sessionGeneration: store.getState().sessionGeneration + 1 });
  assert.equal((await pass).success, false);
  assert.ok(!store.getState().clients.some((c) => c.id === 'client-late'));

  // Project sync runs the client pass right after folders; client errors do not block proposals.
  const order: string[] = [];
  store.setState({
    syncFoldersWithServer: async () => { order.push('folders'); return { success: true, message: 'ok' }; },
    syncClientsWithServer: async () => { order.push('clients'); return { success: false, message: 'Sin conexión' }; },
    syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic' }),
    syncOrganizationCompanyProfile: async () => ({ success: true }),
    projects: [],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    order.push('pull');
    assert.ok(String(input).endsWith('/api/sync/pull'));
    return json({ success: true, projects: [], deletedIds: [] });
  };
  try {
    const result = await store.getState().syncProjectsWithServer();
    assert.equal(result.success, true);
    assert.match(result.message, /clientes/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(order.slice(0, 3), ['folders', 'clients', 'pull']);
} finally {
  ClientSyncService.setTransportFactory(null);
}

console.log('✅ Offline client sync: pull, offline queue, receipts, CAS conflicts, deletions and session isolation passed.');
