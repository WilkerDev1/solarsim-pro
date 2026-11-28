import assert from 'node:assert/strict';
import { computeQuotationTotals, formatMoney, toCents, validateQuotationContent, type QuotationContent, type QuotationCurrency } from '../../shared/quotations';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import {
  ALL_CONVERSION_BLOCKS, buildProposalQuotationSource, convertProposalToQuotation, type ConversionBlocks, type ProposalSourceContext,
} from '../features/quotations/proposalSource';
import type { AttachedPDFDocument, CustomQuotationDiscount, CustomQuotationItem, ProjectSimulation } from '../types';
import type { CompanyProfile } from '../types/companyProfile';
import { publishableContent } from '../store/sync/quotationContent';

const TODAY = '2026-11-26';
const company = { id: 'co-1', name: 'M&A Electsun SRL', rncOrId: '131000001', address: 'Plaza Toledo 307', phone: '809-378-6590', email: 'info@electsun.do', website: 'electsun.do', logoBase64: '' } as unknown as CompanyProfile;
const ctx = (patch: Partial<ProposalSourceContext> = {}): ProposalSourceContext => ({
  today: TODAY, clients: [{ id: 'cli-1' }], company, defaultExchangeRate: 58.5, defaultSeller: 'Ana Pérez', ...patch,
});
const blocks = (patch: Partial<ConversionBlocks> = {}): ConversionBlocks => ({ ...ALL_CONVERSION_BLOCKS, ...patch });
const counter = () => { let n = 0; return () => `id-${++n}`; };
const project = (patch: (p: ProjectSimulation) => void = () => undefined): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.clientId = 'cli-1';
  p.client.quoteDate = '2026-11-20';
  patch(p);
  return p;
};
const convert = (p: ProjectSimulation, b = blocks(), c = ctx()) => {
  const result = convertProposalToQuotation(p, b, c, counter());
  assert(result.ok, result.ok ? '' : result.error);
  return result;
};
const totals = (q: Pick<QuotationContent, 'items' | 'discounts'>) => computeQuotationTotals(q);
const contractCents = (p: ProjectSimulation, rate = 1) => toCents(calculateProjectFinancialSummary(p).contractPriceUSD * rate);

const taxableExtra: CustomQuotationItem = { id: 'x-1', description: 'Monitoreo remoto', quantity: 3, unit: 'UD', unitPriceUSD: 123.456, exonerateITBIS: false, applyMargin: true };
const exemptExtra: CustomQuotationItem = { id: 'x-2', description: 'Estructura especial', quantity: 2.5, unit: 'M', unitPriceUSD: 80.1, exonerateITBIS: true, applyMargin: false };
const hiddenExtra: CustomQuotationItem = { id: 'x-3', description: 'Flete', quantity: 1, unitPriceUSD: 150, exonerateITBIS: false, hideInQuotation: true };
const discounts: CustomQuotationDiscount[] = [
  { id: 'd-1', description: 'Pronto pago', type: 'percentage', value: 5 },
  { id: 'd-2', description: 'Cortesía', type: 'fixed', value: 250, target: 'equipment' },
];

// --- Modo matriz de costos (caso de referencia, ITBIS exonerado) -------------------------------------------------------
{
  const p = project();
  const { value, build } = convert(p);
  assert.equal(value.status, 'draft');
  assert.equal(value.sourceProjectId, BENCHMARK_PROJECT.id);
  assert.equal(value.currency, 'USD', 'la moneda de la propuesta');
  assert.equal(value.exchangeRate, 60, 'su tasa del dólar');
  assert.equal(totals(value).totalCents, contractCents(p), 'el total cuadra al centavo con el precio de la propuesta');
  assert.equal(build.proposalTotalCents, contractCents(p));
  assert.equal(totals(value).taxCents, 0, 'equipos exonerados: sin ITBIS cobrado');
  const priced = value.items.filter((l) => l.kind === 'item');
  assert.equal(priced.length, 1, 'sin desglose por equipo: una línea de importe global');
  assert.match(priced[0].description, /Sistema fotovoltaico 23\.56 kWp/);
  assert.equal(priced[0].taxable, false);
  const details = value.items.filter((l) => l.kind === 'detail');
  assert.deepEqual(details.map((l) => [l.description, l.quantity]), [
    ['Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)', 38],
    ['Inversor Lux Power LXP-LB-US 8K (8.0Kw)', 2],
    ['Batería Hinaess 16 KwH-48 vdc.', 3],
    ['Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).', 1],
  ]);
  assert.equal(totals({ items: details, discounts: [] }).totalCents, 0, 'las filas de equipos no suman');
  assert.equal(value.client.name, 'CENTRO MEDICO HISPANICO');
  assert.equal(value.clientId, 'cli-1');
  assert.equal(value.client.phone, '', 'el teléfono de ejemplo nunca se imprime, tampoco aquí');
  assert.equal(value.client.attention, 'CENTRO MEDICO HISPANICO SRL', 'la misma «Atención» que imprime la propuesta');
  assert.equal(convert(project((x) => { x.client.contactPhone = '809-378-0000'; })).value.client.phone, '809-378-0000');
  assert.equal(value.client.email, 'contacto@centromedico.do');
  assert.equal(value.client.address, 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.');
  assert.equal(value.validUntil, '2026-11-27', 'fecha de la propuesta + 7 días de validez');
  assert.match(value.notes, /Paneles Solares:/);
  assert.match(value.notes, /Batería:/, 'con baterías se incluye su garantía');
  assert.match(value.paymentTerms, /7 días/);
  assert.equal(value.seller, 'Ana Pérez');
  assert.equal(value.issuer.name, 'M&A Electsun SRL');
  assert.equal(value.issuer.taxId, '131000001');
  assert.deepEqual(validateQuotationContent(value), { ok: true, value }, 'contenido ya normalizado');
}

// --- Directo por Wp, excedente al margen y a la mano de obra ------------------------------------------------------------
for (const target of ['margin', 'labor'] as const) {
  const p = project((x) => { x.specs = { ...x.specs, pricingMode: 'direct_watt', pricePerWattUSD: 1.21, directPriceSurplusTarget: target }; x.financials = { ...x.financials, customITBISSavedUSD: undefined }; });
  const { value } = convert(p);
  assert.equal(totals(value).totalCents, contractCents(p), `directo (${target}): el total cuadra`);
  assert.equal(value.items.filter((l) => l.kind === 'item').length, 1);
}

// --- Precio manual (customCostUSD): los descuentos no se restan en la propuesta, tampoco aquí -------------------------
{
  const p = project((x) => { x.financials = { ...x.financials, customCostUSD: 31_000, customDiscounts: discounts }; });
  const { value, build } = convert(p);
  assert.equal(totals(value).totalCents, 3_100_000);
  assert.equal(value.discounts.length, 0);
  assert(build.notices.some((n) => /precio manual/i.test(n)), 'se avisa que sus descuentos no pasan');
  assert.equal(value.items.some((l) => /^Incluye descuento/.test(l.description)), false, 'ninguna fila de descuento');
  assert.equal(build.totalDifferenceCents, 0);
  // Con la exoneración apagada también cuadra al centavo, ITBIS incluido (el precio manual no resta descuentos).
  for (const currencyOn of [true, false]) {
    const off = project((x) => { x.financials = { ...x.financials, applyITBISExemption: false, customITBISSavedUSD: undefined, customCostUSD: 31_000, customDiscounts: discounts, customItems: [taxableExtra] }; });
    const rate = currencyOn ? 1 : 58.5;
    const r = convert(off, blocks({ currency: currencyOn }));
    const s = calculateProjectFinancialSummary(off);
    assert.equal(totals(r.value).totalCents, contractCents(off, rate));
    assert.equal(totals(r.value).taxCents, toCents(Math.round((s.contractPriceUSD - s.grossInvestmentUSD) * 100) / 100 * rate));
    assert.deepEqual(r.value.discounts, []);
  }
}

// --- Ítems extra: visibles con su precio de venta e ITBIS, ocultos sumados al importe global -------------------------
for (const mode of ['cost_matrix', 'direct_watt'] as const) {
  const p = project((x) => {
    x.specs = { ...x.specs, pricingMode: mode, pricePerWattUSD: 1.2 };
    x.financials = { ...x.financials, customItems: [taxableExtra, exemptExtra, hiddenExtra] };
  });
  const summary = calculateProjectFinancialSummary(p);
  const { value, build } = convert(p);
  const t = totals(value);
  assert.equal(t.totalCents, contractCents(p), `${mode}: total con extras al centavo`);
  // ITBIS: el de la propuesta (extras gravados, visibles y ocultos) al centavo: la parte gravada oculta absorbe el redondeo
  assert.equal(t.taxCents, toCents(summary.customItemsNonExoneratedITBISUSD), `${mode}: mismo ITBIS (${t.taxCents})`);
  assert.equal(build.proposalTaxCents, toCents(summary.customItemsNonExoneratedITBISUSD));
  const monitor = value.items.find((l) => l.description === 'Monitoreo remoto');
  assert(monitor && monitor.taxable && monitor.quantity === 3);
  assert.equal(monitor.unitPriceCents, toCents(123.456 * 1.25), 'precio de venta: costo × margen de la propuesta');
  const structure = value.items.find((l) => l.description === 'Estructura especial');
  assert(structure && !structure.taxable && structure.unit === 'M' && structure.quantity === 2.5);
  assert.equal(structure.unitPriceCents, 8010, 'sin margen: el costo tal cual');
  assert.equal(value.items.some((l) => l.description === 'Flete'), false, 'un ítem oculto no se lista');
  const taxablePart = value.items.find((l) => l.kind === 'item' && l.taxable && l.description !== 'Monitoreo remoto');
  assert(taxablePart, 'el oculto gravado va a la parte gravada');
}

// --- Descuentos: cuadre exacto. Se imputan a la parte sin ITBIS (la línea global), como los aplica la propuesta -------
// El ITBIS que cobra la propuesta (el del sistema con la exoneración apagada y el de los extras gravados) no depende del
// descuento; la conversión lo reproduce al centavo, igual que el total y la base gravada. El descuento queda visible en
// una fila descriptiva justo debajo de la línea global, con el concepto y el importe.

/** ITBIS que cobra la propuesta, del motor, en centavos de la moneda del borrador. */
const engineTaxCents = (p: ProjectSimulation, rate = 1) => {
  const s = calculateProjectFinancialSummary(p);
  const manual = (p.financials.customCostUSD ?? 0) > 0;
  const system = Math.max(0, Math.round((s.contractPriceUSD - s.grossInvestmentUSD) * 100) / 100);
  return toCents((system + (manual ? 0 : s.customItemsNonExoneratedITBISUSD)) * rate);
};
/** Descuento que resta la propuesta (lista − bruta), en centavos de la moneda del borrador. */
const engineDiscountCents = (p: ProjectSimulation, rate = 1) => {
  const s = calculateProjectFinancialSummary(p);
  return Math.max(0, toCents((s.listGrossInvestmentUSD - s.grossInvestmentUSD) * rate));
};
/** Base gravada de la propuesta: la base en centavos cuyo 18 % es exactamente su ITBIS. */
const baseForTax = (taxCents: number) => Math.round((taxCents * 10000) / 1800);
const minus = (cents: number, currency: QuotationCurrency) => `−${formatMoney(cents, currency)}`;
/** Suma de lo que dicen las filas «Incluye descuento…» (el primer importe de cada una: el único o el total). */
const includedInNotes = (value: QuotationContent) => value.items
  .filter((l) => l.kind === 'detail' && /^Incluye/.test(l.description))
  .reduce((sum, l) => sum + Math.round(Number(/−(?:US|RD)\$ ([\d,]+\.\d\d)/.exec(l.description)?.[1].replace(/,/g, '') ?? 'NaN') * 100), 0);

/** Igualdad exacta con la propuesta: total, ITBIS y base gravada; sin descuentos de documento; descuento visible. */
const assertExact = (p: ProjectSimulation, b = blocks(), c = ctx(), what = '') => {
  const rate = b.currency ? 1 : c.defaultExchangeRate;
  const { value, build } = convert(p, b, c);
  const t = totals(value);
  const tax = engineTaxCents(p, rate);
  assert.equal(t.totalCents, contractCents(p, rate), `${what}: el total cuadra al centavo con contractPriceUSD`);
  assert.equal(t.taxCents, tax, `${what}: el mismo ITBIS que cobra la propuesta`);
  // Con parte gravada del sistema (exoneración apagada o extras gravados ocultos), la base es la de la propuesta; sin
  // ella, la de las líneas de extras visibles tal como se listan (precio unitario × cantidad).
  const systemTaxable = value.items.some((l) => /Parte del sistema con ITBIS/.test(l.description));
  if (tax > 0 && systemTaxable) assert.equal(t.taxableBaseCents, baseForTax(tax), `${what}: la misma base gravada`);
  if (!systemTaxable) assert.equal(t.taxableBaseCents, t.lines.filter((_, i) => value.items[i].taxable).reduce((sum, l) => sum + l.netCents, 0));
  assert.equal(build.proposalTaxCents, tax);
  assert.equal(build.totalDifferenceCents, 0, `${what}: sin diferencia`);
  assert.equal(build.totalDifferenceReason, null);
  assert.equal(build.residualDiscountCents, 0);
  assert.deepEqual(value.discounts, [], `${what}: el descuento no se prorratea sobre lo gravado`);
  assert.equal(t.discountCents, 0);
  const discount = engineDiscountCents(p, rate);
  const globalIndex = value.items.findIndex((l) => l.kind === 'item' && /llave en mano/.test(l.description));
  const note = value.items[globalIndex + 1];
  if (discount > 0) {
    assert(globalIndex >= 0, `${what}: hay línea global`);
    assert(note && note.kind === 'detail' && /^Incluye descuentos?[: ]/.test(note.description), `${what}: el descuento se ve justo debajo de la línea global`);
    // Entre la fila de la línea global y las de los extras exentos que absorbieron el resto, todo el descuento.
    assert.equal(includedInNotes(value), discount, `${what}: las filas suman el descuento (${note.description})`);
    if (value.items.filter((l) => /^Incluye/.test(l.description)).length === 1) assert(note.description.includes(minus(discount, value.currency)));
    for (const [i, l] of value.items.entries()) {
      if (!/^Incluye/.test(l.description)) continue;
      assert(l.kind === 'detail' && l.quantity === 0 && l.description.length <= 500, 'fila descriptiva sin cantidad');
      assert(value.items[i - 1]?.kind === 'item' && !value.items[i - 1].taxable, 'debajo de una línea sin ITBIS');
    }
  } else {
    assert.equal(value.items.some((l) => /^Incluye descuento/.test(l.description)), false);
  }
  return { value, build, t };
};

// (a) Sin líneas gravadas: los descuentos de la propuesta, visibles con concepto e importe.
{
  const p = project((x) => { x.financials = { ...x.financials, customDiscounts: discounts }; });
  const { value } = assertExact(p, blocks(), ctx(), 'exonerado con dos descuentos');
  const discount = engineDiscountCents(p);
  const note = value.items[1];
  assert.equal(note.description, `Incluye descuentos por ${minus(discount, 'USD')}: Pronto pago (5 %) ${minus(discount - 25_000, 'USD')}; Cortesía · equipos (Ley 57-07) ${minus(25_000, 'USD')}`);
  const global = value.items[0];
  const s = calculateProjectFinancialSummary(p);
  assert.equal(global.unitPriceCents, toCents(s.contractPriceUSD), 'la línea global ya lleva el descuento');
  assert.equal(global.discountPct, 0);
}

// (b) Caso de referencia: exención apagada con 10 % de descuento, en USD y en DOP (propuesta US$ 25,078.43).
for (const [currencyOn, rate] of [[true, 1], [false, 58.5]] as const) {
  const p = project((x) => {
    x.financials = { ...x.financials, applyITBISExemption: false, customITBISSavedUSD: undefined, customDiscounts: [{ id: 'd', description: 'Cierre', type: 'percentage', value: 10 }] };
  });
  if (currencyOn) assert.equal(contractCents(p), 2_507_843, 'caso de referencia del problema');
  const { value, t } = assertExact(p, blocks({ currency: currencyOn }), ctx(), `exención apagada 10 % (${currencyOn ? 'USD' : 'DOP'})`);
  assert(t.taxCents > 0);
  const currency = currencyOn ? 'USD' : 'DOP';
  assert.equal(value.items[1].description, `Incluye descuento: Cierre (10 %) ${minus(engineDiscountCents(p, rate), currency)}`);
  const taxable = value.items.find((l) => l.taxable);
  assert(taxable && /Parte del sistema con ITBIS/.test(taxable.description) && taxable.discountPct === 0, 'la parte gravada no se descuenta');
}

// (c) Exención encendida con extras gravados (visibles y ocultos), exentos y descuentos; también en pesos.
for (const [currencyOn, rate] of [[true, 1], [false, 58.5]] as const) {
  for (const mode of ['cost_matrix', 'direct_watt'] as const) {
    const p = project((x) => {
      x.specs = { ...x.specs, pricingMode: mode, pricePerWattUSD: 1.2 };
      x.financials = { ...x.financials, customItems: [taxableExtra, exemptExtra, hiddenExtra], customDiscounts: discounts };
    });
    const { t } = assertExact(p, blocks({ currency: currencyOn }), ctx(), `${mode} con extras gravados (${rate})`);
    assert(t.taxCents > 0);
  }
}

// (d) Exención apagada, extras gravados y varios descuentos (porcentaje y fijo), en USD y DOP, matriz y por Wp.
for (const currencyOn of [true, false]) {
  for (const mode of ['cost_matrix', 'direct_watt'] as const) {
    for (const target of ['margin', 'labor'] as const) {
      if (mode === 'cost_matrix' && target === 'labor') continue;
      const p = project((x) => {
        x.specs = { ...x.specs, pricingMode: mode, pricePerWattUSD: 1.21, directPriceSurplusTarget: target };
        x.financials = {
          ...x.financials, applyITBISExemption: false, customITBISSavedUSD: undefined, customItems: [taxableExtra, exemptExtra],
          customDiscounts: [...discounts, { id: 'd-3', description: 'Referido', type: 'percentage', value: 2.5 }, { id: 'd-4', description: 'Bono', type: 'fixed', value: 99.99 }],
        };
      });
      assertExact(p, blocks({ currency: currencyOn }), ctx(), `${mode}/${target} exención apagada, cuatro descuentos`);
    }
  }
}

// (e) Más de 20 descuentos: un único descuento en la línea global y la fila con el desglose (recortada a su límite).
{
  const many: CustomQuotationDiscount[] = Array.from({ length: 25 }, (_, i) => ({ id: `d-${i}`, description: `Descuento comercial número ${i + 1}`, type: i % 2 ? 'fixed' : 'percentage', value: i % 2 ? 10 + i : 0.5 }));
  for (const exemption of [true, false]) {
    const p = project((x) => { x.financials = { ...x.financials, applyITBISExemption: exemption, customITBISSavedUSD: exemption ? x.financials.customITBISSavedUSD : undefined, customItems: [taxableExtra], customDiscounts: many }; });
    const { value } = assertExact(p, blocks(), ctx(), `25 descuentos (exención ${exemption})`);
    const note = value.items[1].description;
    assert.match(note, /^Incluye descuentos por −US\$ [\d,]+\.\d\d: Descuento comercial número 1 \(0\.5 %\) −US\$/);
    assert.match(note, /; otros \d+ −US\$ [\d,]+\.\d\d$/, 'los que no caben, juntos y con su importe');
  }
  const p21 = project((x) => { x.financials = { ...x.financials, customDiscounts: Array.from({ length: 21 }, (_, i) => ({ id: `d-${i}`, description: `D${i + 1}`, type: 'fixed', value: 10 + i })) }; });
  const { value } = assertExact(p21, blocks(), ctx(), '21 descuentos cortos');
  assert.match(value.items[1].description, /; D21 −US\$ 30\.00$/, 'si caben, todos con su importe');
}

// (f) El descuento supera la línea global: lo que no cabe ahí se imputa a los extras exentos visibles (precio rebajado y
// su propia fila «Incluye descuento…» debajo) y el total sigue cuadrando. Solo lo que tampoco cabe en las líneas sin
// ITBIS va como descuento del documento, con la diferencia exacta avisada.
{
  const bigExempt: CustomQuotationItem = { id: 'x-big', description: 'Obra civil', quantity: 1, unit: 'UD', unitPriceUSD: 10_000, exonerateITBIS: true, applyMargin: false };
  const bigTaxable: CustomQuotationItem = { id: 'x-tax', description: 'Transformador', quantity: 2, unit: 'UD', unitPriceUSD: 1_500, exonerateITBIS: false, applyMargin: false };
  const liquidation: CustomQuotationDiscount[] = [{ id: 'd', description: 'Liquidación', type: 'percentage', value: 60 }];
  const lowWp = (items: CustomQuotationItem[], customDiscounts = liquidation) => project((x) => {
    x.specs = { ...x.specs, pricingMode: 'direct_watt', pricePerWattUSD: 0.2 };
    x.financials = { ...x.financials, customItems: items, customDiscounts };
  });
  const noteBelow = (value: QuotationContent, description: RegExp) => {
    const index = value.items.findIndex((l) => l.kind === 'item' && description.test(l.description));
    assert(index >= 0, `línea ${description}`);
    return { line: value.items[index], note: value.items[index + 1] };
  };
  for (const currencyOn of [true, false]) {
    const rate = currencyOn ? 1 : 58.5;
    // Caso del revisor: la Obra civil exenta da para todo el resto → cuadre exacto, sin descuento de documento.
    const p = lowWp([bigExempt, bigTaxable]);
    const { value } = convert(p, blocks({ currency: currencyOn }));
    const discount = engineDiscountCents(p, rate);
    const global = noteBelow(value, /llave en mano/);
    const civil = noteBelow(value, /^Obra civil$/);
    assert.equal(global.line.unitPriceCents, 0, 'la línea global se descuenta entera');
    const onGlobal = Number(/−(?:US|RD)\$ ([\d,]+\.\d\d)$/.exec(global.note.description)?.[1].replace(/,/g, '')) * 100;
    const onCivil = Math.round(10_000 * rate * 100) - civil.line.unitPriceCents;
    assert.equal(global.note.description, `Incluye descuento: Liquidación (60 %) ${minus(Math.round(onGlobal), value.currency)}`);
    assert.equal(civil.note.kind, 'detail');
    assert.equal(civil.note.description, `Incluye descuento: Liquidación (60 %) ${minus(onCivil, value.currency)}`, 'misma fila que la del sistema');
    assert.equal(Math.round(onGlobal) + onCivil, discount, 'entre las dos filas, todo el descuento');
    assert.equal(civil.line.quantity, 1);
    assert.equal(noteBelow(value, /^Transformador$/).line.unitPriceCents, Math.round(1_500 * rate * 100), 'lo gravado no se toca');
    assertExact(p, blocks({ currency: currencyOn }), ctx(), `resto en la Obra civil (${value.currency})`);

    // Extra exento con cantidad ≠ 1 y un resto que su precio unitario no expresa al centavo: pasa a 1 lote por su neto.
    const piece: CustomQuotationItem = { id: 'x-piece', description: 'Postes', quantity: 3, unit: 'UD', unitPriceUSD: 1_000, exonerateITBIS: true, applyMargin: false };
    const q = lowWp([piece], [{ id: 'd', description: 'Cierre', type: 'fixed', value: 0 }]);
    const list = calculateProjectFinancialSummary(q).listGrossInvestmentUSD;
    const odd = lowWp([piece], [{ id: 'd', description: 'Cierre', type: 'fixed', value: Math.round((list - 3_000 + 1_000.01) * 100) / 100 }]);
    const r = convert(odd, blocks({ currency: currencyOn }));
    const poles = noteBelow(r.value, /^Postes/);
    if (currencyOn) {
      assert.deepEqual([poles.line.description, poles.line.quantity, poles.line.unit, poles.line.unitPriceCents], ['Postes (3 UD)', 1, 'lote', 199_999], 'un lote por el neto exacto');
      assert.equal(poles.note.description, `Incluye descuento: Cierre ${minus(100_001, 'USD')}`);
    }
    assertExact(odd, blocks({ currency: currencyOn }), ctx(), `extra en lote (${r.value.currency})`);

    // Sin extras exentos visibles: el resto no cabe en ninguna línea sin ITBIS y va al documento («<concepto> · resto»).
    const s = lowWp([bigTaxable]);
    const res = convert(s, blocks({ currency: currencyOn }));
    const t = totals(res.value);
    assert(res.build.residualDiscountCents > 0, 'hay resto');
    const g = noteBelow(res.value, /llave en mano/);
    assert.equal(g.line.unitPriceCents, 0);
    assert.equal(g.note.description, `Incluye descuento: Liquidación (60 %) ${minus(engineDiscountCents(s, rate) - res.build.residualDiscountCents, res.value.currency)}`);
    assert.deepEqual(res.value.discounts.map((d) => [d.label, d.type, d.value]), [['Liquidación · resto', 'fixed', res.build.residualDiscountCents]], 'sin repetir el porcentaje en un monto fijo');
    assert.equal(t.discountCents, res.build.residualDiscountCents);
    assert.equal(res.build.totalDifferenceCents, t.totalCents - contractCents(s, rate), 'diferencia exacta');
    assert(res.build.totalDifferenceCents < 0, 'el ITBIS del resto prorrateado sobre lo gravado');
    assert.equal(res.build.totalDifferenceReason, 'residual_discount');
    assert.equal(res.build.notices.some((n) => /superan/.test(n)), false, 'no va entre los avisos plegados');
  }
}

// (f2) Un extra gravado oculto diminuto cuya base exacta no deja nada para la parte gravada: no se crea esa línea (su
// centavo va a la línea global) y el ITBIS sigue siendo el de la propuesta.
{
  const tinyHidden: CustomQuotationItem = { id: 'x-tiny', description: 'Sello', quantity: 1, unitPriceUSD: 0.01, exonerateITBIS: false, applyMargin: false, hideInQuotation: true };
  const p = project((x) => { x.financials = { ...x.financials, customItems: [taxableExtra, tinyHidden] }; });
  const { value } = convert(p);
  assert.equal(value.items.some((l) => /Parte del sistema con ITBIS/.test(l.description)), false, 'sin parte gravada de 0 o negativa');
  assert.equal(totals(value).taxCents, engineTaxCents(p));
  assert.equal(totals(value).totalCents, contractCents(p));
}

// (g) Sin descuentos, sin diferencia ni fila de descuento.
{
  const { build } = assertExact(project(), blocks(), ctx(), 'sin descuentos');
  assert.equal(build.totalDifferenceReason, null);
}

// (h) Fuzz con semilla fija: igualdad exacta salvo el caso residual (descuento mayor que la parte sin ITBIS).
{
  let seed = 0x5eed_2026;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const money = (max: number) => Math.round(rnd() * max * 1000) / 1000;
  let exact = 0, residual = 0, taxRounding = 0, manualCases = 0, superanCases = 0;
  for (let n = 0; n < 600; n++) {
    const mode = pick(['cost_matrix', 'direct_watt', 'manual'] as const);
    const exemption = rnd() < 0.5;
    const currencyOn = rnd() < 0.6;
    const c = ctx({ defaultExchangeRate: Math.round((50 + rnd() * 15) * 100) / 100 });
    const extras: CustomQuotationItem[] = Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => ({
      id: `fx-${i}`, description: `Extra ${i}`, unit: 'UD',
      quantity: rnd() < 0.7 ? 1 + Math.floor(rnd() * 10) : Math.round(rnd() * 20 * 2) / 2 + 0.5,
      unitPriceUSD: money(rnd() < 0.15 ? 12_000 : 1_500),
      exonerateITBIS: rnd() < 0.5, applyMargin: rnd() < 0.6, hideInQuotation: rnd() < 0.2,
    }));
    const disc: CustomQuotationDiscount[] = Array.from({ length: rnd() < 0.3 ? 0 : Math.floor(rnd() * 26) }, (_, i) => ({
      id: `fd-${i}`, description: `Promo ${i}`, ...(rnd() < 0.5 ? { type: 'percentage' as const, value: Math.round(rnd() * (rnd() < 0.1 ? 90 : 8) * 100) / 100 } : { type: 'fixed' as const, value: money(rnd() < 0.1 ? 8_000 : 600) }),
      ...(rnd() < 0.3 ? { target: 'equipment' as const } : {}),
    }));
    const p = project((x) => {
      x.specs = { ...x.specs, dopExchangeRate: Math.round((55 + rnd() * 10) * 100) / 100, pricingMode: mode === 'manual' ? 'cost_matrix' : mode, pricePerWattUSD: Math.round((0.15 + rnd() * 1.8) * 100) / 100, directPriceSurplusTarget: pick(['margin', 'labor'] as const) };
      x.financials = {
        ...x.financials, applyITBISExemption: exemption, customITBISSavedUSD: exemption ? x.financials.customITBISSavedUSD : undefined,
        customItems: extras, customDiscounts: disc, ...(mode === 'manual' ? { customCostUSD: Math.round((3_000 + rnd() * 50_000) * 100) / 100 } : {}),
      };
    });
    const rate = currencyOn ? 1 : c.defaultExchangeRate;
    const b = blocks({ currency: currencyOn });
    const result = convertProposalToQuotation(p, b, c, counter());
    assert(result.ok, `caso ${n}: ${result.ok ? '' : result.error}`);
    const { value, build } = result;
    const t = totals(value);
    const label = `fuzz ${n} (${mode}, exención ${exemption}, ${value.currency}, ${extras.length} extras, ${disc.length} descuentos)`;
    if (mode === 'manual') manualCases++;
    const contract = contractCents(p, rate);
    const discount = mode === 'manual' ? 0 : engineDiscountCents(p, rate);
    // Cota independiente del resto: el descuento menos lo imputable a líneas sin ITBIS, es decir, la línea global antes
    // del descuento (total − ITBIS − líneas listadas + descuento) y los extras exentos visibles a su precio de lista.
    const multiplier = 1.25;
    const exemptList = mode === 'manual' ? 0 : extras
      .filter((e) => !e.hideInQuotation && e.exonerateITBIS && e.quantity > 0)
      .reduce((sum, e) => sum + totals({ items: [{ id: 'e', kind: 'item', description: '', quantity: e.quantity, unit: '', unitPriceCents: toCents(e.unitPriceUSD * (e.applyMargin ? multiplier : 1) * rate), discountPct: 0, taxable: false }], discounts: [] }).subtotalCents, 0);
    const taxableLines = t.lines.filter((_, i) => value.items[i].taxable).reduce((sum, l) => sum + l.grossCents, 0);
    const taxOfLines = Math.floor((taxableLines * 1800 + 5000) / 10000);
    const globalList = contract - taxOfLines - taxableLines - exemptList + discount;
    const expectedResidual = Math.max(0, discount - Math.max(0, globalList) - exemptList);
    assert.equal(build.residualDiscountCents, expectedResidual, `${label}: resto = descuento − lo imputable a líneas sin ITBIS`);
    assert.equal(includedInNotes(value), discount - expectedResidual, `${label}: las filas «Incluye descuento» suman lo incluido`);
    assert.equal(build.totalDifferenceCents, t.totalCents - contract, `${label}: diferencia exacta`);
    const superan = build.notices.some((x) => /superan el precio/.test(x));
    assert.equal(superan, globalList < 0, `${label}: aviso de extras por encima del precio`);
    if (build.totalDifferenceCents !== 0) {
      assert(superan || build.residualDiscountCents > 0, `${label}: diferencia sin motivo`);
      if (!superan && build.residualDiscountCents > 0 && taxableLines > 0) {
        assert.equal(build.totalDifferenceReason, 'residual_discount', label);
      } else assert.equal(build.totalDifferenceReason, 'other', label);
    }
    if (build.residualDiscountCents > 0) {
      residual++;
      // Solo el resto es descuento del documento (acotado a lo que queda: descuentos que suman más que todo el documento).
      assert.equal(t.discountCents, Math.min(build.residualDiscountCents, t.subtotalCents), `${label}: solo el resto es descuento del documento`);
      assert(value.discounts.every((d) => d.type === 'fixed' && / · resto$/.test(d.label) && !/%\)/.test(d.label)), `${label}: etiquetas del resto`);
      // Lo imputable a líneas sin ITBIS se agotó: todas las listadas exentas quedan en 0.
      assert(value.items.every((l) => l.kind !== 'item' || l.taxable || l.unitPriceCents === 0), `${label}: líneas sin ITBIS agotadas`);
      continue;
    }
    if (superan) { superanCases++; continue; }
    assert.equal(t.totalCents, contractCents(p, rate), `${label}: total`);
    assert.equal(build.totalDifferenceCents, 0, label);
    assert.deepEqual(value.discounts, [], label);
    const tax = engineTaxCents(p, rate);
    // Única excepción al ITBIS exacto: con la exoneración encendida, sin extras gravados ocultos ni parte gravada del
    // sistema, la base es la suma de las líneas de extras visibles (precio unitario redondeado al centavo × cantidad).
    const flexible = value.items.some((l) => /Parte del sistema con ITBIS/.test(l.description));
    if (flexible || tax === 0) {
      assert.equal(t.taxCents, tax, `${label}: ITBIS`);
      if (tax > 0) assert.equal(t.taxableBaseCents, baseForTax(tax), `${label}: base gravada`);
      exact++;
    } else {
      // Cota: medio centavo por unidad de cada precio unitario redondeado y, en pesos, el ITBIS de la propuesta llega ya
      // redondeado al centavo de dólar (± media tasa en centavos de peso). El total sí cuadra: lo absorbe la línea global.
      const bound = value.items.filter((l) => l.taxable).reduce((sum, l) => sum + 0.18 * (l.quantity * 0.5 + 0.5), 1) + (rate > 1 ? rate / 2 : 0);
      assert(Math.abs(t.taxCents - tax) <= bound, `${label}: ITBIS ${t.taxCents} vs ${tax}`);
      if (t.taxCents !== tax) taxRounding++; else exact++;
    }
    if (discount > 0) {
      const g = value.items.findIndex((l) => /llave en mano/.test(l.description));
      assert(g >= 0 && /^Incluye descuentos?[: ]/.test(value.items[g + 1]?.description ?? ''), `${label}: descuento visible`);
    }
  }
  assert(exact >= 400, `casos exactos: ${exact}`);
  assert(residual >= 5, `casos con resto: ${residual}`);
  assert(manualCases >= 100);
  console.log(`  fuzz: ${exact} exactos, ${residual} con resto, ${superanCases} con extras por encima del precio, ${taxRounding} con ITBIS de extras visibles redondeado por línea`);
}

// --- (4) Precio manual con extras que lo superan: extras como filas sin precio, total = precio manual -------------------
{
  const pricey: CustomQuotationItem = { id: 'x-big', description: 'Canalización', quantity: 7, unit: 'UD', unitPriceUSD: 1500, exonerateITBIS: false };
  const p = project((x) => { x.financials = { ...x.financials, customCostUSD: 5000, customItems: [pricey, hiddenExtra] }; });
  const { value, build } = convert(p);
  assert.equal(totals(value).totalCents, 500_000);
  assert.equal(build.totalDifferenceCents, 0);
  const priced = value.items.filter((l) => l.kind === 'item');
  assert.equal(priced.length, 1, 'solo la línea global con el precio manual');
  const extraRow = value.items.find((l) => l.description === 'Canalización');
  assert(extraRow && extraRow.kind === 'detail' && extraRow.quantity === 7);
  assert.equal(value.items.some((l) => l.description === 'Flete'), false);
  assert.equal(build.notices.some((n) => /superan/.test(n)), false);
}

// --- (5) Extra con cantidad 0 y (6) fuera de rango: no bloquean, se omiten con aviso nombrado --------------------------
for (const mode of ['cost_matrix', 'direct_watt'] as const) {
  const zero: CustomQuotationItem = { id: 'x-0', description: 'Pararrayos', quantity: 0, unitPriceUSD: 300, exonerateITBIS: false };
  const negative: CustomQuotationItem = { id: 'x-neg', description: 'Bonificación', quantity: 1, unitPriceUSD: -50, exonerateITBIS: true };
  const huge: CustomQuotationItem = { id: 'x-huge', description: 'Cable a granel', quantity: 2_000_000, unitPriceUSD: 0.01, exonerateITBIS: true };
  const nan: CustomQuotationItem = { id: 'x-nan', description: 'Dato roto', quantity: Number.NaN, unitPriceUSD: Number.NaN, exonerateITBIS: true };
  const p = project((x) => {
    x.specs = { ...x.specs, pricingMode: mode, pricePerWattUSD: 1.2 };
    x.financials = { ...x.financials, customItems: [zero, negative, huge, nan, taxableExtra] };
  });
  const { value, build } = convert(p);
  assert.equal(totals(value).totalCents, contractCents(p), `${mode}: el total sigue cuadrando`);
  for (const name of ['Pararrayos', 'Bonificación', 'Cable a granel', 'Dato roto']) {
    assert.equal(value.items.some((l) => l.description === name), false, `${name} no se lista`);
    assert(build.notices.some((n) => n.includes(`«${name}»`)), `aviso que nombra «${name}»`);
  }
  assert(value.items.some((l) => l.description === 'Monitoreo remoto'), 'los extras válidos sí pasan');
}

// --- ITBIS no exonerado: la parte gravada del sistema lleva el ITBIS de la propuesta -----------------------------------
{
  const p = project((x) => { x.financials = { ...x.financials, applyITBISExemption: false, customITBISSavedUSD: undefined }; });
  const summary = calculateProjectFinancialSummary(p);
  assert(summary.contractPriceUSD > summary.grossInvestmentUSD);
  const { value } = convert(p);
  const t = totals(value);
  assert.equal(t.totalCents, contractCents(p));
  assert.equal(t.taxCents, toCents(summary.contractPriceUSD - summary.grossInvestmentUSD), 'el ITBIS del sistema al centavo');
}

// --- Moneda y tasa apagadas: pesos con la tasa de las cotizaciones nuevas, importes convertidos -----------------------
{
  const p = project();
  const { value } = convert(p, blocks({ currency: false }));
  assert.equal(value.currency, 'DOP');
  assert.equal(value.exchangeRate, 58.5);
  assert.equal(totals(value).totalCents, contractCents(p, 58.5));
}
{
  const p = project((x) => { x.specs = { ...x.specs, dopExchangeRate: 62.35 }; x.financials = { ...x.financials, customItems: [taxableExtra, exemptExtra] }; });
  const usd = convert(p).value;
  assert.equal(usd.exchangeRate, 62.35);
  const dop = convert(p, blocks({ currency: false }), ctx({ defaultExchangeRate: 62.35 })).value;
  assert.equal(totals(dop).totalCents, contractCents(p, 62.35), 'en pesos también cuadra');
  assert.equal(dop.items.find((l) => l.description === 'Monitoreo remoto')?.unitPriceCents, toCents(123.456 * 1.25 * 62.35));
}

// --- Bloques apagados ---------------------------------------------------------------------------------------------------
{
  const p = project((x) => { x.financials = { ...x.financials, customDiscounts: discounts }; x.customization = { attachedPdfs: [] }; });
  const none = convert(p, { client: false, items: false, documents: false, currency: false, conditions: false }).value;
  assert.equal('clientId' in none, false);
  assert.deepEqual(none.client, { name: '', attention: '', taxId: '', phone: '', email: '', address: '' });
  assert.deepEqual(none.items, []);
  assert.deepEqual(none.discounts, []);
  assert.deepEqual(none.attachments, []);
  assert.equal(none.notes, '');
  assert.equal(none.paymentTerms, '');
  assert.equal(none.validUntil, null);
  assert.equal(none.sourceProjectId, BENCHMARK_PROJECT.id, 'siempre enlazada a la propuesta');
  assert.match(none.projectLabel, /23\.56 kWp/);
  const onlyItems = convert(p, { client: false, items: true, documents: false, currency: true, conditions: false }).value;
  assert(onlyItems.items.length > 0 && onlyItems.discounts.length === 0);
  assert.match(onlyItems.items[1].description, /^Incluye descuentos por −US\$/, 'con «Equipos y materiales» el descuento va en la fila bajo la línea global');
}

// --- Propuesta sin cliente enlazado, o con un cliente que ya no está en el directorio ---------------------------------
{
  const p = project((x) => { delete x.clientId; });
  const { value } = convert(p);
  assert.equal('clientId' in value, false);
  assert.equal(value.client.name, 'CENTRO MEDICO HISPANICO', 'los datos impresos sí pasan');
  const gone = convert(project(), blocks(), ctx({ clients: [] }));
  assert.equal('clientId' in gone.value, false);
  assert(gone.build.notices.some((n) => /directorio/.test(n)));
}

// --- Documentos: referencias reutilizables como «Archivo aparte en el correo»; sin referencia, se omiten -------------------------
{
  const pdf = (patch: Partial<AttachedPDFDocument>): AttachedPDFDocument => ({
    id: 'a', fileName: 'a.pdf', fileSize: 1000, pageCount: 2, title: 'A', uploadedAt: '2026-11-01T10:00:00.000Z', enabled: true, addToTableOfContents: true, ...patch,
  });
  const p = project((x) => {
    x.customization = {
      attachedPdfs: [
        pdf({ id: 'att-panel', title: 'Ficha del panel', origin: 'catalog', catalogItemId: 'eq-panel', assetId: 'equipment-asset_9f2', thumbnailDataUrl: 'data:image/jpeg;base64,AAAA' }),
        pdf({ id: 'att-old', title: 'Ficha antigua', origin: 'catalog', catalogItemId: 'eq-inv', sourceDatasheetKey: 'legacy-asset-1' }),
        pdf({ id: 'att-manual', title: 'Plano del techo', origin: 'manual' }),
        pdf({ id: 'att-url', title: 'Ficha por URL', origin: 'catalog', sourceDatasheetKey: 'https://example.com/a.pdf' }),
        pdf({ id: 'att-bad', title: 'Referencia rara', assetId: 'asset with spaces' }),
        pdf({ id: 'att-off', title: 'Retirado', enabled: false, assetId: 'asset-off' }),
        pdf({ id: 'att-svg', title: 'Miniatura SVG', assetId: 'asset-svg', thumbnailDataUrl: 'data:image/svg+xml;base64,AAAA' }),
      ],
    };
  });
  const { value, build } = convert(p);
  assert.deepEqual(value.attachments.map((a) => [a.id, a.origin, a.mode, a.assetId, a.catalogItemId ?? null]), [
    ['att-panel', 'catalog', 'related', 'equipment-asset_9f2', 'eq-panel'],
    ['att-old', 'catalog', 'related', 'legacy-asset-1', 'eq-inv'],
    ['att-svg', 'proposal', 'related', 'asset-svg', null],
  ]);
  assert(value.attachments.every((a) => a.sourceProjectId === BENCHMARK_PROJECT.id));
  assert.equal(value.attachments[0].thumbnailDataUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal('thumbnailDataUrl' in value.attachments[2], false, 'una miniatura no admitida se quita, el documento no');
  assert.deepEqual(build.omittedDocuments.map((d) => d.title), ['Plano del techo', 'Ficha por URL', 'Referencia rara']);
  const off = convert(p, blocks({ documents: false }));
  assert.deepEqual(off.value.attachments, []);
  assert.deepEqual(off.build.omittedDocuments, []);
}

// --- Vigencia: una propuesta vencida deja la cotización sin vigencia ----------------------------------------------------
{
  const expired = convert(project((x) => { x.client.quoteDate = '2026-10-01'; })).value;
  assert.equal(expired.validUntil, null);
  const noDate = convert(project((x) => { delete x.client.quoteDate; x.client.quoteValidityDays = 15; })).value;
  assert.equal(noDate.validUntil, '2026-12-11', 'sin fecha, desde hoy');
}

// --- (10) Ida y vuelta: convertido → contenido publicable → validación compartida (miniatura en línea) -----------------
{
  const p = project((x) => {
    x.customization = { attachedPdfs: [{ id: 'att-1', fileName: 'ficha.pdf', fileSize: 10, pageCount: 1, title: 'Ficha', uploadedAt: '2026-11-01T10:00:00.000Z', enabled: true, addToTableOfContents: true, origin: 'catalog', catalogItemId: 'eq-1', assetId: 'asset-1', thumbnailDataUrl: 'data:image/jpeg;base64,AAAA' }] };
    x.financials = { ...x.financials, customItems: [taxableExtra], customDiscounts: discounts };
  });
  const { value } = convert(p);
  assert.equal(value.attachments[0].thumbnailDataUrl, 'data:image/jpeg;base64,AAAA');
  const published = publishableContent(value);
  assert.equal('thumbnailDataUrl' in published.attachments[0], false, 'la miniatura en línea no viaja');
  assert.equal(published.attachments[0].assetId, 'asset-1');
  const again = validateQuotationContent(published);
  assert(again.ok, again.ok ? '' : again.error);
  assert.deepEqual(computeQuotationTotals(again.value), computeQuotationTotals(value), 'mismos totales tras publicar');
}

// --- La propuesta de origen no cambia -----------------------------------------------------------------------------------
{
  const p = project((x) => { x.financials = { ...x.financials, customItems: [taxableExtra, hiddenExtra], customDiscounts: discounts }; });
  const before = structuredClone(p);
  convert(p);
  buildProposalQuotationSource(p, blocks({ currency: false }), ctx());
  assert.deepEqual(p, before);
}

console.log('Quotation proposal-source tests passed.');
