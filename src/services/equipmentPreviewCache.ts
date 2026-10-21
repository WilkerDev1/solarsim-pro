/**
 * Cache of equipment asset previews (catalog images and datasheets).
 *
 * Keys are `scope|assetId|variant`: the scope is the workspace (server + organization), so previews never
 * cross accounts. Server asset ids are content-addressed, so entries never go stale; they are only
 * pruned by least-recent use. Layers: memory LRU → persistent storage (IndexedDB in the app) → loader.
 * One load per key is in flight at a time, and failures are remembered briefly so a broken asset does
 * not hammer the server from every table row.
 */

export type EquipmentPreviewVariant = 'thumb' | 'source';

export interface PreviewRecord {
  key: string;
  blob: Blob;
  size: number;
  accessedAt: number;
}

export interface PreviewStorage {
  get(key: string): Promise<PreviewRecord | null>;
  put(record: PreviewRecord): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Array<Pick<PreviewRecord, 'key' | 'size' | 'accessedAt'>>>;
}

export interface EquipmentPreviewCacheOptions {
  /** Persistent layer; `null` keeps previews in memory only. */
  storage: PreviewStorage | null;
  memoryEntries?: number;
  memoryBytes?: number;
  maxPersistentBytes?: number;
  negativeTtlMs?: number;
  /** A stored record is re-stamped on read at most once per interval (keeps LRU pruning meaningful). */
  touchIntervalMs?: number;
  now?: () => number;
}

export type PreviewLoader = () => Promise<Blob | null>;

export interface EquipmentPreviewCache {
  /** Memory only, synchronous. */
  peek(key: string): Blob | null;
  /** Memory or storage; never calls a loader. */
  get(key: string): Promise<Blob | null>;
  /** Memory → storage → loader, deduplicated per key; resolves `null` on failure. */
  load(key: string, loader: PreviewLoader): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  /** Waits for pending storage writes and pruning. */
  flush(): Promise<void>;
}

export function previewCacheKey(scope: string, assetId: string, variant: EquipmentPreviewVariant | string): string {
  if (!scope) throw new Error('previewCacheKey requires a scope');
  if (!assetId) throw new Error('previewCacheKey requires an assetId');
  if (!variant) throw new Error('previewCacheKey requires a variant');
  return [scope, assetId, variant].map(encodeURIComponent).join('|');
}

export function parsePreviewCacheKey(key: string): { scope: string; assetId: string; variant: string } | null {
  const parts = key.split('|');
  if (parts.length !== 3) return null;
  const [scope, assetId, variant] = parts.map(decodeURIComponent);
  return { scope, assetId, variant };
}

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError' || (error as { name?: string })?.name === 'AbortError';

export function createEquipmentPreviewCache(options: EquipmentPreviewCacheOptions): EquipmentPreviewCache {
  const storage = options.storage;
  const memoryEntries = options.memoryEntries ?? 160;
  const memoryBytes = options.memoryBytes ?? 48 * 1024 * 1024;
  const maxPersistentBytes = options.maxPersistentBytes ?? 120 * 1024 * 1024;
  const negativeTtlMs = options.negativeTtlMs ?? 30_000;
  const touchIntervalMs = options.touchIntervalMs ?? 60 * 60 * 1000;
  const now = options.now ?? Date.now;

  // Map iteration order is insertion order: re-inserting on access makes the first key the LRU one.
  const memory = new Map<string, Blob>();
  let memorySize = 0;
  const inFlight = new Map<string, Promise<Blob | null>>();
  const failures = new Map<string, number>();
  const pending = new Set<Promise<void>>();

  const remember = (key: string, blob: Blob) => {
    const previous = memory.get(key);
    if (previous) { memory.delete(key); memorySize -= previous.size; }
    memory.set(key, blob);
    memorySize += blob.size;
    while (memory.size > 1 && (memory.size > memoryEntries || memorySize > memoryBytes)) {
      const [oldest, value] = memory.entries().next().value as [string, Blob];
      memory.delete(oldest);
      memorySize -= value.size;
    }
  };

  const track = (work: Promise<void>) => {
    const settled = work.catch(() => undefined).finally(() => pending.delete(settled));
    pending.add(settled);
    return settled;
  };

  const prune = async () => {
    if (!storage) return;
    const records = await storage.list();
    let total = records.reduce((sum, record) => sum + record.size, 0);
    for (const record of [...records].sort((a, b) => a.accessedAt - b.accessedAt)) {
      if (total <= maxPersistentBytes) break;
      await storage.delete(record.key);
      memory.delete(record.key);
      total -= record.size;
    }
  };

  const persist = (key: string, blob: Blob) => {
    if (!storage) return Promise.resolve();
    return track(storage.put({ key, blob, size: blob.size, accessedAt: now() }).then(prune));
  };

  const readStorage = async (key: string): Promise<Blob | null> => {
    if (!storage) return null;
    try {
      const record = await storage.get(key);
      if (!record?.blob) return null;
      if (now() - record.accessedAt > touchIntervalMs) void track(storage.put({ ...record, accessedAt: now() }));
      return record.blob;
    } catch {
      return null;
    }
  };

  const peek = (key: string) => {
    const blob = memory.get(key);
    if (!blob) return null;
    remember(key, blob);
    return blob;
  };

  const get = async (key: string) => {
    const hit = peek(key);
    if (hit) return hit;
    const stored = await readStorage(key);
    if (stored) remember(key, stored);
    return stored;
  };

  const load = (key: string, loader: PreviewLoader): Promise<Blob | null> => {
    const hit = peek(key);
    if (hit) return Promise.resolve(hit);
    const running = inFlight.get(key);
    if (running) return running;
    const failedAt = failures.get(key);
    if (failedAt !== undefined && now() - failedAt <= negativeTtlMs) return Promise.resolve(null);
    const task = (async () => {
      const stored = await get(key);
      if (stored) return stored;
      try {
        const blob = await loader();
        if (!blob) { failures.set(key, now()); return null; }
        failures.delete(key);
        remember(key, blob);
        await persist(key, blob);
        return blob;
      } catch (error) {
        if (!isAbort(error)) failures.set(key, now());
        return null;
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };

  const put = (key: string, blob: Blob) => {
    failures.delete(key);
    remember(key, blob);
    return persist(key, blob);
  };

  const flush = async () => {
    while (pending.size) await Promise.all([...pending]);
  };

  return { peek, get, load, put, flush };
}

export function createMemoryPreviewStorage(): PreviewStorage {
  const records = new Map<string, PreviewRecord>();
  return {
    get: async (key) => records.get(key) ?? null,
    put: async (record) => { records.set(record.key, record); },
    delete: async (key) => { records.delete(key); },
    list: async () => [...records.values()].map(({ key, size, accessedAt }) => ({ key, size, accessedAt })),
  };
}

const DB_NAME = 'solarsim_equipment_previews';
const BLOBS = 'previews';
const META = 'meta';

/** IndexedDB-backed storage, or `null` where IndexedDB does not exist (tests). Pruning reads only `meta`. */
export function createIndexedDbPreviewStorage(): PreviewStorage | null {
  if (typeof indexedDB === 'undefined') return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        for (const name of [BLOBS, META]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { dbPromise = null; reject(request.error); };
    });
    return dbPromise;
  };
  const read = async <T,>(name: string, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
    const request = operation((await db()).transaction(name, 'readonly').objectStore(name));
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  const write = async (operation: (blobs: IDBObjectStore, meta: IDBObjectStore) => void) => {
    const tx = (await db()).transaction([BLOBS, META], 'readwrite');
    operation(tx.objectStore(BLOBS), tx.objectStore(META));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: async (key) => (await read<PreviewRecord | undefined>(BLOBS, (store) => store.get(key))) ?? null,
    put: (record) => write((blobs, meta) => {
      blobs.put(record);
      meta.put({ key: record.key, size: record.size, accessedAt: record.accessedAt });
    }),
    delete: (key) => write((blobs, meta) => { blobs.delete(key); meta.delete(key); }),
    list: () => read<Array<Pick<PreviewRecord, 'key' | 'size' | 'accessedAt'>>>(META, (store) => store.getAll()),
  };
}

/** App-wide instance. */
export const equipmentPreviewCache = createEquipmentPreviewCache({ storage: createIndexedDbPreviewStorage() });
