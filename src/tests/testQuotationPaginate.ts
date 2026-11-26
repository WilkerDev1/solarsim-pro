// Paginación de la hoja A4 (src/features/quotations/paginate.ts): reparte las líneas por alturas estimadas, la
// primera página tiene menos capacidad y totales y firmas caben siempre en la última.
import assert from 'node:assert/strict';
import { emptyQuotationContent, type QuotationContent, type QuotationLine } from '../../shared/quotations';
import { SHEET_LAYOUT, estimateLineHeight, estimateTotalsHeight, fitToWidth, paginateQuotation, sheetFit, splitParagraph, textWidthEm, type SheetPage } from '../features/quotations/paginate';

const line = (n: number, description = `Ítem ${n}`, extra: Partial<QuotationLine> = {}): QuotationLine => ({
  id: `l-${n}`, kind: 'item', description, quantity: 1, unit: 'UD', unitPriceCents: 1000, discountPct: 0, taxable: true, ...extra,
});
const doc = (items: QuotationLine[], extra: Partial<QuotationContent> = {}) => emptyQuotationContent('2026-11-26', { items, ...extra });

const check = (pages: SheetPage[], items: QuotationLine[], label: string) => {
  assert.ok(pages.length >= 1, `${label}: al menos una página`);
  assert.deepEqual(pages.flatMap((p) => p.rows.map((r) => r.line.id)), items.map((l) => l.id), `${label}: todas las líneas, en orden y una vez`);
  assert.deepEqual(pages.map((p) => p.closing), pages.map((_, i) => i === pages.length - 1), `${label}: totales y firmas solo en la última`);
  for (const [i, page] of pages.entries()) {
    assert.ok(page.estimatedHeight <= page.capacity, `${label}: la página ${i + 1} cabe (${page.estimatedHeight} ≤ ${page.capacity})`);
  }
  assert.ok(pages[0].capacity < SHEET_LAYOUT.usableHeight, `${label}: la primera página tiene menos capacidad`);
};

// 0, 1 y 6 líneas: una página.
for (const count of [0, 1, 6]) {
  const items = Array.from({ length: count }, (_, i) => line(i + 1));
  const pages = paginateQuotation(doc(items));
  check(pages, items, `${count} líneas`);
  assert.equal(pages.length, 1, `${count} líneas en una página`);
}

// 40 y 200 líneas: varias páginas; la primera lleva menos filas que la segunda (misma altura por fila).
const forty = Array.from({ length: 40 }, (_, i) => line(i + 1));
const fortyPages = paginateQuotation(doc(forty));
check(fortyPages, forty, '40 líneas');
assert.ok(fortyPages.length >= 2);
assert.ok(fortyPages[0].rows.length < fortyPages[1].rows.length, 'primera página de menor capacidad');
const twoHundred = Array.from({ length: 200 }, (_, i) => line(i + 1));
const twoHundredPages = paginateQuotation(doc(twoHundred));
check(twoHundredPages, twoHundred, '200 líneas');
assert.ok(twoHundredPages.length > fortyPages.length);

// Numeración: solo las líneas con precio llevan número, correlativo entre páginas.
const mixed = [line(1), line(2, 'Detalle', { kind: 'detail', unitPriceCents: 0, taxable: false }), line(3)];
const mixedRows = paginateQuotation(doc(mixed))[0].rows;
assert.deepEqual(mixedRows.map((r) => r.number), [1, null, 2]);
assert.deepEqual(twoHundredPages.flatMap((p) => p.rows.map((r) => r.number)), twoHundred.map((_, i) => i + 1));

// Descripciones largas ocupan más filas y más páginas.
const long = 'Suministro e instalación de canalización EMT de 3/4 con accesorios, soportería y cableado THHN '.repeat(5).slice(0, 500);
assert.ok(estimateLineHeight(line(1, long)) > estimateLineHeight(line(1)) * 3);
assert.ok(estimateLineHeight(line(1, 'a\nb\nc')) > estimateLineHeight(line(1)), 'los saltos de línea cuentan');
const longItems = Array.from({ length: 40 }, (_, i) => line(i + 1, long));
const longPages = paginateQuotation(doc(longItems));
check(longPages, longItems, '40 líneas largas');
assert.ok(longPages.length > fortyPages.length);

// Si las últimas filas llenan la página, totales y firmas pasan a una página nueva.
let fill = 1;
while (paginateQuotation(doc(Array.from({ length: fill }, (_, i) => line(i + 1)))).length === 1) fill++;
const spill = Array.from({ length: fill }, (_, i) => line(i + 1));
const spillPages = paginateQuotation(doc(spill));
check(spillPages, spill, 'desborde de cierre');
assert.equal(spillPages.length, 2);

// Notas y condiciones extensas fluyen por párrafos; nunca rompen la última página.
const notes = Array.from({ length: 120 }, (_, i) => `Nota ${i + 1}: condición de garantía y alcance del suministro.`).join('\n');
const terms = 'Pago del 70% con la orden y 30% al concluir. '.repeat(40).slice(0, 2000);
const verbose = paginateQuotation(doc(forty, { notes, paymentTerms: terms, projectLabel: 'Planta' }));
check(verbose, forty, 'notas largas');
const notesText = verbose.flatMap((p) => p.texts.filter((t) => t.section === 'notes').map((t) => t.text)).join('\n');
assert.equal(notesText, notes, 'las notas se reparten sin perder texto');
assert.ok(verbose.some((p) => p.texts.some((t) => t.section === 'notes' && t.continued)), 'las notas continúan en otra página');
assert.equal(verbose[0].termsBeside, false, 'condiciones largas no van junto a los totales');
const short = paginateQuotation(doc(forty, { paymentTerms: 'Pago del 70% con la orden y 30% al concluir.', projectLabel: 'Planta' }));
assert.equal(short.at(-1)!.termsBeside, true, 'condiciones cortas junto a los totales');
assert.ok(short.every((p) => p.texts.every((t) => t.section === 'notes')), 'condiciones cortas no fluyen aparte');

// Datos del cliente muy largos reducen la primera página.
const bigClient = paginateQuotation(doc(forty, { client: { name: 'Cliente', attention: '', taxId: '', phone: '', email: '', address: 'Dirección extensa '.repeat(27) } }));
assert.ok(bigClient[0].capacity < fortyPages[0].capacity);
check(bigClient, forty, 'cliente con dirección larga');

// Cada fila mide lo que su celda más alta, no solo la descripción (valores fijados a mano: 26 px de relleno + 19 por renglón).
assert.equal(estimateLineHeight(line(1, 'Cable')), 45, 'un renglón');
const metrosLine = (n: number) => line(n, 'Cable', { unit: 'METROS', quantity: 1250.5 });
assert.equal(estimateLineHeight(metrosLine(1)), 64, '«1,250.5 METROS» parte en dos renglones en la columna de 90 px');
assert.equal(estimateLineHeight(line(1, 'Equipo', { unitPriceCents: 99999999999, quantity: 9 })), 64, 'importes largos parten en dos renglones');
assert.equal(estimateLineHeight(line(1, 'Cable', { discountPct: 5 })), 45 + 17, 'el «Desc. N%» bajo la descripción suma su renglón');
const metros = Array.from({ length: 40 }, (_, i) => metrosLine(i + 1));
const metrosPages = paginateQuotation(doc(metros));
check(metrosPages, metros, '40 líneas «1,250.5 METROS»');
assert.equal(metrosPages.length, 4);
assert.deepEqual(metrosPages.map((p) => p.rows.length), [11, 15, 14, 0]);

// Descuentos globales: cada etiqueta en un renglón junto a su importe (se acorta con «…»), 29 px por fila de totales.
assert.equal(estimateTotalsHeight(doc([line(1)])), 2 * 29 + 14 + 27);
const longLabel = 'Descuento por pronto pago y volumen '.repeat(8).slice(0, 255);
const twentyDiscounts = doc([line(1)], { discounts: Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, label: longLabel, type: 'fixed' as const, value: 1 })) });
assert.equal(estimateTotalsHeight(twentyDiscounts), 22 * 29 + 14 + 27);
const discountPages = paginateQuotation(twentyDiscounts);
check(discountPages, twentyDiscounts.items, '20 descuentos con etiqueta larga');
assert.equal(discountPages.length, 2);
const shortened = sheetFit.discount(longLabel, '-0.01');
assert.ok(shortened.endsWith('…') && shortened.length < longLabel.length);

// Bloques que el revisor no llegó a romper: vendedor, emisor sin logo, De/Para, notas sin espacios, filas sin espacios.
const longName = 'Ingeniería y Soluciones Fotovoltaicas Integrales del Caribe '.repeat(5).slice(0, 255);
for (const [label, content] of [
  ['vendedor largo', doc(forty, { seller: longName })],
  ['emisor largo sin logo', doc(forty, { issuer: { name: longName, taxId: '', address: '', phone: '', email: '', website: 'w'.repeat(255), logo: '' } })],
  ['De/Para enormes', doc(forty, { client: { name: longName, attention: longName, taxId: '', phone: '', email: 'e'.repeat(255), address: 'CALLE PRINCIPAL '.repeat(40).slice(0, 500) } })],
  ['descripciones sin espacios', doc(Array.from({ length: 12 }, (_, i) => line(i + 1, 'W'.repeat(500))))],
  ['notas sin espacios', doc([line(1)], { notes: 'W'.repeat(4000), paymentTerms: 'X'.repeat(2000) })],
] as const) check(paginateQuotation(content), content.items, label);
assert.equal(sheetFit.meta(longName).endsWith('…'), true, 'el vendedor se acorta a dos renglones en la franja de datos');

// Recortes en JavaScript (sin CSS de recorte).
assert.equal(fitToWidth('Electsun SRL', 40), 'Electsun SRL');
const cut = fitToWidth('x'.repeat(300), 20);
assert.ok(cut.endsWith('…') && textWidthEm(cut) <= 20);
assert.ok(textWidthEm(sheetFit.footer(`${longName} · ${'w'.repeat(255)}`, 'COT-2026-0001 · Página 1 de 1')) * 10.5 < SHEET_LAYOUT.contentWidth, 'el pie cabe en un renglón');
const pieces = splitParagraph('palabra '.repeat(3000).trim(), 10, 57);
assert.ok(pieces.length > 1 && pieces.join(' ') === 'palabra '.repeat(3000).trim());

console.log('Quotation pagination tests passed.');
