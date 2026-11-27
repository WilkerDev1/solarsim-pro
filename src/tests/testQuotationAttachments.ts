// Adjuntos de la cotización: archivo subido (tipo real, tamaño, páginas), fichas del catálogo, bytes, fusión al PDF con
// tolerancia a adjuntos dañados o cifrados, firma y sello en la paginación, plantilla predeterminada y bloqueo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  catalogDatasheetCandidates, formatFileSize, jpegOrientation, mergeQuotationAttachments, pdfFailure, pageCountLabel, prepareAttachmentFile, resolveAttachmentBytes,
  skippedAttachmentsMessage,
} from '../features/quotations/attachments';
import { estimateClosingHeight, estimateSignaturesHeight, paginateQuotation, SHEET_LAYOUT } from '../features/quotations/paginate';
import { quotationSignatureFor, quotationStampFor } from '../features/quotations/library';
import { createAndOpenQuotation } from '../features/quotations/newQuotation';
import { addAttachments, moveAttachment, removeAttachment, setDesign, updateAttachment } from '../domain/quotationEdit';
import { quotationEditorActions } from '../features/quotations/editorActions';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { emptyQuotationLibrary } from '../types/quotationLibrary';
import { emptyQuotationContent, validateQuotationContent, type QuotationAttachment, type QuotationSignature } from '../../shared/quotations';
import { bytesToDataUrl, dataUrlToBytes } from '../utils/dataUrl';
import type { SolarEquipmentItem } from '../types/equipment';

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const PNG = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const pdfWith = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return buffer(await doc.save());
};
/** PDF con diccionario /Encrypt en el tráiler: pdf-lib lo reconoce como cifrado. */
const encryptedPdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: PDFName.of('Standard'), V: 1, R: 2 }));
  return buffer(await doc.save());
};
const now = '2026-11-26T12:00:00.000Z';
const attachment = (id: string, extra: Partial<QuotationAttachment> = {}): QuotationAttachment => ({
  id, fileName: `${id}.pdf`, fileSize: 10, pageCount: 1, title: id, uploadedAt: now, mode: 'include', origin: 'manual', ...extra,
});

// ── Archivo subido ──
const three = await pdfWith(3);
const prepared = await prepareAttachmentFile({ name: 'Plano de la instalación.pdf', bytes: three }, { id: 'att-1', now });
assert.ok(prepared.ok, prepared.ok ? '' : prepared.error);
assert.equal(prepared.type, 'application/pdf');
assert.equal(prepared.attachment.pageCount, 3);
assert.equal(prepared.attachment.fileSize, three.byteLength);
assert.equal(prepared.attachment.title, 'Plano de la instalación');
assert.equal(prepared.attachment.mode, 'include');
assert.equal(prepared.attachment.origin, 'manual');
assert.equal(prepared.attachment.assetId, `asset:sha256:${sha(bytesToDataUrl(three, 'application/pdf'))}`, 'la referencia es la del servidor');
assert.ok(validateQuotationContent(emptyQuotationContent('2026-11-26', { attachments: [prepared.attachment] })).ok, 'cabe en el contrato');
const image = await prepareAttachmentFile({ name: 'foto.png', bytes: buffer(PNG_BYTES) }, { id: 'att-2', now });
assert.ok(image.ok);
assert.equal(image.attachment.pageCount, 1);
// Tipo real: un SVG o un HTML con extensión .pdf/.png no entra; tampoco lo vacío, lo grande, lo cifrado o lo dañado.
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
for (const [name, bytes, pattern] of [
  ['logo.png', buffer(svg), /Formato no admitido/],
  ['ficha.pdf', buffer(Buffer.from('<!doctype html><p>no soy un pdf</p>')), /Formato no admitido/],
  ['vacio.pdf', new ArrayBuffer(0), /vacío/],
  ['grande.pdf', buffer(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(8 * 1024 * 1024)])), /8 MB/],
  ['danado.pdf', buffer(Buffer.from('%PDF-1.4\nbasura sin objetos')), /dañado/],
] as const) {
  const result = await prepareAttachmentFile({ name, bytes }, { id: 'x', now });
  assert.equal(result.ok, false, name);
  if (!result.ok) assert.match(result.error, pattern, name);
}
const locked = await prepareAttachmentFile({ name: 'cifrado.pdf', bytes: await encryptedPdf() }, { id: 'x', now });
assert.equal(locked.ok, false);
if (!locked.ok) assert.match(locked.error, /contraseña o permisos/);
const traversal = await prepareAttachmentFile({ name: '../../etc/passwd\u0000.pdf', bytes: three }, { id: 'x', now });
assert.ok(traversal.ok);
assert.ok(!traversal.attachment.fileName.includes('/'));
assert.equal(formatFileSize(0), '');
assert.equal(formatFileSize(2048), '2 KB');
assert.equal(formatFileSize(3.4 * 1024 * 1024), '3.4 MB');
assert.equal(pageCountLabel(0), 'Páginas por confirmar');
assert.equal(pageCountLabel(1), '1 página');
assert.equal(pageCountLabel(4), '4 páginas');

// ── Fichas del catálogo: solo equipos de las líneas con PDF en el servidor, sin repetir ──
const catalog = [
  { id: 'panel-1', displayName: 'Panel 620 W', datasheetAssetId: 'asset-panel', datasheetName: 'panel.pdf' },
  { id: 'inv-1', displayName: 'Inversor 10 kW', datasheetAssetId: 'asset-inv' },
  { id: 'bat-1', displayName: 'Batería', datasheetAssetId: 'asset-img', datasheetName: 'foto.png' },
  { id: 'cable', displayName: 'Cable' },
] as unknown as SolarEquipmentItem[];
const lines = ['panel-1', 'panel-1', 'inv-1', 'bat-1', 'cable', undefined].map((catalogItemId, i) => ({
  id: `l${i}`, kind: 'item' as const, description: 'x', quantity: 1, unit: 'UD', unitPriceCents: 1, discountPct: 0, taxable: true, ...(catalogItemId ? { catalogItemId } : {}),
}));
const candidates = catalogDatasheetCandidates({ items: lines, attachments: [attachment('ya', { assetId: 'asset-inv', origin: 'catalog' })] }, catalog, now);
assert.deepEqual(candidates.map((c) => [c.assetId, c.origin, c.catalogItemId, c.title, c.pageCount]), [['asset-panel', 'catalog', 'panel-1', 'Ficha técnica — Panel 620 W', 0]]);
assert.ok(validateQuotationContent(emptyQuotationContent('2026-11-26', { attachments: candidates })).ok);
assert.deepEqual(catalogDatasheetCandidates({ items: lines, attachments: [] }, [], now), [], 'sin catálogo, solo la subida manual');

// ── Bytes: este equipo → servidor (y se guardan) → null ──
const saved: string[] = [];
const deps = {
  local: async (id: string) => (id === 'local' ? three : null),
  save: async (id: string) => { saved.push(id); },
  documentAssetBytes: async (ref: string) => (ref === 'asset:sha256:' + 'a'.repeat(64) ? buffer(dataUrlToBytes(bytesToDataUrl(PNG_BYTES, 'image/png'))!) : null),
  equipmentAsset: async (assetId: string) => (assetId === 'asset-panel' ? new Blob([three]) : assetId === 'asset-html' ? new Blob(['<html>']) : null),
};
assert.equal(await resolveAttachmentBytes(attachment('local'), deps), three);
assert.equal((await resolveAttachmentBytes(attachment('srv', { assetId: 'asset:sha256:' + 'a'.repeat(64) }), deps))?.byteLength, PNG_BYTES.length);
assert.equal((await resolveAttachmentBytes(attachment('cat', { assetId: 'asset-panel', origin: 'catalog' }), deps))?.byteLength, three.byteLength);
assert.deepEqual(saved, ['srv', 'cat'], 'lo descargado queda en este equipo');
assert.equal(await resolveAttachmentBytes(attachment('none'), deps), null);
assert.equal(await resolveAttachmentBytes(attachment('html', { assetId: 'asset-html' }), deps), null, 'un activo que no es de la lista blanca no se usa');
assert.equal(await resolveAttachmentBytes(attachment('boom', { assetId: 'asset-panel' }), { ...deps, local: async () => { throw new Error('IndexedDB'); } }), null, 'nunca lanza');

// ── Fusión: PDF tal cual, imagen en A4, corrupto/cifrado/ausente se omiten sin romper ──
const main = await pdfWith(2);
const loaded: string[] = [];
const item = (a: QuotationAttachment, bytes: ArrayBuffer | null) => ({ attachment: a, load: async () => { loaded.push(a.id); return bytes; } });
const merged = await mergeQuotationAttachments(main, [
  item(attachment('pdf3'), three),
  item(attachment('foto', { title: 'Foto del techo' }), buffer(PNG_BYTES)),
  item(attachment('solo-enlazado', { mode: 'related' }), three),
  item(attachment('roto', { title: 'Ficha rota' }), buffer(Buffer.from('%PDF-1.4\nbasura'))),
  item(attachment('cifrado', { title: 'Contrato' }), await encryptedPdf()),
  item(attachment('ausente', { title: 'Plano' }), null),
  item(attachment('webp', { title: 'Render' }), buffer(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))),
  item(attachment('svg', { title: 'Logo' }), buffer(svg)),
]);
const result = await PDFDocument.load(merged.bytes);
assert.equal(result.getPageCount(), 2 + 3 + 1, 'cotización + PDF de 3 páginas + 1 página de imagen; «related» no entra');
const imagePage = result.getPage(5);
assert.deepEqual([Math.round(imagePage.getWidth()), Math.round(imagePage.getHeight())], [595, 842], 'la imagen va en una página A4');
assert.equal(merged.merged, 2);
assert.ok(!loaded.includes('solo-enlazado'), 'un adjunto relacionado ni se carga');
assert.deepEqual(merged.skipped.map((s) => [s.id, s.reason]), [
  ['roto', 'está dañado'],
  ['cifrado', 'está protegido con contraseña o permisos'],
  ['ausente', 'no está disponible en este equipo ni en el servidor'],
  ['webp', 'formato de imagen que no se puede incluir'],
  ['svg', 'formato no admitido'],
]);
assert.match(skippedAttachmentsMessage(merged.skipped)!, /sin 5 adjuntos: «Ficha rota» \(está dañado\)/);
assert.equal(skippedAttachmentsMessage([]), null);
const withConverter = await mergeQuotationAttachments(main, [item(attachment('webp'), buffer(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')))], { toEmbeddable: async () => buffer(PNG_BYTES) });
assert.equal(withConverter.merged, 1, 'WebP convertido a PNG se incluye');
assert.equal((await mergeQuotationAttachments(main, [])).skipped.length, 0);
// Tope total de memoria: lo que no cabe se omite sin cargarlo (si conoce su tamaño) y se avisa.
loaded.length = 0;
const capped = await mergeQuotationAttachments(main, [
  item(attachment('a', { fileSize: three.byteLength }), three),
  item(attachment('b', { fileSize: three.byteLength }), three),
  item(attachment('c', { fileSize: 0 }), three),
], { maxTotalBytes: three.byteLength + 10 });
assert.equal(capped.merged, 1);
assert.deepEqual(capped.skipped.map((s) => s.id), ['b', 'c']);
assert.deepEqual(loaded, ['a', 'c'], 'el que ya se sabe que no cabe no se carga');
// Motivos distintos: protegido, formato no soportado y dañado.
assert.equal(pdfFailure(Object.assign(new Error('Input document to `PDFDocument.load` is encrypted'), { name: 'EncryptedPDFError' })), 'protected');
assert.equal(pdfFailure(new Error('Object streams with compression filter X are not supported')), 'unsupported');
assert.equal(pdfFailure(new Error('Failed to parse PDF document')), 'damaged');
// Orientación EXIF de un JPEG (APP1 «Exif» con la etiqueta 0x0112).
const exif = (orientation: number, little = false) => {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return buffer(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...u16b(app1.length + 2), ...app1, 0xff, 0xd9]));
};
const u16b = (v: number) => [v >> 8, v & 0xff];
assert.equal(jpegOrientation(exif(6)), 6);
assert.equal(jpegOrientation(exif(8, true)), 8);
assert.equal(jpegOrientation(exif(3)), 3);
assert.equal(jpegOrientation(buffer(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0]))), 1, 'sin EXIF');
assert.equal(jpegOrientation(buffer(PNG_BYTES)), 1, 'no es JPEG');
assert.equal(jpegOrientation(buffer(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 200]))), 1, 'EXIF truncado no lanza');

// ── Edición pura de adjuntos y diseño ──
let content = emptyQuotationContent('2026-11-26');
content = addAttachments(content, [attachment('a'), attachment('b'), attachment('a')]);
assert.deepEqual(content.attachments.map((a) => a.id), ['a', 'b']);
assert.equal(addAttachments(content, [attachment('a')]), content, 'sin cambios, misma referencia');
content = moveAttachment(content, 'b', -1);
assert.deepEqual(content.attachments.map((a) => a.id), ['b', 'a']);
assert.equal(moveAttachment(content, 'b', -1), content);
content = updateAttachment(content, 'a', { title: 'Plano', mode: 'related' });
assert.deepEqual([content.attachments[1].title, content.attachments[1].mode], ['Plano', 'related']);
assert.equal(updateAttachment(content, 'a', { title: 'Plano' }), content);
content = removeAttachment(content, 'b');
assert.deepEqual(content.attachments.map((a) => a.id), ['a']);
const designed = setDesign({ ...content, design: { ...content.design, templateId: 't', signatureId: 's' } }, { accent: '#1f3fb4', signatureId: undefined });
assert.equal(designed.design.accent, '#1f3fb4');
assert.equal(designed.design.templateId, 't');
assert.ok(!('signatureId' in designed.design));

// ── Firma y sello que imprime la hoja ──
const sig = (id: string, kind: 'signature' | 'stamp', isDefault: boolean, extra: Partial<QuotationSignature> = {}): QuotationSignature => ({
  id, kind, name: id, role: '', image: PNG, isDefault, version: 0, baseVersion: 0, createdById: '', createdBy: '', createdAt: now, updatedAt: now, ...extra,
});
const library = [sig('s-def', 'signature', true), sig('s-other', 'signature', false), sig('stamp-def', 'stamp', true, { image: 'data:image/png;base64,c3RhbXA=' })];
const design = emptyQuotationContent('2026-11-26').design;
assert.equal(quotationSignatureFor(design, library)?.id, 's-def', 'sin elección, la predeterminada');
assert.equal(quotationSignatureFor({ ...design, signatureId: 's-other' }, library)?.id, 's-other');
assert.equal(quotationSignatureFor({ ...design, signatureId: 'stamp-def' }, library)?.id, 's-def', 'un sello no sirve de firma');
assert.equal(quotationSignatureFor({ ...design, showSignature: false }, library), null);
assert.equal(quotationStampFor(design, library, 'seal-membrete'), 'data:image/png;base64,c3RhbXA=', 'el sello predeterminado de la organización');
assert.equal(quotationStampFor(design, [], 'seal-membrete'), 'seal-membrete', 'sin sello propio, el del membrete');
assert.equal(quotationStampFor({ ...design, showStamp: false }, library, 'seal-membrete'), null);

// ── Paginación: la firma con nombre y cargo largos cuenta su altura y el cierre nunca invade el pie ──
const base = estimateSignaturesHeight('Ana');
assert.equal(base, Math.max(SHEET_LAYOUT.signaturesFixed + SHEET_LAYOUT.rowLine, SHEET_LAYOUT.signaturesStamp) + SHEET_LAYOUT.signaturesBottom, 'sin firma, igual que antes');
assert.equal(estimateSignaturesHeight('Ana', { name: 'Idali Candelario', role: 'Ventas' }), base, 'un cargo corto cabe en su renglón');
const longSigner = { name: 'Idali Candelario de los Santos Rodríguez Martínez', role: 'Gerente comercial y de proyectos fotovoltaicos de la región norte' };
const tall = estimateSignaturesHeight('Ana', longSigner);
assert.ok(tall > base, `nombre y cargo largos crecen (${tall} > ${base})`);
assert.equal(tall, SHEET_LAYOUT.signaturesFixed - SHEET_LAYOUT.signaturesRoleLine + 2 * SHEET_LAYOUT.signaturesRoleLine + 2 * SHEET_LAYOUT.rowLine + SHEET_LAYOUT.signaturesBottom, 'acotado a dos renglones cada uno');
const doc = emptyQuotationContent('2026-11-26', {
  client: { name: 'Hotel', attention: '', taxId: '', phone: '', email: '', address: '' },
  items: Array.from({ length: 14 }, (_, i) => ({ id: `l${i}`, kind: 'item' as const, description: `Línea ${i} con una descripción de equipo`, quantity: 1, unit: 'UD', unitPriceCents: 100_00, discountPct: 0, taxable: true })),
});
const withSignature = { ...doc, signature: longSigner };
assert.ok(estimateClosingHeight(withSignature, true) > estimateClosingHeight(doc, true));
for (const input of [doc, withSignature]) for (const page of paginateQuotation(input)) assert.ok(page.estimatedHeight <= page.capacity, `${page.estimatedHeight} ≤ ${page.capacity}`);
// Con una cantidad de líneas en el límite, la firma alta empuja el cierre a otra página en vez de cortar el pie.
let pushed = false;
for (let count = 1; count <= 25 && !pushed; count++) {
  for (let notes = 0; notes <= 6 && !pushed; notes++) {
    const sized = { ...doc, notes: Array.from({ length: notes }, (_, i) => `Nota ${i}`).join('\n'), items: Array.from({ length: count }, (_, i) => ({ ...doc.items[0], id: `x${i}` })) };
    const longer = paginateQuotation({ ...sized, signature: longSigner });
    pushed = paginateQuotation(sized).length < longer.length;
    if (pushed) for (const page of longer) assert.ok(page.estimatedHeight <= page.capacity);
  }
}
assert.ok(pushed, 'en algún tamaño la firma alta añade una página');

// ── Plantilla predeterminada en las cotizaciones nuevas, y una cotización bloqueada no se modifica ──
store.setState({ quotations: [], quotationChanges: {}, quotationLibrary: emptyQuotationLibrary(), companies: [], activeCompanyId: 'none' });
store.getState().setSyncSettings({ ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false });
const plain = createAndOpenQuotation();
assert.ok(plain.ok);
assert.equal(store.getState().quotations.find((q) => q.id === (plain as { id: string }).id)!.design.layout, 'clasica', 'sin plantilla, el diseño de fábrica');
const tpl = store.getState().createQuotationTemplate({
  name: 'Banda azul', design: { layout: 'banda', accent: '#1f3fb4', typography: 'serif', showSignature: false, showStamp: true },
  notes: 'Precios sujetos a disponibilidad.', paymentTerms: '60% de avance', validityDays: 10, isDefault: true,
});
assert.ok(tpl.ok);
const fromTemplate = createAndOpenQuotation();
assert.ok(fromTemplate.ok);
const q = store.getState().quotations.find((x) => x.id === (fromTemplate as { id: string }).id)!;
assert.deepEqual(q.design, { layout: 'banda', accent: '#1f3fb4', typography: 'serif', showSignature: false, showStamp: true, templateId: tpl.ok ? tpl.record.id : '' });
assert.equal(q.notes, 'Precios sujetos a disponibilidad.');
assert.equal(q.paymentTerms, '60% de avance');
const [y, m, d] = q.issueDate.split('-').map(Number);
assert.equal(q.validUntil, new Date(Date.UTC(y, m - 1, d + 10)).toISOString().slice(0, 10));
const explicit = createAndOpenQuotation({ design: { layout: 'minimal', accent: '#182230', typography: 'sans', showSignature: true, showStamp: false } });
assert.ok(explicit.ok);
assert.equal(store.getState().quotations.find((x) => x.id === (explicit as { id: string }).id)!.design.layout, 'minimal', 'un diseño explícito gana');

// Bloqueada (emitida): los adjuntos y el diseño no cambian.
const issued = store.getState().createQuotationRecord({ client: { name: 'Hotel', attention: '', taxId: '', phone: '', email: '', address: '' }, items: doc.items.slice(0, 1) });
assert.ok(issued.ok);
const id = issued.ok ? issued.quotation.id : '';
assert.ok(store.getState().setQuotationStatus(id, 'issued').ok);
const actions = quotationEditorActions(store.getState, id);
assert.match(actions.edit((c) => addAttachments(c, [attachment('nuevo')]))!, /no es un borrador/);
assert.match(actions.edit((c) => setDesign(c, { accent: '#b4541f' }))!, /no es un borrador/);
assert.deepEqual(store.getState().quotations.find((x) => x.id === id)!.attachments, []);
// En borrador sí.
assert.ok(store.getState().setQuotationStatus(id, 'draft').ok);
assert.equal(actions.edit((c) => addAttachments(c, [attachment('nuevo')])), null);
assert.equal(store.getState().quotations.find((x) => x.id === id)!.attachments.length, 1);

// ── B1: una cotización emitida conserva la firma y el sello con que se emitió ──
{
  const { printedSignature, printedStamp } = await import('../features/quotations/library');
  const { PDFAttachmentStorage } = await import('../services/pdfAttachmentStorage');
  const api = () => store.getState();
  const setSignatures = (items: QuotationSignature[]) =>
    store.setState((s) => ({ quotationLibrary: { ...s.quotationLibrary, signatures: { ...s.quotationLibrary.signatures, items } } }));
  setSignatures([sig('s-idali', 'signature', true, { name: 'Idali', role: 'Ventas' }), sig('stamp-org', 'stamp', true, { image: 'data:image/png;base64,c3RhbXA=' })]);
  const draft = api().createQuotationRecord({ client: { name: 'Hotel', attention: '', taxId: '', phone: '', email: '', address: '' }, items: doc.items.slice(0, 1) });
  assert.ok(draft.ok);
  const qid = draft.ok ? draft.quotation.id : '';
  const get = () => api().quotations.find((x) => x.id === qid)!;
  const signatures = () => api().quotationLibrary.signatures.items;
  // El borrador sigue la selección de la biblioteca.
  assert.equal(printedSignature(get(), signatures())?.name, 'Idali');
  setSignatures([...signatures(), sig('s-mayler', 'signature', false, { name: 'Mayler', role: 'Gerente' })]);
  assert.ok(api().updateQuotationRecord(qid, { design: { ...get().design, signatureId: 's-mayler' } }).ok);
  assert.equal(printedSignature(get(), signatures())?.name, 'Mayler', 'el borrador cambia al elegir otra firma');
  assert.equal(get().design.signature, undefined, 'en borrador no hay copia fija');
  // Emitir fija la copia.
  assert.ok(api().setQuotationStatus(qid, 'issued').ok);
  assert.deepEqual(get().design.signature, { name: 'Mayler', role: 'Gerente', image: PNG });
  assert.equal(get().design.stampImage, 'data:image/png;base64,c3RhbXA=');
  // Borrar la firma, cambiar la predeterminada o el sello no cambia lo que imprime la emitida.
  setSignatures([sig('s-nueva', 'signature', true, { name: 'Otra persona' }), sig('stamp-nuevo', 'stamp', true, { image: 'data:image/png;base64,bnVldm8=' })]);
  assert.deepEqual(printedSignature(get(), signatures()), { name: 'Mayler', role: 'Gerente', image: PNG });
  assert.equal(printedStamp(get(), signatures(), 'seal-membrete'), 'data:image/png;base64,c3RhbXA=');
  // Emitidas antes de las firmas (sin copia): ninguna firma aunque alguien importe la primera; el sello del membrete.
  const legacy = { status: 'issued' as const, design: { layout: 'clasica' as const, accent: '#087b58', typography: 'sans' as const, showSignature: true, showStamp: true } };
  assert.equal(printedSignature(legacy, signatures()), null, 'importar la primera firma no altera una emitida');
  assert.equal(printedStamp(legacy, signatures(), 'seal-membrete'), 'seal-membrete', 'conserva el sello del membrete');
  assert.equal(printedStamp(legacy, [], null), null);
  // Reabrir vuelve a seguir la biblioteca; volver a emitir fija la selección de ese momento.
  assert.ok(api().setQuotationStatus(qid, 'draft').ok);
  assert.equal(printedSignature(get(), signatures())?.name, 'Otra persona', 'la elegida ya no existe: la predeterminada');
  assert.ok(api().setQuotationStatus(qid, 'issued').ok);
  assert.equal(get().design.signature?.name, 'Otra persona');
  // Sin firma ni sello visibles, la copia no se guarda.
  assert.ok(api().setQuotationStatus(qid, 'draft').ok);
  assert.ok(api().updateQuotationRecord(qid, { design: { ...get().design, showSignature: false, showStamp: false } }).ok);
  assert.ok(api().setQuotationStatus(qid, 'issued').ok);
  assert.equal(get().design.signature, undefined);
  assert.equal(get().design.stampImage, undefined);
  // Compatibilidad: contenido sin copias sigue siendo válido y una copia mal formada se rechaza.
  assert.ok(validateQuotationContent({ ...emptyQuotationContent('2026-11-26'), design: legacy.design }).ok);
  assert.equal(validateQuotationContent({ ...emptyQuotationContent('2026-11-26'), design: { ...legacy.design, stampImage: 'data:image/svg+xml;base64,PHN2Zz4=' } }).ok, false);
  assert.equal(validateQuotationContent({ ...emptyQuotationContent('2026-11-26'), design: { ...legacy.design, signature: 'Idali' } }).ok, false);

  // ── I4: duplicar da ids nuevos a los adjuntos propios y copia sus bytes ──
  assert.ok(api().setQuotationStatus(qid, 'draft').ok);
  const bytes = await pdfWith(1);
  await PDFAttachmentStorage.saveAttachment('att-own', qid, 'plano.pdf', bytes);
  assert.ok(api().updateQuotationRecord(qid, { attachments: [attachment('att-own'), attachment('att-catalog-x', { origin: 'catalog', assetId: 'asset-x' })] }).ok);
  const copy = api().duplicateQuotationRecord(qid);
  assert.ok(copy.ok);
  const copied = copy.ok ? copy.quotation.attachments : [];
  assert.notEqual(copied[0].id, 'att-own', 'el adjunto propio recibe un id nuevo');
  assert.equal(copied[1].id, 'att-catalog-x', 'la ficha del catálogo conserva el suyo');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await PDFAttachmentStorage.getAttachment(copied[0].id), bytes, 'la copia tiene sus propios bytes');
  const { attachmentBytesUnused } = await import('../features/quotations/attachments');
  assert.equal(attachmentBytesUnused(api().quotations, attachment('att-own')), false, 'el original aún lo usa');
  assert.equal(attachmentBytesUnused([], attachment('att-own')), true);
  assert.equal(attachmentBytesUnused([], attachment('att-catalog-x', { origin: 'catalog' })), false, 'las fichas del catálogo nunca se borran');
}

// ── I1/I2/M9: publicar adjuntos e imágenes ──
{
  const { publishQuotationAssets, createUploadedAttachments } = await import('../store/sync/quotationAssets');
  const memory = new Map<string, string>();
  const uploads = createUploadedAttachments({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } });
  const pdf = await pdfWith(2);
  const prepared = await prepareAttachmentFile({ name: 'plano.pdf', bytes: pdf }, { id: 'att-pub', now });
  assert.ok(prepared.ok);
  const withAttachment = emptyQuotationContent('2026-11-26', { attachments: [prepared.attachment, attachment('equipo', { origin: 'catalog', assetId: 'uuid-equipo' })] });
  let reads = 0, posted = 0, failing = true;
  const deps = {
    scope: 'srv|org', uploads,
    upload: async () => { if (failing) throw new Error('sin red'); posted++; return 'ok'; },
    attachmentBytes: async () => { reads++; return pdf; },
  };
  assert.deepEqual((await publishQuotationAssets(withAttachment, deps)).pending, ['«plano»'], 'subida fallida: pendiente, no se publica');
  failing = false;
  assert.deepEqual((await publishQuotationAssets(withAttachment, deps)).pending, []);
  assert.equal(posted, 1, 'la ficha de equipment_assets no se sube');
  const readsBefore = reads;
  assert.deepEqual((await publishQuotationAssets(withAttachment, deps)).pending, []);
  assert.equal(reads, readsBefore, 'ya subido: ni se leen ni se rehashean sus bytes');
  const restarted = createUploadedAttachments({ getItem: (k) => memory.get(k) ?? null, setItem: () => undefined });
  await publishQuotationAssets(withAttachment, { ...deps, uploads: restarted });
  assert.equal(reads, readsBefore, 'el registro sobrevive a un reinicio');
  restarted.forgetHashes([prepared.attachment.assetId!.slice(13)]);
  await publishQuotationAssets(withAttachment, { ...deps, uploads: restarted });
  assert.equal(reads, readsBefore + 1, 'tras unknown_document_asset se vuelve a subir');
  // Una imagen nueva que no se pudo subir deja la cotización pendiente; si la base ya la tiene, no hace falta subirla.
  failing = true;
  const logoContent = emptyQuotationContent('2026-11-26', { issuer: { name: 'E', taxId: '', address: '', phone: '', email: '', website: '', logo: PNG } });
  assert.deepEqual((await publishQuotationAssets(logoContent, deps)).pending, ['el logo del emisor']);
  const base = { ...logoContent, issuer: { ...logoContent.issuer, logo: `asset:sha256:${sha(PNG)}` } };
  assert.deepEqual((await publishQuotationAssets(logoContent, { ...deps, base })).pending, [], 'confirmada en la base: se envía su referencia');

  // ── I-a: rechazos definitivos frente a fallos reintentables ──
  const { isPermanentUploadFailure } = await import('../store/sync/quotationAssets');
  const { DocumentAssetUploadError } = await import('../services/documentAssetService');
  const { publishableContent, canonicalQuotationContent } = await import('../store/sync/quotationContent');
  assert.equal(isPermanentUploadFailure(new DocumentAssetUploadError('x', 415)), true);
  assert.equal(isPermanentUploadFailure(new DocumentAssetUploadError('x', 413)), true);
  for (const status of [401, 403, 408, 429, 500, 503]) assert.equal(isPermanentUploadFailure(new DocumentAssetUploadError('x', status)), false, String(status));
  assert.equal(isPermanentUploadFailure(new Error('sin red')), false);
  const issuer = (logo: string) => ({ name: 'E', taxId: '', address: '', phone: '', email: '', website: '', logo });
  // Un JPEG guardado como `.png`: se sube con su tipo real (no falla en cada pasada).
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
  const jpegAsPng = `data:image/png;base64,${jpegBytes.toString('base64')}`;
  const sentImages: string[] = [];
  const okDeps = { ...deps, upload: async (dataUrl: string) => { sentImages.push(dataUrl); return 'ok'; } };
  const mislabelled = emptyQuotationContent('2026-11-26', { issuer: issuer(jpegAsPng) });
  const normalizedResult = await publishQuotationAssets(mislabelled, okDeps);
  assert.deepEqual([normalizedResult.pending, normalizedResult.issues], [[], []]);
  assert.equal(sentImages[0], `data:image/jpeg;base64,${jpegBytes.toString('base64')}`, 'normalizado al tipo real');
  const jpegRef = `asset:sha256:${sha(`data:image/jpeg;base64,${jpegBytes.toString('base64')}`)}`;
  assert.equal(publishableContent(mislabelled).issuer.logo, jpegRef, 'viaja la referencia del contenido normalizado');
  // Un SVG con extensión de imagen: no se intenta subir; se publica vacío con un aviso que dice qué hacer.
  const svgLogo = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
  const svgContent = emptyQuotationContent('2026-11-26', { issuer: issuer(svgLogo) });
  sentImages.length = 0;
  const svgResult = await publishQuotationAssets(svgContent, okDeps);
  assert.deepEqual(svgResult.pending, []);
  assert.equal(sentImages.length, 0);
  assert.match(svgResult.issues[0].message, /el logo del emisor.*vuelve a importarla como PNG, JPEG o WebP/);
  assert.equal(publishableContent(svgContent).issuer.logo, '');
  // 415 del servidor: imagen vacía con aviso, adjunto publicado sin su referencia; nada queda pendiente.
  const refusedPng = `data:image/png;base64,${Buffer.concat([PNG_BYTES, Buffer.from('rechazada')]).toString('base64')}`;
  const pdf2 = await pdfWith(3);
  const refusedAttachment = await prepareAttachmentFile({ name: 'cifrado.pdf', bytes: pdf2 }, { id: 'att-415', now });
  assert.ok(refusedAttachment.ok);
  const refusedContent = emptyQuotationContent('2026-11-26', {
    issuer: issuer(refusedPng), attachments: [refusedAttachment.attachment, attachment('ok-other', { origin: 'catalog', assetId: 'uuid' })],
  });
  const refused = await publishQuotationAssets(refusedContent, {
    ...deps, uploads: createUploadedAttachments(null), attachmentBytes: async () => pdf2,
    upload: async () => { throw new DocumentAssetUploadError('Formato no admitido', 415, 'unsupported_asset_type'); },
  });
  assert.deepEqual(refused.pending, [], 'un rechazo definitivo no bloquea la publicación');
  assert.deepEqual(refused.issues.map((i) => [i.kind, i.attachmentId]), [['image', undefined], ['attachment', 'att-415']]);
  assert.match(refused.issues[1].message, /quítalo o reemplázalo/);
  const refusedPublished = publishableContent(refusedContent);
  assert.equal(refusedPublished.issuer.logo, '');
  assert.equal(refusedPublished.attachments[0].assetId, undefined, 'el adjunto rechazado viaja sin referencia');
  assert.equal(refusedPublished.attachments[1].assetId, 'uuid', 'el resto, intacto');
  // publishableContent nunca muta el contenido del store.
  const frozen = emptyQuotationContent('2026-11-26', { design: { ...emptyQuotationContent('2026-11-26').design, signature: { name: 'A', role: '', image: svgLogo }, stampImage: svgLogo } });
  const before = structuredClone(frozen);
  publishableContent(frozen);
  canonicalQuotationContent(frozen);
  assert.deepEqual(frozen, before);

  // ── I-b: emitida → aceptada sin la imagen local de la copia fija: un solo PUT con las referencias de la base ──
  const { planQuotationPush } = await import('../store/sync/quotationContent');
  const signRef = `asset:sha256:${'d'.repeat(64)}`, stampRef = `asset:sha256:${'e'.repeat(64)}`;
  const issuedBase = {
    ...emptyQuotationContent('2026-11-26', { client: { name: 'Hotel', attention: '', taxId: '', phone: '', email: '', address: '' }, items: doc.items.slice(0, 1) }),
    status: 'issued' as const,
  };
  issuedBase.design = { ...issuedBase.design, signature: { name: 'Idali', role: 'Ventas', image: signRef }, stampImage: stampRef };
  const hydratedLocal = { ...issuedBase, status: 'accepted' as const, design: { ...issuedBase.design, signature: { name: 'Idali', role: 'Ventas', image: '' } } };
  delete (hydratedLocal.design as { stampImage?: string }).stampImage;
  const plan = planQuotationPush(issuedBase, hydratedLocal);
  assert.deepEqual(plan.map((p) => p.status), ['accepted'], 'sin reabrir');
  assert.equal(plan[0].design.signature?.image, signRef, 'la firma del servidor se conserva');
  assert.equal(plan[0].design.stampImage, stampRef, 'y el sello');
}

// ── Menor 3: una copia en curso protege los bytes de origen ──
{
  const { trackAttachmentCopy, attachmentCopiesSettled } = await import('../store/sync/attachmentCopies');
  const { attachmentBytesUnused } = await import('../features/quotations/attachments');
  let finish: () => void = () => undefined;
  void trackAttachmentCopy('att-copiando', new Promise<void>((resolve) => { finish = resolve; }));
  assert.equal(attachmentBytesUnused([], attachment('att-copiando')), false, 'mientras se copia, no se borra');
  finish();
  await attachmentCopiesSettled('att-copiando');
  assert.equal(attachmentBytesUnused([], attachment('att-copiando')), true);
}

console.log('Quotation attachments, signatures and templates tests passed.');
