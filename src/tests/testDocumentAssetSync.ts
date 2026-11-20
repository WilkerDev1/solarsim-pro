import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SyncService, clearDocumentAssetCache } from '../services/syncService';
import { ASSET_REFS_QUERY, assetRef, isAssetRef, mapDocumentAssetFields, replaceAssetRefs } from '../../shared/documentAssets';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import type { ProjectSimulation } from '../types';

// El escritorio recibe referencias `asset:sha256:` y las convierte en el contenido antes de que lleguen al store:
// el PDF, el visor web y la caché local siguen viendo imágenes; por la red viaja cada logo una sola vez.

const serverUrl = 'https://document-assets.invalid';
const logo = (seed: string) => `data:image/png;base64,${Buffer.from(seed.repeat(400)).toString('base64')}`;
const shared = logo('empresa-');
const own = logo('distinto-');
const thumb = logo('miniatura-');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

// --- Contrato compartido ---
assert.ok(isAssetRef(assetRef(sha(shared))));
assert.equal(isAssetRef(shared), false);
assert.equal(isAssetRef('asset:sha256:xyz'), false);
const sample = { id: 'x', customization: { companyName: 'E', coverLogoBase64: shared, headerLogoBase64: '', attachedPdfs: [{ id: 'a', thumbnailDataUrl: thumb, fileName: 'f.pdf' }] }, client: { name: shared } };
const mapped = mapDocumentAssetFields(sample, (value) => `X${value.length}`);
assert.equal(mapped.customization.coverLogoBase64, `X${shared.length}`);
assert.equal(mapped.customization.headerLogoBase64, '', 'Empty values are not assets');
assert.equal(mapped.customization.attachedPdfs[0].thumbnailDataUrl, `X${thumb.length}`);
assert.equal(mapped.client.name, shared, 'Only the declared image fields are touched');
assert.equal(mapped.customization.companyName, 'E');
assert.equal(sample.customization.coverLogoBase64, shared, 'The input is not mutated');
const plain = { id: 'y', customization: { companyName: 'E' } };
assert.strictEqual(mapDocumentAssetFields(plain, () => 'never'), plain, 'Documents without images keep their identity');
const nested = { results: [{ project: { customization: { coverLogoBase64: assetRef(sha(own)) } } }] };
assert.equal(replaceAssetRefs(nested, (hash) => (hash === sha(own) ? own : undefined)).results[0].project.customization.coverLogoBase64, own);

// --- Transporte sintético ---
const project = (id: string, customization: Record<string, unknown>): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT), id, version: 2, baseVersion: 2, syncStatus: 'synced',
  customization: { ...structuredClone(BENCHMARK_PROJECT.customization || {}), ...customization } as ProjectSimulation['customization'],
});
const assets = new Map([[sha(shared), shared], [sha(own), own], [sha(thumb), thumb]]);
const withRefs = (p: ProjectSimulation) => mapDocumentAssetFields(p, (value) => assetRef(sha(value)));
const remote = [
  project('a', { coverLogoBase64: shared, headerLogoBase64: shared, attachedPdfs: [{ id: 't', fileName: 'f.pdf', fileSize: 1, pageCount: 1, title: 'F', uploadedAt: '2026-11-20T00:00:00.000Z', enabled: true, addToTableOfContents: true, thumbnailDataUrl: thumb }] }),
  project('b', { coverLogoBase64: own, headerLogoBase64: shared }),
];
const calls: Array<{ path: string; refs: boolean; body?: any }> = [];
let failAssets = false;
let forgetAssets = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const refs = url.searchParams.get(ASSET_REFS_QUERY) === '1';
  // A new header would change the CORS preflight and an older API would block the request.
  assert.equal([...new Headers(init.headers).keys()].some((name) => name.includes('asset')), false);
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path: url.pathname, refs, body });
  if (url.pathname.startsWith('/api/document-assets/')) {
    const hash = url.pathname.split('/').pop()!;
    if (failAssets) throw new TypeError('Sin conexión');
    return assets.has(hash) ? Response.json({ success: true, sha256: hash, content: assets.get(hash) }) : Response.json({ error: 'Activo no encontrado' }, { status: 404 });
  }
  if (url.pathname === '/api/sync/pull') {
    return Response.json({ success: true, projects: remote.map((p) => (refs ? withRefs(p) : p)), deletedIds: [], serverTimestamp: '2026-11-20T00:00:00.000Z', count: remote.length });
  }
  if (url.pathname.startsWith('/api/projects/')) {
    const found = remote.find((p) => p.id === decodeURIComponent(url.pathname.split('/').pop()!));
    return Response.json({ success: true, project: refs ? withRefs(found!) : found });
  }
  if (url.pathname === '/api/sync/push') {
    const sent: ProjectSimulation[] = body.projects;
    const unknown = sent.flatMap((p) => JSON.stringify(p).match(/asset:sha256:[0-9a-f]{64}/g) || []).some((ref) => forgetAssets || !assets.has(ref.slice(13)));
    if (unknown) return Response.json({ error: 'Logo desconocido', code: 'unknown_document_asset' }, { status: 400 });
    return Response.json({ success: true, results: sent.map((p) => ({ id: p.id, originalId: p.id, status: 'updated', version: (p.baseVersion ?? 0) + 1, project: (() => { const saved = mapDocumentAssetFields({ ...p, version: (p.baseVersion ?? 0) + 1 }, (value) => (isAssetRef(value) ? assets.get(value.slice(13))! : value)); return refs ? withRefs(saved) : saved; })() })) });
  }
  throw new Error(`Unexpected ${url.pathname}`);
}) as typeof fetch;

async function run() {
  try {
    // Pull: announces references, expands them, and downloads each distinct asset once.
    const pulled = await SyncService.pullProjects(serverUrl, 'synthetic', null);
    assert.ok(pulled.success, pulled.error);
    assert.ok(calls[0].refs, 'The pull announces references');
    const a = pulled.projects!.find((p) => p.id === 'a')!;
    const b = pulled.projects!.find((p) => p.id === 'b')!;
    assert.equal(a.customization?.coverLogoBase64, shared, 'The store receives the image, never a reference');
    assert.equal(a.customization?.attachedPdfs?.[0].thumbnailDataUrl, thumb);
    assert.equal(b.customization?.coverLogoBase64, own);
    assert.ok(!JSON.stringify(pulled.projects).includes('asset:sha256:'));
    const assetCalls = calls.filter((c) => c.path.startsWith('/api/document-assets/')).map((c) => c.path).sort();
    assert.deepEqual(assetCalls, [`/api/document-assets/${sha(own)}`, `/api/document-assets/${sha(shared)}`, `/api/document-assets/${sha(thumb)}`].sort(), 'One download per distinct image');

    // A second pull reuses the cache.
    calls.length = 0;
    assert.ok((await SyncService.pullProjects(serverUrl, 'synthetic', null)).success);
    assert.equal(calls.filter((c) => c.path.startsWith('/api/document-assets/')).length, 0, 'Cached assets are not downloaded again');

    // GET of one proposal also expands.
    const one = await SyncService.getProject(serverUrl, 'synthetic', 'b');
    assert.equal(one.project?.customization?.coverLogoBase64, own);

    // Push: images the server already has travel as references; the response comes back as images.
    calls.length = 0;
    const edited = { ...a, baseVersion: 2, syncStatus: 'pending' as const, client: { ...a.client, name: 'Editado' } };
    const pushed = await SyncService.pushProjects(serverUrl, 'synthetic', [edited]);
    assert.ok(pushed.success, pushed.error);
    const sent = calls.find((c) => c.path === '/api/sync/push')!;
    assert.ok(sent.refs);
    assert.equal(sent.body.projects[0].customization.coverLogoBase64, assetRef(sha(shared)), 'Known image is sent as a reference');
    assert.equal(sent.body.projects[0].customization.attachedPdfs[0].thumbnailDataUrl, assetRef(sha(thumb)));
    assert.ok(JSON.stringify(sent.body).length < shared.length, 'The push payload no longer carries the logos');
    const result = pushed.results![0];
    assert.equal(result.status, 'updated');
    assert.equal((result as { project?: ProjectSimulation }).project?.customization?.coverLogoBase64, shared, 'Acknowledged document carries the image');

    // A new image the server has never seen travels inline once.
    calls.length = 0;
    const fresh = logo('nuevo-');
    const withNew = { ...edited, customization: { ...edited.customization!, watermarkLogoBase64: fresh } };
    await SyncService.pushProjects(serverUrl, 'synthetic', [withNew]);
    assert.equal(calls.find((c) => c.path === '/api/sync/push')!.body.projects[0].customization.watermarkLogoBase64, fresh);

    // The server does not know a reference (other organization, restored database): retry once with images.
    forgetAssets = true;
    calls.length = 0;
    const retried = await SyncService.pushProjects(serverUrl, 'synthetic', [edited]);
    forgetAssets = false;
    const pushes = calls.filter((c) => c.path === '/api/sync/push');
    assert.equal(pushes.length, 2, 'One retry');
    assert.equal(pushes[1].body.projects[0].customization.coverLogoBase64, shared, 'The retry sends images');
    assert.ok(retried.success, retried.error);

    // An image that cannot be downloaded fails the pull instead of storing a reference.
    clearDocumentAssetCache();
    failAssets = true;
    const failed = await SyncService.pullProjects(serverUrl, 'synthetic', null);
    failAssets = false;
    assert.equal(failed.success, false);
    assert.match(failed.error || '', /logo|imagen/i);
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log('✓ Document assets: references expanded on pull/GET, compacted on push, retry and failure handled');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
