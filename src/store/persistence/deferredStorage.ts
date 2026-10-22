import type { PersistStorage, StorageValue } from 'zustand/middleware';

type TextStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const sameState = (left: unknown, right: unknown) => {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return left === right;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]);
};

/**
 * persist calls setItem on every set(); serializing the whole workspace there blocks the UI thread.
 * Writes are coalesced and skipped when every persisted slice keeps its reference.
 */
export function createDeferredJSONStorage<S>(resolve: () => TextStorage, delayMs = 400): PersistStorage<S> & { flush: () => void } {
  const pending = new Map<string, StorageValue<S>>();
  const written = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [name, value] of pending) {
      pending.delete(name);
      const last = written.get(name);
      if (last && last.version === value.version && sameState(last.state, value.state)) continue;
      resolve().setItem(name, JSON.stringify(value));
      written.set(name, value);
    }
  };
  return {
    getItem: name => {
      const queued = pending.get(name);
      if (queued) return queued;
      const raw = resolve().getItem(name);
      return raw === null ? null : JSON.parse(raw) as StorageValue<S>;
    },
    setItem: (name, value) => {
      pending.set(name, value);
      timer ??= setTimeout(flush, delayMs);
    },
    removeItem: name => {
      pending.delete(name);
      written.delete(name);
      resolve().removeItem(name);
    },
    flush,
  };
}
