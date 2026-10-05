import { useSimulationStore as store } from '../store/useSimulationStore';
import { SyncService, SyncPushOutcome } from '../services/syncService';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import type { ProjectSimulation } from '../types';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { acknowledgeQueuedProjectDeletions, createProjectDeletion } from '../store/sync/projectDeletion';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const serverUrl = 'https://deletion-test.invalid';
const user = { id: 'deletion-test-user', name: 'Synthetic reviewer', email: 'test@example.invalid', role: 'EDITOR' as const, organizationId: 'deletion-test-org' };
function project(id: string, overrides: Partial<ProjectSimulation> = {}): ProjectSimulation {
  return { ...structuredClone(BENCHMARK_PROJECT), id, organizationId: user.organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1, syncStatus: 'synced', ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function mockServer(initial: ProjectSimulation[]) {
  const remote = new Map(initial.map((item) => [item.id, structuredClone(item)]));
  const deleted = new Set<string>();
  const pushes: ProjectSimulation[][] = [];
  let deleteCalls = 0;
  SyncService.pullProjects = async () => ({ success: true, projects: structuredClone([...remote.values()]), deletedIds: [...deleted], serverTimestamp: '2026-10-03T00:00:00Z' });
  const push = async (_url: string, _token: string, items: ProjectSimulation[]) => {
    pushes.push(structuredClone(items));
    const results: SyncPushOutcome[] = items.map((item) => {
      const prior = remote.get(item.id);
      if (prior && prior.version !== item.baseVersion) return { id: item.id, originalId: item.id, status: 'conflict', reason: 'version_conflict', serverVersion: prior.version!, serverProject: structuredClone(prior) };
      const version = prior ? prior.version! + 1 : 1;
      const saved: ProjectSimulation = { ...structuredClone(item), version, baseVersion: version, syncStatus: 'synced' };
      remote.set(item.id, saved);
      return { id: item.id, originalId: item.id, status: prior ? 'updated' : 'created', version, project: structuredClone(saved) };
    });
    return { success: true, results };
  };
  SyncService.pushProjects = push;
  SyncService.deleteProject = async (_url, _token, id, permanent, baseVersion) => {
    deleteCalls++;
    const prior = remote.get(id);
    if (!prior) return deleted.has(id);
    if (!permanent || !prior.isDeleted || prior.version !== baseVersion) return false;
    remote.delete(id);
    deleted.add(id);
    return true;
  };
  return { remote, deleted, pushes, push, deleteCalls: () => deleteCalls };
}

function reset(projects: ProjectSimulation[]) {
  store.getState().setSyncSettings({ serverUrl, authToken: 'synthetic-token', currentUser: user, autoSyncEnabled: false });
  store.setState({ projects, activeProjectId: projects[0]?.id || '', projectDeletionQueue: [], activeConflict: null,
    snapshotsByProject: {}, isSyncing: false, syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic catalog' }) });
}

async function run() {
  const oldFetch = globalThis.fetch;
  const originals = { pull: SyncService.pullProjects, push: SyncService.pushProjects, remove: SyncService.deleteProject };
  globalThis.fetch = async () => { throw new Error('Real network forbidden in deletion-outbox tests'); };
  try {
    const mapped = acknowledgeQueuedProjectDeletions([createProjectDeletion(project('old-id'), 'synthetic-scope'), createProjectDeletion(project('old-id'), 'other-scope')],
      [{ originalId: 'old-id', id: 'forked-id', status: 'forked', version: 7, project: project('forked-id', { version: 7, isDeleted: true }) }], 'synthetic-scope');
    assert(mapped[0].id === 'forked-id' && mapped[0].project?.id === 'forked-id' && mapped[0].baseVersion === 7 && mapped[0].stage === 'delete', 'Queued ACK must migrate identity and confirmed deletion stage');
    assert(mapped[1].id === 'old-id' && mapped[1].baseVersion === 1, 'Queued ACK must never mutate a foreign scope');
    // A document created offline with an account has never reached the server.
    const unsent = project('new-offline', { baseVersion: 0, syncStatus: 'pending' });
    reset([unsent]);
    const offline = mockServer([]);
    store.getState().moveToTrash(unsent.id);
    store.getState().hardDeleteProject(unsent.id);
    const durable = JSON.parse(JSON.stringify(serializeSimulationStore(store.getState())));
    assert(durable.projectDeletionQueue[0].project.isDeleted === true, 'Deletion snapshot must survive serialization');
    const offlineResult = await store.getState().syncProjectsWithServer(true);
    assert(offlineResult.success && offline.deleted.has(unsent.id), 'Unsent offline document must create trash then durable server tombstone');
    assert(offline.pushes[0][0].isDeleted, 'Creation for deletion must enter trash directly');
    assert(store.getState().projectDeletionQueue.length === 0, 'Confirmed offline deletion leaves no stuck command');

    // Local soft deletion is followed immediately by permanent deletion without a sync.
    const active = project('soft-offline');
    reset([active]);
    const soft = mockServer([active]);
    store.getState().moveToTrash(active.id);
    store.getState().hardDeleteProject(active.id);
    assert((await store.getState().syncProjectsWithServer(true)).success, 'Pending soft deletion must be confirmed before physical delete');
    assert(soft.deleted.has(active.id) && soft.deleteCalls() === 1, 'Physical delete uses the newly acknowledged trash version');

    // The create response arrives after the visible document was removed.
    const creating = project('create-in-flight', { baseVersion: 0, syncStatus: 'pending' });
    reset([creating]);
    const creation = mockServer([]);
    const createStarted = deferred<void>();
    const createRelease = deferred<void>();
    let firstCreate = true;
    SyncService.pushProjects = async (...args) => {
      if (firstCreate) { firstCreate = false; createStarted.resolve(); await createRelease.promise; }
      return creation.push(...args);
    };
    const creatingSync = store.getState().syncProjectsWithServer(true);
    await createStarted.promise;
    store.getState().hardDeleteProject(creating.id);
    createRelease.resolve();
    await creatingSync;
    const queuedCreate = store.getState().projectDeletionQueue[0];
    assert(queuedCreate.baseVersion === 1 && queuedCreate.stage === 'trash', 'Create ACK must update an invisible queued document');
    assert((await store.getState().syncProjectsWithServer(true)).success && creation.deleted.has(creating.id), 'Created-in-flight deletion must complete on next cycle');

    // The soft-delete response arrives after the permanent deletion intent.
    const softSource = project('soft-in-flight');
    reset([softSource]);
    const softFlight = mockServer([softSource]);
    store.getState().moveToTrash(softSource.id);
    const softStarted = deferred<void>();
    const softRelease = deferred<void>();
    let firstSoft = true;
    SyncService.pushProjects = async (...args) => {
      if (firstSoft) { firstSoft = false; softStarted.resolve(); await softRelease.promise; }
      return softFlight.push(...args);
    };
    const deletingSync = store.getState().syncProjectsWithServer(true);
    await softStarted.promise;
    store.getState().hardDeleteProject(softSource.id);
    softRelease.resolve();
    await deletingSync;
    const queuedSoft = store.getState().projectDeletionQueue[0];
    assert(queuedSoft.baseVersion === 2 && queuedSoft.stage === 'delete', 'Soft-delete ACK updates the invisible queued revision');
    assert((await store.getState().syncProjectsWithServer(true)).success && softFlight.deleted.has(softSource.id), 'Soft-delete-in-flight must delete exactly the confirmed version');

    // A teammate modified the remote document; retain a recoverable local copy and sync unrelated work.
    const stale = project('remote-conflict');
    const unrelated = project('unrelated', { baseVersion: 0, syncStatus: 'pending' });
    reset([stale, unrelated]);
    const conflictServer = mockServer([{ ...stale, version: 2, baseVersion: 2, client: { ...stale.client, name: 'Teammate revision' } }]);
    store.getState().hardDeleteProject(stale.id);
    const conflictResult = await store.getState().syncProjectsWithServer(true);
    assert(!conflictResult.success && conflictServer.deleteCalls() === 0, 'Stale deletion must not issue physical delete');
    assert(conflictServer.remote.get(stale.id)?.client.name === 'Teammate revision', 'Remote teammate work must remain unchanged');
    assert(store.getState().projects.find((item) => item.id === stale.id)?.syncStatus === 'conflict', 'Local snapshot must remain recoverable in trash');
    assert(store.getState().activeConflict?.projectId === stale.id, 'Deletion conflict must be resolvable');
    assert(store.getState().projectDeletionQueue.length === 0 && conflictServer.remote.has(unrelated.id), 'Conflict cannot block synchronization of other projects');

    // A transport failure leaves its snapshot durable but still allows unrelated pushes.
    const transportSource = project('transport-failure', { isDeleted: true });
    const pending = project('transport-unrelated', { baseVersion: 0, syncStatus: 'pending' });
    reset([transportSource, pending]);
    const transport = mockServer([transportSource]);
    SyncService.deleteProject = async () => false;
    store.getState().hardDeleteProject(transportSource.id);
    const transportResult = await store.getState().syncProjectsWithServer(true);
    assert(!transportResult.success && store.getState().projectDeletionQueue[0].project?.id === transportSource.id, 'Failed deletion remains durable');
    assert(transport.remote.has(pending.id), 'A failed deletion must not block other documents');
    console.log('✓ Project deletion outbox: offline creation, pending trash, create/soft ACK races, remote conflict and transport failure');
  } finally {
    globalThis.fetch = oldFetch;
    SyncService.pullProjects = originals.pull;
    SyncService.pushProjects = originals.push;
    SyncService.deleteProject = originals.remove;
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
