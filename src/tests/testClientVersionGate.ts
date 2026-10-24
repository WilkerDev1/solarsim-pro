import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import pkg from '../../package.json';
import { SyncService, fetchWithSessionRetry } from '../services/syncService';
import { CLIENT_IDENTITY_VALUE, CLIENT_VERSION } from '../services/clientIdentity';
import { getClientOutdated, isServerBlocked, resetClientOutdated, subscribeClientOutdated } from '../services/clientVersionGate';
import { ClientOutdatedNoticeView } from '../components/common/ClientOutdatedNotice';
import { useSimulationStore } from '../store/useSimulationStore';

const serverUrl = 'https://gate.example.invalid';
const workerUrl = 'https://worker.example.invalid';
const original = { fetch: globalThis.fetch };
const initial = useSimulationStore.getState();
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const outdated = () => reply(426, { error: 'client_outdated', minVersion: '9.9.9', message: 'Actualiza SolarSim a la versión 9.9.9 o superior para seguir sincronizando.' });
const headerOf = (init: RequestInit | undefined) => new Headers(init?.headers).get('X-SolarSim-Client');

try {
  // El encabezado sale de package.json: desktop/<versión>.
  assert.equal(CLIENT_VERSION, pkg.version);
  assert.equal(CLIENT_IDENTITY_VALUE, `desktop/${pkg.version}`);

  // Toda solicitud a la API lleva la identidad del cliente, incluidas las de sesión y la reintentada tras renovar.
  const seen: { url: string; client: string | null }[] = [];
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), client: headerOf(init) }); return reply(200, { success: true }); };
  await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { method: 'POST', headers: { Authorization: 'Bearer a' } });
  await fetchWithSessionRetry(`${serverUrl}/api/health`);
  assert.deepEqual(seen.map(s => s.client), [CLIENT_IDENTITY_VALUE, CLIENT_IDENTITY_VALUE]);
  seen.length = 0;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), client: headerOf(init) });
    return ++calls === 2 ? reply(200, { success: true, token: 'renewed' }) : calls === 1 ? reply(401, {}) : reply(200, { success: true });
  };
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { headers: { Authorization: 'Bearer old' } })).status, 200);
  assert.equal(seen.length, 3);
  assert.ok(seen.every(s => s.client === CLIENT_IDENTITY_VALUE), 'solicitud, renovación y reintento');
  // Las solicitudes al Worker (otro origen que la API de sesión) no llevan el encabezado ni se bloquean.
  seen.length = 0;
  await fetchWithSessionRetry(`${workerUrl}/api/share/history`, { headers: { Authorization: 'Bearer a' } }, serverUrl);
  assert.equal(seen[0].client, null);

  // Un 426 client_outdated deja el aviso, conserva el mensaje en español y detiene los reintentos de datos.
  resetClientOutdated();
  let notified = 0;
  const unsubscribe = subscribeClientOutdated(() => notified++);
  calls = 0;
  globalThis.fetch = async () => { calls++; return outdated(); };
  const first = await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { method: 'POST', headers: { Authorization: 'Bearer a' } });
  assert.equal(first.status, 426);
  const firstBody = await first.json();
  assert.equal(firstBody.success, false);
  assert.equal(firstBody.error, 'Actualiza SolarSim a la versión 9.9.9 o superior para seguir sincronizando.');
  assert.equal(firstBody.minVersion, '9.9.9');
  assert.deepEqual(getClientOutdated(), { serverUrl, minVersion: '9.9.9' });
  assert.equal(notified, 1);
  assert.equal(isServerBlocked(serverUrl), true);
  assert.equal(calls, 1);
  for (const path of ['/api/sync/pull', '/api/sync/push', '/api/folders', '/api/clients', '/api/equipment']) {
    const blocked = await fetchWithSessionRetry(`${serverUrl}${path}`, { method: 'POST', headers: { Authorization: 'Bearer a' } });
    assert.equal(blocked.status, 426, path);
    assert.equal((await blocked.json()).minVersion, '9.9.9');
  }
  assert.equal(calls, 1, 'tras el 426 no se vuelve a llamar a la red para datos');
  // Sesión y salud siguen abiertas; otro servidor y el Worker no se bloquean.
  globalThis.fetch = async () => { calls++; return reply(200, { success: true, status: 'ok' }); };
  for (const path of ['/api/health', '/api/auth/me', '/api/auth/login', '/api/auth/refresh']) assert.equal((await fetchWithSessionRetry(`${serverUrl}${path}`, { method: 'POST', headers: { Authorization: 'Bearer a' } })).status, 200, path);
  assert.equal((await fetchWithSessionRetry('https://otro.example.invalid/api/sync/pull', { headers: { Authorization: 'Bearer a' } })).status, 200);
  assert.equal((await fetchWithSessionRetry(`${workerUrl}/api/share/history`, { headers: { Authorization: 'Bearer a' } }, serverUrl)).status, 200);
  assert.equal(calls, 7);
  // Un 426 que no es de versión (proxy) no activa el aviso.
  resetClientOutdated();
  globalThis.fetch = async () => reply(426, { error: 'otra cosa' });
  assert.equal((await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { headers: { Authorization: 'Bearer a' } })).status, 426);
  assert.equal(getClientOutdated(), null);
  unsubscribe();

  // El servicio informa el mensaje de actualización y no el código técnico.
  resetClientOutdated();
  globalThis.fetch = async () => outdated();
  const pull = await SyncService.pullProjects(serverUrl, 'token');
  assert.equal(pull.success, false);
  assert.match(pull.error ?? '', /^Actualiza SolarSim a la versión 9\.9\.9/);

  // De punta a punta: la sincronización falla una vez, no vuelve a salir a la red y el trabajo local sigue pendiente.
  resetClientOutdated();
  const user = { id: 'qa-editor', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
  const pending = { ...structuredClone(BENCHMARK_PROJECT), id: 'qa-pending', organizationId: user.organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1, syncStatus: 'pending' as const };
  useSimulationStore.setState({
    syncSettings: { serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: true, lastSyncTimestamp: null },
    projects: [pending], folders: [], folderChanges: {}, folderDeletionQueue: [], clients: [], clientChanges: {}, clientDeletionQueue: [], projectDeletionQueue: [], projectConflicts: {}, isSyncing: false,
  });
  calls = 0;
  globalThis.fetch = async () => { calls++; return outdated(); };
  const store = useSimulationStore.getState();
  const result = await store.syncProjectsWithServer(true);
  assert.equal(result.success, false);
  assert.equal(getClientOutdated()?.minVersion, '9.9.9');
  const afterFirst = calls;
  assert.ok(afterFirst >= 1 && afterFirst <= 3, `se detiene en la primera respuesta 426 (${afterFirst} llamadas)`);
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await store.syncProjectsWithServer(true)).success, false);
  assert.equal(calls, afterFirst, 'los reintentos posteriores no tocan la red');
  assert.equal(useSimulationStore.getState().projects.find(project => project.id === 'qa-pending')?.syncStatus, 'pending', 'el trabajo local sigue pendiente y guardado');
  assert.equal(useSimulationStore.getState().isSyncing, false);

  // Aviso fijo: mensaje, versión mínima y botón del actualizador.
  const notice = renderToStaticMarkup(React.createElement(ClientOutdatedNoticeView, { minVersion: '9.9.9', onUpdate: () => {} }));
  assert.match(notice, /Actualiza SolarSim para seguir sincronizando/);
  assert.match(notice, /9\.9\.9/);
  assert.match(notice, /role="alert"/);
  assert.match(notice, /Buscar actualización/);
  assert.match(notice, /se guarda en este equipo/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(ClientOutdatedNoticeView, { minVersion: null, onUpdate: () => {} })), /undefined|null/);
  console.log('PASS: encabezado de cliente, 426 detiene la sincronización y aviso de actualización.');
} finally {
  resetClientOutdated();
  globalThis.fetch = original.fetch;
  useSimulationStore.setState(initial, true);
}
