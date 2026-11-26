// Paginación de la hoja A4 (src/features/quotations/paginate.ts): reparte las líneas por alturas estimadas, la
// primera página tiene menos capacidad y totales y firmas caben siempre en la última.
import assert from 'node:assert/strict';
import { emptyQuotationContent, type QuotationContent, type QuotationLine } from '../../shared/quotations';
import { SHEET_LAYOUT, estimateLineHeight, paginateQuotation, type SheetPage } from '../features/quotations/paginate';

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

console.log('Quotation pagination tests passed.');
