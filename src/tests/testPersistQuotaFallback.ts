import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDeferredJSONStorage } from '../store/persistence/deferredStorage';
import { createPersistedDocumentAssets, persistedAssetsKey } from '../store/persistence/persistedDocumentAssets';

/**
 * Cerca del límite de almacenamiento, la primera escritura colapsada no puede guardar antes la clave de imágenes
 * (el blob anterior en línea sigue ocupando su espacio). Esa falla nunca puede impedir guardar el estado: se escribe
 * en línea (lo que había) y la siguiente reescritura vuelve a intentar colapsar cuando el blob principal ya libera
 * espacio. Sin esto, cada edición posterior a la actualización se perdía al reiniciar.
 */
const NAME = 'qa-quota-storage';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const logo = (seed: number) => `data:image/png;base64,${`Q${seed}`.repeat(75_000)}`; // ~150 KB
const logos = [0, 1, 2].map(logo);
const projects = (name0: string) => Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`, client: { name: i === 0 ? name0 : `P${i}` },
  customization: { coverLogoBase64: logos[i % 3], headerLogoBase64: logos[(i + 1) % 3] },
}));

function quotaStorage(limit: number) {
  const map = new Map<string, string>();
  const used = () => [...map.values()].reduce((sum, v) => sum + v.length, 0);
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (used() - (map.get(k)?.length ?? 0) + v.length > limit) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        map.set(k, v);
      },
      removeItem: (k: string) => { map.delete(k); },
    },
  };
}

async function run() {
  // Blob antiguo en línea (formato anterior) que ocupa casi todo el espacio disponible.
  const backing = quotaStorage(1_500_000); // cabe el blob (~1.2 M), no el blob más la clave de imágenes (~0.45 M)
  backing.map.set(NAME, JSON.stringify({ state: { projects: projects('P0') }, version: 0 }));
  assert.ok(backing.map.get(NAME)!.length > 600_000, 'blob antiguo grande');

  const assets = createPersistedDocumentAssets({ hash: async (text) => sha(text) });
  const storage = createDeferredJSONStorage<any>(() => backing.storage, 5, assets);
  const hydrated = storage.getItem(NAME) as any;
  await assets.settled();

  // Edición del usuario: debe guardarse aunque la clave de imágenes no quepa todavía.
  storage.setItem(NAME, { state: { ...hydrated.state, projects: projects('P0 EDITADO') }, version: 0 });
  assert.doesNotThrow(() => storage.flush(), 'la escritura no falla por la clave de imágenes');
  const saved = JSON.parse(backing.map.get(NAME)!).state;
  assert.equal(saved.projects[0].client.name, 'P0 EDITADO', 'la edición queda guardada');
  assert.equal(saved.projects[0].customization.coverLogoBase64, logos[0], 'sin imágenes guardadas, siguen en línea (nunca una referencia sin activo)');

  // Otro arranque: todo idéntico.
  const again = createDeferredJSONStorage<any>(() => backing.storage, 5, createPersistedDocumentAssets({ hash: async (text) => sha(text) }));
  assert.deepEqual((again.getItem(NAME) as any).state.projects, projects('P0 EDITADO'));

  // Con espacio suficiente, la reescritura siguiente colapsa y libera espacio.
  const roomy = quotaStorage(10_000_000);
  roomy.map.set(NAME, backing.map.get(NAME)!);
  const assets2 = createPersistedDocumentAssets({ hash: async (text) => sha(text) });
  const storage2 = createDeferredJSONStorage<any>(() => roomy.storage, 5, assets2);
  const h2 = storage2.getItem(NAME) as any;
  await assets2.settled();
  storage2.rewrite(NAME, { state: h2.state, version: 0 });
  storage2.flush();
  assert.ok(roomy.map.has(persistedAssetsKey(NAME)), 'con espacio: clave de imágenes escrita');
  assert.ok(roomy.map.get(NAME)!.length < 10_000, 'con espacio: blob principal colapsado');

  console.log('Persistencia: el límite de almacenamiento nunca impide guardar ediciones.');
}
run().catch((error) => { console.error(error); process.exit(1); });
