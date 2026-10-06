import assert from 'node:assert/strict';
import { fetchWithSessionRetry, markTokenInvalid, clearInvalidToken, SyncService } from '../services/syncService';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';

async function runAuthInvalidationTests() {
  console.log('--- TEST 1: Token rechazado con 401 definitivo (rotación) frena bucle y limpia authToken sin tocar proyectos ---');
  const serverUrl = 'https://auth-test.solarsim.invalid';
  const oldToken = 'old-pre-rotation-token';
  const user = { id: 'usr-wilker', name: 'Wilker', email: 'wilker@example.invalid', role: 'ADMIN' as const, organizationId: 'org-electsun' };

  const testProject = { ...structuredClone(BENCHMARK_PROJECT), id: 'local-proj-1', client: { ...BENCHMARK_PROJECT.client, name: 'Proyecto Intacto' } };

  useSimulationStore.setState({
    syncSettings: {
      serverUrl,
      authToken: oldToken,
      currentUser: user,
      autoSyncEnabled: true,
      lastSyncTimestamp: null,
    },
    projects: [testProject],
    isSyncing: false,
    syncFeedbackMessage: null,
  });

  const originalFetch = globalThis.fetch;
  let refreshCallCount = 0;
  let pullCallCount = 0;

  try {
    // Simular que el servidor responde 401 en /api/sync/pull y 401 en /api/auth/refresh (secreto rotado)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        refreshCallCount++;
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/sync/pull')) {
        pullCallCount++;
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Primera sincronización: debe encontrar 401 en pull y 401 en refresh
    const result1 = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(result1.success, false, 'Sync con token antiguo debe fallar');
    assert.equal(refreshCallCount, 1, 'Debe intentar refresh exactamente una vez');
    assert.equal(pullCallCount, 1, 'Debe haber llamado a pull exactamente una vez');

    // Comprobar que el store detectó la invalidación y puso authToken en null
    const stateAfterInvalidation = useSimulationStore.getState();
    assert.equal(stateAfterInvalidation.syncSettings.authToken, null, 'authToken debe limpiarse a null tras 401 definitivo');
    assert.equal(stateAfterInvalidation.isSyncing, false, 'isSyncing debe quedar en false');
    assert.ok(stateAfterInvalidation.syncFeedbackMessage?.includes('expiró'), 'Feedback message debe advertir expiración');

    // Comprobar que los proyectos locales NO fueron eliminados ni modificados
    assert.equal(stateAfterInvalidation.projects.length, 1, 'Los proyectos locales deben preservarse al 100%');
    assert.equal(stateAfterInvalidation.projects[0].client.name, 'Proyecto Intacto');

    // Segunda llamada a sincronizar (ej. disparo de timer de 15s):
    // Como authToken es null, no debe disparar peticiones de red
    const result2 = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(result2.success, false);
    assert.equal(refreshCallCount, 1, 'No debe volver a llamar a refresh porque el token fue invalidado y no hay sesión activa');
    assert.equal(pullCallCount, 1, 'No debe volver a llamar a pull');

    console.log('✅ PASS: Bucle frenado inmediatamente, token limpiado y proyectos preservados.');

    console.log('--- TEST 2: Fallo temporal de red NO invalida la sesión ni borra authToken ---');
    const validSessionToken = 'valid-token-with-network-glitch';
    useSimulationStore.setState({
      syncSettings: {
        serverUrl,
        authToken: validSessionToken,
        currentUser: user,
        autoSyncEnabled: true,
        lastSyncTimestamp: null,
      },
    });

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/sync/pull')) {
        // Fallo de red (ej. timeout o desconexión de wifi)
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    const networkGlitchResult = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(networkGlitchResult.success, false);
    assert.equal(
      useSimulationStore.getState().syncSettings.authToken,
      validSessionToken,
      'Fallo de red transitorio NO debe eliminar authToken',
    );
    console.log('✅ PASS: Desconexión temporal no invalida la sesión.');

    console.log('--- TEST 3: Nuevo login limpia tokens marcados como inválidos y restaura acceso ---');
    markTokenInvalid(serverUrl, 'another-token');
    clearInvalidToken(serverUrl, 'another-token');

    let loginCalled = false;
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/login')) {
        loginCalled = true;
        return new Response(
          JSON.stringify({
            success: true,
            token: 'new-fresh-valid-token-2026',
            user: { ...user, name: 'Wilker Fresh' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/organization/features')) {
        return new Response(JSON.stringify({ settings: { selfConsumptionProjection: false }, version: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/sync/pull')) {
        return new Response(JSON.stringify({ success: true, projects: [], serverTimestamp: '2026-10-06T14:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/equipment')) {
        return new Response(JSON.stringify({ success: true, items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const loginResult = await useSimulationStore.getState().loginUser('wilker@example.invalid', 'password123');
    assert.equal(loginResult.success, true);
    assert.equal(loginCalled, true);
    assert.equal(useSimulationStore.getState().syncSettings.authToken, 'new-fresh-valid-token-2026');
    assert.equal(useSimulationStore.getState().syncSettings.currentUser?.name, 'Wilker Fresh');

    console.log('✅ PASS: Login exitoso restaura sesión fresca y limpia marcas de invalidación.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runAuthInvalidationTests().then(() => {
  console.log('🎉 Todas las pruebas de invalidación de autenticación y freno de bucles pasaron exitosamente.');
});
