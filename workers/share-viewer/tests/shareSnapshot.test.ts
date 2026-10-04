import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { featureScope } from '../../../shared/applicationFeatures';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, configurable: true });
async function main() {
  const { useSimulationStore } = await import('../../../src/store/useSimulationStore');
  const { ShareProposalService } = await import('../../../src/services/shareProposalService');
  const originalGetState = useSimulationStore.getState;
  const originalFetch = globalThis.fetch;
  const session = { serverUrl: 'https://solarsim.electsun.net', authToken: 'mock-session', currentUser: { id: 'mock-user', role: 'ADMIN' as const, organizationId: 'mock-org', name: 'Usuario', email: 'local@test.invalid' }, autoSyncEnabled: false, lastSyncTimestamp: null };
  let state = {
    ...originalGetState(), syncSettings: session,
    localFeatureSettings: { selfConsumptionProjection: true },
    organizationFeaturePolicies: { [featureScope(session.serverUrl, 'mock-org')]: { organizationId: 'mock-org', version: 4, settings: { selfConsumptionProjection: false } } },
    featurePolicyRequest: { scope: featureScope(session.serverUrl, 'mock-org'), status: 'ready' as const },
    loadOrganizationFeaturePolicy: async () => {},
  };
  useSimulationStore.getState = () => state;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://propuesta.electsun.net/api/share');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer mock-session');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.calculationSnapshot, { mode: 'legacy', organizationId: 'mock-org', policyVersion: 4, capturedAt: body.calculationSnapshot.capturedAt });
    assert.deepEqual(body.summary, calculateProjectFinancialSummary(BENCHMARK_PROJECT, 'legacy'));
    return Response.json({ success: true, id: 'abcdef1234567890abcdef1234567890', shareUrl: 'https://propuesta.electsun.net/p/abcdef1234567890abcdef1234567890', validityDays: 7, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  };
  try {
    // Even a stale caller preview must publish a coherent snapshot in the confirmed organization mode.
    const result = await ShareProposalService.shareProposal(BENCHMARK_PROJECT, calculateProjectFinancialSummary(BENCHMARK_PROJECT, 'self_consumption'));
    assert.equal(result.success, true, result.error);
    assert.equal(calls, 1);
    state = { ...state, syncSettings: { ...session, currentUser: { ...session.currentUser, role: 'LECTOR' as never } } };
    assert.equal((await ShareProposalService.shareProposal(BENCHMARK_PROJECT, calculateProjectFinancialSummary(BENCHMARK_PROJECT))).success, false);
    state = { ...state, syncSettings: { ...session, authToken: null as never } };
    assert.equal((await ShareProposalService.shareProposal(BENCHMARK_PROJECT, calculateProjectFinancialSummary(BENCHMARK_PROJECT))).success, false);
    state = { ...state, syncSettings: session };
    assert.equal((await ShareProposalService.shareProposal(BENCHMARK_PROJECT, calculateProjectFinancialSummary(BENCHMARK_PROJECT), 7, 'http://test.invalid')).success, false);
    state = { ...state, loadOrganizationFeaturePolicy: async () => { state = { ...state, syncSettings: { ...session, currentUser: { ...session.currentUser, organizationId: 'other-org' } } }; } };
    assert.equal((await ShareProposalService.shareProposal(BENCHMARK_PROJECT, calculateProjectFinancialSummary(BENCHMARK_PROJECT))).success, false);
    assert.equal(calls, 1);
    console.log('PASS: servicio publica resumen y política coherentes; bloquea lector, sin sesión, HTTP y cambio de organización.');
  } finally {
    useSimulationStore.getState = originalGetState;
    globalThis.fetch = originalFetch;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
