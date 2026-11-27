// Contratos puros de plantillas, firmas y sellos (shared/quotations/library.ts) y de la firma real de archivos.
import assert from 'node:assert/strict';
import {
  QUOTATION_LIBRARY_LIMITS, QUOTATION_LIMITS, addDaysIso, applyTemplateToNewContent, defaultQuotationSignature, defaultQuotationTemplate,
  emptyQuotationContent, templateFromQuotation, validateQuotationSignature, validateQuotationTemplate, type QuotationTemplate,
} from '../../shared/quotations';
import { checkDocumentDataUrl, decodeBase64Head, parseDataUrl, sniffDocumentFileType } from '../../shared/fileSignatures';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`;
const HTML_AS_JPEG = `data:image/jpeg;base64,${Buffer.from('<!doctype html><html><body>hola</body></html>').toString('base64')}`;
const PDF_AS_PNG = `data:image/png;base64,${Buffer.from('%PDF-1.7\n%âãÏÓ\n').toString('base64')}`;
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const REF = `asset:sha256:${'c'.repeat(64)}`;

// ── Firma real de los archivos ──
assert.equal(sniffDocumentFileType(Buffer.from('%PDF-1.4')), 'application/pdf');
assert.equal(sniffDocumentFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
assert.equal(sniffDocumentFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
assert.equal(sniffDocumentFileType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
assert.equal(sniffDocumentFileType(Buffer.from('RIFF\0\0\0\0WAVEfmt ')), null, 'RIFF que no es WebP');
assert.equal(sniffDocumentFileType(Buffer.from('<svg')), null);
assert.equal(sniffDocumentFileType(Buffer.from('<!doctype html>')), null);
assert.equal(sniffDocumentFileType([]), null);
assert.deepEqual(decodeBase64Head(Buffer.from('hola mundo').toString('base64'), 4), [...Buffer.from('hola')]);
assert.deepEqual(decodeBase64Head('**'), [], 'alfabeto inválido');
assert.equal(parseDataUrl('data:image/png;base64,abc')?.base64, undefined, 'base64 de longitud inválida');
assert.equal(parseDataUrl('data:image/png,iVBORw0K'), null, 'sin base64');
assert.equal(parseDataUrl(PNG)?.actual, 'image/png');
assert.equal(parseDataUrl(PNG)?.byteLength, Buffer.from(PNG.split(',')[1], 'base64').length);
assert.deepEqual(checkDocumentDataUrl(PNG, { maxBytes: 1000 }).ok, true);
for (const disguised of [SVG_AS_PNG, HTML_AS_JPEG, PDF_AS_PNG]) assert.deepEqual(checkDocumentDataUrl(disguised, { maxBytes: 1e6 }), { ok: false, reason: 'type' });
assert.deepEqual(checkDocumentDataUrl(SVG, { maxBytes: 1e6 }), { ok: false, reason: 'type' });
assert.deepEqual(checkDocumentDataUrl(PNG, { maxBytes: 10 }), { ok: false, reason: 'size' });
assert.deepEqual(checkDocumentDataUrl('texto', { maxBytes: 10 }), { ok: false, reason: 'format' });
const pdfUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.7 contenido').toString('base64')}`;
assert.equal(checkDocumentDataUrl(pdfUrl, { maxBytes: 1e6 }).ok, true);
assert.deepEqual(checkDocumentDataUrl(pdfUrl, { maxBytes: 1e6, allowed: ['image/png'] }), { ok: false, reason: 'type' });

// ── Plantillas ──
const template = validateQuotationTemplate({
  name: '  Electsun clásica ', description: 'Barra verde', design: { layout: 'banda', accent: '#1F3FB4', typography: 'serif', showSignature: false, showStamp: true, templateId: 'x' },
  notes: ' Precios sujetos a cambio. ', paymentTerms: '50% de avance', validityDays: 15, isDefault: true, extra: 'descartada',
});
assert.ok(template.ok);
assert.deepEqual(template.value, {
  name: 'Electsun clásica', description: 'Barra verde', design: { layout: 'banda', accent: '#1f3fb4', typography: 'serif', showSignature: false, showStamp: true },
  notes: 'Precios sujetos a cambio.', paymentTerms: '50% de avance', validityDays: 15, isDefault: true,
});
assert.deepEqual(validateQuotationTemplate(template.value), template, 'idempotente');
const minimal = validateQuotationTemplate({ name: 'Mínima' });
assert.ok(minimal.ok);
assert.deepEqual(minimal.value.design, { layout: 'clasica', accent: '#087b58', typography: 'sans', showSignature: true, showStamp: true });
assert.equal(minimal.value.validityDays, null);
assert.equal(minimal.value.isDefault, false);
const rejects = (raw: unknown, pattern: RegExp) => {
  const result = validateQuotationTemplate(raw);
  assert.equal(result.ok, false, JSON.stringify(raw).slice(0, 80));
  if (!result.ok) assert.match(result.error, pattern);
};
rejects(null, /Plantilla inválida/);
rejects([], /Plantilla inválida/);
rejects({ name: '   ' }, /nombre/);
rejects({ name: 'x'.repeat(QUOTATION_LIBRARY_LIMITS.name + 1) }, /120/);
rejects({ name: 'A', description: 'x'.repeat(256) }, /255/);
rejects({ name: 'A', notes: 'x'.repeat(QUOTATION_LIMITS.notes + 1) }, /notas/);
rejects({ name: 'A', paymentTerms: 'x'.repeat(QUOTATION_LIMITS.paymentTerms + 1) }, /condiciones/);
rejects({ name: 'A', design: { layout: 'moderna' } }, /disposición/);
rejects({ name: 'A', design: { accent: 'red' } }, /#rrggbb/);
rejects({ name: 'A', validityDays: 0 }, /vigencia/);
rejects({ name: 'A', validityDays: 366 }, /vigencia/);
rejects({ name: 'A', validityDays: 1.5 }, /vigencia/);
rejects({ name: 'A', isDefault: 'sí' }, /predeterminada/);
rejects({ name: 'A\u0000' }, /texto válido/);

// ── Firmas y sellos ──
const signature = validateQuotationSignature({ kind: 'signature', name: ' Idali Candelario ', role: ' Ventas ', image: PNG, isDefault: true, extra: 1 });
assert.deepEqual(signature, { ok: true, value: { kind: 'signature', name: 'Idali Candelario', role: 'Ventas', image: PNG, isDefault: true } });
assert.deepEqual(validateQuotationSignature({ kind: 'stamp', name: 'Sello Electsun', image: REF }), { ok: true, value: { kind: 'stamp', name: 'Sello Electsun', role: '', image: REF, isDefault: false } });
const rejectsSignature = (raw: unknown, pattern: RegExp) => {
  const result = validateQuotationSignature(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, pattern);
};
rejectsSignature({ kind: 'firma', name: 'A', image: PNG }, /Tipo/);
rejectsSignature({ kind: 'signature', name: '', image: PNG }, /nombre/);
rejectsSignature({ kind: 'stamp', name: '', image: PNG }, /sello necesita un nombre/);
rejectsSignature({ kind: 'signature', name: 'A', role: 'x'.repeat(121), image: PNG }, /cargo/);
rejectsSignature({ kind: 'signature', name: 'A', image: '' }, /necesitan una imagen/);
rejectsSignature({ kind: 'signature', name: 'A', image: SVG }, /no es una imagen PNG/);
rejectsSignature({ kind: 'signature', name: 'A', image: SVG_AS_PNG }, /no coincide/);
rejectsSignature({ kind: 'signature', name: 'A', image: HTML_AS_JPEG }, /no coincide/);
rejectsSignature({ kind: 'signature', name: 'A', image: PDF_AS_PNG }, /no coincide/);
rejectsSignature({ kind: 'signature', name: 'A', image: 'https://example.invalid/firma.png' }, /PNG, JPEG o WebP/);
const big = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(QUOTATION_LIBRARY_LIMITS.signatureImageBytes)]).toString('base64')}`;
rejectsSignature({ kind: 'signature', name: 'A', image: big }, /512 KB/);

// ── Predeterminadas: la más reciente marcada, determinista ──
const meta = (id: string, updatedAt: string) => ({ id, version: 1, baseVersion: 1, createdById: '', createdBy: '', createdAt: updatedAt, updatedAt });
const templates: QuotationTemplate[] = [
  { ...minimal.value, ...meta('t-a', '2026-11-01T00:00:00Z'), isDefault: true },
  { ...minimal.value, ...meta('t-b', '2026-11-03T00:00:00Z'), isDefault: true },
  { ...minimal.value, ...meta('t-c', '2026-11-05T00:00:00Z'), isDefault: false },
];
assert.equal(defaultQuotationTemplate(templates)?.id, 't-b');
assert.equal(defaultQuotationTemplate([]), undefined);
const sigs = [
  { kind: 'signature' as const, name: 'A', role: '', image: PNG, isDefault: true, ...meta('s-a', '2026-11-01T00:00:00Z') },
  { kind: 'stamp' as const, name: 'S', role: '', image: PNG, isDefault: true, ...meta('s-b', '2026-11-01T00:00:00Z') },
  { kind: 'stamp' as const, name: 'S2', role: '', image: PNG, isDefault: true, ...meta('s-c', '2026-11-01T00:00:00Z') },
];
assert.equal(defaultQuotationSignature(sigs, 'signature')?.id, 's-a');
assert.equal(defaultQuotationSignature(sigs, 'stamp')?.id, 's-b', 'a igual fecha, por id');

// ── Fechas y aplicación a una cotización nueva ──
assert.equal(addDaysIso('2026-11-26', 15), '2026-12-11');
assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
assert.equal(addDaysIso('2028-02-28', 1), '2028-02-29');
assert.equal(addDaysIso('no-fecha', 3), 'no-fecha');
const chosen: QuotationTemplate = { ...template.value, ...meta('t-elect', '2026-11-01T00:00:00Z') };
const fresh = applyTemplateToNewContent(emptyQuotationContent('2026-11-26'), chosen);
assert.deepEqual(fresh.design, { layout: 'banda', accent: '#1f3fb4', typography: 'serif', showSignature: false, showStamp: true, templateId: 't-elect' });
assert.equal(fresh.notes, 'Precios sujetos a cambio.');
assert.equal(fresh.paymentTerms, '50% de avance');
assert.equal(fresh.validUntil, '2026-12-11');
// Lo que ya trae el contenido gana sobre los textos de la plantilla.
const prefilled = applyTemplateToNewContent(emptyQuotationContent('2026-11-26', { notes: 'Propias', validUntil: '2026-11-30' }), { ...chosen, validityDays: null });
assert.equal(prefilled.notes, 'Propias');
assert.equal(prefilled.validUntil, '2026-11-30');
assert.equal(applyTemplateToNewContent(emptyQuotationContent('2026-11-26'), { ...chosen, validityDays: null }).validUntil, null);

// «Guardar como plantilla»: diseño sin enlace, textos y vigencia en días.
const saved = templateFromQuotation({ ...fresh }, 'Desde la cotización');
assert.deepEqual(saved, {
  name: 'Desde la cotización', description: '', design: { layout: 'banda', accent: '#1f3fb4', typography: 'serif', showSignature: false, showStamp: true },
  notes: 'Precios sujetos a cambio.', paymentTerms: '50% de avance', validityDays: 15, isDefault: false,
});
assert.equal(templateFromQuotation({ ...fresh, validUntil: null }, 'x').validityDays, null);
assert.equal(templateFromQuotation({ ...fresh, validUntil: '2026-11-26' }, 'x').validityDays, null, 'cero días no es vigencia');
assert.ok(validateQuotationTemplate(saved).ok);

// Normalizar al tipo real: un JPEG declarado PNG pasa a image/jpeg; lo que no es una imagen admitida, null.
{
  const { normalizeDocumentDataUrl } = await import('../../shared/fileSignatures');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
  assert.equal(normalizeDocumentDataUrl(`data:image/png;base64,${jpeg}`), `data:image/jpeg;base64,${jpeg}`);
  assert.equal(normalizeDocumentDataUrl(PNG), PNG, 'ya correcto: el mismo texto');
  assert.equal(normalizeDocumentDataUrl(SVG_AS_PNG), null);
  assert.equal(normalizeDocumentDataUrl(PDF_AS_PNG), null, 'un PDF no es una imagen');
  assert.equal(normalizeDocumentDataUrl(PDF_AS_PNG, ['application/pdf']), PDF_AS_PNG.replace('image/png', 'application/pdf'));
  assert.equal(normalizeDocumentDataUrl('texto'), null);
  // Firma importada con el tipo mal declarado: se valida tras normalizar (lo hace el store al crear).
}

console.log('Quotation library contract tests passed.');
