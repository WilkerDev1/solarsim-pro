import assert from 'node:assert/strict';
import {
  createEquipmentPreviewCache,
  createMemoryPreviewStorage,
  parsePreviewCacheKey,
  previewCacheKey,
  type PreviewStorage,
} from '../services/equipmentPreviewCache';
import { selectEquipmentPreviewSource, sniffAssetMimeType } from '../features/equipmentPreview/previewSource';
import { fetchAssetBlob, loadEquipmentAssetBlob, loadEquipmentThumbnail, seedEquipmentAssetBlob, sourceKey } from '../features/equipmentPreview/equipmentPreviewLoader';
import type { SolarEquipmentItem } from '../types/equipment';

const blob = (text: string, type = 'image/jpeg') => new Blob([text], { type });
const scope = 'https://qa.example.invalid|qa-org';

// Keys: scope|assetId|variant, every part encoded so a scope with "|" stays parseable.
const key = previewCacheKey(scope, 'asset/1', 'thumb');
assert.equal(key.split('|').length, 3);
assert.deepEqual(parsePreviewCacheKey(key), { scope, assetId: 'asset/1', variant: 'thumb' });
assert.throws(() => previewCacheKey(scope, '', 'thumb'), /assetId/);
assert.throws(() => previewCacheKey('', 'a', 'thumb'), /scope/);
assert.notEqual(previewCacheKey('local', 'a', 'thumb'), previewCacheKey(scope, 'a', 'thumb'), 'Workspaces never share previews');

// In-flight dedup: concurrent loads of one key run the loader once.
{
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const cache = createEquipmentPreviewCache({ storage: createMemoryPreviewStorage() });
  const loader = async () => { calls++; await gate; return blob('thumb-a'); };
  const pending = [cache.load(key, loader), cache.load(key, loader), cache.load(key, loader)];
  release();
  const results = await Promise.all(pending);
  assert.equal(calls, 1, 'One request in flight per key');
  assert.ok(results.every((result) => result === results[0]));
  assert.equal(await cache.load(key, async () => { calls++; return blob('other'); }), results[0], 'Memory hit skips the loader');
  assert.equal(calls, 1);
  assert.equal(cache.peek(key), results[0], 'peek reads memory synchronously');
}

// Persistence: a new cache over the same storage reads the stored blob without the network.
{
  const storage = createMemoryPreviewStorage();
  await createEquipmentPreviewCache({ storage }).load(key, async () => blob('persisted'));
  const fresh = createEquipmentPreviewCache({ storage });
  assert.equal(fresh.peek(key), null);
  const restored = await fresh.load(key, async () => { throw new Error('network must not be used'); });
  assert.equal(await restored?.text(), 'persisted');
  assert.equal(await (await fresh.get(key))?.text(), 'persisted', 'get reads memory or storage, never the loader');
  assert.equal(await fresh.get(previewCacheKey(scope, 'unknown', 'thumb')), null);
}

// Short negative cache: failures are not retried until the TTL passes; aborts are never cached.
{
  let now = 1_000;
  let calls = 0;
  const cache = createEquipmentPreviewCache({ storage: null, negativeTtlMs: 30_000, now: () => now });
  const failing = async () => { calls++; throw new Error('HTTP 500'); };
  assert.equal(await cache.load(key, failing), null);
  assert.equal(await cache.load(key, failing), null);
  assert.equal(calls, 1, 'Negative entry suppresses retries');
  now += 30_001;
  assert.equal(await cache.load(key, async () => { calls++; return null; }), null);
  assert.equal(calls, 2, 'Retry after the TTL; a null result is also negative');
  const abortKey = previewCacheKey(scope, 'aborted', 'thumb');
  await cache.load(abortKey, async () => { throw new DOMException('cancelado', 'AbortError'); });
  assert.equal(await (await cache.load(abortKey, async () => blob('ok')))?.text(), 'ok', 'An aborted load is retried at once');
  cache.put(previewCacheKey(scope, 'manual', 'source'), blob('%PDF', 'application/pdf'));
  assert.equal(await (await cache.get(previewCacheKey(scope, 'manual', 'source')))?.text(), '%PDF', 'put seeds the cache');
}

// Memory LRU by entries: the least recently used entry leaves memory but stays persisted.
{
  const storage = createMemoryPreviewStorage();
  const cache = createEquipmentPreviewCache({ storage, memoryEntries: 2 });
  const k = (id: string) => previewCacheKey(scope, id, 'thumb');
  await cache.load(k('a'), async () => blob('a'));
  await cache.load(k('b'), async () => blob('b'));
  assert.ok(cache.peek(k('a')), 'Touch a so b becomes the oldest');
  await cache.load(k('c'), async () => blob('c'));
  assert.equal(cache.peek(k('b')), null, 'Oldest entry is evicted from memory');
  assert.ok(cache.peek(k('a')) && cache.peek(k('c')));
  assert.equal(await (await cache.get(k('b')))?.text(), 'b', 'Evicted entry is still in storage');
}

// Persistent pruning by bytes, least recently accessed first.
{
  let now = 0;
  const storage = createMemoryPreviewStorage();
  const cache = createEquipmentPreviewCache({ storage, maxPersistentBytes: 10, now: () => ++now });
  const k = (id: string) => previewCacheKey(scope, id, 'source');
  await cache.load(k('old'), async () => blob('1234'));
  await cache.load(k('mid'), async () => blob('5678'));
  await cache.load(k('new'), async () => blob('9012'));
  await cache.flush();
  const keys = (await storage.list()).map((entry) => entry.key).sort();
  assert.deepEqual(keys, [k('mid'), k('new')].sort(), 'Oldest record is pruned once the budget is exceeded');
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 8 }, 'Pruning a resident record also releases its memory bytes');
}

// Storage failures never break previews: memory keeps working.
{
  const broken: PreviewStorage = {
    get: async () => { throw new Error('IndexedDB bloqueado'); },
    put: async () => { throw new Error('IndexedDB lleno'); },
    delete: async () => undefined,
    list: async () => { throw new Error('IndexedDB bloqueado'); },
  };
  const cache = createEquipmentPreviewCache({ storage: broken });
  assert.equal(await (await cache.load(key, async () => blob('memory only')))?.text(), 'memory only');
  assert.equal(await (await cache.get(key))?.text(), 'memory only');
  await cache.flush();
}

// Preview source: first image, otherwise the datasheet (asset ids only, never external URLs).
const item = (patch: Partial<SolarEquipmentItem>): SolarEquipmentItem => ({
  id: 'qa', type: 'panel', brand: 'QA', modelSeries: 'QA', displayName: 'QA 600 W', createdAt: '2026-10-21', updatedAt: '2026-10-21', ...patch,
});
assert.deepEqual(selectEquipmentPreviewSource(item({ imageAssetIds: ['img-1', 'img-2'], datasheetAssetId: 'ds' })), { assetId: 'img-1', kind: 'image' });
assert.deepEqual(selectEquipmentPreviewSource(item({ datasheetAssetId: 'ds', datasheetName: 'Ficha.pdf' })), { assetId: 'ds', kind: 'datasheet' });
assert.equal(selectEquipmentPreviewSource(item({ datasheetUrl: 'https://qa.example.invalid/ficha.pdf' })), null);
assert.equal(selectEquipmentPreviewSource(item({ imageAssetIds: [] })), null);
assert.equal(selectEquipmentPreviewSource(undefined), null);

// Content sniffing decides how to render; server Content-Type is not trusted.
const bytes = (...values: number[]) => new Uint8Array(values);
assert.equal(sniffAssetMimeType(new TextEncoder().encode('%PDF-1.7')), 'application/pdf');
assert.equal(sniffAssetMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
assert.equal(sniffAssetMimeType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
assert.equal(sniffAssetMimeType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
assert.equal(sniffAssetMimeType(new TextEncoder().encode('<svg onload=alert(1)>')), null, 'SVG and unknown content are rejected');

// Loader: content typing, sessions, and cache layering over the synthetic transport.
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const session = { scope, serverUrl: 'https://qa.example.invalid', authToken: 'synthetic' };
  const asset = async (body: BodyInit, type = 'application/octet-stream') => new Blob([await new Response(body).arrayBuffer()], { type });
  assert.equal((await fetchAssetBlob(session, 'img', async () => asset(png)))?.type, 'image/png', 'Type comes from the bytes');
  assert.equal(await fetchAssetBlob(session, 'svg', async () => asset('<svg/>', 'image/png')), null, 'Mislabelled content is rejected');
  assert.equal(await fetchAssetBlob({ ...session, authToken: null }, 'img', async () => { throw new Error('no request without session'); }), null);

  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async (url) => {
      requests++;
      assert.ok(String(url).startsWith('https://qa.example.invalid/api/equipment-assets/'));
      return String(url).endsWith('/pdf-as-image') ? new Response('%PDF-1.7') : new Response(png);
    };
    const cache = createEquipmentPreviewCache({ storage: createMemoryPreviewStorage() });
    const thumb = await loadEquipmentThumbnail(session, { assetId: 'img', kind: 'image' }, 96, cache);
    assert.equal(thumb?.type, 'image/png', 'Without a canvas the original image is the thumbnail');
    assert.equal(requests, 1);
    assert.ok(await cache.get(sourceKey(session, 'img')), 'Source bytes are cached for previews and annexes');
    await loadEquipmentThumbnail(session, { assetId: 'img', kind: 'image' }, 96, cache);
    assert.equal(requests, 1, 'Second thumbnail is served from cache');
    assert.equal(await loadEquipmentThumbnail(session, { assetId: 'pdf-as-image', kind: 'image' }, 96, cache), null, 'An image slot never renders a PDF');
    const offline = { ...session, authToken: null };
    assert.equal((await loadEquipmentAssetBlob(offline, 'img', cache))?.type, 'image/png', 'Cached bytes stay available offline');
    assert.equal(await loadEquipmentAssetBlob(offline, 'never-seen', cache), null);
    await seedEquipmentAssetBlob(session, 'uploaded', new Blob(['%PDF-1.7 local']), cache);
    assert.equal((await loadEquipmentAssetBlob(offline, 'uploaded', cache))?.type, 'application/pdf', 'Uploads seed the cache');
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; }
}

console.log('Equipment preview cache keys, in-flight dedup, persistence, negative TTL, LRU, pruning and source selection passed.');
