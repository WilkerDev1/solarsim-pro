import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { saveDatasheetLocally, attachImportedDatasheet } from '../services/datasheetImportService';
import { normalizeDatasheetResponse } from '../utils/datasheetImport';
import { featureScope } from '../../shared/applicationFeatures';
import { datasheetFileName } from '../utils/proposalDatasheets';

async function main() {
  const originalFetch = globalThis.fetch;
  const server = 'https://datasheet-qa.example.invalid';
  const scope = featureScope(server, 'org-qa');
  const user = { id: 'user-qa', organizationId: 'org-qa', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const };
  store.setState({ equipmentCatalog: [], equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, projects: [], workspaceScope: scope,
    syncSettings: { ...store.getState().syncSettings, serverUrl: server, currentUser: user, authToken: 'synthetic-only', autoSyncEnabled: true } });
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new TypeError('Servidor apagado'); };
  const extracted = normalizeDatasheetResponse({ equipmentType: 'inverter', brand: 'Fronius', modelSeries: 'PRIMO',
    variants: [3, 3.5, 3.6, 4, 4.6, 5, 6, 8.2, 10].map(powerKW => ({ modelCode: `PRIMO ${powerKW}-1`, displayName: `Fronius PRIMO ${powerKW}-1`, powerKW })) });
  const file = new File(['%PDF-1.7 synthetic'], 'qa.pdf', { type: 'application/pdf' });
  const signal = new AbortController().signal;
  try {
    const receipt = saveDatasheetLocally(extracted);
    assert.equal(receipt.created, 9);
    assert.equal(store.getState().equipmentCatalog.length, 9, 'All models exist before optional upload');
    await assert.rejects(attachImportedDatasheet(receipt, file, signal), /apagado/);
    const sync = await store.getState().syncEquipmentWithServer();
    assert.equal(sync.success, false);
    assert.equal(store.getState().equipmentCatalog.length, 9);
    assert.equal(Object.keys(store.getState().equipmentChanges).length, 9);
    for (const id of receipt.ids) {
      assert.equal(store.getState().equipmentChanges[id].scope, scope);
      assert.equal(store.getState().equipmentChanges[id].baseVersion, 0);
    }
    await store.persist.rehydrate();
    for (const id of receipt.ids) {
      assert.ok(store.getState().equipmentCatalog.some(item => item.id === id), 'Model survives rehydration');
      assert.equal(store.getState().equipmentChanges[id].scope, scope, 'Sync intent survives rehydration');
    }
    store.setState({ syncSettings: { ...store.getState().syncSettings, autoSyncEnabled: false } });
    const sizeBeforeRetry = store.getState().equipmentCatalog.length;
    let uploads = 0;
    globalThis.fetch = async (_url, init) => {
      uploads++;
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ asset: { id: 'shared-qa-file', name: 'qa.pdf' } }));
    };
    await attachImportedDatasheet(receipt, file, signal);
    assert.equal(uploads, 1, 'A single attachment is shared by nine variants');
    assert.equal(store.getState().equipmentCatalog.length, sizeBeforeRetry, 'Retry creates no duplicate models');
    receipt.ids.forEach(id => assert.equal(store.getState().equipmentCatalog.find(item => item.id === id)?.datasheetAssetId, 'shared-qa-file'));
    await assert.rejects(attachImportedDatasheet(receipt, file, signal), /adjunto cambió/, 'A stale receipt cannot overwrite another attachment');
    receipt.ids.forEach(id => {
      const item = store.getState().equipmentCatalog.find(item => item.id === id)!;
      assert.equal(item.datasheetName, datasheetFileName(item.displayName), 'Each model names the shared file after itself, not the server name');
    });

    // A photo scanned with AI is an equipment image, never a datasheet annex.
    const photoReceipt = saveDatasheetLocally(normalizeDatasheetResponse({ equipmentType: 'panel', brand: 'QA', modelSeries: 'Foto',
      variants: [{ modelCode: 'QA-FOTO-600', displayName: 'QA Foto 600 W', powerW: 600 }] }));
    let uploadedKind: unknown;
    globalThis.fetch = async (_url, init) => {
      uploadedKind = (init?.body as FormData).get('kind');
      return new Response(JSON.stringify({ asset: { id: 'photo-asset', name: 'IMG_0001.jpg' } }));
    };
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0001.jpg', { type: 'image/jpeg' });
    await attachImportedDatasheet(photoReceipt, photo, signal);
    assert.equal(uploadedKind, 'image');
    const photographed = store.getState().equipmentCatalog.find(item => item.id === photoReceipt.ids[0])!;
    assert.deepEqual(photographed.imageAssetIds, ['photo-asset']);
    assert.deepEqual(photographed.imageNames, ['QA Foto 600 W']);
    assert.equal(photographed.datasheetAssetId, undefined, 'No PDF annex is invented from a photo');
    await attachImportedDatasheet(photoReceipt, photo, signal);
    assert.deepEqual(store.getState().equipmentCatalog.find(item => item.id === photoReceipt.ids[0])!.imageAssetIds, ['photo-asset'], 'Retrying does not duplicate the image');

    const beforeUpdate = store.getState().equipmentCatalog.find(item => item.id === receipt.ids[0])!;
    const offers = [{ id: 'offer', supplierName: 'QA', priceUSD: 120, updatedAt: '2026-10-13' }];
    store.getState().updateEquipmentItem(beforeUpdate.id, { supplierPrices: offers });
    const updateData = { ...extracted, variants: [{ ...extracted.variants[0], action: 'update' as const, matchedEquipmentId: beforeUpdate.id, displayName: 'Modelo corregido' }] };
    const updated = saveDatasheetLocally(updateData);
    globalThis.fetch = async () => { throw new TypeError('Servidor apagado'); };
    await assert.rejects(attachImportedDatasheet(updated, file, signal), /apagado/);
    const afterUpdate = store.getState().equipmentCatalog.find(item => item.id === beforeUpdate.id)!;
    assert.equal(afterUpdate.displayName, 'Modelo corregido');
    assert.deepEqual(afterUpdate.supplierPrices, offers);
    assert.equal(afterUpdate.datasheetAssetId, 'shared-qa-file', 'Offline update preserves existing attachment');

    globalThis.fetch = async () => {
      store.setState({ sessionGeneration: store.getState().sessionGeneration + 1 });
      return new Response(JSON.stringify({ asset: { id: 'stale-response', name: 'qa.pdf' } }));
    };
    await assert.rejects(attachImportedDatasheet(updated, file, signal), /sesión cambió/);
    assert.equal(store.getState().equipmentCatalog.find(item => item.id === beforeUpdate.id)?.datasheetAssetId, 'shared-qa-file');
    store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: { ...user, role: 'VIEWER' } } });
    assert.throws(() => saveDatasheetLocally(updateData), /solo puede consultar/);
    store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: user } });
    store.getState().equipmentCatalog.find(item => item.id === beforeUpdate.id)!.organizationId = 'other-org';
    assert.throws(() => saveDatasheetLocally(updateData), /otro ámbito/);

    store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null }, equipmentCatalog: [] });
    const local = saveDatasheetLocally(extracted);
    assert.equal(local.created, 9);
    assert.equal(local.userId, undefined);
    assert.equal(store.getState().equipmentChanges[local.ids[0]].scope, 'local');
    await assert.rejects(attachImportedDatasheet(local, file, signal), /Inicia sesión/);
    assert.ok(requests > 0, 'Offline sync was exercised');
    console.log('PASS: nine offline variants, persisted sync intent, attachment-only retry, update preservation and session/role/tenant isolation.');
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
