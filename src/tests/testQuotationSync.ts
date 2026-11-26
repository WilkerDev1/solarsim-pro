import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { QuotationSyncService } from '../services/quotationSyncService';
import { ClientSyncService } from '../services/clientSyncService';
import { canTransitionQuotation, formatQuotationNumber, quotationNumberYear, validateQuotationContent } from '../../shared/quotations';
import { isAssetRef } from '../../shared/documentAssets';
import { contentEqual } from '../store/sync/projectDifferences';
import type { QuotationContent, QuotationLine, QuotationRecord } from '../types/quotation';

// ── Synthetic API that follows the quotations HTTP contract (no network) ──
const serverUrl = 'https://quotations-sync.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
let clock = Date.parse('2026-11-01T00:00:00.000Z');
const tick = () => new Date(++clock).toISOString();
type Row = { record: QuotationRecord; changedAt: string };
let rows = new Map<string, Row>();
let tombstones = new Map<string, string>();
let sequences = new Map<number, number>();
let online = true;
let dropResponseFor: string | null = null;
let holdList: Promise<void> | null = null;
const invalidClients = new Set<string>();
const invalidFolders = new Set<string>();
const calls: string[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });
const strip = ({ status: _s, ...rest }: QuotationContent) => rest;
const hasInlineImage = (c: QuotationContent) =>
  (!!c.issuer?.logo && !isAssetRef(c.issuer.logo)) || (c.attachments ?? []).some((a) => !!a.thumbnailDataUrl && !isAssetRef(a.thumbnailDataUrl));

const reset = () => {
  rows = new Map(); tombstones = new Map(); sequences = new Map(); calls.length = 0; dropResponseFor = null; holdList = null; online = true;
};
const serverPut = (id: string, baseVersion: number, raw: QuotationContent): Response => {
  const current = rows.get(id)?.record;
  // Same order of checks as the API: validation → inline images → version/tombstone → transition → lock → client.
  const validated = validateQuotationContent(raw);
  if (!validated.ok) return json({ error: validated.error }, 400);
  if (!current && !['draft', 'issued'].includes(validated.value.status))
    return json({ error: 'Una cotización nueva es borrador o emitida', code: 'invalid_transition' }, 400);
  if (hasInlineImage(raw)) return json({ error: 'Imágenes en línea no admitidas', code: 'inline_image_not_allowed' }, 400);
  if (tombstones.has(id)) return json({ error: 'Cotización eliminada', quotation: null }, 409);
  if ((current?.version ?? 0) !== baseVersion) return json({ error: 'Conflicto de versión', quotation: current ?? null }, 409);
  const content = validated.value;
  if (current && content.status !== current.status && !canTransitionQuotation(current.status, content.status))
    return json({ error: 'Transición no permitida', code: 'invalid_transition' }, 400);
  if (current && current.status !== 'draft') {
    const stored = validateQuotationContent(current);
    if (content.status === current.status || !stored.ok || !contentEqual(strip(content), strip(stored.value)))
      return json({ error: 'La cotización está bloqueada', code: 'quotation_locked' }, 400);
  }
  if (content.clientId && invalidClients.has(content.clientId))
    return json({ error: 'Cliente inválido', code: 'invalid_client', reason: 'invalid_client', quotation: current ?? null }, 409);
  if (content.folderId && invalidFolders.has(content.folderId))
    return json({ error: 'Carpeta inválida', code: 'invalid_folder', reason: 'invalid_folder', quotation: current ?? null }, 409);
  let number = current?.number ?? null;
  if (!current) {
    const year = quotationNumberYear(content.issueDate);
    const next = (sequences.get(year) ?? 0) + 1;
    sequences.set(year, next);
    number = formatQuotationNumber(year, next);
  }
  const changedAt = tick();
  const version = (current?.version ?? 0) + 1;
  const record: QuotationRecord = {
    ...content, id, number, organizationId: user.organizationId, version, baseVersion: version,
    createdById: current?.createdById ?? user.id, createdBy: current?.createdBy ?? user.name, createdAt: current?.createdAt ?? changedAt, updatedAt: changedAt,
  };
  rows.set(id, { record, changedAt });
  return json({ success: true, quotation: record });
};
/** Another member writes directly on the server. */
const teammateWrite = (id: string, edit: (q: QuotationRecord) => Partial<QuotationRecord>) => {
  const row = rows.get(id)!;
  const changedAt = tick();
  const record = { ...row.record, ...edit(row.record), version: row.record.version + 1, baseVersion: row.record.version + 1, updatedAt: changedAt };
  rows.set(id, { record, changedAt });
};
const teammateDelete = (id: string) => { rows.delete(id); tombstones.set(id, tick()); };

QuotationSyncService.setTransportFactory((url, token) => async (path, init = {}) => {
  assert.equal(url, serverUrl, 'Only the session server');
  assert.equal(token(), 'synthetic');
  const method = init.method || 'GET';
  calls.push(`${method} ${path}`);
  if (!online) throw new Error('Sin conexión');
  if (method === 'GET') {
    const since = new URLSearchParams(path.replace(/^\?/, '')).get('since');
    const serverTimestamp = tick();
    const quotations = [...rows.values()].filter((r) => !since || r.changedAt > since).map((r) => structuredClone(r.record));
    const deletedIds = [...tombstones.entries()].filter(([, at]) => !since || at > since).map(([id]) => id);
    if (holdList) await holdList;
    return json({ success: true, quotations, deletedIds, serverTimestamp });
  }
  const id = decodeURIComponent(path.slice(1).split('?')[0]);
  if (method === 'DELETE') {
    const baseVersion = Number(new URLSearchParams(path.split('?')[1]).get('baseVersion'));
    const current = rows.get(id)?.record;
    if (!current) return json({ error: 'No encontrada' }, 404);
    if (current.version !== baseVersion) return json({ error: 'Conflicto', quotation: current }, 409);
    teammateDelete(id);
    return json({ success: true });
  }
  const body = JSON.parse(String(init.body));
  assert.deepEqual(Object.keys(body).sort(), ['baseVersion', 'content']);
  const response = serverPut(id, body.baseVersion, body.content);
  if (id === dropResponseFor) {
    dropResponseFor = null;
    throw new Error('Conexión interrumpida tras enviar');
  }
  return response;
});

const line = (id: string, extra: Partial<QuotationLine> = {}): QuotationLine => ({
  id, kind: 'item', description: 'Inversor 10 kW', quantity: 1, unit: 'UD', unitPriceCents: 9_000_000, discountPct: 0, taxable: true, ...extra,
});
const printed = { name: 'Cliente impreso', attention: '', taxId: '', phone: '', email: '', address: '' };
const api = () => store.getState();
const find = (id: string) => api().quotations.find((q) => q.id === id)!;
const begin = () => {
  reset();
  api().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  store.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null, quotationNumberCounters: {}, quotationSyncFeedback: null });
};
const sync = () => api().syncQuotationsWithServer();
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ASSET = `asset:sha256:${'a'.repeat(64)}`;

try {
  // 1. Offline creation with a session: number null → sync → the server's number is stored and never changes.
  begin();
  online = false;
  const created = api().createQuotationRecord({ client: printed, items: [line('l1')] });
  assert.ok(created.ok);
  const id = created.quotation.id;
  assert.equal(created.quotation.number, null);
  assert.equal((await sync()).success, false);
  assert.ok(api().quotationSyncFeedback);
  assert.equal(find(id).number, null);
  online = true;
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.deepEqual(calls, ['GET ', `PUT /${encodeURIComponent(id)}`], 'First pull is complete (no cursor)');
  const assigned = find(id).number;
  assert.equal(assigned, formatQuotationNumber(Number(created.quotation.issueDate.slice(0, 4)), 1));
  assert.equal(find(id).version, 1);
  assert.equal(api().quotationChanges[id], undefined);
  assert.equal(api().quotationSyncFeedback, null);
  assert.ok(api().quotationSyncCursor?.serverTimestamp);
  assert.ok(api().updateQuotationRecord(id, { notes: 'Edición posterior' }).ok);
  assert.equal(api().quotationChanges[id].baseVersion, 1);
  assert.equal((await sync()).success, true);
  assert.equal(find(id).number, assigned, 'The number never changes');
  assert.equal(rows.get(id)!.record.notes, 'Edición posterior');

  // 2. The next pull uses `since` and applies only changes and deletedIds.
  const other = api().createQuotationRecord({ client: printed });
  assert.ok(other.ok);
  await sync();
  const cursor = api().quotationSyncCursor!.serverTimestamp;
  teammateWrite(id, () => ({ notes: 'Cambio de otro miembro' }));
  teammateDelete(other.quotation.id);
  const unchanged = find(id);
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.deepEqual(calls, [`GET ?since=${encodeURIComponent(cursor)}`]);
  assert.equal(find(id).notes, 'Cambio de otro miembro');
  assert.equal(find(id).version, unchanged.version + 1);
  assert.ok(!api().quotations.some((q) => q.id === other.quotation.id), 'deletedIds remove the local copy');
  assert.notEqual(api().quotationSyncCursor!.serverTimestamp, cursor);
  calls.length = 0;
  const kept = api().quotations;
  assert.equal((await sync()).success, true);
  assert.equal(api().quotations, kept, 'An empty delta keeps the same collection reference');

  // 3a. Lost receipt with identical server content: acknowledged without a second write.
  const lost = api().createQuotationRecord({ client: printed, notes: 'Recibo perdido' });
  assert.ok(lost.ok);
  dropResponseFor = lost.quotation.id;
  assert.equal((await sync()).success, false, 'The PUT reached the server but its response did not');
  assert.ok(rows.has(lost.quotation.id));
  assert.equal(find(lost.quotation.id).number, null);
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), [], 'No second write');
  assert.equal(find(lost.quotation.id).number, rows.get(lost.quotation.id)!.record.number);
  assert.equal(find(lost.quotation.id).version, 1);
  assert.equal(api().quotationChanges[lost.quotation.id], undefined);

  // 3b. Lost receipt and the content changed meanwhile: kept as a conflict, never acknowledged.
  const lost2 = api().createQuotationRecord({ client: printed, notes: 'Primera versión' });
  assert.ok(lost2.ok);
  dropResponseFor = lost2.quotation.id;
  await sync();
  assert.ok(api().updateQuotationRecord(lost2.quotation.id, { notes: 'Segunda versión local' }).ok);
  assert.equal((await sync()).success, false);
  assert.equal(api().quotationChanges[lost2.quotation.id].serverQuotation?.notes, 'Primera versión');
  api().resolveQuotationConflict(lost2.quotation.id, 'keep_local');
  assert.equal(api().quotationChanges[lost2.quotation.id].baseVersion, 1);
  assert.equal((await sync()).success, true);
  assert.equal(rows.get(lost2.quotation.id)!.record.notes, 'Segunda versión local');
  assert.equal(find(lost2.quotation.id).number, rows.get(lost2.quotation.id)!.record.number);

  // 4. Version conflict (409) resolved both ways.
  teammateWrite(id, () => ({ notes: 'Servidor A' }));
  assert.ok(api().updateQuotationRecord(id, { notes: 'Local A' }).ok);
  assert.equal((await sync()).success, false);
  assert.equal(api().quotationChanges[id].serverQuotation?.notes, 'Servidor A');
  assert.match(api().quotationSyncFeedback!, /cotizaci/i);
  assert.equal(find(id).notes, 'Local A', 'The local copy is kept until the user chooses');
  calls.length = 0;
  assert.equal((await sync()).success, false, 'An unresolved conflict is not pushed again');
  assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), []);
  api().resolveQuotationConflict(id, 'keep_local');
  assert.equal((await sync()).success, true);
  assert.equal(rows.get(id)!.record.notes, 'Local A');
  teammateWrite(id, () => ({ notes: 'Servidor B' }));
  assert.ok(api().updateQuotationRecord(id, { notes: 'Local B (se descarta)' }).ok);
  await sync();
  api().resolveQuotationConflict(id, 'accept_server');
  assert.equal(find(id).notes, 'Servidor B');
  assert.equal(find(id).number, assigned);
  assert.equal(api().quotationChanges[id], undefined);
  assert.equal((await sync()).success, true);

  // 5. Deleted on the server while a local edit is pending: deletion conflict; the id is never revived.
  const doomed = api().createQuotationRecord({ client: printed, notes: 'Antes' });
  assert.ok(doomed.ok);
  await sync();
  const doomedNumber = find(doomed.quotation.id).number;
  teammateDelete(doomed.quotation.id);
  assert.ok(api().updateQuotationRecord(doomed.quotation.id, { notes: 'Edición sin conexión' }).ok);
  calls.length = 0;
  assert.equal((await sync()).success, false);
  assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), [], 'Never pushed to a deleted id');
  assert.equal(api().quotationChanges[doomed.quotation.id].serverDeleted, true);
  assert.equal(find(doomed.quotation.id).notes, 'Edición sin conexión');
  api().resolveQuotationConflict(doomed.quotation.id, 'keep_local');
  assert.ok(!api().quotations.some((q) => q.id === doomed.quotation.id));
  const revived = api().quotations.find((q) => q.notes === 'Edición sin conexión')!;
  assert.notEqual(revived.id, doomed.quotation.id);
  assert.equal(revived.number, null, 'The kept copy is a new quotation without a number');
  assert.equal(revived.version, 0);
  assert.equal((await sync()).success, true);
  assert.ok(!rows.has(doomed.quotation.id) && tombstones.has(doomed.quotation.id));
  assert.ok(find(revived.id).number && find(revived.id).number !== doomedNumber);
  // Discarding instead removes the local copy.
  const doomed2 = api().createQuotationRecord({ client: printed });
  assert.ok(doomed2.ok);
  await sync();
  teammateDelete(doomed2.quotation.id);
  api().updateQuotationRecord(doomed2.quotation.id, { notes: 'Se descarta' });
  await sync();
  api().resolveQuotationConflict(doomed2.quotation.id, 'accept_server');
  assert.ok(!api().quotations.some((q) => q.id === doomed2.quotation.id));
  assert.equal(api().quotationChanges[doomed2.quotation.id], undefined);

  // 6. Issued on the server, reopened → edited → issued again offline: published as reopen, then edit + issue.
  const flow = api().createQuotationRecord({ client: printed, items: [line('l1')] });
  assert.ok(flow.ok);
  assert.ok(api().setQuotationStatus(flow.quotation.id, 'issued').ok);
  assert.equal((await sync()).success, true, 'A draft can be edited and issued in the same PUT');
  assert.equal(rows.get(flow.quotation.id)!.record.status, 'issued');
  assert.ok(api().setQuotationStatus(flow.quotation.id, 'draft').ok);
  assert.ok(api().updateQuotationRecord(flow.quotation.id, { notes: 'Corrección tras reabrir' }).ok);
  assert.ok(api().setQuotationStatus(flow.quotation.id, 'issued').ok);
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.equal(calls.filter((c) => c.startsWith('PUT')).length, 2);
  assert.equal(rows.get(flow.quotation.id)!.record.status, 'issued');
  assert.equal(rows.get(flow.quotation.id)!.record.notes, 'Corrección tras reabrir');
  assert.equal(api().quotationChanges[flow.quotation.id], undefined);
  // Reopen and re-issue without edits: nothing to publish.
  assert.ok(api().setQuotationStatus(flow.quotation.id, 'draft').ok);
  assert.ok(api().setQuotationStatus(flow.quotation.id, 'issued').ok);
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), []);
  assert.equal(api().quotationChanges[flow.quotation.id], undefined);

  // 7. A 400 quotation_locked is a visible error of that quotation and is not retried in a loop.
  teammateWrite(flow.quotation.id, () => ({ status: 'accepted' }));
  await sync();
  assert.equal(find(flow.quotation.id).status, 'accepted');
  store.setState((s) => ({
    quotations: s.quotations.map((q) => (q.id === flow.quotation.id ? { ...q, status: 'issued' as const, notes: 'Forzado' } : q)),
    quotationChanges: { ...s.quotationChanges, [flow.quotation.id]: { revision: 'forced', ownerId: user.id, baseVersion: find(flow.quotation.id).version } },
  }));
  assert.equal((await sync()).success, false);
  const rejected = api().quotationChanges[flow.quotation.id].rejected;
  assert.ok(rejected && ['quotation_locked', 'invalid_transition'].includes(rejected.code!), JSON.stringify(rejected));
  calls.length = 0;
  assert.equal((await sync()).success, false);
  assert.equal((await sync()).success, false);
  assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), [], 'No retry loop');
  assert.match(api().quotationSyncFeedback!, /cotizaci/i);
  api().resolveQuotationConflict(flow.quotation.id, 'accept_server');
  assert.equal(api().quotationChanges[flow.quotation.id], undefined);
  assert.equal((await sync()).success, true);
  assert.equal(find(flow.quotation.id).status, 'accepted', 'Discarding restores the server copy');
  assert.equal(find(flow.quotation.id).notes, rows.get(flow.quotation.id)!.record.notes);

  // 8. Inline images never travel and are not lost locally; asset references do travel.
  const imaged = api().createQuotationRecord({
    client: printed,
    issuer: { name: 'Emisor', taxId: '', address: '', phone: '', email: '', website: '', logo: LOGO },
    attachments: [
      { id: 'a1', fileName: 'ficha.pdf', fileSize: 10, pageCount: 1, title: 'Ficha', uploadedAt: '2026-11-01', mode: 'related', origin: 'manual', thumbnailDataUrl: LOGO },
      { id: 'a2', fileName: 'plano.pdf', fileSize: 10, pageCount: 1, title: 'Plano', uploadedAt: '2026-11-01', mode: 'related', origin: 'manual', thumbnailDataUrl: ASSET },
    ],
  });
  assert.ok(imaged.ok);
  calls.length = 0;
  assert.equal((await sync()).success, true);
  const sent = rows.get(imaged.quotation.id)!.record;
  assert.equal(sent.issuer.logo, '');
  assert.equal(sent.attachments[0].thumbnailDataUrl, undefined);
  assert.equal(sent.attachments[1].thumbnailDataUrl, ASSET);
  assert.equal(find(imaged.quotation.id).issuer.logo, LOGO, 'The local copy keeps its logo after the receipt');
  assert.equal(find(imaged.quotation.id).attachments[0].thumbnailDataUrl, LOGO);
  assert.equal(api().quotationChanges[imaged.quotation.id], undefined);
  teammateWrite(imaged.quotation.id, () => ({ notes: 'Nota del equipo' }));
  await sync();
  assert.equal(find(imaged.quotation.id).notes, 'Nota del equipo');
  assert.equal(find(imaged.quotation.id).issuer.logo, LOGO, 'A later pull keeps the local image too');
  // A second device without the image stays in sync (its record was identical once images are excluded).
  assert.equal((await sync()).success, true);

  // 9. Deleting: published quotations use CAS; never-published drafts are dropped without a request.
  online = false;
  const neverPublished = api().createQuotationRecord();
  assert.ok(neverPublished.ok);
  assert.ok(api().deleteQuotationRecord(neverPublished.quotation.id).ok);
  online = true;
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.deepEqual(calls.filter((c) => !c.startsWith('GET')), []);
  assert.deepEqual(api().quotationDeletionQueue, []);
  assert.ok(api().deleteQuotationRecord(imaged.quotation.id).ok);
  assert.equal((await sync()).success, true);
  assert.ok(tombstones.has(imaged.quotation.id));
  assert.deepEqual(api().quotationDeletionQueue, []);
  teammateWrite(lost.quotation.id, () => ({ notes: 'Cambio previo al borrado' }));
  assert.ok(api().deleteQuotationRecord(lost.quotation.id).ok);
  assert.equal((await sync()).success, false, 'A stale deletion returns the server record for review');
  assert.equal(find(lost.quotation.id).notes, 'Cambio previo al borrado');
  assert.ok(api().quotationChanges[lost.quotation.id].serverQuotation);
  assert.ok(rows.has(lost.quotation.id));
  api().resolveQuotationConflict(lost.quotation.id, 'accept_server');

  // 9b. invalid_client (409 with that code): only the link is dropped; the change stays pending and is not a conflict.
  const deadLink = api().createQuotationRecord({ client: printed, notes: 'Con cliente borrado' });
  assert.ok(deadLink.ok);
  store.setState((s) => ({ quotations: s.quotations.map((q) => (q.id === deadLink.quotation.id ? { ...q, clientId: 'client-dead' } : q)) }));
  invalidClients.add('client-dead');
  assert.equal((await sync()).success, false);
  assert.equal(find(deadLink.quotation.id).clientId, undefined);
  assert.deepEqual(find(deadLink.quotation.id).client, printed, 'The printed client is untouched');
  const pendingDead = api().quotationChanges[deadLink.quotation.id];
  assert.ok(pendingDead && !pendingDead.serverQuotation && !pendingDead.serverDeleted && !pendingDead.rejected, 'Not a conflict to resolve');
  assert.equal((await sync()).success, true, 'The next attempt publishes without the link');
  assert.equal(rows.get(deadLink.quotation.id)!.record.clientId, undefined);
  assert.equal(api().quotationChanges[deadLink.quotation.id], undefined);
  invalidClients.clear();

  // 9c. invalid_folder is handled the same way: the folder link goes, the change stays pending.
  const deadFolder = api().createQuotationRecord({ client: printed });
  assert.ok(deadFolder.ok);
  store.setState((s) => ({ quotations: s.quotations.map((q) => (q.id === deadFolder.quotation.id ? { ...q, folderId: 'folder-dead' } : q)) }));
  invalidFolders.add('folder-dead');
  assert.equal((await sync()).success, false);
  assert.equal(find(deadFolder.quotation.id).folderId, undefined);
  const pendingFolder = api().quotationChanges[deadFolder.quotation.id];
  assert.ok(pendingFolder && !pendingFolder.serverQuotation && !pendingFolder.serverDeleted && !pendingFolder.rejected);
  assert.equal((await sync()).success, true);
  assert.equal(rows.get(deadFolder.quotation.id)!.record.folderId, undefined);
  invalidFolders.clear();

  // 9d. Never published and voided offline: discarded without a request; rejected offline is created as issued first.
  online = false;
  const voided = api().createQuotationRecord();
  assert.ok(voided.ok && api().setQuotationStatus(voided.quotation.id, 'void').ok);
  const refused = api().createQuotationRecord({ client: printed, items: [line('l1')] });
  assert.ok(refused.ok && api().setQuotationStatus(refused.quotation.id, 'issued').ok && api().setQuotationStatus(refused.quotation.id, 'rejected').ok);
  online = true;
  calls.length = 0;
  assert.equal((await sync()).success, true);
  assert.ok(!calls.some((c) => c.includes(encodeURIComponent(voided.quotation.id))), 'No request for the voided draft');
  assert.ok(!api().quotations.some((q) => q.id === voided.quotation.id));
  assert.equal(api().quotationChanges[voided.quotation.id], undefined);
  assert.equal(calls.filter((c) => c === `PUT /${encodeURIComponent(refused.quotation.id)}`).length, 2);
  assert.equal(rows.get(refused.quotation.id)!.record.status, 'rejected');
  assert.ok(find(refused.quotation.id).number);

  // 10. Workspace isolation: an organization switch during a download discards the response.
  begin();
  const mine = api().createQuotationRecord({ client: printed });
  assert.ok(mine.ok);
  await sync();
  const cursorA = api().quotationSyncCursor;
  teammateWrite(mine.quotation.id, () => ({ notes: 'Llega tarde' }));
  let release!: () => void;
  holdList = new Promise((resolve) => { release = resolve; });
  const pass = sync();
  await new Promise((resolve) => setTimeout(resolve, 0));
  api().setSyncSettings({ currentUser: { ...user, organizationId: 'other-org' } });
  assert.deepEqual(api().quotations, [], 'The other organization starts empty');
  release();
  holdList = null;
  assert.equal((await pass).success, false);
  assert.deepEqual(api().quotations, [], 'The late response is not applied to the new workspace');
  assert.equal(api().quotationSyncCursor, null);
  api().setSyncSettings({ currentUser: user });
  assert.deepEqual(api().quotationSyncCursor, cursorA, 'Nor to the archived one');
  assert.notEqual(find(mine.quotation.id).notes, 'Llega tarde');
  assert.equal((await sync()).success, true);
  assert.equal(find(mine.quotation.id).notes, 'Llega tarde');

  // 11. Client and folder tombstones drop only the links (printed client data stays).
  begin();
  const linked = api().createQuotationRecord({ client: printed });
  assert.ok(linked.ok);
  store.setState((s) => ({
    clients: [{ id: 'client-gone', name: 'Se borra', kind: 'persona', taxId: '', phone: '', email: '', address: '', province: '', notes: '', createdAt: '2026-11-01', version: 1, baseVersion: 1 }],
    clientChanges: {}, clientDeletionQueue: [],
    folders: [{ id: 'folder-gone', name: 'Se borra', color: '#10b981', createdAt: '2026-11-01', version: 1, baseVersion: 1 } as never],
    folderChanges: {}, folderDeletionQueue: [],
    quotations: s.quotations.map((q) => (q.id === linked.quotation.id ? { ...q, clientId: 'client-gone', folderId: 'folder-gone' } : q)),
  }));
  ClientSyncService.setTransportFactory(() => async () => json({ success: true, clients: [], deletedIds: ['client-gone'] }));
  assert.equal((await api().syncClientsWithServer()).success, true);
  assert.equal(find(linked.quotation.id).clientId, undefined);
  assert.deepEqual(find(linked.quotation.id).client, printed);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.ok(new URL(String(input)).pathname.endsWith('/api/folders'));
    return json({ success: true, folders: [], deletedIds: ['folder-gone'] });
  };
  try {
    await api().syncFoldersWithServer();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(find(linked.quotation.id).folderId, undefined);

  // 12. Project sync runs quotations right after clients; a quotation failure does not block proposals.
  const order: string[] = [];
  store.setState({
    syncFoldersWithServer: async () => { order.push('folders'); return { success: true, message: 'ok' }; },
    syncClientsWithServer: async () => { order.push('clients'); return { success: true, message: 'ok' }; },
    syncQuotationsWithServer: async () => { order.push('quotations'); return { success: false, message: 'Sin conexión' }; },
    syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic' }),
    syncOrganizationCompanyProfile: async () => ({ success: true }),
    projects: [],
  });
  globalThis.fetch = async (input) => {
    order.push('pull');
    assert.ok(new URL(String(input)).pathname.endsWith('/api/sync/pull'));
    return json({ success: true, projects: [], deletedIds: [] });
  };
  try {
    const result = await api().syncProjectsWithServer();
    assert.equal(result.success, true);
    assert.match(result.message, /cotizaciones pendientes/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(order.slice(0, 4), ['folders', 'clients', 'quotations', 'pull']);
} finally {
  QuotationSyncService.setTransportFactory(null);
  ClientSyncService.setTransportFactory(null);
}

console.log('✅ Quotation sync: server numbering, since cursor, receipts, conflicts, tombstones, locks, images and workspaces passed.');
