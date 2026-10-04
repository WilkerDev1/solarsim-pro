import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { acknowledgeProjectPush, reconcilePulledProjects } from '../store/sync/projectReconciliation';
import { restoreProjectContent } from '../store/sync/projectMutation';
import { fetchWithSessionRetry, SyncService } from '../services/syncService';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';

const user = { id: 'qa-editor', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const serverUrl = 'https://qa.example.invalid';
const session = { serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null };
const confirmed = { ...structuredClone(BENCHMARK_PROJECT), id: 'qa-document', organizationId: user.organizationId, syncServerUrl: serverUrl, version: 4, baseVersion: 4, syncStatus: 'synced' as const };
const local = { ...confirmed, client: { ...confirmed.client, name: 'Local edit' }, syncStatus: 'pending' as const };
const remote = { ...confirmed, client: { ...confirmed.client, name: 'Remote edit' }, version: 5, baseVersion: 5 };
assert.equal(reconcilePulledProjects([local], [remote], [], new Set(), serverUrl, user.organizationId)[0].baseVersion, 4, 'Pull never rebases unconfirmed local edits silently');
assert.equal(reconcilePulledProjects([confirmed], [remote], [], new Set(), serverUrl + '/', user.organizationId)[0].client.name, 'Remote edit');
assert.equal(reconcilePulledProjects([confirmed], [], ['qa-document'], new Set(), serverUrl, user.organizationId).length, 0, 'Tombstone prevents resurrection');
const otherTenant = { ...local, organizationId: 'other-org' };
assert.equal(reconcilePulledProjects([otherTenant], [remote], [], new Set(), serverUrl, user.organizationId)[0], otherTenant);
const unscoped = { ...local, organizationId: undefined, syncStatus: 'local_only' as const };
assert.equal(reconcilePulledProjects([unscoped], [remote], [], new Set(), serverUrl, user.organizationId)[0].organizationId, undefined);
const newerEdit = { ...local, client: { ...local.client, name: 'Edited during push' } };
const ack = [{ id: local.id, status: 'updated' as const, version: 5, project: remote }];
let reconciled = acknowledgeProjectPush([newerEdit], [local], ack, serverUrl, user.organizationId).projects[0];
assert.equal(reconciled.client.name, 'Edited during push');
assert.equal(reconciled.baseVersion, 5);
assert.equal(reconciled.syncStatus, 'pending');
reconciled = acknowledgeProjectPush([local], [local], [{ id: local.id, status: 'conflict', serverVersion: 5, serverProject: remote }], serverUrl, user.organizationId).projects[0];
assert.equal(reconciled.syncStatus, 'conflict');
assert.equal(reconciled.client.name, 'Local edit');
const restored = restoreProjectContent(confirmed, { ...local, version: 1, baseVersion: 1 }, session);
assert.equal(restored.baseVersion, 4, 'Undo restores content while preserving confirmed transport version');

const initial = useSimulationStore.getState();
const originalFetch = globalThis.fetch;
const pullProjects = SyncService.pullProjects;
const pushProjects = SyncService.pushProjects;
const pullEquipment = SyncService.pullEquipment;
const pushEquipment = SyncService.pushEquipmentBatch;
try {
  useSimulationStore.setState({ syncSettings: session, projects: [local], equipmentCatalog: [], equipmentChanges: {}, projectDeletionQueue: [], equipmentDeletionQueue: [], isSyncing: false });
  SyncService.pullProjects = async () => ({ success: false, error: 'Network unavailable' });
  const failure = await initial.syncProjectsWithServer(true);
  assert.equal(failure.success, false);
  assert.equal(useSimulationStore.getState().syncSettings.lastSyncTimestamp, null);
  assert.equal(useSimulationStore.getState().projects[0].syncStatus, 'pending');

  let completePull!: (value: any) => void;
  SyncService.pullProjects = () => new Promise(resolve => { completePull = resolve; });
  const pending = initial.syncProjectsWithServer(true);
  initial.logoutUser();
  initial.setSyncSettings(session);
  completePull({ success: true, projects: [remote], serverTimestamp: '2030-01-01T00:00:00.123456Z' });
  assert.equal((await pending).success, false, 'Logout and same-account login invalidates old requests');
  assert.equal(useSimulationStore.getState().projects[0].client.name, 'Local edit');
  assert.equal(useSimulationStore.getState().isSyncing, false);

  const equipment = { ...structuredClone(DEFAULT_EQUIPMENT_CATALOG[0]), organizationId: user.organizationId, baseVersion: 1, version: 1 };
  useSimulationStore.setState({ equipmentCatalog: [equipment], equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {} });
  SyncService.pullEquipment = async () => ({ success: true, items: [] });
  let pushed: any[] = [];
  SyncService.pushEquipmentBatch = async (_server, _token, items) => { pushed = items; return { success: true, results: items.map(item => ({ id: item.id, status: 'updated', version: 2, item: { ...item, version: 2 } })) }; };
  initial.addEquipmentItem({ ...equipment, displayName: 'Edited catalog item' });
  assert.equal((await initial.syncEquipmentWithServer()).success, true);
  assert.equal(pushed.length, 1, 'Only dirty equipment is sent');
  assert.equal(useSimulationStore.getState().equipmentChanges[equipment.id], undefined);
  assert.equal(useSimulationStore.getState().equipmentCatalog[0].baseVersion, 2);

  useSimulationStore.setState({ syncSettings: { ...session, currentUser: { ...user, role: 'VIEWER' } } });
  pushed = [];
  assert.equal((await initial.syncEquipmentWithServer()).success, true, 'Viewer can pull the catalog');
  assert.equal(pushed.length, 0);

  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/refresh')) return Response.json({ success: true, token: 'renewed' });
    return new Headers(init?.headers).get('Authorization') === 'Bearer renewed' ? Response.json({ success: true }) : new Response('', { status: 401 });
  };
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/test`, { headers: { Authorization: 'Bearer expired' } })).status, 200);
  assert.equal(calls.length, 3, '401 renews once then retries once');
  calls.length = 0;
  globalThis.fetch = async url => { calls.push(String(url)); return new Response('', { status: 403 }); };
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/test`, { headers: { Authorization: 'Bearer forbidden' } })).status, 403);
  assert.equal(calls.length, 1, '403 is never refreshed');
  globalThis.fetch = async () => Response.json({ success: true, results: [{ id: 'qa-document', status: 'synced' }] });
  SyncService.pushProjects = pushProjects;
  assert.equal((await SyncService.pushProjects(serverUrl, 'synthetic', [local])).success, false, 'Old or malformed ACK cannot mark a project synchronized');
} finally {
  globalThis.fetch = originalFetch;
  SyncService.pullProjects = pullProjects;
  SyncService.pushProjects = pushProjects;
  SyncService.pullEquipment = pullEquipment;
  SyncService.pushEquipmentBatch = pushEquipment;
  useSimulationStore.setState(initial, true);
}
console.log('Client reconciliation, session boundaries, catalog dirtiness and bounded renewal passed.');
