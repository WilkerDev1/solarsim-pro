// Porción de precios de equipos (ADR 0006 §3): cola local, precio genérico efectivo, sincronización y espacios.
// Todo el tráfico es sintético: `globalThis.fetch` se sustituye por un servidor en memoria.
import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { SyncService } from '../services/syncService';
import { effectiveGenericPrice } from '../store/slices/equipmentPriceSlice';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { isObservationId, type GenericPriceInfo } from '../../shared/equipmentPrices';
import type { SolarEquipmentItem } from '../types/equipment';
import type { SimulationStore } from '../store/types';

const serverUrl = 'https://prices.invalid';
const user = (id: string, organizationId: string, role: 'ADMIN' | 'EDITOR' | 'LECTOR' = 'EDITOR') => ({ id, name: id, email: `${id}@example.invalid`, role, organizationId });
const session = (u = user('ana', 'org-a'), autoSyncEnabled = false) => ({ serverUrl, authToken: `token-${u.id}`, currentUser: u, autoSyncEnabled });
const panel = (id: string, organizationId = 'org-a'): SolarEquipmentItem => ({
  id, type: 'panel', brand: 'QA', modelSeries: id, displayName: `Panel ${id}`, powerW: 600, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1,
});

type Batch = { observations: { id: string; kind: string; equipmentId: string; priceUSD: number; observedAt: string }[]; voids: { id: string }[] };
interface FakeServer {
  batches: Batch[];
  genericCalls: number;
  prices: Record<string, GenericPriceInfo>;
  mode: 'ok' | 'missing' | 'down';
  /** Estados forzados por id (p. ej. `not_found` para una anulación). */
  forced: Record<string, string>;
  /** Se llama mientras la solicitud está "en vuelo" (antes de responder). */
  during?: () => void;
  history: unknown[];
  /** Genérico anterior por equipo: vuelve a ser el vigente cuando se anula el actual. */
  previous: Record<string, GenericPriceInfo>;
}
function install(): FakeServer {
  const server: FakeServer = { batches: [], genericCalls: 0, prices: {}, mode: 'ok', forced: {}, history: [], previous: {} };
  let seq = 100;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.pathname.startsWith('/api/equipment-prices')) return Response.json({ success: false, error: 'unexpected' }, { status: 500 });
    if (server.mode === 'down') throw new TypeError('network down');
    if (server.mode === 'missing') return new Response('Not Found', { status: 404 });
    const headers = new Headers(init?.headers);
    assert.ok(headers.get('Authorization')?.startsWith('Bearer '), 'authenticated');
    assert.ok(headers.get('X-SolarSim-Client'), 'client identity header');
    if (url.pathname === '/api/equipment-prices/generic') {
      server.genericCalls++;
      return Response.json({ success: true, prices: server.prices });
    }
    if (url.pathname === '/api/equipment-prices/batch' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Batch;
      server.batches.push(body);
      server.during?.();
      const observations = body.observations.map((o) => {
        const status = server.forced[o.id] ?? 'created';
        if (status === 'created' && o.kind === 'generic') server.prices[o.equipmentId] = { priceUSD: o.priceUSD, observedAt: o.observedAt, observationId: o.id };
        return { id: o.id, status, ...(status === 'created' ? { observation: { ...o, seq: ++seq } } : {}) };
      });
      const voids = body.voids.map((v) => {
        const status = server.forced[v.id] ?? 'voided';
        if (status === 'voided') for (const [key, info] of Object.entries(server.prices)) if (info.observationId === v.id) {
          delete server.prices[key];
          if (server.previous[key]) server.prices[key] = server.previous[key];
        }
        return { id: v.id, status };
      });
      return Response.json({ success: true, observations, voids });
    }
    if (url.pathname === '/api/equipment-prices' && (init?.method ?? 'GET') === 'GET') {
      server.history.push(Object.fromEntries(url.searchParams));
      return Response.json({ success: true, observations: [{ id: 'po-00000000-0000-4000-8000-000000000001', seq: 5, equipmentId: url.searchParams.get('equipmentId'), kind: 'observation', priceUSD: 90, source: 'manual', observedAt: '2026-11-01T00:00:00.000Z' }], nextBefore: null });
    }
    return Response.json({ success: false }, { status: 500 });
  }) as typeof fetch;
  return server;
}
function reset(settings: ReturnType<typeof session> | null, catalog: SolarEquipmentItem[] = [panel('eq-1'), panel('eq-2')]) {
  if (settings) store.getState().setSyncSettings(settings);
  else store.getState().setSyncSettings({ serverUrl, authToken: null, currentUser: null, autoSyncEnabled: false });
  store.setState({ equipmentCatalog: catalog, equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, deletedEquipmentIds: [], genericPrices: {}, pricePending: { observations: [], voids: [] } });
}
const pending = () => store.getState().pricePending;

async function run() {
  const originalFetch = globalThis.fetch;
  const initial = store.getState();
  try {
    // --- SyncService: contrato HTTP, 404 = función no disponible.
    const server = install();
    const ok = await SyncService.fetchGenericPrices(serverUrl, 'token');
    assert.deepEqual(ok, { status: 'ok', prices: {} });
    const history = await SyncService.fetchPriceHistory(serverUrl, 'token', 'eq-1', { limit: 50, before: 99 });
    assert.equal(history.status, 'ok');
    assert.deepEqual(server.history.at(-1), { equipmentId: 'eq-1', limit: '50', before: '99' });
    server.mode = 'missing';
    assert.deepEqual(await SyncService.fetchGenericPrices(serverUrl, 'token'), { status: 'unsupported' });
    assert.deepEqual(await SyncService.pushPriceObservations(serverUrl, 'token', { observations: [], voids: [] }), { status: 'unsupported' });
    assert.deepEqual((await SyncService.fetchPriceHistory(serverUrl, 'token', 'eq-1', {})).status, 'unsupported');
    server.mode = 'down';
    assert.equal((await SyncService.fetchGenericPrices(serverUrl, 'token')).status, 'error');
    server.mode = 'ok';

    // --- Modo local: la función está apagada (sin registros ni preguntas).
    reset(null);
    assert.deepEqual(store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 10, source: 'manual' }]), []);
    assert.equal(store.getState().setGenericPrice('eq-1', 10, 'manual'), null);
    assert.equal(pending().observations.length, 0, 'local mode records nothing');
    assert.equal((await store.getState().syncPriceObservations()).status, 'skipped');

    // --- LECTOR: puede leer, no registra ni envía.
    reset(session(user('lia', 'org-a', 'LECTOR')));
    server.prices = { 'eq-1': { priceUSD: 50, observedAt: '2026-11-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000aa' } };
    assert.equal(store.getState().setGenericPrice('eq-1', 10, 'manual'), null);
    assert.deepEqual(store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 10, source: 'manual' }]), []);
    store.setState({ pricePending: { observations: [{ id: 'po-00000000-0000-4000-8000-0000000000bb', equipmentId: 'eq-1', kind: 'observation', priceUSD: 1, source: 'manual', observedAt: '2026-11-01T00:00:00.000Z', scope: store.getState().workspaceScope, userId: 'lia' }], voids: [] } });
    const batchesBefore = server.batches.length;
    await store.getState().syncPriceObservations();
    assert.equal(server.batches.length, batchesBefore, 'readers never send');
    assert.equal(store.getState().genericPrices['eq-1']?.priceUSD, 50, 'readers refresh the generic map');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD, 50);

    // --- Registro y precio genérico efectivo.
    reset(session());
    const [obsId] = store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 120, source: 'supplier_offer', supplierName: 'Prov', supplierOfferId: 'sp-1', originalCurrency: 'USD', originalPrice: 120 }]);
    assert.ok(isObservationId(obsId));
    const entry = pending().observations[0];
    assert.equal(entry.scope, store.getState().workspaceScope);
    assert.equal(entry.userId, 'ana');
    assert.ok(Number.isFinite(Date.parse(entry.observedAt)));
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1'), null, 'an observation is not a generic price');
    store.setState({ genericPrices: { 'eq-1': { priceUSD: 100, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000100' } } });
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD, 100);
    const g1 = store.getState().setGenericPrice('eq-1', 110, 'manual')!;
    const g2 = store.getState().setGenericPrice('eq-1', 115, 'supplier_offer', { derivedFromId: obsId })!;
    assert.ok(g1 && g2);
    assert.equal(pending().observations.find((o) => o.id === g2)?.derivedFromId, obsId);
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD, 115, 'newest pending generic wins');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.observationId, g2);
    assert.equal(store.getState().voidPriceObservation(g2), true);
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD, 110, 'voiding the pending generic falls back to the previous pending one');
    store.getState().voidPriceObservation(g1);
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD, 100);
    store.getState().voidPriceObservation('po-00000000-0000-4000-8000-000000000100');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1'), null, 'a pending void of the server generic removes it until the next download');
    assert.equal(store.getState().setGenericPrice('eq-1', 0, 'manual'), null, 'generic must be > 0');
    assert.equal(store.getState().setGenericPrice('missing', 5, 'manual'), null, 'unknown equipment');
    assert.equal(store.getState().setGenericPrice('eq-foreign', 5, 'manual'), null);
    // Equipo de referencia (de otra organización, compartido): admite precio genérico.
    const referenceIds = (await import('../../shared/referenceEquipment')).REFERENCE_EQUIPMENT_IDS;
    store.setState({ equipmentCatalog: [...store.getState().equipmentCatalog, panel(referenceIds[0], 'org-electsun-default'), panel('eq-foreign', 'org-b')] });
    assert.ok(store.getState().setGenericPrice(referenceIds[0], 33, 'manual'), 'reference equipment accepts a generic price');
    assert.equal(store.getState().setGenericPrice('eq-foreign', 5, 'manual'), null, 'another organization\'s private equipment is refused');

    // --- Persistencia: solo genericPrices y pricePending; nunca historial.
    const saved = JSON.parse(JSON.stringify(serializeSimulationStore(store.getState())));
    assert.ok(saved.genericPrices && saved.pricePending, 'persisted');
    assert.equal(saved.pricePending.observations.length, pending().observations.length);
    assert.equal('priceHistory' in saved, false);
    const hydrated = { ...saved, pricePending: 'corrupt', genericPrices: null } as unknown as SimulationStore;
    hydrateSimulationStore(hydrated);
    assert.deepEqual(hydrated.pricePending, { observations: [], voids: [] }, 'corrupt queue is reset on hydrate');
    assert.deepEqual(hydrated.genericPrices, {});

    // --- Sincronización: lotes de 200 + 200, quita por id lo confirmado, conserva not_found y lo nuevo.
    reset(session());
    server.prices = {};
    server.batches = [];
    server.forced = {};
    const many = store.getState().recordPriceObservations(Array.from({ length: 250 }, (_, i) => ({ equipmentId: 'eq-2', kind: 'observation' as const, priceUSD: 10 + i, source: 'manual' as const })));
    assert.equal(many.length, 250);
    const generic = store.getState().setGenericPrice('eq-1', 77, 'manual')!;
    const lostVoid = 'po-00000000-0000-4000-8000-0000000000cc';
    store.getState().voidPriceObservation(lostVoid);
    server.forced[lostVoid] = 'not_found';
    server.forced[many[3]] = 'conflict';
    server.forced[many[4]] = 'rejected';
    server.forced[many[5]] = 'duplicate';
    let lateId = '';
    server.during = () => { if (!lateId) [lateId] = store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 5, source: 'manual' }]); };
    const result = await store.getState().syncPriceObservations();
    server.during = undefined;
    assert.equal(result.status, 'ok');
    assert.ok(server.batches.length >= 2, 'more than 200 records go in several requests');
    assert.ok(server.batches.every((b) => b.observations.length <= 200 && b.voids.length <= 200));
    assert.deepEqual(pending().observations.map((o) => o.id), [lateId], 'acknowledged ids leave the queue; one added during the request stays');
    assert.deepEqual(pending().voids.map((v) => v.id), [lostVoid], 'not_found voids are retried');
    assert.equal(store.getState().genericPrices['eq-1']?.observationId, generic, 'generic map refreshed after sending');
    assert.ok(server.genericCalls > 0);

    // --- 404: API sin la función → sin mensaje, cola intacta.
    server.mode = 'missing';
    const queued = structuredClone(pending());
    const missing = await store.getState().syncPriceObservations();
    assert.equal(missing.status, 'unsupported');
    assert.equal(missing.message, undefined, 'no message for an API without the feature');
    assert.deepEqual(pending(), queued, 'queue kept');
    // Red caída: se conserva todo.
    server.mode = 'down';
    assert.equal((await store.getState().syncPriceObservations()).status, 'error');
    assert.deepEqual(pending(), queued);
    server.mode = 'ok';

    // --- Otro usuario de la misma organización: no envía la cola ajena.
    reset(session(user('ana', 'org-a')));
    store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 9, source: 'manual' }]);
    const anasQueue = structuredClone(pending());
    store.getState().logoutUser();
    assert.equal(store.getState().workspaceScope, 'local');
    assert.equal(pending().observations.length, 0, 'local workspace has its own (empty) queue');
    store.getState().setSyncSettings(session(user('beto', 'org-a')));
    server.batches = [];
    await store.getState().syncPriceObservations();
    assert.equal(server.batches.reduce((n, b) => n + b.observations.length, 0), 0, 'another member never sends someone else\'s queue');
    assert.deepEqual(pending().observations.map((o) => o.id), anasQueue.observations.map((o) => o.id), 'and never drops it');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.priceUSD ?? null, store.getState().genericPrices['eq-1']?.priceUSD ?? null, 'pending entries of another member are not applied');

    // --- Cambio de organización: colas y mapas aislados.
    reset(session(user('ana', 'org-a')));
    store.setState({ genericPrices: { 'eq-1': { priceUSD: 1, observedAt: '2026-11-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000dd' } } });
    store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 11, source: 'manual' }]);
    store.getState().setSyncSettings(session(user('ana', 'org-b')));
    assert.deepEqual(store.getState().genericPrices, {}, 'org B starts without org A\'s generic prices');
    assert.equal(pending().observations.length, 0, 'org B starts without org A\'s queue');
    store.getState().setSyncSettings(session(user('ana', 'org-a')));
    assert.equal(store.getState().genericPrices['eq-1']?.priceUSD, 1, 'org A restored');
    assert.equal(pending().observations.length, 1);

    // --- Guarda de sesión: un cambio durante el envío no aplica la respuesta a otro espacio.
    reset(session(user('ana', 'org-a')));
    store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 12, source: 'manual' }]);
    server.during = () => store.getState().setSyncSettings(session(user('ana', 'org-b')));
    const raced = await store.getState().syncPriceObservations();
    server.during = undefined;
    assert.equal(raced.status, 'error');
    assert.equal(pending().observations.length, 0, 'org B queue untouched');
    store.getState().setSyncSettings(session(user('ana', 'org-a')));
    assert.equal(pending().observations.length, 1, 'org A keeps its entry for the next sync (server answers duplicate)');

    // --- Descargar, hidratar o resolver conflictos nunca registran.
    reset(session());
    const remote = { ...panel('eq-1'), version: 2, supplierPrices: [{ id: 'sp-x', supplierName: 'X', priceUSD: 300, updatedAt: '2026-11-01' }] };
    const originalPull = SyncService.pullEquipment;
    const originalPush = SyncService.pushEquipmentBatch;
    SyncService.pullEquipment = async () => ({ success: true, items: [remote], deletedIds: [] });
    SyncService.pushEquipmentBatch = async () => ({ success: true, results: [] });
    try {
      await store.getState().syncEquipmentWithServer();
      assert.equal(store.getState().equipmentCatalog.find((e) => e.id === 'eq-1')?.supplierPrices?.[0].priceUSD, 300);
      assert.equal(pending().observations.length, 0, 'pulling offers records nothing');
      store.setState({ equipmentConflicts: { 'eq-1': { reason: 'version_conflict', serverItem: { ...remote, supplierPrices: [{ ...remote.supplierPrices[0], priceUSD: 999 }] }, serverVersion: 3 } } });
      store.getState().resolveEquipmentConflict('eq-1', 'accept_server');
      assert.equal(pending().observations.length, 0, 'conflict resolution records nothing');
      store.getState().resetEquipmentCatalogToDefaults();
      assert.equal(pending().observations.length, 0, 'reset records nothing');
    } finally {
      SyncService.pullEquipment = originalPull;
      SyncService.pushEquipmentBatch = originalPush;
    }
    const persisted = serializeSimulationStore(store.getState()) as unknown as SimulationStore;
    hydrateSimulationStore(structuredClone(persisted));
    assert.equal(pending().observations.length, 0, 'hydrate records nothing');

    // --- Envío inmediato durante otra sincronización: lo encolado tras la captura sale en una pasada más.
    reset(session());
    server.batches = [];
    server.forced = {};
    server.prices = {};
    store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 21, source: 'manual' }]);
    let lateSend: Promise<unknown> | null = null;
    let lateGeneric = '';
    server.during = () => {
      if (lateSend) return;
      lateGeneric = store.getState().setGenericPrice('eq-2', 44, 'manual')!;
      lateSend = store.getState().syncPriceObservations({ refresh: false });
    };
    await store.getState().syncPriceObservations();
    server.during = undefined;
    await lateSend;
    assert.ok(server.batches.some((b) => b.observations.some((o) => o.id === lateGeneric)), 'a send-only call made during another run is sent once that run settles');
    assert.equal(pending().observations.length, 0, 'nothing left in the queue');
    assert.equal(store.getState().genericPrices['eq-2']?.observationId, lateGeneric);

    // --- `duplicate` de un genérico (respuesta perdida): el mapa se vuelve a descargar aunque sea solo envío.
    reset(session());
    server.forced = {};
    const old = { priceUSD: 50, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000e1' };
    store.setState({ genericPrices: { 'eq-1': old } });
    const committed = store.getState().setGenericPrice('eq-1', 66, 'manual')!;
    server.prices = { 'eq-1': { priceUSD: 66, observedAt: pending().observations[0].observedAt, observationId: committed } };
    server.forced[committed] = 'duplicate';
    const callsBeforeDuplicate = server.genericCalls;
    assert.equal((await store.getState().syncPriceObservations({ refresh: false })).status, 'ok');
    assert.equal(pending().observations.length, 0);
    assert.ok(server.genericCalls > callsBeforeDuplicate, 'a non-created generic triggers a download');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.observationId, committed, 'the committed generic is current, not the stale one');
    server.forced = {};

    // --- Anular el genérico vigente: vuelve el anterior sin esperar a la sincronización completa.
    reset(session());
    const current = { priceUSD: 70, observedAt: '2026-11-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000e2' };
    const before = { priceUSD: 60, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000e3' };
    server.prices = { 'eq-1': current };
    server.previous = { 'eq-1': before };
    store.setState({ genericPrices: { 'eq-1': current } });
    store.getState().voidPriceObservation(current.observationId);
    assert.equal((await store.getState().syncPriceObservations({ refresh: false })).status, 'ok');
    assert.equal(effectiveGenericPrice(store.getState(), 'eq-1')?.observationId, before.observationId, 'the previous generic comes back');
    server.previous = {};
    // Una anulación que no toca el mapa (registro normal) no descarga nada.
    reset(session());
    const [plain] = store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 5, source: 'manual' }]);
    await store.getState().syncPriceObservations({ refresh: false });
    store.getState().voidPriceObservation(plain);
    const callsBeforePlain = server.genericCalls;
    await store.getState().syncPriceObservations({ refresh: false });
    assert.equal(server.genericCalls, callsBeforePlain, 'voiding a plain observation does not download the map');

    // --- syncAll: el paso de precios va después del catálogo y nunca hace fallar la sincronización.
    reset(session());
    store.getState().recordPriceObservations([{ equipmentId: 'eq-1', kind: 'observation', priceUSD: 13, source: 'manual' }]);
    const order: string[] = [];
    const saved2 = { pullProjects: SyncService.pullProjects, pullEquipment: SyncService.pullEquipment, push: SyncService.pushPriceObservations, folders: store.getState().syncFoldersWithServer, clients: store.getState().syncClientsWithServer, company: store.getState().syncOrganizationCompanyProfile };
    SyncService.pullProjects = async () => ({ success: true, projects: [], deletedIds: [], serverTimestamp: '2026-11-21T00:00:00.000Z' });
    SyncService.pullEquipment = async () => { order.push('equipment'); return { success: true, items: [], deletedIds: [] }; };
    SyncService.pushPriceObservations = async () => { order.push('prices'); throw new Error('boom'); };
    store.setState({ syncFoldersWithServer: async () => ({ success: true, message: '' }), syncClientsWithServer: async () => ({ success: true, message: '' }), syncOrganizationCompanyProfile: async () => ({ success: true }) });
    try {
      const all = await store.getState().syncProjectsWithServer(true);
      assert.deepEqual(order, ['equipment', 'prices'], 'prices run after the catalog');
      assert.equal(all.success, true, JSON.stringify(all));
      assert.equal(pending().observations.length, 1, 'a failing price step keeps its queue');
    } finally {
      SyncService.pullProjects = saved2.pullProjects;
      SyncService.pullEquipment = saved2.pullEquipment;
      SyncService.pushPriceObservations = saved2.push;
      store.setState({ syncFoldersWithServer: saved2.folders, syncClientsWithServer: saved2.clients, syncOrganizationCompanyProfile: saved2.company });
    }
  } finally {
    globalThis.fetch = originalFetch;
    store.setState(initial, true);
  }
  console.log('PASS: equipment price slice queues per workspace and user, applies pending generics, syncs in acknowledged chunks, treats 404 as unsupported and never records from pull, hydrate or conflicts.');
}
await run();
