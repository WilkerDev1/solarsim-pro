import assert from 'node:assert/strict';
import { DEFAULT_QUOTATION_DESIGN, computeQuotationTotals, quotationFromProposal, validateQuotationContent } from '../../shared/quotations/index';
import type { ProposalQuotationSource, QuotationDesign } from '../../shared/quotations/index';

const issuer = { name: 'Electsun SRL', taxId: '130000001', address: 'Santo Domingo', phone: '809-000-0000', email: 'info@electsun.do', website: 'electsun.do', logo: 'asset:sha256:' + 'c'.repeat(64) };
const source = (): ProposalQuotationSource => ({
  projectId: 'proj-77',
  clientId: 'cli-9',
  client: { name: 'Hotel Caribe SRL', attention: 'Sr. Luis', taxId: '131123456', phone: '809-555-1234', email: 'compras@hotel.do', address: 'Av. Mella 1' },
  projectLabel: 'Sistema FV 25 kWp',
  currency: 'DOP',
  exchangeRate: 59.5,
  seller: 'Ana Pérez',
  detailLines: [
    { description: 'Panel solar 550 W', quantity: 46, unit: 'UD', catalogItemId: 'eq-panel' },
    { description: 'Inversor 25 kW', quantity: 1, unit: 'UD', catalogItemId: 'eq-inv' },
    { description: 'Cable solar 6 mm', quantity: 120.5, unit: 'pies' },
  ],
  pricedLines: [
    { description: 'Equipos fotovoltaicos', quantity: 1, unit: 'UD', unitPriceCents: 85_000_00, taxable: false },
    { description: 'Instalación y puesta en marcha', quantity: 1, unit: 'UD', unitPriceCents: 12_500_50, taxable: true },
    { description: 'Estructura de montaje', quantity: 25, unit: 'UD', unitPriceCents: 640_00, taxable: true },
  ],
  discounts: [{ label: 'Pronto pago', type: 'percentage', value: 3 }, { label: 'Cortesía', type: 'fixed', value: 5_000_00 }],
  paymentTerms: '50 % al ordenar, 50 % contra entrega',
  notes: 'Precios sujetos a variación.',
  validUntil: '2026-04-10',
  attachments: [
    { id: 'att-1', fileName: 'ficha-panel.pdf', fileSize: 120_000, pageCount: 2, title: 'Ficha del panel', uploadedAt: '2026-03-01T10:00:00.000Z', assetId: 'asset:sha256:' + 'd'.repeat(64), catalogItemId: 'eq-panel', thumbnailDataUrl: 'data:image/png;base64,AAAA' },
    { id: 'att-2', fileName: 'ficha-inversor.pdf', fileSize: 90_000, pageCount: 3, title: 'Ficha del inversor', uploadedAt: '2026-03-01T10:00:00.000Z' },
  ],
  issuer,
});
const counter = () => { let n = 0; return () => `id-${++n}`; };
const build = (src = source(), design?: QuotationDesign) => quotationFromProposal(src, { today: '2026-03-10', newId: counter(), ...(design ? { design } : {}) });

const quotation = build();

// cabecera
assert.equal(quotation.status, 'draft');
assert.equal(quotation.issueDate, '2026-03-10');
assert.equal(quotation.validUntil, '2026-04-10');
assert.equal(quotation.sourceProjectId, 'proj-77');
assert.equal(quotation.clientId, 'cli-9');
assert.equal(quotation.currency, 'DOP');
assert.equal(quotation.exchangeRate, 59.5);
assert.equal(quotation.seller, 'Ana Pérez');
assert.equal(quotation.projectLabel, 'Sistema FV 25 kWp');
assert.equal(quotation.paymentTerms, '50 % al ordenar, 50 % contra entrega');
assert.equal(quotation.notes, 'Precios sujetos a variación.');
assert.deepEqual(quotation.client, source().client);
assert.deepEqual(quotation.issuer, issuer);
assert.deepEqual(quotation.design, DEFAULT_QUOTATION_DESIGN);

// orden: primero las líneas con precio ('item'), después las descriptivas ('detail')
assert.deepEqual(quotation.items.map(i => i.kind), ['item', 'item', 'item', 'detail', 'detail', 'detail']);
assert.deepEqual(quotation.items.map(i => i.description), [
  'Equipos fotovoltaicos', 'Instalación y puesta en marcha', 'Estructura de montaje', 'Panel solar 550 W', 'Inversor 25 kW', 'Cable solar 6 mm',
]);
assert.deepEqual(quotation.items.map(i => i.taxable), [false, true, true, false, false, false]);
assert.deepEqual(quotation.items.slice(3).map(i => [i.unitPriceCents, i.discountPct]), [[0, 0], [0, 0], [0, 0]]);
assert.equal(quotation.items[3].catalogItemId, 'eq-panel');
assert.equal(quotation.items[5].catalogItemId, undefined);
assert.equal('catalogItemId' in quotation.items[5], false);
assert.equal(quotation.items[5].quantity, 120.5);
assert.equal(quotation.items[5].unit, 'pies');
assert.deepEqual(quotation.discounts.map(d => [d.label, d.type, d.value]), [['Pronto pago', 'percentage', 3], ['Cortesía', 'fixed', 500000]]);

// ids inyectados y únicos
const ids = [...quotation.items.map(i => i.id), ...quotation.discounts.map(d => d.id)];
assert.equal(new Set(ids).size, ids.length);
assert(ids.every(id => /^id-\d+$/.test(id)), 'todos los ids salen de newId');

// adjuntos: relacionados, con su origen
assert.equal(quotation.attachments.length, 2);
for (const attachment of quotation.attachments) {
  assert.equal(attachment.mode, 'related');
  assert.equal(attachment.origin, 'proposal');
  assert.equal(attachment.sourceProjectId, 'proj-77');
}
assert.deepEqual(quotation.attachments.map(a => a.id), ['att-1', 'att-2'], 'conservan el id de la fuente');
assert.equal(quotation.attachments[0].assetId, 'asset:sha256:' + 'd'.repeat(64));
assert.equal(quotation.attachments[0].catalogItemId, 'eq-panel');
assert.equal(quotation.attachments[0].thumbnailDataUrl, 'data:image/png;base64,AAAA');
assert.equal('assetId' in quotation.attachments[1], false);

// resultado válido y estable ante la validación
{
  const result = validateQuotationContent(quotation);
  assert(result.ok, result.ok ? '' : result.error);
  assert.deepEqual(result.value, quotation);
}

// totales del borrador = totales de las líneas con precio y los descuentos de la fuente
{
  const src = source();
  const expected = computeQuotationTotals({
    items: src.pricedLines.map((l, i) => ({ id: String(i), kind: 'item' as const, description: l.description, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents, discountPct: 0, taxable: l.taxable })),
    discounts: src.discounts.map((d, i) => ({ id: String(i), label: d.label, type: d.type, value: d.value })),
  });
  const actual = computeQuotationTotals(quotation);
  // subtotal: 8,500,000 + 1,250,050 + 1,600,000 = 11,350,050 centavos
  assert.equal(actual.subtotalCents, 11_350_050);
  assert.equal(actual.subtotalCents, expected.subtotalCents);
  assert.equal(actual.discountCents, expected.discountCents);
  assert.equal(actual.taxCents, expected.taxCents);
  assert.equal(actual.totalCents, expected.totalCents);
  assert(actual.discountCents > 0 && actual.taxCents > 0);
  assert.equal(computeQuotationTotals({ items: quotation.items.filter(i => i.kind === 'detail'), discounts: [] }).totalCents, 0, 'las filas descriptivas no aportan');
}

// no muta la entrada
{
  const src = source();
  const before = structuredClone(src);
  const design: QuotationDesign = { ...DEFAULT_QUOTATION_DESIGN, layout: 'banda', accent: '#112233' };
  const designBefore = structuredClone(design);
  const out = build(src, design);
  assert.deepEqual(src, before);
  assert.deepEqual(design, designBefore);
  assert.equal(out.design.layout, 'banda');
  assert.deepEqual(out.design, designBefore);
  // el resultado no comparte referencias con la entrada
  out.client.name = 'otro';
  out.issuer.name = 'otro';
  out.attachments[0].title = 'otro';
  out.design.accent = '#000000';
  assert.deepEqual(src, before);
  assert.deepEqual(design, designBefore);
}

// fuente mínima: sin cliente enlazado, sin vigencia, sin líneas descriptivas ni descuentos ni adjuntos
{
  const src: ProposalQuotationSource = { ...source(), clientId: undefined, validUntil: null, detailLines: [], discounts: [], attachments: [], pricedLines: [source().pricedLines[0]] };
  delete src.clientId;
  const out = build(src);
  assert.equal('clientId' in out, false);
  assert.equal(out.validUntil, null);
  assert.deepEqual(out.items.map(i => i.kind), ['item']);
  assert.deepEqual(out.discounts, []);
  assert.deepEqual(out.attachments, []);
  const result = validateQuotationContent(out);
  assert(result.ok, result.ok ? '' : result.error);
}

// USD y newId determinista
{
  const out = quotationFromProposal({ ...source(), currency: 'USD' }, { today: '2026-05-01', newId: counter() });
  assert.equal(out.currency, 'USD');
  assert.equal(out.issueDate, '2026-05-01');
  const again = quotationFromProposal({ ...source(), currency: 'USD' }, { today: '2026-05-01', newId: counter() });
  assert.deepEqual(again, out, 'misma entrada y mismo generador, mismo resultado');
}

console.log('Quotation from-proposal tests passed.');
