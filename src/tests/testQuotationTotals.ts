import assert from 'node:assert/strict';
import { ITBIS_RATE } from '../../shared/financialRules';
import { QUOTATION_LIMITS, computeQuotationTotals, convertCents, formatAmount, formatMoney, fromCents, toCents, validateQuotationContent } from '../../shared/quotations/index';
import type { QuotationContent, QuotationDiscount, QuotationLine } from '../../shared/quotations/index';
import { mulDivRound } from '../../shared/quotations/money';

let line_n = 0;
const line = (over: Partial<QuotationLine> = {}): QuotationLine => ({
  id: over.id ?? `l${++line_n}`, kind: 'item', description: 'x', quantity: 1, unit: 'UD', unitPriceCents: 0, discountPct: 0, taxable: true, ...over,
});
const fixed = (id: string, cents: number): QuotationDiscount => ({ id, label: id, type: 'fixed', value: cents });
const pct = (id: string, value: number): QuotationDiscount => ({ id, label: id, type: 'percentage', value });
const totals = (items: QuotationLine[], discounts: QuotationDiscount[] = []) => computeQuotationTotals({ items, discounts });

// money: redondeo half-up robusto frente a la coma flotante
assert.equal(toCents(39.2), 3920);
assert.equal(toCents(1.005), 101);
assert.equal(toCents(0.1 + 0.2), 30);
assert.equal(toCents(0), 0);
assert.equal(toCents(35966.4), 3596640);
assert.equal(toCents(Number.NaN), 0);
assert.equal(fromCents(3596640), 35966.4);
assert.equal(formatAmount(3596640), '35,966.40');
assert.equal(formatAmount(5), '0.05');
assert.equal(formatMoney(3596640, 'DOP'), 'RD$ 35,966.40');
assert.equal(formatMoney(1845000, 'USD'), 'US$ 18,450.00');
assert.equal(formatMoney(-1000, 'DOP'), '-RD$ 10.00');
assert.equal(formatMoney(0, 'USD'), 'US$ 0.00');
assert.equal(formatMoney(123456789012, 'DOP'), 'RD$ 1,234,567,890.12');
assert.equal(convertCents(6000, 'DOP', 'DOP', 60), 6000);
assert.equal(convertCents(6000, 'DOP', 'USD', 60), 100);
assert.equal(convertCents(100, 'USD', 'DOP', 60), 6000);
assert.equal(convertCents(100, 'DOP', 'USD', 60), 2, '1.00 DOP = 0.0167 USD → 2 centavos');
assert.equal(convertCents(1845000, 'USD', 'DOP', 59.75), 110_238_750);
for (const cents of [0, 1, 99, 12345, 1845000]) {
  assert.equal(convertCents(convertCents(cents, 'USD', 'DOP', 62.5), 'DOP', 'USD', 62.5), cents, 'ida y vuelta USD→DOP→USD');
}

// caso real de referencia (plantilla de Electsun): seis líneas gravadas en DOP
const reference = [
  line({ id: 'a', quantity: 250, unitPriceCents: toCents(39.2) }),
  line({ id: 'b', quantity: 1, unitPriceCents: toCents(980) }),
  line({ id: 'c', quantity: 1, unitPriceCents: toCents(6000) }),
  line({ id: 'd', quantity: 150, unitPriceCents: toCents(12) }),
  line({ id: 'e', quantity: 50, unitPriceCents: toCents(68) }),
  line({ id: 'f', quantity: 1, unitPriceCents: toCents(8500) }),
];
{
  const t = totals(reference);
  assert.equal(t.subtotalCents, 3048000);
  assert.equal(t.taxCents, 548640);
  assert.equal(t.totalCents, 3596640);
  assert.equal(t.discountCents, 0);
  assert.equal(t.taxableBaseCents, 3048000);
  assert.equal(t.exemptBaseCents, 0);
  assert.deepEqual(t.lines.map(l => l.netCents), [980000, 98000, 600000, 180000, 340000, 850000]);
  assert.equal(formatMoney(t.totalCents, 'DOP'), 'RD$ 35,966.40');
}

// descuento de línea
{
  const t = totals([line({ quantity: 2, unitPriceCents: 10000, discountPct: 10 })]);
  assert.deepEqual(t.lines[0], { id: t.lines[0].id, grossCents: 20000, lineDiscountCents: 2000, netCents: 18000, allocatedDiscountCents: 0, taxableBaseCents: 18000 });
  assert.equal(t.subtotalCents, 18000);
  assert.equal(t.taxCents, 3240);
  assert.equal(t.totalCents, 21240);
}

// descuento de línea con redondeo half-up (33 centavos × 50 % = 16.5 → 17)
{
  const t = totals([line({ quantity: 1, unitPriceCents: 33, discountPct: 50 })]);
  assert.equal(t.lines[0].lineDiscountCents, 17);
  assert.equal(t.lines[0].netCents, 16);
}

// descuentos globales: porcentual y fijo combinados, ambos sobre el subtotal (sin cascada)
{
  const t = totals([line({ id: 'a', quantity: 1, unitPriceCents: 100000 })], [pct('p', 10), fixed('f', 5000)]);
  assert.equal(t.subtotalCents, 100000);
  assert.deepEqual(t.discounts, [{ id: 'p', appliedCents: 10000 }, { id: 'f', appliedCents: 5000 }]);
  assert.equal(t.discountCents, 15000);
  assert.equal(t.lines[0].allocatedDiscountCents, 15000);
  assert.equal(t.taxableBaseCents, 85000);
  assert.equal(t.taxCents, 15300);
  assert.equal(t.totalCents, 100000 - 15000 + 15300);
}

// el orden no cambia el total: dos porcentajes no se encadenan (10 % + 10 % = 20 %, no 19 %)
{
  const t = totals([line({ quantity: 1, unitPriceCents: 100000, taxable: false })], [pct('a', 10), pct('b', 10)]);
  assert.equal(t.discountCents, 20000);
  assert.equal(t.totalCents, 80000);
}

// tope: el descuento nunca supera el subtotal y lo aplicado por descuento suma lo descontado
{
  const t = totals([line({ quantity: 1, unitPriceCents: 10000 })], [fixed('a', 8000), fixed('b', 8000), pct('c', 50)]);
  assert.equal(t.discountCents, 10000);
  assert.deepEqual(t.discounts, [{ id: 'a', appliedCents: 8000 }, { id: 'b', appliedCents: 2000 }, { id: 'c', appliedCents: 0 }]);
  assert.equal(t.taxableBaseCents, 0);
  assert.equal(t.taxCents, 0);
  assert.equal(t.totalCents, 0);
}

// prorrateo exacto con centavos indivisibles: 3 líneas de 0.01 con descuento fijo de 0.02
{
  const t = totals([line({ id: 'a', unitPriceCents: 1 }), line({ id: 'b', unitPriceCents: 1 }), line({ id: 'c', unitPriceCents: 1 })], [fixed('d', 2)]);
  assert.equal(t.subtotalCents, 3);
  assert.equal(t.discountCents, 2);
  assert.deepEqual(t.lines.map(l => l.allocatedDiscountCents), [1, 1, 0], 'empates por orden de línea');
  assert.equal(t.lines.reduce((s, l) => s + l.allocatedDiscountCents, 0), 2);
  assert.equal(t.taxableBaseCents, 1);
}

// prorrateo por mayor resto: la suma asignada siempre es el descuento
{
  const items = [line({ id: 'a', unitPriceCents: 3333 }), line({ id: 'b', unitPriceCents: 3333 }), line({ id: 'c', unitPriceCents: 3334 })];
  for (const d of [1, 2, 7, 99, 100, 1234, 9999, 10000]) {
    const t = totals(items, [fixed('d', d)]);
    assert.equal(t.lines.reduce((s, l) => s + l.allocatedDiscountCents, 0), d, `suma exacta con descuento ${d}`);
    for (const l of t.lines) assert(l.allocatedDiscountCents >= 0 && l.allocatedDiscountCents <= l.netCents);
    assert.equal(t.taxableBaseCents + t.exemptBaseCents, t.subtotalCents - t.discountCents);
  }
  const t = totals(items, [fixed('d', 100)]);
  assert.deepEqual(t.lines.map(l => l.allocatedDiscountCents), [33, 33, 34]);
}

// mezcla gravado/exento con descuento: ITBIS sobre la base gravada ya descontada
{
  const t = totals([line({ id: 'g', unitPriceCents: 60000, taxable: true }), line({ id: 'e', unitPriceCents: 40000, taxable: false })], [fixed('d', 10000)]);
  assert.equal(t.subtotalCents, 100000);
  assert.deepEqual(t.lines.map(l => l.allocatedDiscountCents), [6000, 4000]);
  assert.equal(t.taxableBaseCents, 54000);
  assert.equal(t.exemptBaseCents, 36000);
  assert.equal(t.taxCents, 9720);
  assert.equal(t.totalCents, 100000 - 10000 + 9720);
}

// el ITBIS se calcula sobre la base del documento, no línea a línea
{
  const items = [line({ unitPriceCents: 5 }), line({ unitPriceCents: 5 }), line({ unitPriceCents: 5 })];
  const t = totals(items);
  assert.equal(t.taxableBaseCents, 15);
  assert.equal(t.taxCents, 3, '15 × 18 % = 2.7 → 3');
  assert.equal(totals([line({ unitPriceCents: 1 }), line({ unitPriceCents: 1 }), line({ unitPriceCents: 1 }), line({ unitPriceCents: 1 })]).taxCents, 1, '4 × 18 % = 0.72 → 1; por línea sería 0');
}

// líneas 'detail' no aportan
{
  const t = totals([line({ id: 'i', unitPriceCents: 1000 }), line({ id: 'd', kind: 'detail', quantity: 5, unitPriceCents: 999999, discountPct: 50 })]);
  assert.equal(t.subtotalCents, 1000);
  assert.deepEqual(t.lines[1], { id: 'd', grossCents: 0, lineDiscountCents: 0, netCents: 0, allocatedDiscountCents: 0, taxableBaseCents: 0 });
  assert.equal(t.totalCents, 1180);
  const onlyDetail = totals([line({ kind: 'detail', unitPriceCents: 500 })], [fixed('x', 100)]);
  assert.equal(onlyDetail.totalCents, 0);
  assert.equal(onlyDetail.discountCents, 0);
}

// cantidades decimales (hasta 3 decimales)
{
  assert.equal(totals([line({ quantity: 2.5, unitPriceCents: 1000 })]).lines[0].grossCents, 2500);
  assert.equal(totals([line({ quantity: 0.333, unitPriceCents: 1000 })]).lines[0].grossCents, 333);
  assert.equal(totals([line({ quantity: 1.005, unitPriceCents: 1000 })]).lines[0].grossCents, 1005);
  assert.equal(totals([line({ quantity: 0.001, unitPriceCents: 500 })]).lines[0].grossCents, 1, '0.5 centavos → 1');
  assert.equal(totals([line({ quantity: 1.5, unitPriceCents: 3, discountPct: 12.5 })]).lines[0].lineDiscountCents, 1, '4.5 → 5 bruto; 12.5 % = 0.625 → 1');
}

// entradas degeneradas: sin NaN y sin excepciones
{
  const t = totals([
    line({ id: 'neg', quantity: -3, unitPriceCents: 1000 }),
    line({ id: 'nan', quantity: Number.NaN, unitPriceCents: 1000 }),
    line({ id: 'inf', quantity: 1, unitPriceCents: Number.POSITIVE_INFINITY }),
    line({ id: 'price', quantity: 1, unitPriceCents: -500 }),
    line({ id: 'hi', quantity: 1, unitPriceCents: 1000, discountPct: 250 }),
    line({ id: 'lo', quantity: 1, unitPriceCents: 1000, discountPct: -20 }),
    line({ id: 'frac', quantity: 1, unitPriceCents: 10.6 }),
  ], [pct('p', 400), pct('q', -5), fixed('f', Number.NaN), fixed('g', -100)]);
  const flat = JSON.stringify(t);
  assert(!flat.includes('null') && !flat.includes('NaN'), 'sin NaN ni null');
  assert.deepEqual(t.lines.map(l => l.netCents), [0, 0, 0, 0, 0, 1000, 11]);
  assert.equal(t.lines[4].lineDiscountCents, 1000, 'porcentaje > 100 se acota a 100');
  assert.equal(t.lines[5].lineDiscountCents, 0, 'porcentaje < 0 se acota a 0');
  assert.equal(t.subtotalCents, 1011);
  assert.equal(t.discountCents, 1011, 'porcentaje global > 100 se acota y el tope es el subtotal');
  assert.equal(t.totalCents, 0);
  for (const n of [t.subtotalCents, t.discountCents, t.taxCents, t.totalCents, t.taxableBaseCents, t.exemptBaseCents]) assert(Number.isInteger(n) && n >= 0);
}

// lista vacía
{
  const t = totals([]);
  assert.deepEqual(t, { lines: [], subtotalCents: 0, discounts: [], discountCents: 0, taxableBaseCents: 0, exemptBaseCents: 0, taxCents: 0, totalCents: 0 });
  const withDiscount = totals([], [fixed('d', 500)]);
  assert.equal(withDiscount.discountCents, 0);
  assert.deepEqual(withDiscount.discounts, [{ id: 'd', appliedCents: 0 }]);
}

// pureza: no muta la entrada y es determinista
{
  const items = structuredClone(reference);
  const discounts = [pct('p', 3), fixed('f', 777)];
  const before = structuredClone({ items, discounts });
  const first = computeQuotationTotals({ items, discounts });
  assert.deepEqual({ items, discounts }, before);
  assert.deepEqual(computeQuotationTotals({ items, discounts }), first);
}

// mulDivRound es exacto aunque el producto no quepa en enteros seguros (BigInt con half-up)
{
  assert.equal(mulDivRound(1, 4_600_000_000_831_495, 1000), 4_600_000_000_831, '4600000000831.495 → 4600000000831');
  assert.equal(mulDivRound(1, 4_600_000_000_831_500, 1000), 4_600_000_000_832, 'mitad exacta → hacia arriba');
  assert.equal(mulDivRound(1_000_000_000, 100_000_000_000, 1000), 1e17, 'cantidad tope × precio tope');
  assert.equal(mulDivRound(9_007_199_254_740_991, 3, 7), Number((9_007_199_254_740_991n * 3n * 2n + 7n) / 14n));
  assert.equal(mulDivRound(5, 1, 2), 3);
  assert.equal(mulDivRound(-5, 1, 2), -3, 'negativos: la mitad se aleja de cero, como roundHalfUp');
  assert.equal(mulDivRound(Number.NaN, 1, 2), 0);
  assert.equal(mulDivRound(1, 1, 0), 0);
}

// importes fuera de tope: los totales acotan las entradas en vez de perder precisión
{
  assert.equal(totals([line({ unitPriceCents: 1e306, taxable: false })]).subtotalCents, QUOTATION_LIMITS.maxUnitPriceCents, 'precio 1e306 se acota al tope');
  assert.equal(totals([line({ unitPriceCents: 1_234_567_890_123_456, taxable: false })]).subtotalCents, QUOTATION_LIMITS.maxUnitPriceCents);
  assert.equal(totals([line({ quantity: 5e6, unitPriceCents: 1, taxable: false })]).subtotalCents, QUOTATION_LIMITS.maxQuantity, 'cantidad acotada');
  const t = totals([line({ id: 'a', quantity: 1_000_000, unitPriceCents: 1e10 }), line({ id: 'b', quantity: 1_000_000, unitPriceCents: 1e10 })], [fixed('d', 3)]);
  assert.equal(t.discounts.reduce((s, d) => s + d.appliedCents, 0), t.discountCents, 'Σ appliedCents = discountCents');
  assert.equal(t.discountCents, 3);
  assert(t.subtotalCents <= QUOTATION_LIMITS.maxDocumentCents, 'el bruto del documento se acota al tope');
  assert.equal(t.totalCents, t.subtotalCents - t.discountCents + t.taxCents);
  assert.equal(totals([line({ unitPriceCents: 1000 })], [fixed('f', 1e300)]).discountCents, 1000);
}

// entradas hostiles: nunca lanza ni devuelve NaN/Infinity
{
  const hostile: unknown[] = [
    ...Array.from({ length: 1100 }, (_, i) => line({ id: `h${i}`, quantity: 0.001, unitPriceCents: 1.7e308 })),
    line({ quantity: Number.NaN, unitPriceCents: Number.NaN, discountPct: Number.NaN }),
    line({ quantity: Number.POSITIVE_INFINITY, unitPriceCents: Number.POSITIVE_INFINITY, discountPct: Number.POSITIVE_INFINITY }),
    line({ quantity: 1e308, unitPriceCents: 1e308, discountPct: -1e308 }),
    line({ quantity: -1e308, unitPriceCents: -1e308 }),
    line({ quantity: '5' as any, unitPriceCents: '100' as any, discountPct: '10' as any, taxable: 'yes' as any, id: { x: 1 } as any }),
    null, undefined, 42, 'x', [], { kind: 'item' }, { kind: 'detail', id: 7 },
    ...Array.from({ length: 5000 }, (_, i) => line({ id: `m${i}`, quantity: 1e6, unitPriceCents: 1e11, discountPct: i % 101 })),
  ];
  const discounts: unknown[] = [
    pct('p', Number.NaN), pct('q', 1e308), fixed('f', Number.POSITIVE_INFINITY), fixed('g', 1e308), fixed('h', -1e308),
    { id: 'z', type: 'percentage', value: '50' }, null, 'x', { type: 'fixed' }, fixed('k', 1.7e308),
  ];
  for (const input of [
    { items: hostile, discounts },
    { items: hostile, discounts: 'x' },
    { items: 'x', discounts },
    { items: null, discounts: null },
    {},
  ]) {
    const t = computeQuotationTotals(input as any);
    const numbers = [t.subtotalCents, t.discountCents, t.taxableBaseCents, t.exemptBaseCents, t.taxCents, t.totalCents,
      ...t.discounts.map(d => d.appliedCents), ...t.lines.flatMap(l => [l.grossCents, l.lineDiscountCents, l.netCents, l.allocatedDiscountCents, l.taxableBaseCents])];
    for (const n of numbers) assert(Number.isSafeInteger(n) && n >= 0, `valor no válido ${n}`);
    assert.equal(t.discounts.reduce((s, d) => s + d.appliedCents, 0), t.discountCents);
    assert.equal(t.lines.reduce((s, l) => s + l.allocatedDiscountCents, 0), t.discountCents);
    assert.equal(t.totalCents, t.subtotalCents - t.discountCents + t.taxCents);
    assert(t.subtotalCents <= QUOTATION_LIMITS.maxDocumentCents);
    assert(t.lines.every(l => typeof l.id === 'string'));
  }
  assert.doesNotThrow(() => computeQuotationTotals(null as any));
}

// propiedades: documentos válidos aleatorios (generador determinista, semilla fija)
{
  let seed = 0x5eed1234;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number): number => Math.floor(rand() * (max + 1));
  /** Magnitud log-uniforme en [0, max]: cubre centavos sueltos y valores cerca del tope. */
  const logInt = (max: number): number => (rand() < 0.05 ? max : Math.floor(Math.pow(max + 1, rand()) - 1));
  const ITBIS_BASIS = BigInt(Math.round(ITBIS_RATE * 10000));
  const halfUpDiv = (num: bigint, den: bigint): bigint => (num * 2n + den) / (den * 2n);
  let checked = 0;
  for (let doc = 0; doc < 2000; doc++) {
    const lineCount = rand() < 0.1 ? int(200) : int(12);
    const budget = rand() < 0.3 ? QUOTATION_LIMITS.maxDocumentCents : logInt(QUOTATION_LIMITS.maxDocumentCents);
    let left = BigInt(budget) * 1000n;
    const items: QuotationLine[] = [];
    for (let i = 0; i < lineCount; i++) {
      const kind = rand() < 0.15 ? 'detail' : 'item';
      const quantityMilli = rand() < 0.5 ? (1 + int(20)) * 1000 : 1 + logInt(QUOTATION_LIMITS.maxQuantity * 1000 - 1);
      let price = logInt(QUOTATION_LIMITS.maxUnitPriceCents);
      if (kind === 'item') {
        // Cada bruto redondeado excede a lo sumo en media unidad (500 milésimas) a cantidad × precio.
        const room = left > 500n ? (left - 500n) / BigInt(quantityMilli) : 0n;
        if (BigInt(price) > room) price = Number(room);
        left -= BigInt(quantityMilli) * BigInt(price) + 500n;
      }
      const discountPct = rand() < 0.6 ? 0 : int(10000) / 100;
      items.push(line({ id: `p${doc}-${i}`, kind, quantity: quantityMilli / 1000, unitPriceCents: price, discountPct, taxable: rand() < 0.7 }));
    }
    const discounts: QuotationDiscount[] = Array.from({ length: int(4) }, (_, i) =>
      rand() < 0.5 ? pct(`d${i}`, int(10000) / 100) : fixed(`d${i}`, logInt(QUOTATION_LIMITS.maxDocumentCents)));
    const validated = validateQuotationContent({ status: 'draft', issueDate: '2026-03-10', currency: 'DOP', exchangeRate: 60, items, discounts });
    if (!validated.ok) continue;
    const content: QuotationContent = validated.value;
    const t = computeQuotationTotals(content);
    checked++;
    const all = [t.subtotalCents, t.discountCents, t.taxableBaseCents, t.exemptBaseCents, t.taxCents, t.totalCents,
      ...t.discounts.map(d => d.appliedCents), ...t.lines.flatMap(l => [l.grossCents, l.lineDiscountCents, l.netCents, l.allocatedDiscountCents, l.taxableBaseCents])];
    for (const n of all) assert(Number.isSafeInteger(n) && n >= 0, `doc ${doc}: ${n}`);
    assert.equal(t.lines.reduce((s, l) => s + l.allocatedDiscountCents, 0), t.discountCents, `doc ${doc}: Σ asignado`);
    assert.equal(t.discounts.reduce((s, d) => s + d.appliedCents, 0), t.discountCents, `doc ${doc}: Σ aplicado`);
    assert.equal(t.totalCents, t.subtotalCents - t.discountCents + t.taxCents, `doc ${doc}: total`);
    assert.equal(t.taxableBaseCents + t.exemptBaseCents, t.subtotalCents - t.discountCents, `doc ${doc}: bases`);
    assert.equal(BigInt(t.taxCents), halfUpDiv(BigInt(t.taxableBaseCents) * ITBIS_BASIS, 10000n), `doc ${doc}: ITBIS exacto`);
    content.items.forEach((item, i) => {
      if (item.kind !== 'item') return;
      const gross = halfUpDiv(BigInt(Math.round(item.quantity * 1000)) * BigInt(item.unitPriceCents), 1000n);
      assert.equal(BigInt(t.lines[i].grossCents), gross, `doc ${doc}: bruto exacto de la línea ${i}`);
    });
  }
  assert(checked >= 1500, `se comprobaron ${checked} documentos válidos`);
}

console.log('Quotation totals tests passed.');
