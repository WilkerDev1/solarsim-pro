import assert from 'node:assert/strict';
import { SyncService, clearInvalidToken, fetchWithSessionRetry, markTokenInvalid, notifySessionInvalidated, registerSessionInvalidatedListener } from '../services/syncService';
import { useSimulationStore } from '../store/useSimulationStore';
import { featureScope } from '../../shared/applicationFeatures';

const serverUrl = 'https://auth-boundaries.example.invalid';
const user = { id: 'qa-user', name: 'QA', email: 'qa@example.invalid', organizationId: 'qa-org', role: 'ADMIN' as const };
const originalFetch = globalThis.fetch;
const originalLogin = SyncService.login;
const originalState = useSimulationStore.getState();
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reset = (token: string) => useSimulationStore.setState({
  syncSettings: { serverUrl, authToken: token, currentUser: user, autoSyncEnabled: false, lastSyncTimestamp: null },
  workspaceScope: featureScope(serverUrl, user.organizationId),
  loadOrganizationFeaturePolicy: async () => undefined,
  syncProjectsWithServer: async () => ({ success: true, message: 'QA only' }),
});
try {
  for (const scenario of ['network', '500', 'malformed', 'refresh-outage'] as const) {
    reset(`transient-${scenario}`);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (scenario === 'network') throw new TypeError('Synthetic network outage');
      if (scenario === '500') return reply(500, {});
      if (scenario === 'malformed') return reply(200, { success: true, user: {} });
      return reply(calls === 1 ? 401 : 503, {});
    };
    const before = useSimulationStore.getState();
    const result = await before.validateSession();
    assert.equal(result.valid, false);
    const after = useSimulationStore.getState();
    assert.equal(after.syncSettings.authToken, before.syncSettings.authToken, scenario);
    assert.equal(after.workspaceScope, before.workspaceScope);
    assert.equal(after.sessionGeneration, before.sessionGeneration);
    assert.equal(calls, scenario === 'refresh-outage' ? 2 : 1);
  }
  reset('valid-lector');
  globalThis.fetch = async () => reply(200, { success: true, user: { ...user, role: 'LECTOR' } });
  assert.equal((await useSimulationStore.getState().validateSession()).valid, true);

  // These distinct strings collided in the former FNV32 registry.
  const first = 'synthetic.jwt.19t9wk2.ba1ufd.1uo2yhg.1ulugdf.ly6ova.';
  const second = 'synthetic.jwt.ik6f4r.1had2ny.9d5f5x.1k5pr4w.ad81a7.';
  await markTokenInvalid(serverUrl, first);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return reply(200, { success: true }); };
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { headers: { Authorization: `Bearer ${second}` } })).status, 200);
  assert.equal(calls, 1);
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { headers: { Authorization: `Bearer ${first}` } })).status, 401);
  assert.equal(calls, 1);
  await clearInvalidToken(serverUrl, first);

  reset('before-login');
  let resolveLogin!: (value: Awaited<ReturnType<typeof SyncService.login>>) => void;
  SyncService.login = async () => new Promise(resolve => { resolveLogin = resolve; });
  const login = useSimulationStore.getState().loginUser(user.email, 'literal password ');
  notifySessionInvalidated({ serverUrl, token: 'before-login' });
  resolveLogin({ success: true, token: 'after-login', user });
  assert.equal((await login).success, true, 'Previous token rejection must not cancel a newer login');
  assert.equal(useSimulationStore.getState().syncSettings.authToken, 'after-login');

  reset('retry-start');
  calls = 0;
  let invalidations = 0;
  const unsubscribe = registerSessionInvalidatedListener(origin => {
    if (origin.token === 'retry-renewed') invalidations++;
  });
  globalThis.fetch = async () => {
    calls++;
    return calls === 2 ? reply(200, { success: true, token: 'retry-renewed' }) : reply(401, {});
  };
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/auth/me`, { headers: { Authorization: 'Bearer retry-start' } })).status, 401);
  assert.equal(calls, 3);
  assert.equal(invalidations, 1);
  assert.equal(useSimulationStore.getState().syncSettings.authToken, null);
  await fetchWithSessionRetry(`${serverUrl}/api/auth/me`, { headers: { Authorization: 'Bearer retry-renewed' } });
  assert.equal(calls, 3, 'Terminal token rejection must stop future refresh loops');
  unsubscribe();
  console.log('PASS: transient verification, SHA-256 token isolation, pending login and terminal retry rejection.');
} finally {
  globalThis.fetch = originalFetch;
  SyncService.login = originalLogin;
  useSimulationStore.setState(originalState, true);
}
