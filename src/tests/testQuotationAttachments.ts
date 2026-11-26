// Adjuntos de la cotización: archivo subido (tipo real, tamaño, páginas), fichas del catálogo, bytes, fusión al PDF con
// tolerancia a adjuntos dañados o cifrados, firma y sello en la paginación, plantilla predeterminada y bloqueo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  catalogDatasheetCandidates, formatFileSize, mergeQuotationAttachments, pageCountLabel, prepareAttachmentFile, resolveAttachmentBytes,
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
if (!locked.ok) assert.match(locked.error, /contraseña/);
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
  documentAsset: async (ref: string) => (ref === 'asset:sha256:' + 'a'.repeat(64) ? bytesToDataUrl(PNG_BYTES, 'image/png') : null),
  equipmentAsset: async (assetId: string) => (assetId === 'asset-panel' ? new Blob([three]) : assetId === 'asset-html' ? new Blob(['<html>']) : null),
  decode: dataUrlToBytes,
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
const merged = await mergeQuotationAttachments(main, [
  { attachment: attachment('pdf3'), bytes: three },
  { attachment: attachment('foto', { title: 'Foto del techo' }), bytes: buffer(PNG_BYTES) },
  { attachment: attachment('solo-enlazado', { mode: 'related' }), bytes: three },
  { attachment: attachment('roto', { title: 'Ficha rota' }), bytes: buffer(Buffer.from('%PDF-1.4\nbasura')) },
  { attachment: attachment('cifrado', { title: 'Contrato' }), bytes: await encryptedPdf() },
  { attachment: attachment('ausente', { title: 'Plano' }), bytes: null },
  { attachment: attachment('webp', { title: 'Render' }), bytes: buffer(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')) },
  { attachment: attachment('svg', { title: 'Logo' }), bytes: buffer(svg) },
]);
const result = await PDFDocument.load(merged.bytes);
assert.equal(result.getPageCount(), 2 + 3 + 1, 'cotización + PDF de 3 páginas + 1 página de imagen; «related» no entra');
const imagePage = result.getPage(5);
assert.deepEqual([Math.round(imagePage.getWidth()), Math.round(imagePage.getHeight())], [595, 842], 'la imagen va en una página A4');
assert.equal(merged.merged, 2);
assert.deepEqual(merged.skipped.map((s) => [s.id, s.reason]), [
  ['roto', 'está dañado'],
  ['cifrado', 'está protegido con contraseña'],
  ['ausente', 'no está disponible en este equipo ni en el servidor'],
  ['webp', 'formato de imagen que no se puede incluir'],
  ['svg', 'formato no admitido'],
]);
assert.match(skippedAttachmentsMessage(merged.skipped)!, /sin 5 adjuntos: «Ficha rota» \(está dañado\)/);
assert.equal(skippedAttachmentsMessage([]), null);
const withConverter = await mergeQuotationAttachments(main, [{ attachment: attachment('webp'), bytes: buffer(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')) }], async () => buffer(PNG_BYTES));
assert.equal(withConverter.merged, 1, 'WebP convertido a PNG se incluye');
assert.equal((await mergeQuotationAttachments(main, [])).skipped.length, 0);

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

console.log('Quotation attachments, signatures and templates tests passed.');
