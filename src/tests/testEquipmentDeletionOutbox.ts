import { useSimulationStore as store } from '../store/useSimulationStore';
import { SyncService, EquipmentPushOutcome } from '../services/syncService';
import type { SolarEquipmentItem } from '../types/equipment';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const serverUrl = 'https://equipment-outbox.invalid';
const user = { id: 'equipment-review-user', name: 'Synthetic reviewer', email: 'test@example.invalid', role: 'EDITOR' as const, organizationId: 'equipment-review-org' };
function item(id: string, overrides: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem {
  return { id, type: 'panel', brand: 'Synthetic', modelSeries: id, displayName: id, powerW: 600, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', organizationId: user.organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1, ...overrides };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function reset(catalog: SolarEquipmentItem[], autoSyncEnabled = false) {
  store.getState().setSyncSettings({ serverUrl, authToken: 'synthetic-token', currentUser: user, autoSyncEnabled });
  store.setState({ equipmentCatalog: catalog, equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, deletedEquipmentIds: [] });
}
function mockServer(initial: SolarEquipmentItem[]) {
  const remote = new Map(initial.map((entry) => [entry.id, structuredClone(entry)]));
  const deleted = new Set<string>();
  let pushCalls = 0;
  let deleteCalls = 0;
  SyncService.pullEquipment = async () => ({ success: true, items: structuredClone([...remote.values()]), deletedIds: [...deleted] });
  const push = async (_url: string, _token: string, items: SolarEquipmentItem[]) => {
    pushCalls++;
    const results: EquipmentPushOutcome[] = items.map((entry) => {
      const prior = remote.get(entry.id);
      if (deleted.has(entry.id)) return { id: entry.id, status: 'conflict', reason: 'deleted' };
      if (prior && prior.version !== entry.baseVersion) return { id: entry.id, status: 'conflict', reason: 'version_conflict', serverVersion: prior.version, serverItem: structuredClone(prior) };
      const version = prior ? prior.version! + 1 : 1;
      const saved = { ...structuredClone(entry), version, baseVersion: version };
      remote.set(saved.id, saved);
      return { id: entry.id, status: prior ? 'updated' : 'created', version, item: structuredClone(saved) };
    });
    return { success: true, results };
  };
  SyncService.pushEquipmentBatch = push;
  SyncService.deleteEquipment = async (_url, _token, id, baseVersion) => {
    deleteCalls++;
    const prior = remote.get(id);
    if (prior && prior.version !== baseVersion) return false;
    remote.delete(id);
    deleted.add(id); // Real endpoint records tombstones for absent IDs as well.
    return true;
  };
  return { remote, deleted, push, pushCalls: () => pushCalls, deleteCalls: () => deleteCalls };
}
async function run() {
  const oldFetch = globalThis.fetch;
  const originals = { pull: SyncService.pullEquipment, push: SyncService.pushEquipmentBatch, remove: SyncService.deleteEquipment };
  globalThis.fetch = async () => { throw new Error('Real network forbidden in equipment-outbox tests'); };
  try {
    reset([]);
    const offline = mockServer([]);
    store.getState().addEquipmentItem(item('never-uploaded', { baseVersion: 0, version: undefined }));
    store.getState().removeEquipmentItem('never-uploaded');
    const durable = JSON.parse(JSON.stringify(serializeSimulationStore(store.getState())));
    assert(durable.equipmentDeletionQueue[0].item.id === 'never-uploaded', 'Deletion snapshot must survive restart');
    assert((await store.getState().syncEquipmentWithServer()).success && offline.deleted.has('never-uploaded'), 'Never-uploaded ID receives a tenant tombstone without failed version-0 update');

    for (const isCreation of [true, false]) {
      const target = item(isCreation ? 'create-in-flight' : 'update-in-flight', { baseVersion: isCreation ? 0 : 1 });
      reset(isCreation ? [] : [target]);
      const server = mockServer(isCreation ? [] : [target]);
      if (isCreation) store.getState().addEquipmentItem(target);
      else store.getState().updateEquipmentItem(target.id, { powerW: 620 });
      const started = deferred<void>();
      const release = deferred<void>();
      let first = true;
      SyncService.pushEquipmentBatch = async (...args) => {
        if (first) { first = false; started.resolve(); await release.promise; }
        return server.push(...args);
      };
      const syncing = store.getState().syncEquipmentWithServer();
      await started.promise;
      store.getState().removeEquipmentItem(target.id);
      release.resolve();
      await syncing;
      assert(store.getState().equipmentDeletionQueue[0].baseVersion === (isCreation ? 1 : 2), 'Invisible deletion command receives the in-flight ACK version');
      assert((await store.getState().syncEquipmentWithServer()).success && server.deleted.has(target.id), 'In-flight creation/update can subsequently be deleted without stale CAS');
    }

    const stale = item('deletion-conflict');
    reset([stale]);
    const conflict = mockServer([{ ...stale, version: 2, baseVersion: 2, powerW: 650 }]);
    store.getState().removeEquipmentItem(stale.id);
    store.getState().addEquipmentItem(item('unrelated', { baseVersion: 0 }));
    const conflictResult = await store.getState().syncEquipmentWithServer();
    assert(!conflictResult.success && conflict.deleteCalls() === 0, 'Stale deletion must not issue a physical delete');
    assert(conflict.remote.get(stale.id)?.powerW === 650 && conflict.remote.has('unrelated'), 'Remote work is protected and unrelated changes synchronize');
    assert(store.getState().equipmentCatalog.find((entry) => entry.id === stale.id)?.powerW === 600, 'Deleted local snapshot is restored for recovery');
    assert(store.getState().equipmentConflicts[stale.id]?.reason === 'deletion_version_conflict' && !(store.getState().deletedEquipmentIds || []).includes(stale.id), 'Recovery is visible and resolvable rather than hidden by tombstone');
    assert(store.getState().equipmentDeletionQueue.length === 0, 'Recovered conflict cannot block later deletion commands');

    reset([item('network-failure')]);
    const failure = mockServer([item('network-failure')]);
    store.getState().removeEquipmentItem('network-failure');
    store.getState().addEquipmentItem(item('network-unrelated', { baseVersion: 0 }));
    SyncService.deleteEquipment = async () => false;
    assert(!(await store.getState().syncEquipmentWithServer()).success, 'Failed deletion must report partial failure');
    assert(store.getState().equipmentDeletionQueue[0].item?.id === 'network-failure' && failure.remote.has('network-unrelated'), 'Failure preserves recovery snapshot and does not block other pushes');

    // A second mutation during the first push must schedule its own confirmation automatically.
    reset([item('follow-up')]);
    const follow = mockServer([item('follow-up')]);
    store.getState().updateEquipmentItem('follow-up', { powerW: 610 });
    const started = deferred<void>();
    const release = deferred<void>();
    const followed = deferred<void>();
    let sequence = 0;
    SyncService.pushEquipmentBatch = async (...args) => {
      if (++sequence === 1) { started.resolve(); await release.promise; }
      const result = await follow.push(...args);
      if (sequence === 2) followed.resolve();
      return result;
    };
    store.setState((state) => ({ syncSettings: { ...state.syncSettings, autoSyncEnabled: true } }));
    const followingSync = store.getState().syncEquipmentWithServer();
    await started.promise;
    store.getState().updateEquipmentItem('follow-up', { powerW: 630 });
    release.resolve();
    await followingSync;
    await Promise.race([followed.promise, new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Dirty ACK never scheduled follow-up')), 1000))]);
    await store.getState().syncEquipmentWithServer();
    assert(follow.remote.get('follow-up')?.powerW === 630 && follow.pushCalls() === 2, 'Automatic follow-up confirms the edit made during push');
    store.getState().setSyncSettings({ autoSyncEnabled: false });

    // A tombstone cannot erase unconfirmed supplier data; retain it as a forkable conflict.
    reset([item('remote-tombstone')]);
    const tombstone = mockServer([]);
    tombstone.deleted.add('remote-tombstone');
    store.getState().updateEquipmentItem('remote-tombstone', { powerW: 645 });
    assert(!(await store.getState().syncEquipmentWithServer()).success && tombstone.pushCalls() === 0, 'Dirty remote tombstone must not be pushed back');
    assert(store.getState().equipmentCatalog.find((entry) => entry.id === 'remote-tombstone')?.powerW === 645 && store.getState().equipmentConflicts['remote-tombstone']?.reason === 'deleted', 'Dirty tombstone snapshot must be preserved for fork recovery');

    // Logout + login to the same identity is still a different session generation.
    reset([item('old-session')]);
    mockServer([]);
    const oldStarted = deferred<void>();
    const oldRelease = deferred<void>();
    let firstPull = true;
    SyncService.pullEquipment = async () => {
      if (firstPull) { firstPull = false; oldStarted.resolve(); await oldRelease.promise; return { success: true, items: [item('stale-response')] }; }
      return { success: true, items: [item('current-response')] };
    };
    const oldSync = store.getState().syncEquipmentWithServer();
    await oldStarted.promise;
    store.getState().logoutUser();
    store.getState().setSyncSettings({ serverUrl, authToken: 'new-synthetic-token', currentUser: user, autoSyncEnabled: false });
    assert((await store.getState().syncEquipmentWithServer()).success, 'New generation starts its own catalog request while the old one is in flight');
    oldRelease.resolve();
    assert(!(await oldSync).success, 'Old generation response must be discarded');
    assert(!store.getState().equipmentCatalog.some((entry) => entry.id === 'stale-response') && store.getState().equipmentCatalog.some((entry) => entry.id === 'current-response'), 'Stale session cannot contaminate a renewed session of the same account');
    console.log('✓ Equipment deletion outbox: offline ID, create/update ACK races, deletion conflict, partial failure, automatic follow-up and session generation');
  } finally {
    store.getState().setSyncSettings({ autoSyncEnabled: false });
    globalThis.fetch = oldFetch;
    SyncService.pullEquipment = originals.pull;
    SyncService.pushEquipmentBatch = originals.push;
    SyncService.deleteEquipment = originals.remove;
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
