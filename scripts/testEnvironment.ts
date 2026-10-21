// Default-deny network in renderer-domain tests. Each HTTP test injects its own transport.
globalThis.fetch = async () => { throw new Error('Real network is forbidden in this test suite. Inject a synthetic transport.'); };

// In-memory localStorage shared by the renderer-domain suites (each suite runs in its own process).
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  },
});
