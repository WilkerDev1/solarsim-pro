import assert from 'node:assert/strict';
import { ShareProposalService as service, STORAGE_SHARED_HISTORY_KEY, type SharedProposalRecord } from '../services/shareProposalService';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { featureScope } from '../../shared/applicationFeatures';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
  get length() { return storage.size; }, key: (index: number) => [...storage.keys()][index] ?? null,
} });
const initial = useSimulationStore.getState();
const originalFetch = globalThis.fetch;
const serverA = 'https://api-a.example.invalid';
const serverB = 'https://api-b.example.invalid';
let generation = initial.sessionGeneration;
function session(organizationId: string, serverUrl = serverA) {
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, serverUrl, authToken: 'synthetic-session',
    currentUser: { id: 'user-' + organizationId, name: 'Synthetic', email: 'qa@example.invalid', role: 'ADMIN', organizationId } }, sessionGeneration: ++generation,
    projects: [], featurePolicyRequest: null });
}
function record(id: string, overrides: Partial<SharedProposalRecord> = {}): SharedProposalRecord {
  return { id, projectId: 'same-project-id', projectCode: 'SP-SYNTHETIC', quoteNumber: 'C-0009', clientName: id,
    systemKWp: 5, workerUrl: 'https://share.example.invalid', shareUrl: `https://share.example.invalid/p/${id}`,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), validityDays: 1, ...overrides };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
try {
  session('org-a');
  service.saveSharedRecord(record('proposal-a'));
  const keyA = service.getHistoryScopeKey()!;
  assert.equal(service.getLastSharedInfo('same-project-id')?.id, 'proposal-a');
  session('org-b');
  assert.deepEqual(service.getSharedHistory(), [], 'A links must never appear under B');
  assert.equal(service.getLastSharedInfo('same-project-id'), null, 'Identical project IDs do not share a cache');
  service.saveSharedRecord(record('proposal-b'));
  const keyB = service.getHistoryScopeKey()!;
  assert.notEqual(keyA, keyB);
  session('org-a');
  assert.deepEqual(service.getSharedHistory().map((r) => r.id), ['proposal-a'], 'A history returns intact');
  session('org-a', serverB);
  assert.deepEqual(service.getSharedHistory(), [], 'Organizations with equal IDs on distinct servers remain isolated');
  session('org-a', ' HTTPS://API-A.EXAMPLE.INVALID:443/ ');
  assert.equal(service.getHistoryScopeKey(), keyA, 'Host casing, default port and trailing slash canonicalize');
  assert.equal(service.getSharedHistory().length, 1);

  const legacy = record('legacy-unassigned');
  storage.set(STORAGE_SHARED_HISTORY_KEY, JSON.stringify([legacy]));
  storage.set('solarsim_last_share_same-project-id', JSON.stringify({ ...legacy, savedAt: legacy.createdAt }));
  assert.equal(service.hasQuarantinedLegacyHistory(), true);
  session('new-org');
  assert.deepEqual(service.getSharedHistory(), [], 'A matching project ID cannot establish historical ownership');
  assert.equal(storage.get(STORAGE_SHARED_HISTORY_KEY), JSON.stringify([legacy]), 'Unscoped history remains recoverable');
  assert.ok(storage.has('solarsim_last_share_same-project-id'));

  const scopedLegacy = record('legacy-owned', { serverUrl: serverA, organizationId: 'legacy-org' });
  storage.set(STORAGE_SHARED_HISTORY_KEY, JSON.stringify([legacy, scopedLegacy]));
  session('legacy-org');
  assert.deepEqual(service.getSharedHistory().map((r) => r.id), ['legacy-owned'], 'Only explicit source and organization migrate');
  service.deleteSharedRecord('legacy-owned');
  assert.deepEqual(service.getSharedHistory(), [], 'Migrated legacy does not reappear after deletion');
  assert.ok(storage.get(STORAGE_SHARED_HISTORY_KEY)?.includes('legacy-unassigned'));

  session('org-a');
  const placeholder = record('late-hydration', { clientName: 'Propuesta Solar', projectCode: 'same-project-id', quoteNumber: 'C-0001', systemKWp: 0 });
  service.saveSharedRecord(placeholder);
  const response = deferred<Response>();
  globalThis.fetch = async () => response.promise;
  const hydration = service.hydrateFromCloudflare();
  session('org-b');
  const beforeB = storage.get(keyB);
  response.resolve(Response.json({ success: true, proposals: [{ id: 'late-hydration', clientName: 'Confidential A', systemKWp: 6 }] }));
  assert.equal((await hydration).updatedCount, 0);
  assert.equal(storage.get(keyB), beforeB, 'Late hydration never mutates B');
  session('org-a');
  assert.equal(service.getSharedHistory().find((r) => r.id === 'late-hydration')?.clientName, 'Propuesta Solar');

  const backResponse = deferred<Response>();
  globalThis.fetch = async () => backResponse.promise;
  const backHydration = service.hydrateFromCloudflare();
  session('org-b'); session('org-a');
  backResponse.resolve(Response.json({ success: true, proposals: [{ id: 'late-hydration', clientName: 'Stale A' }] }));
  assert.equal((await backHydration).updatedCount, 0, 'A→B→A rejects the previous session result');

  const concurrent = deferred<Response>();
  globalThis.fetch = async () => concurrent.promise;
  const pending = service.hydrateFromCloudflare();
  service.deleteSharedRecord('late-hydration');
  service.saveSharedRecord(record('newer-publication'));
  concurrent.resolve(Response.json({ success: true, proposals: [{ id: 'late-hydration', clientName: 'Deleted A' }] }));
  await pending;
  assert.ok(!service.getSharedHistory().some((r) => r.id === 'late-hydration'), 'Hydration cannot resurrect a deleted record');
  assert.ok(service.getSharedHistory().some((r) => r.id === 'newer-publication'), 'Hydration cannot overwrite concurrently saved history');

  // Production-like publication response arriving after a scope change must not escape through its caller or cache.
  const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'synthetic-project', organizationId: 'org-a', syncServerUrl: serverA };
  const scope = featureScope(serverA, 'org-a');
  useSimulationStore.setState({ projects: [project], loadOrganizationFeaturePolicy: async () => {}, organizationFeaturePolicies: {
    [scope]: { organizationId: 'org-a', version: 1, settings: { selfConsumptionProjection: false } },
  } });
  const publishResponse = deferred<Response>();
  const started = deferred<void>();
  globalThis.fetch = async () => { started.resolve(); return publishResponse.promise; };
  const publishing = service.shareProposal(project, calculateProjectFinancialSummary(project), 7, 'https://share.example.invalid');
  await started.promise;
  session('org-b');
  publishResponse.resolve(Response.json({ success: true, id: 'publication-late', shareUrl: 'https://share.example.invalid/p/publication-late' }));
  const published = await publishing;
  assert.equal(published.success, false);
  assert.equal(published.shareUrl, undefined);
  assert.equal(service.getLastSharedInfo(project.id), null);

  session('org-a');
  for (const suppliedUrl of ['http://share.example.invalid/p/confirmed-publication', 'https://unrelated.example.invalid/p/confirmed-publication', 'javascript:alert(1)']) {
    globalThis.fetch = async () => Response.json({ success: true, id: 'confirmed-publication', shareUrl: suppliedUrl });
    const canonical = await service.shareProposal(project, calculateProjectFinancialSummary(project), 7, 'https://share.example.invalid');
    assert.equal(canonical.success, true);
    assert.equal(canonical.shareUrl, 'https://share.example.invalid/p/confirmed-publication');
    assert.equal(service.getLastSharedInfo(project.id)?.shareUrl, canonical.shareUrl);
  }

  session('batch-org');
  for (let index = 0; index < 51; index++) service.saveSharedRecord(record(`batch-${index}`, { clientName: 'Propuesta Solar' }));
  const batchSizes: number[] = [];
  globalThis.fetch = async (_url, init) => {
    const ids = JSON.parse(String(init?.body)).ids as string[];
    batchSizes.push(ids.length);
    return Response.json({ success: true, proposals: ids.flatMap((id) => [{ id, clientName: `Hydrated ${id}` }, { id, clientName: 'Duplicate must be ignored' }]) });
  };
  assert.deepEqual(await service.hydrateFromCloudflare(), { updatedCount: 51, errors: 0 });
  assert.deepEqual(batchSizes, [50, 1], 'Worker hydration contract permits at most fifty IDs per batch');
  assert.ok(service.getSharedHistory().every((entry) => entry.clientName !== 'Duplicate must be ignored'));
  session('org-b');
  service.clearAllSharedRecords();
  session('org-a');
  assert.ok(service.getSharedHistory().some((r) => r.id === 'newer-publication'), 'Clearing B retains A history');
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null }, sessionGeneration: ++generation });
  assert.deepEqual(service.getSharedHistory(), [], 'Logged-out UI cannot expose authenticated history');
  console.log('Scoped share history, legacy quarantine, late hydration, deletion and publication regressions passed.');
} finally { globalThis.fetch = originalFetch; useSimulationStore.setState(initial, true); }
