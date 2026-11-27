import assert from 'node:assert/strict';
import { DEFAULT_QUOTATION_DESIGN, QUOTATION_LIMITS, computeQuotationTotals, emptyQuotationContent, validateQuotationContent } from '../../shared/quotations/index';
import type { QuotationContent } from '../../shared/quotations/index';

const validate = (data: unknown) => validateQuotationContent(data);
const ok = (data: unknown, label = ''): QuotationContent => {
  const result = validate(data);
  assert(result.ok, result.ok ? '' : `${label} ${result.error}`.trim());
  return result.value;
};
const fail = (data: unknown, pattern: RegExp, label: string) => {
  const result = validate(data);
  assert.equal(result.ok, false, `debería rechazar: ${label}`);
  if (!result.ok) assert.match(result.error, pattern, label);
};

const itemLine = (over: Record<string, unknown> = {}) => ({ id: 'l1', kind: 'item', description: 'Panel solar', quantity: 2, unit: 'UD', unitPriceCents: 10000, discountPct: 0, taxable: true, ...over });
const draft = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...emptyQuotationContent('2026-03-10', { exchangeRate: 60 }), ...over });
const issued = (over: Record<string, unknown> = {}): Record<string, unknown> => draft({ status: 'issued', client: { name: 'Hotel Caribe SRL' }, items: [itemLine()], ...over });

// fábrica
{
  const empty = emptyQuotationContent('2026-03-10', { exchangeRate: 58.5 });
  assert.equal(empty.status, 'draft');
  assert.equal(empty.currency, 'DOP');
  assert.equal(empty.issueDate, '2026-03-10');
  assert.equal(empty.validUntil, null);
  assert.equal(empty.exchangeRate, 58.5);
  assert.deepEqual(empty.design, DEFAULT_QUOTATION_DESIGN);
  assert.deepEqual(DEFAULT_QUOTATION_DESIGN, { layout: 'clasica', accent: '#087b58', typography: 'sans', showSignature: true, showStamp: true });
  assert.deepEqual(empty.items, []);
  assert(emptyQuotationContent('2026-03-10').exchangeRate > 0, 'tasa por defecto utilizable');
  assert.equal(emptyQuotationContent('2026-03-10', { currency: 'USD', seller: 'Ana' }).currency, 'USD');
  const a = emptyQuotationContent('2026-03-10', { exchangeRate: 60 });
  a.items.push(itemLine() as never);
  assert.equal(emptyQuotationContent('2026-03-10', { exchangeRate: 60 }).items.length, 0, 'no comparte referencias entre llamadas');
  ok(empty);
}

// mínimo válido (borrador vacío) y normalización de ausentes
{
  const value = ok({ status: 'draft', issueDate: '2026-03-10', currency: 'DOP', exchangeRate: 60 });
  assert.equal(value.validUntil, null);
  assert.deepEqual(value.client, { name: '', attention: '', taxId: '', phone: '', email: '', address: '' });
  assert.deepEqual(value.items, []);
  assert.deepEqual(value.discounts, []);
  assert.deepEqual(value.attachments, []);
  assert.equal(value.notes, '');
  assert.equal(value.paymentTerms, '');
  assert.equal(value.seller, '');
  assert.equal(value.projectLabel, '');
  assert.deepEqual(value.design, DEFAULT_QUOTATION_DESIGN);
  assert.deepEqual(value.issuer, { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' });
  assert.equal('clientId' in value, false);
  assert.equal('sourceProjectId' in value, false);
  assert.equal('folderId' in value, false);
}

// contenido completo: sale normalizado
{
  const full = {
    status: 'issued', issueDate: '2026-03-10', validUntil: '2026-04-10', currency: 'USD', exchangeRate: 59.75,
    clientId: ' cli-1 ', sourceProjectId: 'proj-1', folderId: 'fold-1', seller: '  Ana Pérez ', projectLabel: ' Hotel Caribe ',
    client: { name: ' Hotel Caribe SRL ', attention: ' Sr. Luis ', taxId: '1-31-12345-6', phone: ' 809-555-1234 ', email: ' compras@hotel.do ', address: ' Av. Mella 1 ' },
    items: [
      itemLine({ id: ' a ', description: ' Panel 550 W ', quantity: 12.3456, unitPriceCents: 10000.4, discountPct: 5, catalogItemId: ' eq-1 ' }),
      { id: 'b', kind: 'detail', description: ' Cable ', quantity: 100, unit: 'pies', unitPriceCents: 999, discountPct: 20, taxable: true },
      { id: 'c', description: 'Sin tipo', quantity: 1, unitPriceCents: 500, taxable: false },
    ],
    discounts: [{ id: 'd1', label: ' Pronto pago ', type: 'percentage', value: 5 }, { id: 'd2', label: '', type: 'fixed', value: 1500.7 }],
    notes: ' Notas ', paymentTerms: ' 50 % al ordenar ',
    design: { templateId: 't1', layout: 'banda', accent: '#AABBCC', typography: 'serif', signatureId: 's1', showSignature: false, showStamp: false },
    attachments: [{ id: 'att1', fileName: ' ficha.pdf ', fileSize: 1234, pageCount: 2, title: ' Ficha ', uploadedAt: '2026-03-10T12:00:00.000Z', mode: 'include', origin: 'catalog', assetId: 'asset:sha256:' + 'a'.repeat(64), catalogItemId: 'eq-1', thumbnailDataUrl: 'data:image/png;base64,AAAA' }],
    issuer: { name: ' Electsun ', taxId: '1-30-00000-1', address: 'Santo Domingo', phone: '809-000-0000', email: 'info@electsun.do', website: 'electsun.do', logo: 'asset:sha256:' + 'b'.repeat(64) },
  };
  const value = ok(full);
  assert.equal(value.clientId, 'cli-1');
  assert.equal(value.seller, 'Ana Pérez');
  assert.equal(value.projectLabel, 'Hotel Caribe');
  assert.deepEqual(value.client, { name: 'Hotel Caribe SRL', attention: 'Sr. Luis', taxId: '1-31-12345-6', phone: '809-555-1234', email: 'compras@hotel.do', address: 'Av. Mella 1' });
  assert.deepEqual(value.items[0], { id: 'a', kind: 'item', description: 'Panel 550 W', quantity: 12.346, unit: 'UD', unitPriceCents: 10000, discountPct: 5, taxable: true, catalogItemId: 'eq-1' });
  assert.deepEqual(value.items[1], { id: 'b', kind: 'detail', description: 'Cable', quantity: 100, unit: 'pies', unitPriceCents: 0, discountPct: 0, taxable: false });
  assert.equal(value.items[2].kind, 'item', 'kind ausente = item');
  assert.equal(value.items[2].unit, '');
  assert.equal(value.items[2].discountPct, 0);
  assert.deepEqual(value.discounts, [{ id: 'd1', label: 'Pronto pago', type: 'percentage', value: 5 }, { id: 'd2', label: '', type: 'fixed', value: 1501 }]);
  assert.equal(value.design.accent, '#aabbcc');
  assert.equal(value.design.showStamp, false);
  assert.equal(value.attachments[0].fileName, 'ficha.pdf');
  assert.equal(value.issuer.name, 'Electsun');
  assert.equal(value.notes, 'Notas');
  assert(Number.isInteger(value.discounts[1].value));
}

// ausentes dentro de design toman el valor por defecto
{
  const value = ok(draft({ design: { layout: 'minimal' } }));
  assert.deepEqual(value.design, { ...DEFAULT_QUOTATION_DESIGN, layout: 'minimal' });
}

// estado, moneda, layout y demás enumeraciones
fail(draft({ status: 'pendiente' }), /estado/i, 'estado desconocido');
fail(draft({ status: undefined }), /estado/i, 'estado ausente');
fail(draft({ currency: 'EUR' }), /moneda/i, 'moneda desconocida');
fail(draft({ design: { layout: 'barroco' } }), /dise/i, 'layout desconocido');
fail(draft({ design: { typography: 'cursiva' } }), /tipograf/i, 'tipografía desconocida');
fail(draft({ design: { accent: 'verde' } }), /acento|color/i, 'accent sin formato');
fail(draft({ design: { accent: '#abc' } }), /acento|color/i, 'accent corto');
fail(draft({ design: { accent: '#12345g' } }), /acento|color/i, 'accent no hexadecimal');
fail(draft({ design: { showStamp: 'si' } }), /dise/i, 'showStamp no booleano');
fail(draft({ items: [itemLine({ kind: 'otro' })] }), /tipo de l[ií]nea|l[ií]nea/i, 'kind desconocido');

// no objetos
for (const bad of [null, undefined, 'x', 42, [], true]) fail(bad, /cotizaci[oó]n/i, `entrada ${JSON.stringify(bad)}`);

// fechas
fail(draft({ issueDate: '10/03/2026' }), /fecha de emisi[oó]n/i, 'formato de fecha');
fail(draft({ issueDate: '2026-02-30' }), /fecha de emisi[oó]n/i, '30 de febrero');
fail(draft({ issueDate: '2026-13-01' }), /fecha de emisi[oó]n/i, 'mes 13');
fail(draft({ issueDate: undefined }), /fecha de emisi[oó]n/i, 'sin fecha');
fail(draft({ issueDate: '2026-3-1' }), /fecha de emisi[oó]n/i, 'sin ceros');
fail(draft({ validUntil: '2026-02-30' }), /vigencia|v[aá]lida hasta/i, 'validUntil irreal');
fail(draft({ validUntil: '2026-03-09' }), /anterior/i, 'validUntil anterior a la emisión');
ok(draft({ validUntil: '2026-03-10' }));
ok(draft({ issueDate: '2024-02-29', validUntil: '2024-02-29' }));
fail(draft({ issueDate: '2025-02-29' }), /fecha de emisi[oó]n/i, '29 de febrero en año no bisiesto');
assert.equal(ok(draft({ validUntil: undefined })).validUntil, null);

// tasa de cambio
fail(draft({ exchangeRate: 0 }), /tasa/i, 'tasa 0');
fail(draft({ exchangeRate: -1 }), /tasa/i, 'tasa negativa');
fail(draft({ exchangeRate: Number.NaN }), /tasa/i, 'tasa NaN');
fail(draft({ exchangeRate: Number.POSITIVE_INFINITY }), /tasa/i, 'tasa infinita');
fail(draft({ exchangeRate: '60' }), /tasa/i, 'tasa como texto');
fail(draft({ exchangeRate: undefined }), /tasa/i, 'sin tasa');

// líneas: cantidades, precios, porcentajes, ids
fail(draft({ items: [itemLine({ quantity: -1 })] }), /cantidad/i, 'cantidad negativa');
fail(draft({ items: [itemLine({ quantity: Number.NaN })] }), /cantidad/i, 'cantidad NaN');
fail(draft({ items: [itemLine({ quantity: Number.POSITIVE_INFINITY })] }), /cantidad/i, 'cantidad infinita');
fail(draft({ items: [itemLine({ quantity: '2' })] }), /cantidad/i, 'cantidad como texto');
fail(draft({ items: [itemLine({ unitPriceCents: -1 })] }), /precio/i, 'precio negativo');
fail(draft({ items: [itemLine({ unitPriceCents: Number.POSITIVE_INFINITY })] }), /precio/i, 'precio infinito');
fail(draft({ items: [itemLine({ unitPriceCents: Number.NaN })] }), /precio/i, 'precio NaN');
fail(draft({ items: [itemLine({ discountPct: 101 })] }), /descuento/i, 'descuento de línea > 100');
fail(draft({ items: [itemLine({ discountPct: -1 })] }), /descuento/i, 'descuento de línea < 0');
fail(draft({ items: [itemLine({ id: '' })] }), /id/i, 'id de línea vacío');
fail(draft({ items: [itemLine({ id: '   ' })] }), /id/i, 'id de línea en blanco');
fail(draft({ items: [itemLine({ id: undefined })] }), /id/i, 'id de línea ausente');
fail(draft({ items: [itemLine({ id: 'dup' }), itemLine({ id: 'dup', kind: 'detail' })] }), /duplicad/i, 'ids de línea duplicados');
fail(draft({ items: [itemLine({ id: ' dup ' }), itemLine({ id: 'dup' })] }), /duplicad/i, 'ids duplicados tras recortar');
fail(draft({ items: [itemLine({ taxable: 'si' })] }), /ITBIS|gravad/i, 'taxable no booleano');
fail(draft({ items: 'x' }), /l[ií]neas/i, 'items no es arreglo');
fail(draft({ items: [null] }), /l[ií]nea/i, 'línea nula');
assert.equal(ok(draft({ items: [itemLine({ discountPct: 100 }), itemLine({ id: 'z', discountPct: 0 })] })).items.length, 2);

// descuentos globales
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'otro', value: 1 }] }), /descuento/i, 'tipo de descuento');
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'percentage', value: 101 }] }), /descuento/i, 'porcentaje > 100');
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'percentage', value: -1 }] }), /descuento/i, 'porcentaje negativo');
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: -1 }] }), /descuento/i, 'monto negativo');
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: Number.NaN }] }), /descuento/i, 'monto NaN');
fail(draft({ discounts: [{ id: '', label: 'x', type: 'fixed', value: 1 }] }), /descuento/i, 'id vacío');
fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: 1 }, { id: 'd', label: 'y', type: 'fixed', value: 2 }] }), /duplicad/i, 'ids de descuento duplicados');

// cliente obligatorio y línea 'item' obligatoria solo en emitida y aceptada
ok(draft({ client: { name: '' } }));
ok(draft({ items: [] }));
for (const status of ['rejected', 'void']) {
  ok(issued({ status }));
  ok(draft({ status }), `${status} con borrador vacío (draft → void)`);
  ok(issued({ status, client: { name: '   ' }, items: [] }));
}
for (const status of ['issued', 'accepted']) {
  ok(issued({ status }));
  fail(issued({ status, client: { name: '   ' } }), /cliente/i, `${status} sin nombre de cliente`);
  fail(issued({ status, items: [] }), /l[ií]nea/i, `${status} sin líneas`);
  fail(issued({ status, items: [{ id: 'd', kind: 'detail', description: 'Solo descripción', quantity: 1 }] }), /l[ií]nea/i, `${status} solo con filas descriptivas`);
}
ok(issued({ items: [{ id: 'd', kind: 'detail', description: 'x', quantity: 1 }, itemLine({ id: 'i' })] }));

// límites
const text = (n: number) => 'x'.repeat(n);
fail(draft({ items: [itemLine({ id: text(QUOTATION_LIMITS.id + 1) })] }), /id/i, 'id de línea largo');
fail(draft({ items: [itemLine({ description: text(QUOTATION_LIMITS.lineDescription + 1) })] }), /descripci[oó]n/i, 'descripción larga');
ok(draft({ items: [itemLine({ description: text(QUOTATION_LIMITS.lineDescription) })] }));
fail(draft({ items: [itemLine({ unit: text(QUOTATION_LIMITS.unit + 1) })] }), /unidad/i, 'unidad larga');
fail(draft({ notes: text(QUOTATION_LIMITS.notes + 1) }), /notas/i, 'notas largas');
fail(draft({ paymentTerms: text(QUOTATION_LIMITS.paymentTerms + 1) }), /condiciones/i, 'condiciones largas');
fail(draft({ projectLabel: text(QUOTATION_LIMITS.label + 1) }), /proyecto|etiqueta/i, 'etiqueta larga');
fail(draft({ seller: text(QUOTATION_LIMITS.label + 1) }), /vendedor/i, 'vendedor largo');
fail(draft({ client: { name: text(QUOTATION_LIMITS.label + 1) } }), /cliente/i, 'nombre de cliente largo');
fail(draft({ issuer: { name: text(QUOTATION_LIMITS.label + 1) } }), /emisor/i, 'nombre de emisor largo');
fail(draft({ clientId: text(QUOTATION_LIMITS.id + 1) }), /id/i, 'clientId largo');
fail(draft({ items: Array.from({ length: QUOTATION_LIMITS.maxItems + 1 }, (_, i) => itemLine({ id: `l${i}` })) }), /l[ií]neas/i, 'demasiadas líneas');
ok(draft({ items: Array.from({ length: QUOTATION_LIMITS.maxItems }, (_, i) => itemLine({ id: `l${i}` })) }));
assert.equal(QUOTATION_LIMITS.maxItems, 200);
assert.equal(QUOTATION_LIMITS.maxDiscounts, 20);
assert.equal(QUOTATION_LIMITS.maxAttachments, 40);
fail(draft({ discounts: Array.from({ length: QUOTATION_LIMITS.maxDiscounts + 1 }, (_, i) => ({ id: `d${i}`, label: 'x', type: 'fixed', value: 1 })) }), /descuentos/i, 'demasiados descuentos');
const attachment = (over: Record<string, unknown> = {}) => ({ id: 'a1', fileName: 'ficha.pdf', fileSize: 10, pageCount: 1, title: 'Ficha', uploadedAt: '2026-03-10T12:00:00.000Z', mode: 'related', origin: 'manual', ...over });
fail(draft({ attachments: Array.from({ length: QUOTATION_LIMITS.maxAttachments + 1 }, (_, i) => attachment({ id: `a${i}` })) }), /anexos|adjuntos/i, 'demasiados adjuntos');
ok(draft({ attachments: [attachment()] }));
fail(draft({ attachments: [attachment({ mode: 'merge' })] }), /anexo|adjunto/i, 'modo de adjunto');
fail(draft({ attachments: [attachment({ origin: 'otro' })] }), /anexo|adjunto/i, 'origen de adjunto');
fail(draft({ attachments: [attachment({ fileSize: -1 })] }), /anexo|adjunto/i, 'tamaño negativo');
fail(draft({ attachments: [attachment({ pageCount: 1.5 })] }), /anexo|adjunto/i, 'páginas no enteras');
fail(draft({ attachments: [attachment({ id: '' })] }), /anexo|adjunto/i, 'id de adjunto vacío');
fail(draft({ attachments: [attachment(), attachment()] }), /duplicad/i, 'ids de adjunto duplicados');

// claves desconocidas: se descartan (también anidadas)
{
  const value = ok(issued({
    surprise: 1, number: 'COT-2026-0001', version: 3, items: [itemLine({ extra: 'x', hideInQuotation: true })],
    client: { name: 'Hotel', creditLimit: 5 }, design: { layout: 'banda', glow: true }, issuer: { name: 'E', fax: '1' },
    discounts: [{ id: 'd', label: 'x', type: 'fixed', value: 1, note: 'y' }],
  }));
  assert.equal('surprise' in value, false);
  assert.equal('number' in value, false, 'el número y la versión no son contenido');
  assert.equal('version' in value, false);
  assert.equal('extra' in value.items[0], false);
  assert.equal('hideInQuotation' in value.items[0], false);
  assert.equal('creditLimit' in value.client, false);
  assert.equal('glow' in value.design, false);
  assert.equal('fax' in value.issuer, false);
  assert.equal('note' in value.discounts[0], false);
  const keys = Object.keys(value).sort();
  assert.deepEqual(keys, ['attachments', 'client', 'currency', 'design', 'discounts', 'exchangeRate', 'issueDate', 'issuer', 'items', 'notes', 'paymentTerms', 'projectLabel', 'seller', 'status', 'validUntil']);
}

// la entrada no se muta
{
  const input = issued({ items: [itemLine({ id: ' a ', description: ' x ' })] });
  const before = structuredClone(input);
  ok(input);
  assert.deepEqual(input, before);
}

// idempotencia
for (const input of [
  draft(),
  issued({ validUntil: '2026-04-01', currency: 'USD', design: { accent: '#ABCDEF' }, discounts: [{ id: 'd', label: ' L ', type: 'fixed', value: 10.6 }], items: [itemLine({ quantity: 1.23456, unitPriceCents: 99.5 }), { id: 'd', kind: 'detail', description: ' desc ', quantity: 2, unit: ' ft ', unitPriceCents: 5, discountPct: 3, taxable: true }] }),
]) {
  const once = ok(input);
  assert.deepEqual(ok(once), once);
}

// topes de importes (precio unitario, descuento fijo y bruto del documento)
{
  assert.equal(QUOTATION_LIMITS.maxUnitPriceCents, 100_000_000_000);
  assert.equal(QUOTATION_LIMITS.maxDocumentCents, 1_000_000_000_000);
  fail(draft({ items: [itemLine({ quantity: 1, unitPriceCents: 1e306 })] }), /precio/i, 'precio 1e306');
  fail(draft({ items: [itemLine({ quantity: 1, unitPriceCents: 1_234_567_890_123_456 })] }), /precio/i, 'precio que pierde precisión');
  fail(draft({ items: [itemLine({ quantity: 1, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents + 1 })] }), /precio/i, 'precio sobre el tope');
  assert.equal(ok(draft({ items: [itemLine({ quantity: 1, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents })] })).items[0].unitPriceCents, QUOTATION_LIMITS.maxUnitPriceCents);
  fail(draft({ items: [itemLine({ quantity: 0.001, unitPriceCents: 4_600_000_000_831_495 })] }), /precio/i, 'precio enorme con cantidad mínima');
  fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: 1e300 }] }), /descuento/i, 'descuento fijo 1e300');
  fail(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: QUOTATION_LIMITS.maxDocumentCents + 1 }] }), /descuento/i, 'descuento fijo sobre el tope');
  ok(draft({ discounts: [{ id: 'd', label: 'x', type: 'fixed', value: QUOTATION_LIMITS.maxDocumentCents }] }));
  fail(draft({ items: [itemLine({ id: 'a', quantity: 1_000_000, unitPriceCents: 1e10 }), itemLine({ id: 'b', quantity: 1_000_000, unitPriceCents: 1e10 })] }), /documento|importe/i, 'bruto del documento 2e16');
  fail(draft({ items: Array.from({ length: 11 }, (_, i) => itemLine({ id: `t${i}`, quantity: 1, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents })) }), /documento|importe/i, 'once líneas en el tope de precio');
  ok(draft({ items: Array.from({ length: 10 }, (_, i) => itemLine({ id: `t${i}`, quantity: 1, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents })) }));
  // el bruto que se compara es el redondeado de cada línea: 0.001 × 500 centavos = 0.5 → 1, un centavo sobre el tope
  fail(draft({ items: [itemLine({ id: 'a', quantity: 10, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents }), itemLine({ id: 'b', quantity: 0.001, unitPriceCents: 500 })] }), /documento|importe/i, 'un centavo por encima del tope tras redondear');
  ok(draft({ items: [itemLine({ id: 'a', quantity: 10, unitPriceCents: QUOTATION_LIMITS.maxUnitPriceCents }), itemLine({ id: 'b', kind: 'detail', quantity: 1_000_000 })] }), 'las filas descriptivas no suman al bruto');
}

// año de emisión y vigencia entre 2000 y 2199
fail(draft({ issueDate: '0999-05-01' }), /2000.*2199/, 'año 0999');
fail(draft({ issueDate: '1999-12-31' }), /2000.*2199/, 'año 1999');
fail(draft({ issueDate: '2200-01-01' }), /2000.*2199/, 'año 2200');
ok(draft({ issueDate: '2000-01-01' }));
ok(draft({ issueDate: '2199-12-31', validUntil: '2199-12-31' }));
fail(draft({ issueDate: '2199-12-01', validUntil: '2200-01-01' }), /vigencia.*2000.*2199/i, 'vigencia en 2200');

// imágenes: solo '', referencia asset:sha256 o data URL png/jpeg/webp en base64
{
  assert.equal(QUOTATION_LIMITS.logoDataUrl, 500_000);
  assert.equal(QUOTATION_LIMITS.thumbnailDataUrl, 100_000);
  assert.equal('dataUrl' in QUOTATION_LIMITS, false);
  const logo = (value: unknown) => draft({ issuer: { name: 'E', logo: value } });
  for (const good of ['', 'asset:sha256:' + 'a'.repeat(64), 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,/9j/4A==', 'data:image/webp;base64,UklGRg==']) {
    assert.equal(ok(logo(good)).issuer.logo, good, `logo ${good.slice(0, 30)}`);
  }
  assert.equal(ok(logo(undefined)).issuer.logo, '');
  for (const bad of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,AAAA', 'data:image/png,raw', 'data:image/png;base64,', 'data:image/png;base64,AA AA', 'asset:sha256:XYZ', 'asset:sha256:' + 'A'.repeat(64), 'javascript:alert(1)']) {
    fail(logo(bad), /logo/i, `logo ${bad.slice(0, 30)}`);
  }
  const prefix = 'data:image/png;base64,';
  ok(logo(prefix + 'A'.repeat(QUOTATION_LIMITS.logoDataUrl - prefix.length)));
  fail(logo(prefix + 'A'.repeat(QUOTATION_LIMITS.logoDataUrl - prefix.length + 4)), /logo/i, 'logo demasiado grande');

  const thumb = (value: unknown) => draft({ attachments: [attachment({ thumbnailDataUrl: value })] });
  assert.equal(ok(thumb('data:image/jpeg;base64,AAAA')).attachments[0].thumbnailDataUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal(ok(thumb('asset:sha256:' + 'f'.repeat(64))).attachments[0].thumbnailDataUrl, 'asset:sha256:' + 'f'.repeat(64));
  assert.equal('thumbnailDataUrl' in ok(thumb('')).attachments[0], false);
  for (const bad of ['https://example.com/t.png', 'data:image/gif;base64,R0lG', 'hola']) fail(thumb(bad), /miniatura/i, `miniatura ${bad}`);
  ok(thumb(prefix + 'A'.repeat(QUOTATION_LIMITS.thumbnailDataUrl - prefix.length)));
  fail(thumb(prefix + 'A'.repeat(QUOTATION_LIMITS.thumbnailDataUrl - prefix.length + 4)), /miniatura/i, 'miniatura demasiado grande');

  const asset = (value: unknown) => draft({ attachments: [attachment({ assetId: value })] });
  assert.equal(ok(asset('asset:sha256:' + 'a'.repeat(64))).attachments[0].assetId, 'asset:sha256:' + 'a'.repeat(64));
  assert.equal(ok(asset('file_01-AB')).attachments[0].assetId, 'file_01-AB');
  for (const bad of ['a b', '../etc/passwd', 'https://x/y', 'id<script>', 'x'.repeat(QUOTATION_LIMITS.assetId + 1)]) fail(asset(bad), /referencia/i, `assetId ${bad.slice(0, 20)}`);
  ok(asset('x'.repeat(QUOTATION_LIMITS.assetId)));
}

// porcentajes: se guardan redondeados a 2 decimales (half-up), igual que se calculan
{
  const value = ok(draft({
    items: [itemLine({ id: 'a', discountPct: 12.345 }), itemLine({ id: 'b', discountPct: 12.344 }), itemLine({ id: 'c', discountPct: 0.005 }), itemLine({ id: 'd', discountPct: 99.999 })],
    discounts: [{ id: 'p', label: 'x', type: 'percentage', value: 12.345 }, { id: 'q', label: 'y', type: 'percentage', value: 1.005 }],
  }));
  assert.deepEqual(value.items.map(i => i.discountPct), [12.35, 12.34, 0.01, 100]);
  assert.deepEqual(value.discounts.map(d => d.value), [12.35, 1.01]);
  const single = ok(draft({ items: [itemLine({ quantity: 1, unitPriceCents: 100_000, taxable: false })], discounts: [{ id: 'p', label: 'x', type: 'percentage', value: 12.345 }] }));
  const t = computeQuotationTotals(single);
  assert.equal(t.discountCents, 12_350);
  assert.equal(t.discountCents, Math.round(100_000 * single.discounts[0].value / 100), 'lo guardado es exactamente lo que se calcula');
}

// tasa de cambio entre 1 y el máximo
{
  fail(draft({ exchangeRate: 0.5 }), /tasa.*\b1\b.*10[,.]?000/i, 'tasa menor que 1');
  fail(draft({ exchangeRate: QUOTATION_LIMITS.maxExchangeRate + 1 }), /tasa.*\b1\b.*10[,.]?000/i, 'tasa sobre el máximo');
  ok(draft({ exchangeRate: 1 }));
  ok(draft({ exchangeRate: QUOTATION_LIMITS.maxExchangeRate }));
}

// texto: ni carácter nulo ni sustitutos UTF-16 sueltos (PostgreSQL jsonb los rechaza), en cualquier campo de texto
{
  const bad = /caracteres no válidos/i;
  for (const value of ['a\u0000b', 'a\ud800b', 'a\udc00b', '\ud800', 'fin\udbff']) {
    fail(draft({ notes: value }), bad, `notas ${JSON.stringify(value)}`);
    fail(draft({ client: { name: value } }), bad, `cliente ${JSON.stringify(value)}`);
    fail(draft({ items: [itemLine({ description: value })] }), bad, `línea ${JSON.stringify(value)}`);
    fail(draft({ items: [itemLine({ id: value })] }), bad, `id de línea ${JSON.stringify(value)}`);
    fail(draft({ issuer: { name: value } }), bad, `emisor ${JSON.stringify(value)}`);
    fail(draft({ clientId: value }), bad, `clientId ${JSON.stringify(value)}`);
    fail(draft({ discounts: [{ id: 'd', label: value, type: 'fixed', value: 1 }] }), bad, `descuento ${JSON.stringify(value)}`);
  }
  // Los pares bien formados (emoji) siguen siendo válidos.
  assert.equal(ok(draft({ notes: 'Gracias ☀️ 😀' })).notes, 'Gracias ☀️ 😀');
}

console.log('Quotation validation tests passed.');
