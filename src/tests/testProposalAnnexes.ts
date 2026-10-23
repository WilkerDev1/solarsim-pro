import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { applyAnnexPlan, catalogAnnexId, dismissAnnex, planDatasheetAnnexes, restoreDismissedAnnexes, unresolvedEquipmentIds } from '../utils/proposalAnnexes';
import { createProposalAttachmentResolver } from '../services/proposalAttachmentResolver';
import { missingAnnexesConfirmation } from '../components/pdf/annexes/confirmMissingAnnexes';
import type { AttachedPDFDocument, ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

const NOW = '2026-10-21T12:00:00.000Z';
const entry = (id: string, type: SolarEquipmentItem['type'], displayName: string, extra: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem => ({
  id, type, displayName, brand: 'QA', modelSeries: 'QA', createdAt: '2026-10-21', updatedAt: '2026-10-21', ...extra,
});
const catalog = [
  entry('pa', 'panel', 'QA 600 W', { datasheetAssetId: 'sheet-family', datasheetName: '5f3b762bf4e99b1.pdf' }),
  entry('pb', 'panel', 'QA 620 W', { datasheetAssetId: 'sheet-family', datasheetName: '5f3b762bf4e99b1.pdf' }),
  entry('inv', 'inverter', 'QA Inversor 8K', { datasheetAssetId: 'sheet-inverter' }),
  entry('bat', 'battery', 'QA Batería 16', { datasheetAssetId: 'sheet-battery' }),
  entry('photo', 'inverter', 'QA Foto', { datasheetAssetId: 'sheet-photo', datasheetName: 'scan.jpg' }),
  entry('url', 'battery', 'QA URL', { datasheetUrl: 'https://qa.example.invalid/ficha.pdf' }),
];
const project = (): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.specs.panels = [{ id: 'g1', catalogItemId: 'pa', brandModel: 'QA 600 W', powerW: 600, count: 10 }, { id: 'g2', catalogItemId: 'pb', brandModel: 'QA 620 W', powerW: 620, count: 4 }];
  p.specs.inverters = [{ id: 'g3', catalogItemId: 'inv', brandModel: 'QA Inversor 8K', powerKW: 8, count: 1 }];
  p.specs.batteries = [{ id: 'g4', catalogItemId: 'bat', brandModel: 'QA Batería 16', capacityKWh: 16, count: 0 }];
  p.specs.hasBattery = true;
  p.customization = { ...p.customization, attachedPdfs: [], dismissedDatasheetKeys: [] };
  return p;
};

// 1. Plan: in-use equipment with a catalog PDF asset; variants sharing one asset give one annex.
const p = project();
const plan = planDatasheetAnnexes(p, catalog);
assert.deepEqual(plan.map((annex) => annex.key), ['sheet-family', 'sheet-inverter'], 'count 0 equipment is skipped');
assert.equal(plan[0].title, 'Ficha técnica — QA 600 W');
assert.equal(plan[0].fileName, 'Ficha técnica - QA 600 W.pdf', 'Never the deduplicated server name');
assert.equal(plan[0].catalogItemId, 'pa');
p.specs.inverters = [{ id: 'g3', catalogItemId: 'photo', brandModel: 'QA Foto', powerKW: 8, count: 1 }];
p.specs.batteries = [{ id: 'g4', catalogItemId: 'url', brandModel: 'QA URL', capacityKWh: 16, count: 1 }];
assert.deepEqual(planDatasheetAnnexes(p, catalog).map((annex) => annex.key), ['sheet-family'], 'Image datasheets and external URLs are not automatic annexes');

// 2. Apply: new annexes are enabled, catalog-origin, out of the index; existing manual annexes are untouched.
const manual: AttachedPDFDocument = { id: 'att-manual', fileName: 'Plano.pdf', fileSize: 10, pageCount: 2, title: 'Plano', uploadedAt: NOW, enabled: true, addToTableOfContents: true };
const base = project();
base.customization!.attachedPdfs = [manual];
const first = applyAnnexPlan(base.customization!, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.equal(first.changed, true);
assert.deepEqual(first.attachedPdfs.map((att) => att.id), ['att-manual', catalogAnnexId('sheet-family'), catalogAnnexId('sheet-inverter')]);
const auto = first.attachedPdfs[1];
assert.deepEqual(
  { origin: auto.origin, enabled: auto.enabled, toc: auto.addToTableOfContents, key: auto.sourceDatasheetKey, assetId: auto.assetId, pending: auto.pageCountPending, thumb: auto.thumbnailDataUrl },
  { origin: 'catalog', enabled: true, toc: false, key: 'sheet-family', assetId: 'sheet-family', pending: true, thumb: undefined },
);
assert.equal(first.attachedPdfs[0], manual, 'Manual annex object is preserved');
assert.equal(catalogAnnexId('sheet-family'), catalogAnnexId('sheet-family'), 'Deterministic id: the same annex on every device');

// Idempotent: a second pass changes nothing (no write, no sync churn).
base.customization!.attachedPdfs = first.attachedPdfs;
const again = applyAnnexPlan(base.customization!, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.equal(again.changed, false);
assert.equal(again.attachedPdfs, base.customization!.attachedPdfs);

// User edits to an automatic annex (title, enabled, order, index) survive later passes.
const edited = first.attachedPdfs.map((att) => (att.id === catalogAnnexId('sheet-inverter') ? { ...att, title: 'Inversor — hoja oficial', enabled: false, addToTableOfContents: true } : att)).reverse();
base.customization!.attachedPdfs = edited;
assert.equal(applyAnnexPlan(base.customization!, planDatasheetAnnexes(base, catalog), NOW, new Set()).changed, false);

// 3. Removed equipment drops its automatic annex; manual annexes stay even if they came from the catalog.
const legacyManual: AttachedPDFDocument = { ...manual, id: 'att-legacy', sourceDatasheetKey: 'sheet-inverter', title: 'Ficha adjuntada a mano' };
base.customization!.attachedPdfs = [...first.attachedPdfs, legacyManual];
base.specs.inverters = [{ id: 'g3', catalogItemId: 'inv', brandModel: 'QA Inversor 8K', powerKW: 8, count: 0 }];
const removed = applyAnnexPlan(base.customization!, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.deepEqual(removed.attachedPdfs.map((att) => att.id), ['att-manual', catalogAnnexId('sheet-family'), 'att-legacy']);

// A manual annex with the same source key prevents a duplicate automatic one.
base.specs.inverters = [{ id: 'g3', catalogItemId: 'inv', brandModel: 'QA Inversor 8K', powerKW: 8, count: 1 }];
base.customization!.attachedPdfs = [manual, legacyManual];
const deduped = applyAnnexPlan(base.customization!, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.deepEqual(deduped.attachedPdfs.map((att) => att.id), ['att-manual', 'att-legacy', catalogAnnexId('sheet-family')]);

// 3b. Catalog still loading: equipment in use that is not in the catalog yet keeps its annex (and the user's edits).
{
  const loading = project();
  loading.customization!.attachedPdfs = first.attachedPdfs.map((att) => (att.id === catalogAnnexId('sheet-inverter') ? { ...att, title: 'Inversor — revisada', enabled: false, addToTableOfContents: true } : att));
  const before = loading.customization!;
  const partial = catalog.filter((item) => item.id !== 'inv'); // the inverter's catalog record has not arrived
  const pendingIds = unresolvedEquipmentIds(loading, partial);
  assert.equal(pendingIds.has('inv'), true);
  assert.equal(unresolvedEquipmentIds(loading, catalog).size, 0, 'A fully resolved catalog protects nothing');
  // Shared datasheet: the annex's representative variant (pa) is removed while the other (pb) is still unresolved.
  const shared = structuredClone(loading);
  shared.specs.panels = [{ id: 'g2', catalogItemId: 'pb', brandModel: 'QA 620 W', powerW: 620, count: 4 }];
  const noPb = catalog.filter((item) => item.id !== 'pb');
  const sharedKept = applyAnnexPlan(before, planDatasheetAnnexes(shared, noPb), NOW, unresolvedEquipmentIds(shared, noPb));
  assert.equal(sharedKept.attachedPdfs.some((att) => att.id === catalogAnnexId('sheet-family')), true, 'Shared annex survives while a contributing variant is unresolved');
  const during = applyAnnexPlan(before, planDatasheetAnnexes(loading, partial), NOW, pendingIds);
  assert.equal(during.changed, false, 'Nothing is deleted or rewritten while the record is missing');
  assert.equal(during.attachedPdfs, before.attachedPdfs);
  // Without the pending set the annex would be dropped (the old behaviour this guards against).
  assert.equal(applyAnnexPlan(before, planDatasheetAnnexes(loading, partial), NOW, new Set()).changed, true);
  // A group the user detached by hand is not pending: its old annex is removed, not kept forever.
  {
    const manual = structuredClone(loading);
    manual.specs.inverters = [{ id: 'g9', brandModel: 'Inversor propio', powerKW: 8, count: 1, manualModel: true }];
    assert.equal(unresolvedEquipmentIds(manual, catalog).size, 0, 'manual model protects nothing');
    const result = applyAnnexPlan(before, planDatasheetAnnexes(manual, catalog), NOW, unresolvedEquipmentIds(manual, catalog));
    assert.equal(result.attachedPdfs.some((att) => att.id === catalogAnnexId('sheet-inverter')), false, 'old model datasheet leaves the export');
  }
  // The record arrives: the same annex objects survive, nothing is recreated.
  assert.equal(applyAnnexPlan(before, planDatasheetAnnexes(loading, catalog), NOW, unresolvedEquipmentIds(loading, catalog)).changed, false);
  // The proposal stops using the equipment (count 0 or removed group): the annex is removed even if the catalog is still partial.
  const unused = structuredClone(loading);
  unused.specs.inverters = [{ id: 'g3', catalogItemId: 'inv', brandModel: 'QA Inversor 8K', powerKW: 8, count: 0 }];
  const gone = applyAnnexPlan(before, planDatasheetAnnexes(unused, partial), NOW, unresolvedEquipmentIds(unused, partial));
  assert.deepEqual(gone.attachedPdfs.map((att) => att.id), ['att-manual', catalogAnnexId('sheet-family')]);
}

// 3c. Legacy (unmigrated) proposals have synthetic group ids and no catalogItemId: still protected while the catalog is empty.
{
  const legacy = project();
  legacy.customization!.attachedPdfs = first.attachedPdfs.map((att) => (att.id === catalogAnnexId('sheet-inverter') ? { ...att, title: 'Inversor — revisada' } : att));
  legacy.specs.inverters = undefined;
  legacy.specs.inverterBrandModel = 'QA Inversor 8K';
  legacy.specs.inverterPowerKW = 8;
  legacy.specs.inverterCount = 1;
  const before = legacy.customization!;
  const none: SolarEquipmentItem[] = [];
  const during = applyAnnexPlan(before, planDatasheetAnnexes(legacy, none), NOW, unresolvedEquipmentIds(legacy, none));
  assert.equal(during.changed, false, 'Legacy groups do not lose their annexes while the catalog is empty');
  assert.equal(during.attachedPdfs, before.attachedPdfs);
  const gone = structuredClone(legacy);
  gone.specs.inverterCount = 0;
  gone.specs.panels = [];
  gone.specs.panelBrandModel = undefined;
  gone.specs.panelCount = 0;
  assert.deepEqual(applyAnnexPlan(before, planDatasheetAnnexes(gone, none), NOW, unresolvedEquipmentIds(gone, none)).attachedPdfs.map((att) => att.id), ['att-manual']);
}

// 4. Dismiss and restore.
base.customization!.attachedPdfs = first.attachedPdfs;
const dismissed = dismissAnnex(base.customization!, catalogAnnexId('sheet-family'));
assert.deepEqual(dismissed.dismissedDatasheetKeys, ['sheet-family']);
assert.deepEqual(dismissed.attachedPdfs.map((att) => att.id), ['att-manual', catalogAnnexId('sheet-inverter')]);
const afterDismiss = applyAnnexPlan({ ...base.customization!, ...dismissed }, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.equal(afterDismiss.changed, false, 'A dismissed datasheet is not re-added');
assert.deepEqual(dismissAnnex(base.customization!, 'att-manual'), { attachedPdfs: [first.attachedPdfs[1], first.attachedPdfs[2]] }, 'Removing a manual annex does not record a dismissal');
const restored = applyAnnexPlan({ ...base.customization!, ...dismissed, ...restoreDismissedAnnexes() }, planDatasheetAnnexes(base, catalog), NOW, new Set());
assert.deepEqual(restored.attachedPdfs.map((att) => att.id), ['att-manual', catalogAnnexId('sheet-inverter'), catalogAnnexId('sheet-family')]);

// 5. Attachment bytes: IndexedDB → preview cache → server, saved back for the next export.
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`).buffer as ArrayBuffer;
const saved: string[] = [];
const local = new Map<string, ArrayBuffer>([['att-manual', pdf('local')]]);
const calls: string[] = [];
const resolver = createProposalAttachmentResolver({
  projectId: 'qa-project',
  storage: {
    getAttachment: async (id) => local.get(id) ?? null,
    saveAttachment: async (id, _projectId, _name, buffer) => { saved.push(id); local.set(id, buffer); },
  },
  cachedAsset: async (assetId) => { calls.push(`cache:${assetId}`); return assetId === 'cached' ? new Blob([pdf('cached')]) : null; },
  fetchAsset: async (assetId) => { calls.push(`server:${assetId}`); return assetId === 'remote' ? new Blob([pdf('remote')]) : assetId === 'html' ? new Blob(['<html>']) : null; },
});
const text = (buffer: ArrayBuffer | null) => (buffer ? new TextDecoder().decode(buffer) : null);
assert.equal(text(await resolver(manual)), '%PDF-1.7 local');
assert.deepEqual(calls, [], 'Local bytes need nothing else');
const annex = (assetId?: string): AttachedPDFDocument => ({ ...auto, id: `att-${assetId}`, assetId });
assert.equal(text(await resolver(annex('cached'))), '%PDF-1.7 cached');
assert.deepEqual(calls, ['cache:cached'], 'The preview cache avoids the download');
assert.equal(text(await resolver(annex('remote'))), '%PDF-1.7 remote');
assert.deepEqual(saved, ['att-cached', 'att-remote'], 'Recovered bytes are saved on this device');
assert.equal(await resolver(annex('html')), null, 'Non-PDF content is never merged');
assert.equal(await resolver(annex(undefined)), null, 'A manual annex from another device has no source');
const legacyCatalogAnnex: AttachedPDFDocument = { ...manual, id: 'att-old-button', sourceDatasheetKey: 'remote' };
assert.equal(text(await resolver(legacyCatalogAnnex)), '%PDF-1.7 remote', 'Annexes added with the old catalog button are recovered by their asset key');
assert.equal(await resolver({ ...manual, id: 'att-url', sourceDatasheetKey: 'https://qa.example.invalid/ficha.pdf' }), null, 'External URLs are never fetched at export');
const failing = createProposalAttachmentResolver({ projectId: 'qa', storage: { getAttachment: async () => null, saveAttachment: async () => undefined }, cachedAsset: async () => null, fetchAsset: async () => { throw new Error('HTTP 500'); } });
assert.equal(await failing(annex('remote')), null, 'Failures are reported as missing, never thrown');

// 6. Export asks before dropping annexes it could not find.
assert.equal(missingAnnexesConfirmation([auto]).confirmLabel, 'Exportar sin 1 anexo');
const two = missingAnnexesConfirmation([auto, manual]);
assert.equal(two.confirmLabel, 'Exportar sin 2 anexos');
assert.match(two.message, /Ficha técnica — QA 600 W, Plano/);

console.log('Automatic datasheet annexes: plan, idempotent apply, user edits, removal, manual precedence, dismiss/restore and byte resolution passed.');
