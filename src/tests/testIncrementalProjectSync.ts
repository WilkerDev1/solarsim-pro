import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { SyncService, type SyncPushOutcome } from '../services/syncService';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { featureScope } from '../../shared/applicationFeatures';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { createProjectDeletion } from '../store/sync/projectDeletion';
import type { ProjectSimulation } from '../types';

// Sincronización de propuestas en enlaces lentos (incidente del 2026-11-20): pull incremental con cursor por
// sesión, envío aunque la descarga falle y tiempo de espera por inactividad en la descarga.

const serverUrl = 'https://incremental-sync.invalid';
const user = { id: 'inc-user', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'inc-org' };
const otherOrg = { ...user, organizationId: 'inc-org-2' };
const scope = featureScope(serverUrl, user.organizationId);
const project = (id: string, overrides: Partial<ProjectSimulation> = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT), id, organizationId: user.organizationId, syncServerUrl: serverUrl,
  version: 3, baseVersion: 3, syncStatus: 'synced', ...overrides,
});

const originals = { pull: SyncService.pullProjects, push: SyncService.pushProjects, remove: SyncService.deleteProject, get: SyncService.getProject };

/** Servidor sintético que respeta el contrato de `/api/sync/pull`: cambios desde el cursor y lápidas completas. */
function server(initial: ProjectSimulation[]) {
  let clock = 1000;
  const tick = () => new Date(Date.UTC(2026, 10, 20, 0, 0, clock++)).toISOString();
  const rows = new Map(initial.map((p) => [p.id, { project: structuredClone(p), updatedAt: tick() }]));
  const tombstones = new Set<string>();
  const pulls: Array<string | null | undefined> = [];
  const gets: string[] = [];
  const pushes: ProjectSimulation[][] = [];
  let pullFailure: string | null = null;
  SyncService.pullProjects = async (_url, _token, since) => {
    pulls.push(since);
    if (pullFailure) return { success: false, error: pullFailure };
    const cursor = tick();
    const projects = [...rows.values()].filter((row) => !since || row.updatedAt >= since).map((row) => structuredClone(row.project));
    return { success: true, projects, deletedIds: [...tombstones], serverTimestamp: cursor, count: projects.length };
  };
  SyncService.getProject = async (_url, _token, id) => {
    gets.push(id);
    const row = rows.get(id);
    return row ? { success: true, project: structuredClone(row.project) } : { success: false, notFound: true, error: 'Proyecto no encontrado' };
  };
  SyncService.pushProjects = async (_url, _token, items) => {
    pushes.push(structuredClone(items));
    const results: SyncPushOutcome[] = items.map((item) => {
      const prior = rows.get(item.id)?.project;
      if (tombstones.has(item.id)) return { id: item.id, originalId: item.id, status: 'conflict', reason: 'deleted', serverVersion: 0 };
      if (prior ? prior.version !== item.baseVersion : (item.baseVersion ?? 0) !== 0) return { id: item.id, originalId: item.id, status: 'conflict', reason: 'version_conflict', serverVersion: prior?.version ?? 0, serverProject: prior && structuredClone(prior) };
      const version = (prior?.version ?? 0) + 1;
      const saved: ProjectSimulation = { ...structuredClone(item), version, baseVersion: version, syncStatus: 'synced' };
      rows.set(item.id, { project: saved, updatedAt: tick() });
      return { id: item.id, originalId: item.id, status: prior ? 'updated' : 'created', version, project: structuredClone(saved) };
    });
    return { success: true, results };
  };
  SyncService.deleteProject = async (_url, _token, id, permanent, baseVersion) => {
    const prior = rows.get(id)?.project;
    if (!prior || !permanent || !prior.isDeleted || prior.version !== baseVersion) return false;
    rows.delete(id);
    tombstones.add(id);
    return true;
  };
  return {
    rows, tombstones, pulls, gets, pushes,
    edit(id: string, patch: Partial<ProjectSimulation>) {
      const prior = rows.get(id)!.project;
      rows.set(id, { project: { ...prior, ...patch, version: prior.version! + 1, baseVersion: prior.version! + 1 }, updatedAt: tick() });
    },
    failPulls(message: string | null) { pullFailure = message; },
  };
}

function reset(projects: ProjectSimulation[], who = user) {
  store.getState().setSyncSettings({ serverUrl, authToken: 'synthetic-token', currentUser: who, autoSyncEnabled: false });
  store.setState({
    projects, activeProjectId: projects[0]?.id || '', projectDeletionQueue: [], projectConflicts: {}, activeConflict: null, snapshotsByProject: {}, isSyncing: false,
    syncFoldersWithServer: async () => ({ success: true, message: 'Synthetic folders' }),
    syncClientsWithServer: async () => ({ success: true, message: 'Synthetic clients' }),
    syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic catalog' }),
    syncOrganizationCompanyProfile: async () => ({ success: true, message: 'Synthetic profile' }),
  });
}

const byId = (id: string) => store.getState().projects.find((p) => p.id === id);
const byIdFrom = (remote: ReturnType<typeof server>, id: string) => structuredClone(remote.rows.get(id)!.project);

async function run() {
  try {
    // 1. Sin cursor se descarga todo; luego solo lo cambiado desde el último serverTimestamp de esta sesión.
    const remote = server([project('a'), project('b')]);
    reset([]);
    store.setState({ projectSyncCursor: null });
    assert.ok((await store.getState().syncProjectsWithServer(true)).success);
    assert.equal(remote.pulls.length, 1);
    assert.ok(!remote.pulls[0], 'First sync of a scope is a full pull');
    assert.deepEqual(store.getState().projects.map((p) => p.id).sort(), ['a', 'b']);
    const cursor = store.getState().projectSyncCursor;
    assert.equal(cursor?.scope, scope, 'Cursor belongs to server URL + organization');
    assert.ok(cursor?.serverTimestamp);

    remote.edit('a', { client: { ...byId('a')!.client, name: 'Cliente editado por otro' } });
    assert.ok((await store.getState().syncProjectsWithServer(true)).success);
    assert.equal(remote.pulls[1], cursor!.serverTimestamp, 'Next sync sends the persisted cursor');
    assert.equal(byId('a')!.client.name, 'Cliente editado por otro');
    assert.equal(byId('a')!.version, 4);

    // 2. Un proyecto ausente de un pull parcial no está borrado ni es versión 0.
    const b = byId('b')!;
    assert.equal(b.syncStatus, 'synced');
    assert.equal(b.version, 3);
    assert.equal(b.baseVersion, 3);

    // 3. El cursor sobrevive a la persistencia y es por alcance: otra organización arranca con pull completo.
    const durable = JSON.parse(JSON.stringify(serializeSimulationStore(store.getState())));
    assert.equal(durable.projectSyncCursor?.scope, scope, 'Cursor is persisted');
    const scopedCursor = store.getState().projectSyncCursor!.serverTimestamp;
    reset([], otherOrg);
    assert.equal(store.getState().projectSyncCursor ?? null, null, 'Another organization has no cursor');
    remote.pulls.length = 0;
    await store.getState().syncProjectsWithServer(true);
    assert.ok(!remote.pulls[0], 'Another organization pulls in full');
    store.getState().setSyncSettings({ currentUser: user });
    assert.equal(store.getState().projectSyncCursor?.serverTimestamp, scopedCursor, 'Returning to the scope restores its cursor with its cache');
    // A cursor stored under another scope is never sent.
    store.setState({ projectSyncCursor: { scope: 'https://other.invalid|inc-org', serverTimestamp: '2030-01-01T00:00:00.000Z' } });
    remote.pulls.length = 0;
    await store.getState().syncProjectsWithServer(true);
    assert.ok(!remote.pulls[0], 'Foreign cursor falls back to a full pull');

    // 4. Pull completo a pedido.
    remote.pulls.length = 0;
    await store.getState().syncProjectsWithServer(false, { fullPull: true });
    assert.ok(!remote.pulls[0], 'fullPull ignores the cursor');

    // 5. Una descarga fallida no bloquea el envío; el error de descarga se informa aparte y el cursor no avanza.
    const beforeFailure = store.getState().projectSyncCursor;
    store.setState({ projects: store.getState().projects.map((p) => p.id === 'b' ? { ...p, client: { ...p.client, name: 'Cambio local' }, syncStatus: 'pending' as const } : p) });
    remote.failPulls('Tiempo de espera agotado');
    remote.pushes.length = 0;
    const failed = await store.getState().syncProjectsWithServer(false);
    assert.equal(remote.pushes.length, 1, 'Pending local work is pushed even when the pull failed');
    assert.deepEqual(remote.pushes[0].map((p) => p.id), ['b']);
    assert.equal(byId('b')!.syncStatus, 'synced');
    assert.equal(byId('b')!.version, 4);
    assert.equal(failed.success, false, 'A failed pull is not a complete sync');
    assert.match(failed.message, /Tiempo de espera agotado/);
    assert.match(store.getState().syncFeedbackMessage || '', /Tiempo de espera agotado/);
    assert.deepEqual(store.getState().projectSyncCursor, beforeFailure, 'Cursor does not advance without a pull');

    // 6. Con la descarga caída, un conflicto de versión del envío sigue llegando al diálogo de conflictos.
    remote.edit('a', { client: { ...byId('a')!.client, name: 'Otro cambio remoto' } });
    store.setState({ projects: store.getState().projects.map((p) => p.id === 'a' ? { ...p, client: { ...p.client, name: 'Cambio local en conflicto' }, syncStatus: 'pending' as const } : p) });
    await store.getState().syncProjectsWithServer(true);
    assert.equal(byId('a')!.syncStatus, 'conflict');
    assert.ok(store.getState().projectConflicts[scope + '|a'], 'Conflict is recorded for the dialog');
    assert.equal(store.getState().projectConflicts[scope + '|a'].serverProject.client.name, 'Otro cambio remoto');
    remote.failPulls(null);

    // 7. Borrados en cola con pull parcial: el proyecto sin cambios no está en el pull y aun así se borra con su versión real.
    const deletion = server([project('c'), project('d')]);
    reset([]);
    store.setState({ projectSyncCursor: null });
    await store.getState().syncProjectsWithServer(true);
    store.getState().moveToTrash('c');
    store.getState().hardDeleteProject('c');
    assert.ok((await store.getState().syncProjectsWithServer(true)).success, 'Queued deletion of an unchanged project succeeds');
    assert.ok(deletion.pulls.at(-1), 'That sync was incremental');
    assert.ok(deletion.tombstones.has('c'), 'Unchanged project is purged with its confirmed version');
    assert.equal(store.getState().projectDeletionQueue.length, 0);
    assert.ok(byId('d'), 'Unrelated project is kept');

    // A legacy command without a snapshot reads the server copy directly instead of assuming it is gone.
    store.setState({ projectDeletionQueue: [{ scope, id: 'd', baseVersion: 3, stage: 'trash' }], projects: store.getState().projects.filter((p) => p.id !== 'd') });
    deletion.gets.length = 0;
    assert.ok((await store.getState().syncProjectsWithServer(true)).success, 'Snapshotless deletion resolves with a targeted read');
    assert.deepEqual(deletion.gets, ['d']);
    assert.ok(deletion.tombstones.has('d'));

    // A teammate restores a trashed proposal while its purge waits, and the cursor moves past that change without the
    // queue being processed (here: a reader session). The next writer sync must still see the restore and recover.
    const restored = server([project('f', { isDeleted: true })]);
    reset([]);
    store.setState({ projectSyncCursor: null });
    await store.getState().syncProjectsWithServer(true);
    store.setState({ projects: store.getState().projects.filter((p) => p.id !== 'f'), projectDeletionQueue: [createProjectDeletion(byIdFrom(restored, 'f'), scope)] });
    assert.equal(store.getState().projectDeletionQueue[0].stage, 'delete');
    restored.edit('f', { isDeleted: false });
    store.getState().setSyncSettings({ currentUser: { ...user, role: 'LECTOR' } });
    await store.getState().syncProjectsWithServer(true);
    assert.equal(store.getState().projectDeletionQueue.length, 1, 'A reader cannot process the queue');
    store.getState().setSyncSettings({ currentUser: user });
    await store.getState().syncProjectsWithServer(true);
    assert.ok(restored.pulls.at(-1), 'Incremental pull that no longer contains the restored proposal');
    assert.ok(!restored.tombstones.has('f'), 'A restored proposal is never purged');
    assert.equal(store.getState().projectDeletionQueue.length, 0, 'The stale purge does not stay stuck');
    assert.equal(byId('f')?.syncStatus, 'conflict', 'The local deletion intent becomes a reviewable conflict');

    // 8. Abrir un conflicto lee solo esa propuesta, no el catálogo entero de propuestas.
    const conflictServer = server([project('e', { version: 5, baseVersion: 5 })]);
    reset([project('e', { syncStatus: 'conflict', baseVersion: 3 })]);
    conflictServer.pulls.length = 0;
    const opened = await store.getState().openProjectConflict('e');
    assert.ok(opened.success, opened.error);
    assert.equal(conflictServer.pulls.length, 0, 'No full pull to open one conflict');
    assert.deepEqual(conflictServer.gets, ['e']);
    assert.equal(store.getState().activeConflict?.serverVersion, 5);
    // A purged proposal (404 + lápida) opens as a deleted conflict.
    conflictServer.rows.delete('e');
    conflictServer.tombstones.add('e');
    const purged = await store.getState().openProjectConflict('e');
    assert.ok(purged.success, purged.error);
    assert.equal(store.getState().activeConflict?.reason, 'deleted');
    // A creation the push rejected (invalid folder, client…) never existed on the server: 404 is not a purge.
    store.setState({ projects: [project('g', { syncStatus: 'conflict', version: 1, baseVersion: 0 })], activeConflict: null, projectConflicts: {} });
    const rejected = await store.getState().openProjectConflict('g');
    assert.equal(rejected.success, false);
    assert.match(rejected.error || '', /ya no está disponible/);
    assert.equal(store.getState().activeConflict, null);
  } finally {
    Object.assign(SyncService, { pullProjects: originals.pull, pushProjects: originals.push, deleteProject: originals.remove, getProject: originals.get });
  }

  // 9. Tiempo de espera de la descarga: por inactividad, no por duración total; el resto conserva 12 s.
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const timeouts: number[] = [];
  AbortSignal.timeout = ((ms: number) => { timeouts.push(ms); return realTimeout.call(AbortSignal, ms); }) as typeof AbortSignal.timeout;
  const savedTimeouts = { ...SyncService.pullTimeouts };
  try {
    const body = JSON.stringify({ success: true, projects: [], deletedIds: [], serverTimestamp: '2026-11-20T00:00:00.000Z', count: 0, padding: 'x'.repeat(2000) });
    const slowStream = (chunkDelayMs: number, stallAfter?: number) => new ReadableStream<Uint8Array>({
      async start(controller) {
        const bytes = new TextEncoder().encode(body);
        const size = Math.ceil(bytes.length / 10);
        for (let i = 0; i < 10; i++) {
          if (stallAfter !== undefined && i === stallAfter) { await new Promise((r) => setTimeout(r, 2000)); }
          await new Promise((r) => setTimeout(r, chunkDelayMs));
          try { controller.enqueue(bytes.slice(i * size, (i + 1) * size)); } catch { return; }
        }
        try { controller.close(); } catch { /* aborted */ }
      },
    });
    // Margen amplio (ventana 600 ms frente a fragmentos cada 40 ms y una pausa de 2 s): estable con la máquina cargada.
    SyncService.pullTimeouts = { idleMs: 600, maxMs: 8000 };
    let stream = slowStream(40);
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const signal = init.signal!;
      const piped = stream.pipeThrough(new TransformStream(), { signal });
      return new Response(piped, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const started = Date.now();
    const slow = await SyncService.pullProjects(serverUrl, 'synthetic-token', null);
    assert.ok(slow.success, `A slow but steady pull completes: ${slow.error}`);
    assert.ok(Date.now() - started >= 300, 'The download took longer than the idle window');
    assert.ok(!timeouts.includes(12000), 'The pull does not use the 12 s whole-request timeout');

    stream = slowStream(10, 3);
    const stalled = await SyncService.pullProjects(serverUrl, 'synthetic-token', null);
    assert.equal(stalled.success, false, 'A stalled pull is aborted');
    assert.match(stalled.error || '', /sin recibir datos|se detuvo/i);

    timeouts.length = 0;
    globalThis.fetch = (async () => Response.json({ success: true, results: [] })) as typeof fetch;
    await SyncService.pushProjects(serverUrl, 'synthetic-token', []);
    assert.deepEqual(timeouts, [12000], 'Small requests keep the 12 s timeout');
  } finally {
    SyncService.pullTimeouts = savedTimeouts;
    AbortSignal.timeout = realTimeout;
    globalThis.fetch = realFetch;
  }
  console.log('✓ Incremental project sync: per-scope cursor, partial pulls, push without pull, targeted reads, idle timeout');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
