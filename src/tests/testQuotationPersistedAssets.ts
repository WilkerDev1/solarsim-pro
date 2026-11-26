import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDeferredJSONStorage } from '../store/persistence/deferredStorage';
import { createPersistedDocumentAssets } from '../store/persistence/persistedDocumentAssets';
import { assetRef } from '../../shared/documentAssets';

// Las imágenes en línea de las cotizaciones (logo del emisor y miniaturas de anexos) se guardan una sola vez, como
// las de las propuestas; una referencia `asset:sha256:` del servidor en una cotización se conserva tal cual.
const NAME = 'qa-quotation-assets';
const ASSETS = `${NAME}-assets`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const image = (seed: number, size = 60_000) => {
  const unit = `QT${seed}y`.padEnd(16, String.fromCharCode(70 + seed));
  return `data:image/png;base64,${unit.repeat(Math.ceil(size / unit.length)).slice(0, size)}`;
};
const LOGO = image(1);
const THUMB = image(2);
const quotation = (id: string, logo = LOGO, thumb = THUMB) => ({
  id, number: null, status: 'draft', notes: `Cotización ${id}`,
  issuer: { name: 'Emisor', taxId: '', address: '', phone: '', email: '', website: '', logo },
  attachments: [
    { id: `${id}-a`, fileName: 'ficha.pdf', mode: 'related', origin: 'manual', thumbnailDataUrl: thumb },
    { id: `${id}-b`, fileName: 'sin-miniatura.pdf', mode: 'related', origin: 'manual' },
  ],
});
// Server copies (`base`, `serverQuotation`) never hold inline images: the API only stores references.
// The server reference points at the same content as the local logo: it must never be expanded into it.
const serverRef = assetRef(sha(LOGO));
const quotations = [...Array.from({ length: 20 }, (_, i) => quotation(`q${i}`)), quotation('q-server', serverRef)];
const state = {
  sidebarTheme: 'dark',
  quotations,
  quotationChanges: { q0: { revision: 'r', baseVersion: 1, base: { issuer: { logo: serverRef } }, serverQuotation: quotation('q0', serverRef, serverRef) } },
  quotationDeletionQueue: [{ id: 'q-gone', baseVersion: 1, quotation: quotation('q-gone') }],
  organizationWorkspaces: { 'https://otra.invalid|org': { quotations: quotations.slice(0, 5), quotationDeletionQueue: [] } },
};

const backing = new Map<string, string>();
const storage = { getItem: (k: string) => backing.get(k) ?? null, setItem: (k: string, v: string) => { backing.set(k, v); }, removeItem: (k: string) => { backing.delete(k); } };
const setup = () => {
  const assets = createPersistedDocumentAssets({ hash: async (text) => sha(text) });
  return { assets, storage: createDeferredJSONStorage<any>(() => storage, 5, assets) };
};
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
const needle = (img: string) => img;

async function run() {
  const first = setup();
  first.storage.setItem(NAME, { state, version: 0 });
  first.storage.flush();
  assert.ok(occurrences(backing.get(NAME)!, needle(LOGO)) > 20, 'Before hashing the images are written inline');
  await first.assets.settled();
  first.storage.rewrite(NAME, { state, version: 0 });
  first.storage.flush();

  const blob = backing.get(NAME)!;
  const everything = blob + (backing.get(ASSETS) ?? '');
  assert.equal(occurrences(blob, needle(LOGO)), 0, 'The main blob does not repeat the logo');
  assert.equal(occurrences(blob, needle(THUMB)), 0, 'Nor the thumbnails');
  assert.equal(occurrences(everything, needle(LOGO)), 1, 'The logo is stored once');
  assert.equal(occurrences(everything, needle(THUMB)), 1, 'The thumbnail is stored once');
  const parsed = JSON.parse(blob).state;
  assert.equal(parsed.quotations[0].issuer.logo, `quotation-asset:sha256:${sha(LOGO)}`);
  assert.equal(parsed.quotations[20].issuer.logo, serverRef, 'A server reference is written as it is');
  assert.equal(parsed.quotationDeletionQueue[0].quotation.attachments[0].thumbnailDataUrl, `quotation-asset:sha256:${sha(THUMB)}`, 'Deletion copies too');
  assert.equal(parsed.organizationWorkspaces['https://otra.invalid|org'].quotations[4].issuer.logo, `quotation-asset:sha256:${sha(LOGO)}`, 'Archived workspaces too');
  assert.equal(state.quotations[0].issuer.logo, LOGO, 'The state in memory is not modified');

  // Another start: serialize → hydrate gives back exactly the same quotations.
  const restart = setup();
  const hydrated = restart.storage.getItem(NAME) as any;
  assert.deepEqual(hydrated.state, state, 'Hydration restores the inline images and keeps the server references');
  assert.equal(hydrated.state.quotations[20].issuer.logo, serverRef, 'The server reference is not expanded into the local image');
  assert.equal(hydrated.state.quotationChanges.q0.base.issuer.logo, serverRef, 'Confirmed bases keep their references');

  // A side key that lost an entry yields no image (never an invalid value).
  storage.setItem(ASSETS, JSON.stringify({ version: 1, assets: {} }));
  const damaged = setup().storage.getItem(NAME) as any;
  assert.equal(damaged.state.quotations[0].issuer.logo, '');
  assert.equal(damaged.state.quotations[20].issuer.logo, serverRef);

  console.log('✅ Quotation persisted assets: inline images stored once, server references kept, round trip exact.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
