import type { PersistStorage, StorageValue } from 'zustand/middleware';

export type TextStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Transforms the persisted state around storage, e.g. document images kept once in a side key
 * (`persistedDocumentAssets.ts`). `encode` writes its side data before the main value; `committed` runs after.
 */
export interface PersistCodec {
  encode(name: string, state: unknown, storage: TextStorage): unknown;
  committed(name: string, storage: TextStorage): void;
  decode(name: string, state: unknown, storage: TextStorage): unknown;
  remove(name: string, storage: TextStorage): void;
}

const sameState = (left: unknown, right: unknown) => {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return left === right;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]);
};

/**
 * persist calls setItem on every set(); serializing the whole workspace there blocks the UI thread.
 * Writes are coalesced and skipped when every persisted slice keeps its reference (`rewrite` forces one).
 */
export function createDeferredJSONStorage<S>(resolve: () => TextStorage, delayMs = 400, codec?: PersistCodec): PersistStorage<S> & { flush: () => void; rewrite: (name: string, value: StorageValue<S>) => void } {
  const pending = new Map<string, StorageValue<S>>();
  const written = new Map<string, StorageValue<S>>();
  const forced = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [name, value] of pending) {
      pending.delete(name);
      const force = forced.delete(name);
      const last = written.get(name);
      if (!force && last && last.version === value.version && sameState(last.state, value.state)) continue;
      const storage = resolve();
      if (codec) {
        storage.setItem(name, JSON.stringify({ ...value, state: codec.encode(name, value.state, storage) }));
        codec.committed(name, storage);
      } else storage.setItem(name, JSON.stringify(value));
      written.set(name, value);
    }
  };
  const schedule = () => { timer ??= setTimeout(flush, delayMs); };
  return {
    getItem: name => {
      const queued = pending.get(name);
      if (queued) return queued;
      const storage = resolve();
      const raw = storage.getItem(name);
      if (raw === null) return null;
      const value = JSON.parse(raw) as StorageValue<S>;
      return codec ? { ...value, state: codec.decode(name, value.state, storage) as S } : value;
    },
    setItem: (name, value) => {
      pending.set(name, value);
      schedule();
    },
    rewrite: (name, value) => {
      pending.set(name, value);
      forced.add(name);
      schedule();
    },
    removeItem: name => {
      pending.delete(name);
      written.delete(name);
      forced.delete(name);
      const storage = resolve();
      storage.removeItem(name);
      codec?.remove(name, storage);
    },
    flush,
  };
}
