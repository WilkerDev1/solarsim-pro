// Edición pura de una cotización (src/domain/quotationEdit.ts): cada operación devuelve contenido nuevo, no muta la
// entrada y su resultado pasa validateQuotationContent.
import assert from 'node:assert/strict';
import { emptyQuotationContent, validateQuotationContent, type QuotationContent } from '../../shared/quotations';
import {
  addDetailLine, addDiscount, addItemLine, appendLine, changeCurrency, contentPatch, duplicateLine, moveLine, parseDecimalInput,
  printedClientFromDirectory, removeDiscount, removeLine, setDocumentFields, setExchangeRate, setPrintedClient, updateDiscount, updateLine,
} from '../domain/quotationEdit';

let counter = 0;
const newId = () => `id-${++counter}`;
const valid = (content: QuotationContent, label: string) => {
  const result = validateQuotationContent(content);
  assert.ok(result.ok, `${label}: ${result.ok ? '' : result.error}`);
  return content;
};
const frozen = <T,>(value: T): T => {
  const deep = (v: unknown) => {
    if (v && typeof v === 'object') { Object.freeze(v); for (const k of Object.keys(v)) deep((v as Record<string, unknown>)[k]); }
  };
  deep(value);
  return value;
};

const base = frozen(emptyQuotationContent('2026-11-26', { exchangeRate: 60 }));

// Añadir un ítem libre: valores por defecto razonables, id inyectado.
const one = valid(addItemLine(base, newId), 'añadir ítem');
assert.equal(one.items.length, 1);
assert.deepEqual(one.items[0], { id: 'id-1', kind: 'item', description: '', quantity: 1, unit: 'UD', unitPriceCents: 0, discountPct: 0, taxable: true });
assert.equal(base.items.length, 0, 'no muta la entrada');
const seeded = valid(addItemLine(base, newId, { description: 'Breaker 63 A', unitPriceCents: 98000 }), 'añadir ítem con datos');
assert.equal(seeded.items[0].description, 'Breaker 63 A');
assert.equal(seeded.items[0].unitPriceCents, 98000);

// Línea descriptiva: sin precio ni ITBIS.
const detail = valid(addDetailLine(one, newId, 'Incluye canalización'), 'línea descriptiva');
assert.equal(detail.items[1].kind, 'detail');
assert.equal(detail.items[1].unitPriceCents, 0);
assert.equal(detail.items[1].taxable, false);
assert.equal(detail.items[1].description, 'Incluye canalización');

// Editar una línea; una línea descriptiva nunca toma precio.
const edited = valid(updateLine(detail, 'id-1', { description: 'Pies alambre 10 mm²', quantity: 250, unit: 'pies', unitPriceCents: 3920, discountPct: 5, taxable: false }), 'editar línea');
assert.deepEqual({ ...edited.items[0] }, { id: 'id-1', kind: 'item', description: 'Pies alambre 10 mm²', quantity: 250, unit: 'pies', unitPriceCents: 3920, discountPct: 5, taxable: false });
const detailPriced = updateLine(edited, detail.items[1].id, { unitPriceCents: 500, taxable: true, discountPct: 3 });
assert.equal(detailPriced.items[1].unitPriceCents, 0);
assert.equal(detailPriced.items[1].taxable, false);
assert.equal(detailPriced.items[1].discountPct, 0);
assert.equal(updateLine(edited, 'missing', { quantity: 3 }), edited, 'id desconocido: sin cambios');
assert.equal(updateLine(edited, 'id-1', { id: 'otro' } as never).items[0].id, 'id-1', 'el id nunca cambia');

// Duplicar inserta la copia justo después con id nuevo.
const dup = valid(duplicateLine(edited, 'id-1', newId), 'duplicar');
assert.equal(dup.items.length, 3);
assert.equal(dup.items[1].description, 'Pies alambre 10 mm²');
assert.notEqual(dup.items[1].id, 'id-1');
assert.equal(dup.items[2].kind, 'detail');

// Reordenar arriba/abajo; en los extremos no cambia.
const ids = (c: QuotationContent) => c.items.map((l) => l.id);
const moved = moveLine(dup, dup.items[2].id, -1);
assert.deepEqual(ids(moved), [dup.items[0].id, dup.items[2].id, dup.items[1].id]);
assert.equal(moveLine(dup, dup.items[0].id, -1), dup, 'el primero no sube');
assert.equal(moveLine(dup, dup.items[2].id, 1), dup, 'el último no baja');
assert.deepEqual(ids(moveLine(moved, dup.items[0].id, 1)), [dup.items[2].id, dup.items[0].id, dup.items[1].id]);

// Quitar.
const removed = valid(removeLine(dup, 'id-1'), 'quitar');
assert.equal(removed.items.length, 2);
assert.ok(!removed.items.some((l) => l.id === 'id-1'));

// appendLine (líneas armadas fuera, p. ej. del catálogo).
const appended = valid(appendLine(base, { id: 'cat-1', kind: 'item', description: 'Panel 600 W', quantity: 1, unit: 'UD', unitPriceCents: 1000, discountPct: 0, taxable: false, catalogItemId: 'eq-1' }), 'append');
assert.equal(appended.items[0].catalogItemId, 'eq-1');

// Descuentos globales.
const withDiscount = valid(addDiscount(edited, newId), 'descuento');
assert.equal(withDiscount.discounts.length, 1);
assert.equal(withDiscount.discounts[0].type, 'percentage');
assert.equal(withDiscount.discounts[0].value, 0);
const fixed = valid(addDiscount(withDiscount, newId, 'fixed'), 'descuento fijo');
assert.equal(fixed.discounts[1].type, 'fixed');
const discountId = fixed.discounts[0].id;
const updatedDiscount = valid(updateDiscount(fixed, discountId, { label: 'Pronto pago', value: 10 }), 'editar descuento');
assert.equal(updatedDiscount.discounts[0].label, 'Pronto pago');
assert.equal(updatedDiscount.discounts[0].value, 10);
const retyped = updateDiscount(updatedDiscount, discountId, { type: 'fixed' });
assert.equal(retyped.discounts[0].type, 'fixed');
assert.equal(retyped.discounts[0].value, 0, 'cambiar el tipo reinicia el valor (10 % no son 10 centavos)');
assert.equal(valid(removeDiscount(updatedDiscount, discountId), 'quitar descuento').discounts.length, 1);

// Datos del documento y cliente impreso.
const doc = valid(setDocumentFields(base, { issueDate: '2026-11-20', validUntil: '2026-12-20', seller: 'Mayler Capellán', projectLabel: 'Planta', notes: 'Nota', paymentTerms: '70/30' }), 'datos del documento');
assert.equal(doc.validUntil, '2026-12-20');
assert.equal(doc.seller, 'Mayler Capellán');
assert.equal(doc.paymentTerms, '70/30');
assert.equal((setDocumentFields(base, { status: 'issued' } as never) as QuotationContent).status, 'draft', 'el estado no se fija por aquí');
const printed = valid(setPrintedClient(base, { name: 'Sr. Miguel Bona', attention: 'Sr. Miguel Bona', phone: '829-696-9863' }), 'cliente impreso');
assert.equal(printed.client.name, 'Sr. Miguel Bona');
assert.equal(printed.client.email, '');
assert.equal(printed.clientId, undefined, 'fijar los datos impresos no enlaza');
assert.deepEqual(printedClientFromDirectory({ name: 'Hotel Brisa', taxId: '131123456', phone: '809', email: 'a@b.do', address: 'Calle 1' }),
  { name: 'Hotel Brisa', attention: '', taxId: '131123456', phone: '809', email: 'a@b.do', address: 'Calle 1' });

// Cambio de moneda: convierte precios unitarios y descuentos fijos; porcentajes intactos.
const priced: QuotationContent = frozen({
  ...base,
  items: [
    { id: 'a', kind: 'item', description: 'A', quantity: 250, unit: 'pies', unitPriceCents: 3920, discountPct: 0, taxable: true },
    { id: 'b', kind: 'detail', description: 'B', quantity: 0, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false },
    { id: 'c', kind: 'item', description: 'C', quantity: 1, unit: 'UD', unitPriceCents: 600000, discountPct: 10, taxable: true },
  ],
  discounts: [{ id: 'd1', label: 'Fijo', type: 'fixed', value: 120000 }, { id: 'd2', label: 'Pct', type: 'percentage', value: 5 }],
});
const usd = valid(changeCurrency(priced, 'USD'), 'a USD');
assert.equal(usd.currency, 'USD');
assert.equal(usd.exchangeRate, 60);
assert.deepEqual(usd.items.map((l) => l.unitPriceCents), [65, 0, 10000]);
assert.equal(usd.items[2].discountPct, 10);
assert.deepEqual(usd.discounts.map((d) => d.value), [2000, 5]);
assert.equal(changeCurrency(priced, 'DOP'), priced, 'misma moneda: sin cambios');
const back = valid(changeCurrency(usd, 'DOP'), 'de vuelta a DOP');
assert.deepEqual(back.items.map((l) => l.unitPriceCents), [3900, 0, 600000], 'DOP→USD→DOP pierde lo que no cabe en centavos de dólar');
for (const [i, line] of back.items.entries()) assert.ok(Math.abs(line.unitPriceCents - priced.items[i].unitPriceCents) <= 30, 'error acotado a media tasa');
// USD→DOP→USD es exacto con tasa ≥ 1.
const usdBase: QuotationContent = { ...priced, currency: 'USD', exchangeRate: 58.75, items: priced.items.map((l) => ({ ...l, unitPriceCents: l.kind === 'item' ? 6533 + l.quantity : 0 })) };
assert.deepEqual(changeCurrency(changeCurrency(usdBase, 'DOP'), 'USD').items, usdBase.items, 'USD→DOP→USD ida y vuelta exacta');

// Cambiar la tasa no toca importes.
const rate = valid(setExchangeRate(priced, 62.5), 'tasa');
assert.equal(rate.exchangeRate, 62.5);
assert.deepEqual(rate.items, priced.items);
assert.deepEqual(rate.discounts, priced.discounts);
assert.ok(!validateQuotationContent(setExchangeRate(priced, 0.5)).ok, 'la validación rechaza una tasa fuera de rango');

// contentPatch: solo las claves que cambiaron.
assert.deepEqual(Object.keys(contentPatch(priced, rate)), ['exchangeRate']);
assert.deepEqual(Object.keys(contentPatch(priced, usd)).sort(), ['currency', 'discounts', 'items']);
assert.deepEqual(contentPatch(priced, priced), {});

// Entrada numérica tolerante.
assert.equal(parseDecimalInput('39.20'), 39.2);
assert.equal(parseDecimalInput(' 6,000.00 '), 6000);
assert.equal(parseDecimalInput('RD$ 1,234.5'), 1234.5);
assert.equal(parseDecimalInput('-5'), -5);
assert.equal(parseDecimalInput(''), null);
assert.equal(parseDecimalInput('abc'), null);
assert.equal(parseDecimalInput('1.2.3'), null);
assert.equal(parseDecimalInput('12,5'), null, 'la coma es separador de miles: «12,5» es ambiguo y se rechaza');

console.log('Quotation edit tests passed.');
