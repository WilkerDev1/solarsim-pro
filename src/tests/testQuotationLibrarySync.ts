// Plantillas, firmas y sellos en el store: local sin cuenta, sincronización con CAS (API sintética, sin red), imágenes
// como referencias `asset:sha256:` y el logo de las cotizaciones publicado como referencia.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { QuotationLibrarySyncService } from '../services/quotationLibrarySyncService';
import { DocumentAssetService } from '../services/documentAssetService';
import { QuotationSyncService } from '../services/quotationSyncService';
import { PDFAttachmentStorage } from '../services/pdfAttachmentStorage';
import { checkDocumentDataUrl } from '../../shared/fileSignatures';
import { isAssetRef } from '../../shared/documentAssets';
import { validateQuotationSignature, validateQuotationTemplate, validateQuotationContent } from '../../shared/quotations';
import { emptyQuotationLibrary, type LibraryKind } from '../types/quotationLibrary';
import { planQuotationPush, canonicalQuotationContent } from '../store/sync/quotationContent';
import { changeWorkspace } from '../store/sync/organizationWorkspace';

const serverUrl = 'https://library-sync.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')}`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// ── API sintética alineada con server/src/modules/quotationLibrary.ts y documentAssets.ts ──
let clock = Date.parse('2026-11-01T00:00:00.000Z');
const tick = () => new Date(++clock).toISOString();
type Row = { record: any; changedAt: string; deleted?: boolean };
const tables: Record<LibraryKind, Map<string, Row>> = { templates: new Map(), signatures: new Map() };
const assets = new Map<string, string>();
const calls: string[] = [];
let online = true;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const ITEM = { templates: 'template', signatures: 'signature' } as const;
const reset = () => { tables.templates.clear(); tables.signatures.clear(); assets.clear(); calls.length = 0; online = true; DocumentAssetService.setTransportFactory(assetFactory); };

QuotationLibrarySyncService.setTransportFactory((url, token) => async (kind, path, init = {}) => {
  assert.equal(url, serverUrl);
  assert.equal(token(), 'synthetic');
  const method = init.method || 'GET';
  calls.push(`${method} ${kind}${path}`);
  if (!online) throw new Error('Sin conexión');
  const table = tables[kind];
  if (method === 'GET') {
    const since = new URLSearchParams(path.replace(/^\?/, '')).get('since');
    const rows = [...table.values()].filter((r) => !since || r.changedAt > since);
    return json({ success: true, [kind]: rows.filter((r) => !r.deleted).map((r) => structuredClone(r.record)), deletedIds: rows.filter((r) => r.deleted).map((r) => r.record.id), serverTimestamp: tick() });
  }
  const id = decodeURIComponent(path.slice(1).split('?')[0]);
  const row = table.get(id);
  if (method === 'DELETE') {
    const baseVersion = Number(new URLSearchParams(path.split('?')[1]).get('baseVersion'));
    if (!row) return json({ error: 'No encontrada' }, 404);
    if (row.record.version !== baseVersion) return json({ error: 'Cambió', [ITEM[kind]]: row.deleted ? null : row.record }, 409);
    table.set(id, { record: { ...row.record, version: row.record.version + 1 }, changedAt: tick(), deleted: true });
    return json({ success: true });
  }
  const body = JSON.parse(String(init.body));
  const validated = (kind === 'templates' ? validateQuotationTemplate : validateQuotationSignature)(body.content);
  if (!validated.ok) return json({ error: validated.error }, 400);
  const value: any = validated.value;
  if (kind === 'signatures' && !isAssetRef(value.image)) return json({ error: 'En línea', code: 'inline_image_not_allowed' }, 400);
  if (kind === 'signatures' && !assets.has(value.image.slice(13))) return json({ error: 'Desconocida', code: 'unknown_document_asset' }, 400);
  if (row?.deleted || (row ? row.record.version !== body.baseVersion : body.baseVersion !== 0))
    return json({ error: 'Cambió', [ITEM[kind]]: row && !row.deleted ? row.record : null }, 409);
  const changedAt = tick();
  const version = (row?.record.version ?? 0) + 1;
  const record = { ...value, id, organizationId: user.organizationId, version, baseVersion: version, createdById: user.id, createdBy: user.name, createdAt: row?.record.createdAt ?? changedAt, updatedAt: changedAt };
  table.set(id, { record, changedAt });
  const cleared: { id: string; version: number }[] = [];
  if (value.isDefault)
    for (const [otherId, other] of table)
      if (otherId !== id && !other.deleted && other.record.isDefault && (kind === 'templates' || other.record.kind === value.kind)) {
        table.set(otherId, { record: { ...other.record, isDefault: false, version: other.record.version + 1, baseVersion: other.record.version + 1 }, changedAt: tick() });
        cleared.push({ id: otherId, version: other.record.version + 1 });
      }
  return json({ success: true, [ITEM[kind]]: record, cleared });
});
const assetFactory = (url: string) => async (path: string, init: RequestInit = {}) => {
  assert.equal(url, serverUrl);
  const method = init.method || 'GET';
  calls.push(`${method} assets${path}`);
  if (!online) throw new Error('Sin conexión');
  if (method === 'POST') {
    const { content } = JSON.parse(String(init.body));
    const checked = checkDocumentDataUrl(content, { maxBytes: 8 * 1024 * 1024 });
    if (!checked.ok) return json({ error: 'Formato no admitido', code: 'unsupported_asset_type' }, 415);
    assets.set(sha(content), content);
    return json({ success: true, sha256: sha(content), ref: `asset:sha256:${sha(content)}` });
  }
  const content = assets.get(path.slice(1));
  return content ? json({ success: true, content }) : json({ error: 'No' }, 404);
};
// Una API nueva en cada caso: el registro de lo ya subido (por espacio de trabajo) se reinicia con el transporte.
DocumentAssetService.setTransportFactory(assetFactory);

const api = () => store.getState();
const lib = () => api().quotationLibrary;
const templates = () => lib().templates.items;
const signatures = () => lib().signatures.items;
const local = { serverUrl, currentUser: null, authToken: null, autoSyncEnabled: false, lastSyncTimestamp: null };
const session = { serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null };
const begin = (settings: typeof local | typeof session) => {
  reset();
  api().setSyncSettings(settings as any);
  store.setState({ quotationLibrary: emptyQuotationLibrary(), quotationLibrarySyncFeedback: null });
};
const sync = () => api().syncQuotationLibraryWithServer();
const template = (name: string, extra = {}) => ({ name, design: { layout: 'clasica' as const, accent: '#087b58', typography: 'sans' as const, showSignature: true, showStamp: true }, ...extra });

// 1. Espacio local sin cuenta: todo funciona sin red; una sola predeterminada.
begin(local);
const a = api().createQuotationTemplate(template('Electsun clásica', { isDefault: true }));
assert.ok(a.ok);
assert.equal(a.record.version, 0);
const b = api().createQuotationTemplate(template('Banda azul', { isDefault: true }));
assert.ok(b.ok);
assert.deepEqual(templates().map((t) => [t.name, t.isDefault]), [['Electsun clásica', false], ['Banda azul', true]]);
assert.ok(api().setDefaultQuotationTemplate(a.record.id).ok);
assert.deepEqual(templates().map((t) => t.isDefault), [true, false]);
assert.ok(api().setDefaultQuotationTemplate(null).ok);
assert.ok(templates().every((t) => !t.isDefault));
const copy = api().duplicateQuotationTemplate(a.record.id);
assert.ok(copy.ok);
assert.equal(copy.record.name, 'Electsun clásica (copia)');
assert.notEqual(copy.record.id, a.record.id);
assert.ok(api().updateQuotationTemplate(copy.record.id, { name: 'Renombrada' }).ok);
assert.equal(templates().find((t) => t.id === copy.record.id)!.name, 'Renombrada');
const invalid = api().updateQuotationTemplate(copy.record.id, { name: '' });
assert.equal(invalid.ok, false);
assert.ok(api().deleteQuotationTemplate(copy.record.id).ok);
assert.equal(templates().length, 2);
const signature = api().createQuotationSignature({ kind: 'signature', name: 'Idali Candelario', role: 'Ventas', image: PNG, isDefault: true });
assert.ok(signature.ok);
const stamp = api().createQuotationSignature({ kind: 'stamp', name: 'Sello Electsun', image: PNG, isDefault: true });
assert.ok(stamp.ok);
assert.deepEqual(signatures().map((s) => s.isDefault), [true, true], 'firma y sello tienen su propia predeterminada');
const disguised = api().createQuotationSignature({ kind: 'signature', name: 'Falsa', image: SVG_AS_PNG });
assert.equal(disguised.ok, false, 'una imagen disfrazada no entra');
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
const mislabelled = api().createQuotationSignature({ kind: 'signature', name: 'JPEG como PNG', image: `data:image/png;base64,${jpegBytes}` });
assert.ok(mislabelled.ok, 'un JPEG declarado PNG se importa con su tipo real');
assert.equal(mislabelled.ok && mislabelled.record.image, `data:image/jpeg;base64,${jpegBytes}`);
assert.ok(api().deleteQuotationSignature(mislabelled.ok ? mislabelled.record.id : '').ok);
assert.equal((await sync()).success, false, 'sin sesión no hay sincronización');
assert.equal(calls.length, 0, 'sin cuenta no se toca la red');

// LECTOR: no escribe.
api().setSyncSettings({ ...session, currentUser: { ...user, role: 'LECTOR' } } as any);
assert.equal(api().createQuotationTemplate(template('Del lector')).ok, false);
assert.equal(api().deleteQuotationTemplate(a.record.id).ok, false);
assert.equal(api().createQuotationSignature({ kind: 'stamp', name: 'S', image: PNG }).ok, false);

// 2. Con sesión: creación, recibo, firma subida como referencia y la imagen local conservada.
begin(session);
const t1 = api().createQuotationTemplate(template('Plantilla A', { isDefault: true, validityDays: 15 }));
const s1 = api().createQuotationSignature({ kind: 'signature', name: 'Idali Candelario', role: 'Ventas', image: PNG, isDefault: true });
assert.ok(t1.ok && s1.ok);
assert.equal((await sync()).success, true, JSON.stringify(api().quotationLibrarySyncFeedback));
assert.ok(calls.includes('POST assets'), 'la imagen se sube antes del PUT');
assert.ok(calls.indexOf('POST assets') < calls.indexOf(`PUT signatures/${s1.ok && s1.record.id}`));
const storedSignature = tables.signatures.get(s1.ok ? s1.record.id : '')!.record;
assert.equal(storedSignature.image, `asset:sha256:${sha(PNG)}`, 'el servidor guarda la referencia');
assert.equal(signatures()[0].image, PNG, 'la copia local conserva su imagen en línea');
assert.equal(signatures()[0].version, 1);
assert.equal(templates()[0].version, 1);
assert.deepEqual(lib().templates.changes, {});
assert.deepEqual(lib().signatures.changes, {});
assert.ok(lib().templates.cursor?.serverTimestamp);
const tid = t1.ok ? t1.record.id : '';

// 3. Delta: un cambio de otro miembro llega con `since`; la predeterminada que desmarcó el servidor también.
const cursor = lib().templates.cursor!.serverTimestamp;
const row = tables.templates.get(tid)!;
tables.templates.set(tid, { record: { ...row.record, name: 'Renombrada por otro', version: 2, baseVersion: 2 }, changedAt: tick() });
calls.length = 0;
assert.equal((await sync()).success, true);
assert.ok(calls.includes(`GET templates?since=${encodeURIComponent(cursor)}`));
assert.equal(templates()[0].name, 'Renombrada por otro');
assert.equal(templates()[0].version, 2);
const t2 = api().createQuotationTemplate(template('Plantilla B', { isDefault: true }));
assert.ok(t2.ok);
assert.equal(templates().find((t) => t.id === tid)!.isDefault, false, 'desmarcada en local al instante');
await sync();
assert.equal(tables.templates.get(tid)!.record.isDefault, false, 'y en el servidor');
assert.equal(templates().find((t) => t.id === tid)!.version, 3, 'con la versión que subió el servidor');

// 4. CAS: una edición sobre una base vieja queda como conflicto; «usar la del servidor» la instala.
tables.templates.set(tid, { record: { ...tables.templates.get(tid)!.record, notes: 'Del servidor', version: 4, baseVersion: 4 }, changedAt: tick() });
assert.ok(api().updateQuotationTemplate(tid, { notes: 'Local' }).ok);
assert.equal((await sync()).success, false);
assert.equal(lib().templates.changes[tid].server?.version, 4);
assert.ok(api().quotationLibrarySyncFeedback);
api().resolveQuotationLibraryConflict('templates', tid, 'accept_server');
assert.equal(templates().find((t) => t.id === tid)!.notes, 'Del servidor');
assert.equal(lib().templates.changes[tid], undefined);
// «Conservar la mía» publica sobre la versión del servidor.
tables.templates.set(tid, { record: { ...tables.templates.get(tid)!.record, notes: 'Otra vez del servidor', version: 5, baseVersion: 5 }, changedAt: tick() });
assert.ok(api().updateQuotationTemplate(tid, { notes: 'La mía' }).ok);
await sync();
api().resolveQuotationLibraryConflict('templates', tid, 'keep_local');
assert.equal((await sync()).success, true);
assert.equal(tables.templates.get(tid)!.record.notes, 'La mía');
assert.equal(tables.templates.get(tid)!.record.version, 6);

// 5. Recibo perdido: el servidor ya tiene el mismo contenido → se confirma sin conflicto.
assert.ok(api().updateQuotationTemplate(tid, { description: 'Recibo perdido' }).ok);
const saved = tables.templates.get(tid)!.record;
tables.templates.set(tid, { record: { ...saved, description: 'Recibo perdido', version: 7, baseVersion: 7 }, changedAt: tick() });
assert.equal((await sync()).success, true);
assert.equal(templates().find((t) => t.id === tid)!.version, 7);
assert.equal(lib().templates.changes[tid], undefined);

// 6. Borrada en el servidor con edición local pendiente: conflicto de borrado; conservarla crea otra con id nuevo.
assert.ok(api().updateQuotationTemplate(tid, { description: 'Edición huérfana' }).ok);
tables.templates.set(tid, { record: { ...tables.templates.get(tid)!.record, version: 8 }, changedAt: tick(), deleted: true });
assert.equal((await sync()).success, false);
assert.equal(lib().templates.changes[tid].server, null);
api().resolveQuotationLibraryConflict('templates', tid, 'keep_local');
assert.ok(!templates().some((t) => t.id === tid));
const reborn = templates().find((t) => t.description === 'Edición huérfana')!;
assert.equal(reborn.version, 0);
assert.equal((await sync()).success, true);
assert.equal(tables.templates.get(reborn.id)!.record.version, 1);

// 7. Borrado: DELETE con la versión confirmada; el delta de otro equipo lo quita.
calls.length = 0;
assert.ok(api().deleteQuotationTemplate(reborn.id).ok);
assert.equal((await sync()).success, true);
assert.ok(calls.includes(`DELETE templates/${reborn.id}?baseVersion=1`));
assert.ok(tables.templates.get(reborn.id)!.deleted);
const t2id = t2.ok ? t2.record.id : '';
tables.templates.set(t2id, { ...tables.templates.get(t2id)!, changedAt: tick(), deleted: true });
await sync();
assert.ok(!templates().some((t) => t.id === t2id), 'deletedIds quita la copia local');

// 8. Una imagen que el servidor no admite queda como rechazo visible, sin bucle de reintentos.
const before = signatures().length;
store.setState((s) => ({ quotationLibrary: { ...s.quotationLibrary, signatures: { ...s.quotationLibrary.signatures, items: [...s.quotationLibrary.signatures.items, { ...signatures()[0], id: 'qsignature-bad', image: SVG_AS_PNG, version: 0, baseVersion: 0, isDefault: false }], changes: { ...s.quotationLibrary.signatures.changes, 'qsignature-bad': { revision: 'r1', ownerId: user.id, baseVersion: 0 } } } } }));
assert.equal(signatures().length, before + 1);
assert.equal((await sync()).success, false);
// La validación local rechaza la imagen disfrazada: no se publica nada y el cambio queda pendiente sin bucle.
assert.ok(!tables.signatures.has('qsignature-bad'));

// 9. Espacios de trabajo: la biblioteca es del espacio activo; la local no pasa a la organización y vuelve al restaurarla.
begin(local);
assert.ok(api().createQuotationTemplate(template('Solo en este equipo')).ok);
store.setState({ workspaceScope: 'local' });
const org = changeWorkspace(api(), session as any);
assert.ok(!org.quotationLibrary!.templates.items.some((t) => t.name === 'Solo en este equipo'), 'lo local nunca pasa a la organización');
assert.ok(org.quotationLibrary!.signatures.items.some((s) => s.name === 'Idali Candelario'), 'la organización recupera su biblioteca archivada');
store.setState(org);
assert.ok(api().createQuotationTemplate(template('De la organización')).ok);
const back = changeWorkspace(api(), local as any);
assert.deepEqual(back.quotationLibrary!.templates.items.map((t) => t.name), ['Solo en este equipo']);
assert.ok(back.organizationWorkspaces![org.workspaceScope!]?.quotationLibrary?.templates.items.some((t) => t.name === 'De la organización'), 'archivada con su espacio');

// 10. Cotizaciones: el logo en línea viaja como referencia cuando se pudo subir.
QuotationSyncService.setTransportFactory(() => async (path, init = {}) => {
  const method = init.method || 'GET';
  if (method === 'GET') return json({ success: true, quotations: [], deletedIds: [], serverTimestamp: tick() });
  const body = JSON.parse(String(init.body));
  const value = validateQuotationContent(body.content);
  assert.ok(value.ok);
  lastPut = body.content;
  const id = decodeURIComponent(path.slice(1));
  return json({ success: true, quotation: { ...value.value, id, number: 'COT-2026-0001', version: body.baseVersion + 1, baseVersion: body.baseVersion + 1, createdById: user.id, createdBy: user.name, createdAt: tick(), updatedAt: tick() } });
});
let lastPut: any = null;
begin(session);
store.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null });
const quotation = api().createQuotationRecord({ issuer: { name: 'Electsun', taxId: '', address: '', phone: '', email: '', website: '', logo: PNG } });
assert.ok(quotation.ok);
await api().syncQuotationsWithServer();
assert.equal(lastPut.issuer.logo, `asset:sha256:${sha(PNG)}`, 'el logo viaja como referencia');
assert.equal(assets.get(sha(PNG)), PNG);
assert.equal(api().quotations[0].issuer.logo, PNG, 'la copia local conserva la imagen');
assert.equal(api().quotationChanges[quotation.ok ? quotation.quotation.id : ''], undefined);

// Un adjunto guardado en este equipo se sube con su referencia.
const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
const pdfUrl = `data:application/pdf;base64,${pdf.toString('base64')}`;
await PDFAttachmentStorage.saveAttachment('att-1', 'q', 'plano.pdf', pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
const qid = quotation.ok ? quotation.quotation.id : '';
assert.ok(api().updateQuotationRecord(qid, { attachments: [{ id: 'att-1', fileName: 'plano.pdf', fileSize: pdf.length, pageCount: 1, title: 'Plano', uploadedAt: '2026-11-26T00:00:00Z', mode: 'include', origin: 'manual', assetId: `asset:sha256:${sha(pdfUrl)}` }] }).ok);
await api().syncQuotationsWithServer();
assert.equal(assets.get(sha(pdfUrl)), pdfUrl, 'los bytes del adjunto llegan al servidor');
assert.equal(lastPut.attachments[0].assetId, `asset:sha256:${sha(pdfUrl)}`);

// Una cotización emitida cuyo logo se subió después no se reabre para cambiar de estado.
const base = { ...canonicalQuotationContent({ ...api().quotations[0], status: 'issued', issuer: { ...api().quotations[0].issuer, logo: '' } }) };
const target = { ...api().quotations[0], status: 'accepted' as const };
const plan = planQuotationPush(base, target);
assert.deepEqual(plan.map((p) => p.status), ['accepted'], 'un solo PUT con el estado nuevo');
assert.equal(plan[0].issuer.logo, '', 'con la imagen confirmada');

// 11. Marcar otra predeterminada y editar la anterior antes de sincronizar: el servidor la desmarcó (versión + 1) y el
// cliente toma esa versión como base, sin un 409 espurio.
begin(session);
const first = api().createQuotationTemplate(template('Primera', { isDefault: true }));
assert.ok(first.ok);
await sync();
const second = api().createQuotationTemplate(template('Segunda'));
assert.ok(second.ok);
await sync();
assert.ok(api().setDefaultQuotationTemplate(second.ok ? second.record.id : '').ok);
assert.ok(api().updateQuotationTemplate(first.ok ? first.record.id : '', { name: 'Primera renombrada' }).ok);
// Que la segunda se publique antes que la primera (orden de las claves del registro de cambios).
store.setState((s) => {
  const changes = s.quotationLibrary.templates.changes;
  const secondId = second.ok ? second.record.id : '';
  const { [secondId]: mine, ...rest } = changes;
  return { quotationLibrary: { ...s.quotationLibrary, templates: { ...s.quotationLibrary.templates, changes: { [secondId]: mine, ...rest } } } };
});
assert.equal((await sync()).success, true, JSON.stringify(lib().templates.changes));
const firstRow = tables.templates.get(first.ok ? first.record.id : '')!.record;
assert.equal(firstRow.name, 'Primera renombrada');
assert.equal(firstRow.isDefault, false);
assert.equal(tables.templates.get(second.ok ? second.record.id : '')!.record.isDefault, true);
// Resolver un aviso limpia el mensaje de sincronización.
store.setState({ quotationLibrarySyncFeedback: 'pendiente' });
api().resolveQuotationLibraryConflict('templates', 'no-existe', 'accept_server');
assert.equal(api().quotationLibrarySyncFeedback, null);

console.log('Quotation library sync tests passed.');
