import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDeferredJSONStorage } from '../store/persistence/deferredStorage';
import { createPersistedDocumentAssets } from '../store/persistence/persistedDocumentAssets';
import { assetRef } from '../../shared/documentAssets';

// Firmas y sellos de la biblioteca, y la firma y el sello fijados en una cotización emitida: cada imagen en línea se
// guarda una sola vez (prefijo `quotation-asset:sha256:`) y una referencia del servidor nunca se expande al hidratar.
const NAME = 'qa-library-assets';
const ASSETS = `${NAME}-assets`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const image = (seed: number, size = 300_000) => {
  const unit = `SG${seed}x`.padEnd(16, String.fromCharCode(70 + seed));
  return `data:image/png;base64,${unit.repeat(Math.ceil(size / unit.length)).slice(0, size)}`;
};
const SIGNATURE = image(1);
const STAMP = image(2);
const serverRef = assetRef(sha(SIGNATURE));
const signature = (id: string, img = SIGNATURE, kind = 'signature') => ({ id, kind, name: id, role: '', image: img, isDefault: false, version: 1, baseVersion: 1 });
const library = {
  templates: { items: [{ id: 't1', name: 'Clásica' }], changes: {}, deletions: [], cursor: null },
  signatures: {
    items: [...Array.from({ length: 12 }, (_, i) => signature(`s${i}`)), signature('stamp', STAMP, 'stamp'), signature('from-server', serverRef)],
    changes: { s0: { revision: 'r', baseVersion: 1, server: signature('s0', serverRef) } },
    deletions: [{ id: 'gone', baseVersion: 1, record: signature('gone') }],
    cursor: null,
  },
};
const issued = {
  id: 'q1', status: 'issued', issuer: { name: 'E', taxId: '', address: '', phone: '', email: '', website: '', logo: '' }, attachments: [],
  design: { layout: 'clasica', accent: '#087b58', typography: 'sans', showSignature: true, showStamp: true, signature: { name: 'Idali', role: 'Ventas', image: SIGNATURE }, stampImage: STAMP },
};
const state = {
  sidebarTheme: 'dark',
  quotations: Array.from({ length: 10 }, (_, i) => ({ ...issued, id: `q${i}` })),
  quotationLibrary: library,
  organizationWorkspaces: { 'https://otra.invalid|org': { quotationLibrary: library } },
};

const backing = new Map<string, string>();
const storage = { getItem: (k: string) => backing.get(k) ?? null, setItem: (k: string, v: string) => { backing.set(k, v); }, removeItem: (k: string) => { backing.delete(k); } };
const setup = () => {
  const assets = createPersistedDocumentAssets({ hash: async (text) => sha(text) });
  return { assets, storage: createDeferredJSONStorage<any>(() => storage, 5, assets) };
};
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

async function run() {
  const first = setup();
  first.storage.setItem(NAME, { state, version: 0 });
  first.storage.flush();
  const inlineSize = backing.get(NAME)!.length;
  await first.assets.settled();
  first.storage.rewrite(NAME, { state, version: 0 });
  first.storage.flush();

  const blob = backing.get(NAME)!;
  const everything = blob + (backing.get(ASSETS) ?? '');
  assert.equal(occurrences(blob, SIGNATURE), 0, 'the main blob does not repeat the signature');
  assert.equal(occurrences(everything, SIGNATURE), 1, 'the signature is stored once (library, deletions, archives and issued copies)');
  assert.equal(occurrences(everything, STAMP), 1, 'the stamp is stored once');
  // Cuota: ~30 firmas y sellos de 300 KB y 20 copias fijadas ocupan una imagen de cada uno, no todas.
  assert.ok(everything.length < 2 * SIGNATURE.length + 200_000, `collapsed size ${everything.length}`);
  assert.ok(inlineSize > 20 * SIGNATURE.length, 'before hashing everything was inline');
  const parsed = JSON.parse(blob).state;
  assert.equal(parsed.quotationLibrary.signatures.items[0].image, `quotation-asset:sha256:${sha(SIGNATURE)}`);
  assert.equal(parsed.quotationLibrary.signatures.items[13].image, serverRef, 'a server reference is written as it is');
  assert.equal(parsed.quotationLibrary.signatures.deletions[0].record.image, `quotation-asset:sha256:${sha(SIGNATURE)}`);
  assert.equal(parsed.quotations[0].design.signature.image, `quotation-asset:sha256:${sha(SIGNATURE)}`, 'the printed signature copy too');
  assert.equal(parsed.quotations[0].design.stampImage, `quotation-asset:sha256:${sha(STAMP)}`, 'and the printed stamp');
  assert.equal(parsed.organizationWorkspaces['https://otra.invalid|org'].quotationLibrary.signatures.items[1].image, `quotation-asset:sha256:${sha(SIGNATURE)}`);
  assert.equal(state.quotationLibrary.signatures.items[0].image, SIGNATURE, 'memory is not modified');

  const hydrated = setup().storage.getItem(NAME) as any;
  assert.deepEqual(hydrated.state, state, 'hydration restores the inline images exactly');
  assert.equal(hydrated.state.quotationLibrary.signatures.items[13].image, serverRef, 'the server reference is not expanded');
  assert.equal(hydrated.state.quotationLibrary.signatures.changes.s0.server.image, serverRef, 'nor the conflict copy');

  console.log('Quotation library persisted assets tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
