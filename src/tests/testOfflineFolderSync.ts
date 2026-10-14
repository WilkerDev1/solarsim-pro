import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { projectDifferences } from '../store/sync/projectDifferences';
import { acknowledgeProjectPush, reconcilePulledProjects } from '../store/sync/projectReconciliation';
import type { ProjectFolder, ProjectSimulation } from '../types';

const serverUrl = 'https://offline-folders.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'qa-org' };
const folder: ProjectFolder = { id: 'shared', name: 'Vendidas', hideFromGeneral: true, visibility: 'public', organizationId: user.organizationId, createdById: user.id, createdAt: '2026-10-01', version: 1, baseVersion: 1 };
let remote: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), id: 'offline-proposal', folderId: folder.id, organizationId: user.organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1, syncStatus: 'synced' };
const original = store.getState();
const originalFetch = globalThis.fetch;
let online = true;
let pushes = 0;
const json = (value: unknown, status = 200) => Response.json(value, { status });
try {
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).startsWith(serverUrl), 'Only synthetic transport');
    if (!online) throw new Error('Sin conexión');
    if (String(input).endsWith('/api/folders')) return json({ success: true, folders: [folder], deletedIds: [] });
    if (String(input).endsWith('/api/sync/pull')) return json({ success: true, projects: [remote], deletedIds: [] });
    if (String(input).endsWith('/api/sync/push')) {
      pushes++;
      const submitted = JSON.parse(String(init?.body)).projects[0];
      if (submitted.baseVersion !== remote.version) return json({ success: true, results: [{ id: remote.id, status: 'conflict', reason: 'version_conflict', serverVersion: remote.version, serverProject: remote }] });
      remote = { ...submitted, version: remote.version! + 1, baseVersion: remote.version! + 1, syncStatus: 'synced' };
      return json({ success: true, results: [{ id: remote.id, status: 'updated', version: remote.version, project: remote }] });
    }
    throw new Error(`Unexpected request: ${input}`);
  };
  store.getState().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  store.setState({ projects: [], folders: [], folderChanges: {}, folderDeletionQueue: [], projectConflicts: {}, syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic' }), syncOrganizationCompanyProfile: async () => ({ success: true }) });
  assert.equal((await store.getState().syncProjectsWithServer()).success, true);
  assert.equal(store.getState().folders[0].hideFromGeneral, true);
  online = false;
  // Exercise the actual Zustand storage round trip, not just partialize's return value.
  await store.persist.rehydrate();
  assert.equal(store.getState().folders[0].id, folder.id);
  assert.equal(store.getState().projects[0].folderId, folder.id);
  assert.equal((await store.getState().syncProjectsWithServer()).success, false);
  assert.equal(store.getState().folders[0].hideFromGeneral, true);
  assert.equal(store.getState().projects[0].folderId, folder.id);
  store.getState().setSyncSettings({ authToken: null });
  store.getState().setSyncSettings({ autoSyncEnabled: false });
  assert.equal(store.getState().folders[0].id, folder.id, 'Expired token cannot switch to an empty local workspace');
  assert.equal(store.getState().projects[0].folderId, folder.id);
  store.getState().setSyncSettings({ authToken: 'synthetic' });
  store.getState().moveProjectToFolder(remote.id, null);
  await store.persist.rehydrate();
  assert.equal(store.getState().projects[0].syncStatus, 'pending');
  online = true;
  assert.equal((await store.getState().syncProjectsWithServer()).success, true);
  assert.equal(pushes, 1, 'A folder-only edit must reach the server');
  assert.equal(remote.folderId, undefined);
  remote = { ...remote, folderId: folder.id, version: 3, baseVersion: 3 };
  await store.getState().syncProjectsWithServer();
  assert.equal(store.getState().projects[0].folderId, folder.id, 'Remote moves propagate to another device');
  const base = store.getState().projects[0];
  const moved = { ...base, folderId: undefined, syncStatus: 'pending' as const };
  assert.ok(projectDifferences(base, moved).some(diff => diff.field === 'Carpeta'));
  assert.equal(reconcilePulledProjects([moved], [base], [], new Set(), serverUrl, user.organizationId)[0].syncStatus, 'pending');
  const withoutFolder = { ...base, folderId: undefined, version: 4, baseVersion: 4 };
  assert.equal(reconcilePulledProjects([base], [withoutFolder], [], new Set(), serverUrl, user.organizationId)[0].folderId, undefined);
  assert.equal(acknowledgeProjectPush([base], [base], [{ id: base.id, status: 'updated', version: 4, project: JSON.parse(JSON.stringify(withoutFolder)) }], serverUrl, user.organizationId).projects[0].folderId, undefined);
  // A cloud choice must restore the full canonical document, including its folder.
  store.setState({ projects: [{ ...moved, syncStatus: 'conflict' }], activeConflict: null });
  store.getState().setActiveConflict({ projectId: base.id, localProject: moved, serverProject: base, localVersion: 2, serverVersion: 3, lastModifiedByName: 'QA', lastModifiedAt: '', diffs: projectDifferences(base, moved) });
  store.getState().resolveConflict('accept_server');
  assert.equal(store.getState().projects[0].folderId, folder.id);
  assert.equal(store.getState().snapshotsByProject[base.id][0].data.folderId, undefined);
  // Two writers moving/editing the same proposal cannot bypass CAS after resolution.
  store.setState({ projects: [{ ...base, folderId: undefined, syncStatus: 'pending' }] });
  remote = { ...base, client: { ...base.client, name: 'Otro miembro' }, version: 4, baseVersion: 4 };
  assert.equal((await store.getState().syncProjectsWithServer()).success, false);
  assert.equal(store.getState().projects[0].folderId, undefined);
  assert.equal(store.getState().activeConflict?.serverVersion, 4);
  store.getState().resolveConflict('keep_local');
  assert.equal(store.getState().projects[0].baseVersion, 4);
  remote = { ...remote, version: 5, baseVersion: 5 };
  assert.equal((await store.getState().syncProjectsWithServer()).success, false);
  assert.equal(remote.client.name, 'Otro miembro', 'A later cloud edit is never overwritten blindly');
  assert.equal(store.getState().projects[0].folderId, undefined);
  assert.equal(store.getState().activeConflict?.serverVersion, 5);
  store.getState().resolveConflict('accept_server');
  assert.equal(store.getState().projects[0].client.name, remote.client.name);
  // A folder outage cannot be reported as complete just because projects downloaded.
  const syncFolders = store.getState().syncFoldersWithServer;
  store.setState({ syncFoldersWithServer: async () => ({ success: false, message: 'Carpetas sin conexión' }) });
  assert.equal((await store.getState().syncProjectsWithServer()).success, false);
  store.setState({ syncFoldersWithServer: syncFolders });
  // Persisted conflicts remain pending on later syncs without another push.
  store.setState({ projects: [{ ...base, client: { ...base.client, name: 'Divergente' }, syncStatus: 'conflict' }] });
  assert.equal((await store.getState().syncProjectsWithServer()).success, false);
  assert.match(store.getState().syncFeedbackMessage!, /conflictos/);
  // Lost folder creation receipt: divergence stays reviewable instead of being discarded.
  store.setState({ folders: [{ ...folder, name: 'Edición offline', version: undefined, baseVersion: 0 }], folderChanges: { [folder.id]: { revision: 'offline', ownerId: user.id, baseVersion: 0 } } });
  assert.equal((await store.getState().syncFoldersWithServer()).success, false);
  assert.equal(store.getState().folders[0].name, 'Edición offline');
  assert.equal(store.getState().folderChanges[folder.id].serverFolder?.name, folder.name);
  store.getState().resolveFolderConflict(folder.id, 'accept_server');
  store.setState({ folderChanges: { [folder.id]: { revision: 'lost-receipt', ownerId: user.id, baseVersion: 0 } } });
  assert.equal((await store.getState().syncFoldersWithServer()).success, true);
  assert.equal(store.getState().folderChanges[folder.id], undefined);
  console.log('✓ Offline reload, expired token, reconnect, folder-only push, canonical cloud choice and lost folder ACK recovery');
} finally {
  globalThis.fetch = originalFetch;
  store.setState(original, true);
}
