import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { reconcilePulledProjects } from '../store/sync/projectReconciliation';
import { createDeferredJSONStorage } from '../store/persistence/deferredStorage';
import { SyncService } from '../services/syncService';
import { CompanyService } from '../services/companyService';
import { ClientSyncService } from '../services/clientSyncService';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { flushSimulationStorePersistence, useSimulationStore } from '../store/useSimulationStore';

// The background sync runs every 15 s; an unchanged server must not invalidate every view.
const user = { id: 'qa-editor', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const serverUrl = 'https://qa.example.invalid';
const synced = { ...structuredClone(BENCHMARK_PROJECT), id: 'qa-document', organizationId: user.organizationId, syncServerUrl: serverUrl, version: 4, baseVersion: 4, syncStatus: 'synced' as const };
const serverCopy = structuredClone({ ...synced, syncStatus: undefined, baseVersion: undefined, syncServerUrl: undefined });
const local = [synced];
assert.equal(reconcilePulledProjects(local, [serverCopy], [], new Set(), serverUrl, user.organizationId), local, 'An identical pull keeps the projects array');
const edited = { ...serverCopy, version: 5, client: { ...serverCopy.client, name: 'Remote edit' } };
const changed = reconcilePulledProjects(local, [edited], [], new Set(), serverUrl, user.organizationId);
assert.notEqual(changed, local);
assert.equal(changed[0].client.name, 'Remote edit', 'A real server change still replaces the document');
assert.equal(changed[0].baseVersion, 5);

// Persisting serializes the whole workspace: writes are coalesced and skipped when nothing durable changed.
const writes: string[] = [];
const backing = new Map<string, string>();
const storage = createDeferredJSONStorage<{ projects: unknown[]; theme: string }>(() => ({
  getItem: key => backing.get(key) ?? null,
  setItem: (key, value) => { writes.push(value); backing.set(key, value); },
  removeItem: key => { backing.delete(key); },
}), 20);
const projects: unknown[] = [];
storage.setItem('qa', { state: { projects, theme: 'light' }, version: 0 });
storage.setItem('qa', { state: { projects, theme: 'dark' }, version: 0 });
assert.equal(writes.length, 0, 'set() never serializes synchronously');
assert.equal((storage.getItem('qa') as any).state.theme, 'dark', 'Reads see the pending value');
storage.flush();
assert.equal(writes.length, 1);
assert.equal(JSON.parse(writes[0]).state.theme, 'dark');
storage.setItem('qa', { state: { projects, theme: 'dark' }, version: 0 });
storage.flush();
assert.equal(writes.length, 1, 'Identical references are not serialized again');
storage.setItem('qa', { state: { projects: [1], theme: 'dark' }, version: 0 });
await new Promise(resolve => setTimeout(resolve, 40));
assert.equal(writes.length, 2, 'Pending writes flush on their own after the delay');

// End to end: two background syncs against an unchanged server keep every reference.
const initial = useSimulationStore.getState();
const original = { fetch: globalThis.fetch, pullProjects: SyncService.pullProjects, pushProjects: SyncService.pushProjects, pullEquipment: SyncService.pullEquipment, profile: CompanyService.profile, listClients: ClientSyncService.list };
try {
  const equipment = { ...structuredClone(DEFAULT_EQUIPMENT_CATALOG[0]), organizationId: user.organizationId, syncServerUrl: serverUrl, version: 2, baseVersion: 2 };
  const folder = { id: 'qa-folder', name: 'QA', organizationId: user.organizationId, version: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  globalThis.fetch = async url => {
    if (String(url).startsWith(`${serverUrl}/api/folders`)) return Response.json({ success: true, folders: [structuredClone(folder)], deletedIds: [] });
    throw new Error(`Unexpected request ${url}`);
  };
  const client = { id: 'qa-client', name: 'Cliente QA', organizationId: user.organizationId, version: 1, createdAt: '2026-01-01T00:00:00.000Z' };
  ClientSyncService.list = async () => ({ clients: [structuredClone(client)] as any, deletedIds: [] });
  SyncService.pullProjects = async () => ({ success: true, projects: [structuredClone(serverCopy)], deletedIds: [], serverTimestamp: '2026-10-22T00:00:00.000Z', count: 1 });
  SyncService.pushProjects = async () => { throw new Error('Nothing is pending'); };
  SyncService.pullEquipment = async () => ({ success: true, items: [structuredClone({ ...equipment, syncServerUrl: undefined, baseVersion: undefined })], deletedIds: [] });
  CompanyService.profile = async () => ({ success: true, organizationId: user.organizationId, version: 7, profile: { name: 'Shared QA' } });
  useSimulationStore.setState({
    syncSettings: { serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null },
    projects: [synced], equipmentCatalog: [equipment], equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, deletedEquipmentIds: [],
    folders: [], folderChanges: {}, folderDeletionQueue: [], clients: [], clientChanges: {}, clientDeletionQueue: [], projectDeletionQueue: [], projectConflicts: {}, isSyncing: false,
  });
  assert.equal((await initial.syncProjectsWithServer(true)).success, true);
  const first = useSimulationStore.getState();
  assert.equal((await initial.syncProjectsWithServer(true)).success, true);
  const second = useSimulationStore.getState();
  for (const key of ['projects', 'equipmentCatalog', 'equipmentConflicts', 'deletedEquipmentIds', 'folders', 'folderChanges', 'clients', 'clientChanges', 'companies', 'projectConflicts'] as const) {
    assert.equal(second[key], first[key], `An unchanged sync keeps ${key}`);
  }

  const persisted = useSimulationStore.persist.getOptions();
  flushSimulationStorePersistence();
  let serialized = 0;
  const stringify = JSON.stringify;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { serialized++; return stringify(...args); }) as typeof JSON.stringify;
  try {
    useSimulationStore.setState({ sidebarTheme: first.sidebarTheme === 'dark' ? 'light' : 'dark' });
    useSimulationStore.setState({ isSyncing: true });
    useSimulationStore.setState({ isSyncing: false });
    assert.equal(serialized, 0, 'The store does not serialize inside set()');
    flushSimulationStorePersistence();
    assert.equal(serialized, 1, 'Coalesced sets are serialized once');
  } finally {
    JSON.stringify = stringify;
  }
  assert.equal((persisted.storage!.getItem(persisted.name!) as any).state.sidebarTheme, useSimulationStore.getState().sidebarTheme);
} finally {
  globalThis.fetch = original.fetch;
  SyncService.pullProjects = original.pullProjects;
  SyncService.pushProjects = original.pushProjects;
  SyncService.pullEquipment = original.pullEquipment;
  CompanyService.profile = original.profile;
  ClientSyncService.list = original.listClients;
  useSimulationStore.setState(initial, true);
}

// Subscribing to the whole store re-renders a component on every set(), including sync bookkeeping.
const unscoped: string[] = [];
// Getters are stable functions: selecting one alone never re-renders when the data it reads changes.
const getterDependencies: Record<string, string[]> = {
  getActiveProject: ['projects', 'activeProjectId'],
  getFinancialSummary: ['projects', 'activeProjectId', 'energyMode'],
  getActiveCompany: ['companies', 'activeCompanyId'],
};
const staleGetters: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { if (file !== path.join('src', 'tests')) walk(file); continue; }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const source = readFileSync(file, 'utf8');
    if (/useSimulationStore\(\s*\)/.test(source)) unscoped.push(file);
    for (const selector of source.match(/useShallow\(\(s\) => \(\{.*?\}\)\)/g) ?? []) {
      for (const [getter, dependencies] of Object.entries(getterDependencies)) {
        if (!selector.includes(`${getter}: s.${getter}`)) continue;
        const missing = dependencies.filter(key => !selector.includes(`${key}: `));
        if (missing.length) staleGetters.push(`${file}: ${getter} without ${missing.join(', ')}`);
      }
    }
  }
};
walk('src');
assert.deepEqual(staleGetters, [], `Select the state a getter reads:\n${staleGetters.join('\n')}`);
assert.deepEqual(unscoped, [], `Components must select the slices they render:\n${unscoped.join('\n')}`);
console.log('Idle sync keeps references, persistence is coalesced and components subscribe to selected state.');
