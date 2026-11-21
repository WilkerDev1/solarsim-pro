import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDeferredJSONStorage } from '../store/persistence/deferredStorage';
import { createPersistedDocumentAssets } from '../store/persistence/persistedDocumentAssets';
import { assetRef, isAssetRef } from '../../shared/documentAssets';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';

// Los logos y miniaturas se repetían en cada propuesta, versión y archivo de organización: ~98% de lo que se
// serializaba en cada escritura. Se guardan una vez (clave aparte) y el store en memoria sigue viendo el base64.
const NAME = 'qa-assets-storage';
const ASSETS = `${NAME}-assets`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const image = (seed: number, size = 300_000) => {
  const unit = `QA${seed}x`.padEnd(16, String.fromCharCode(65 + seed));
  return `data:image/png;base64,${unit.repeat(Math.ceil(size / unit.length)).slice(0, size)}`;
};
const images = [0, 1, 2, 3, 4].map((seed) => image(seed));
const project = (id: string, logos: string[], extra: Record<string, unknown> = {}) => ({
  id,
  client: { name: `Cliente ${id}` },
  customization: {
    companyName: 'Empresa QA',
    coverLogoBase64: logos[0],
    headerLogoBase64: logos[1],
    webHeaderLogoBase64: logos[2],
    watermarkLogoBase64: logos[3],
    attachedPdfs: [{ id: `pdf-${id}`, fileName: 'ficha.pdf', thumbnailDataUrl: logos[4] ?? logos[0] }],
    ...extra,
  },
});
const projects = Array.from({ length: 50 }, (_, i) => project(`p${i}`, [0, 1, 2, 3, 4].map((k) => images[(i + k) % 5])));
const workspace = (state: Record<string, any>) => ({
  ...state,
  projects: state.projects,
  companies: [{ id: 'empresa', name: 'Empresa QA', logoBase64: images[0], watermarkLogoBase64: images[3], signatureSealBase64: 'corto' }],
  defaultDocumentCustomization: { companyName: 'Empresa QA', coverLogoBase64: images[0], headerLogoBase64: images[1] },
  documentTemplatesByCompany: { empresa: { headerLogoBase64: images[1], attachedPdfs: [{ id: 't', thumbnailDataUrl: images[2] }] } },
  snapshotsByProject: { p0: [{ id: 's1', projectId: 'p0', data: projects[0] }, { id: 's2', projectId: 'p0', data: projects[1] }] },
  projectDeletionQueue: [{ scope: 'local', id: 'p9', baseVersion: 1, stage: 'trash', project: projects[9] }],
  projectConflicts: { 'local|p8': { scope: 'local', projectId: 'p8', localProject: projects[8], serverProject: projects[7] } },
});
const baseState = () => workspace({
  projects,
  sidebarTheme: 'dark',
  organizationWorkspaces: { 'https://otra.invalid|org': workspace({ projects: projects.slice(0, 10) }) },
});

const backingStore = () => {
  const map = new Map<string, string>();
  return { map, storage: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } } };
};
const setup = (backing = backingStore()) => {
  let hashes = 0;
  let learned = 0;
  const assets = createPersistedDocumentAssets({
    hash: async (text) => { hashes++; return sha(text); },
    onLearned: () => { learned++; },
  });
  const storage = createDeferredJSONStorage<any>(() => backing.storage, 5, assets);
  return { backing, assets, storage, hashCount: () => hashes, learnedCount: () => learned };
};
const storedAssets = (map: Map<string, string>) => JSON.parse(map.get(ASSETS) ?? '{"assets":{}}').assets as Record<string, string>;

async function run() {
  // 1. Primera escritura: lo aún no calculado queda en línea (nunca una referencia sin activo).
  const first = setup();
  const state = baseState();
  first.storage.setItem(NAME, { state, version: 0 });
  first.storage.flush();
  const inlineSize = first.backing.map.get(NAME)!.length;
  assert.ok(first.backing.map.get(NAME)!.includes(images[0]), 'Sin hash conocido la imagen se escribe en línea');
  await first.assets.settled();
  assert.equal(first.learnedCount(), 1, 'Aprender hashes pide una sola reescritura');
  assert.equal(first.hashCount(), 5, 'Cada imagen distinta se calcula una vez');

  // 2. Reescritura colapsada: una copia por imagen.
  first.storage.rewrite(NAME, { state, version: 0 });
  first.storage.flush();
  const blob = first.backing.map.get(NAME)!;
  for (const img of images) assert.ok(!blob.includes(img.slice(22, 200)), 'El blob principal no lleva imágenes');
  const stored = storedAssets(first.backing.map);
  assert.deepEqual(Object.keys(stored).sort(), images.map(sha).sort(), 'Una entrada por imagen distinta');
  const total = blob.length + first.backing.map.get(ASSETS)!.length;
  assert.ok(total < images.reduce((sum, img) => sum + img.length, 0) * 1.05 + 200_000, `Tamaño ≈ una copia por imagen (${total})`);
  assert.ok(total * 50 < inlineSize, `Mucho menor que en línea (${total} vs ${inlineSize})`);
  const parsed = JSON.parse(blob).state;
  assert.equal(parsed.projects[0].customization.coverLogoBase64, assetRef(sha(projects[0].customization.coverLogoBase64)));
  assert.ok(isAssetRef(parsed.companies[0].logoBase64), 'Logos de la empresa');
  assert.equal(parsed.companies[0].signatureSealBase64, 'corto', 'Valores cortos quedan igual');
  assert.ok(isAssetRef(parsed.defaultDocumentCustomization.coverLogoBase64), 'Personalización predeterminada');
  assert.ok(isAssetRef(parsed.documentTemplatesByCompany.empresa.attachedPdfs[0].thumbnailDataUrl), 'Plantillas por empresa');
  assert.ok(isAssetRef(parsed.snapshotsByProject.p0[1].data.customization.headerLogoBase64), 'Historial de versiones');
  assert.ok(isAssetRef(parsed.projectDeletionQueue[0].project.customization.watermarkLogoBase64), 'Cola de borrado');
  assert.ok(isAssetRef(parsed.projectConflicts['local|p8'].serverProject.customization.coverLogoBase64), 'Conflictos');
  assert.ok(isAssetRef(parsed.organizationWorkspaces['https://otra.invalid|org'].projects[3].customization.attachedPdfs[0].thumbnailDataUrl), 'Archivos de otras organizaciones');
  assert.equal(state.projects[0].customization.coverLogoBase64, images[0], 'El estado en memoria no se modifica');

  // 3. Escrituras siguientes no recalculan hashes ni reescriben los activos.
  const assetsBlob = first.backing.map.get(ASSETS);
  first.storage.setItem(NAME, { state: { ...state, sidebarTheme: 'light' }, version: 0 });
  first.storage.flush();
  await first.assets.settled();
  assert.equal(first.hashCount(), 5, 'Sin nuevos hashes');
  assert.equal(first.backing.map.get(ASSETS), assetsBlob, 'Activos sin cambios no se reescriben');

  // 4. Hidratar (otro arranque) devuelve exactamente los mismos textos.
  const restart = setup(first.backing);
  const hydrated = restart.storage.getItem(NAME) as any;
  assert.deepEqual(hydrated.state, { ...state, sidebarTheme: 'light' }, 'Hidratar restaura las imágenes idénticas');
  await restart.assets.settled();
  assert.equal(restart.hashCount(), 0, 'Las imágenes cargadas ya tienen hash');
  assert.equal(restart.learnedCount(), 0);

  // 5. Un logo propio de una propuesta es su propia copia única.
  const custom = image(9, 120_000);
  const withCustom = { ...hydrated.state, projects: hydrated.state.projects.map((p: any, i: number) => i === 4 ? { ...p, customization: { ...p.customization, coverLogoBase64: custom } } : p) };
  restart.storage.setItem(NAME, { state: withCustom, version: 0 });
  restart.storage.flush();
  assert.ok(restart.backing.map.get(NAME)!.includes(custom), 'Aún sin hash: en línea');
  await restart.assets.settled();
  assert.equal(restart.learnedCount(), 1);
  restart.storage.rewrite(NAME, { state: withCustom, version: 0 });
  restart.storage.flush();
  assert.ok(!restart.backing.map.get(NAME)!.includes(custom.slice(22, 200)));
  assert.equal(Object.keys(storedAssets(restart.backing.map)).length, 6);
  assert.equal(storedAssets(restart.backing.map)[sha(custom)], custom);
  assert.equal((setup(restart.backing).storage.getItem(NAME) as any).state.projects[4].customization.coverLogoBase64, custom);

  // 6. Una imagen que ya nadie usa sale del mapa de activos.
  restart.storage.setItem(NAME, { state: hydrated.state, version: 0 });
  restart.storage.flush();
  assert.ok(!(sha(custom) in storedAssets(restart.backing.map)), 'Activo sin uso eliminado');
  assert.equal(Object.keys(storedAssets(restart.backing.map)).length, 5);

  // 7. Migración: un blob antiguo con imágenes en línea hidrata igual y se vuelve a guardar colapsado.
  const legacy = backingStore();
  legacy.map.set(NAME, JSON.stringify({ state, version: 0 }));
  const migrating = setup(legacy);
  assert.deepEqual((migrating.storage.getItem(NAME) as any).state, state, 'El blob antiguo hidrata idéntico');
  await migrating.assets.settled();
  assert.equal(migrating.learnedCount(), 1, 'Hidratar un blob en línea calcula sus hashes y pide reescribir');
  migrating.storage.rewrite(NAME, { state, version: 0 });
  migrating.storage.flush();
  assert.ok(legacy.map.get(NAME)!.length < 200_000, 'Se reescribe colapsado');
  assert.deepEqual((setup(legacy).storage.getItem(NAME) as any).state, state);

  // 8. Activo ausente o mapa corrupto: nunca se rompe la hidratación ni se escribe una referencia colgante.
  const missingRef = assetRef('f'.repeat(64));
  const broken = backingStore();
  broken.map.set(NAME, JSON.stringify({ state: { projects: [project('x', [missingRef, images[1]])] }, version: 0 }));
  broken.map.set(ASSETS, JSON.stringify({ version: 1, assets: { [sha(images[1])]: images[1], ['a'.repeat(64)]: 42 } }));
  const recovering = setup(broken);
  const recovered = (recovering.storage.getItem(NAME) as any).state;
  assert.equal(recovered.projects[0].customization.coverLogoBase64, missingRef, 'Una referencia sin activo se conserva tal cual');
  assert.equal(recovered.projects[0].customization.headerLogoBase64, images[1], 'Las demás imágenes se restauran');
  recovering.storage.setItem(NAME, { state: recovered, version: 0 });
  recovering.storage.flush();
  assert.equal(JSON.parse(broken.map.get(NAME)!).state.projects[0].customization.coverLogoBase64, missingRef);
  broken.map.set(ASSETS, '{corrupto');
  const corrupt = setup(broken).storage.getItem(NAME) as any;
  assert.ok(corrupt.state.projects[0], 'Un mapa de activos corrupto no impide hidratar');
  const fresh = setup(broken);
  fresh.storage.getItem(NAME);
  fresh.storage.setItem(NAME, { state: { projects: [project('y', images)] }, version: 0 });
  fresh.storage.flush();
  await fresh.assets.settled();
  fresh.storage.rewrite(NAME, { state: { projects: [project('y', images)] }, version: 0 });
  fresh.storage.flush();
  const rewritten = setup(broken).storage.getItem(NAME) as any;
  assert.deepEqual(rewritten.state.projects[0].customization.coverLogoBase64, images[0], 'Tras un mapa corrupto, las nuevas referencias tienen su activo');

  // 9. Sin SubtleCrypto (hash nulo) todo queda en línea, como antes.
  const plain = backingStore();
  const noHash = createPersistedDocumentAssets({ hash: async () => null, onLearned: () => assert.fail('Nada que reescribir') });
  const plainStorage = createDeferredJSONStorage<any>(() => plain.storage, 5, noHash);
  plainStorage.setItem(NAME, { state, version: 0 });
  plainStorage.flush();
  await noHash.settled();
  plainStorage.setItem(NAME, { state: { ...state }, version: 0 });
  plainStorage.flush();
  assert.ok(plain.map.get(NAME)!.includes(images[0]));
  assert.ok(!plain.map.has(ASSETS));

  // 10. removeItem borra también los activos.
  first.storage.removeItem(NAME);
  assert.ok(!first.backing.map.has(ASSETS));

  // 11. Store real: el blob antiguo de localStorage hidrata con el base64 y se guarda colapsado solo.
  const big = image(7);
  const legacyProject = { ...structuredClone(BENCHMARK_PROJECT), id: 'legacy-doc', customization: { ...BENCHMARK_PROJECT.customization, coverLogoBase64: big, headerLogoBase64: big } };
  localStorage.setItem('solarsim-pro-storage', JSON.stringify({ state: { projects: [legacyProject], activeProjectId: 'legacy-doc', workspaceScope: 'local', organizationWorkspaces: {} }, version: 0 }));
  const { useSimulationStore, flushSimulationStorePersistence, settleSimulationStoreAssets } = await import('../store/useSimulationStore');
  const loaded = useSimulationStore.getState().projects.find((p) => p.id === 'legacy-doc');
  assert.ok(loaded?.customization?.coverLogoBase64 === big, 'El store en memoria ve el base64');
  await settleSimulationStoreAssets();
  flushSimulationStorePersistence();
  const persisted = localStorage.getItem('solarsim-pro-storage')!;
  assert.ok(!persisted.includes(big.slice(22, 200)), 'El store reescribe su blob colapsado tras hidratar');
  assert.equal(JSON.parse(localStorage.getItem('solarsim-pro-storage-assets')!).assets[sha(big)], big);
  console.log('Imágenes del documento persistidas una vez, hidratadas idénticas, migración y activos ausentes seguros.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
