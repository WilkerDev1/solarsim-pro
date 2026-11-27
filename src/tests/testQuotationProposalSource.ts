import assert from 'node:assert/strict';
import { computeQuotationTotals, toCents, validateQuotationContent, type QuotationContent } from '../../shared/quotations';
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
  // ITBIS: el de la propuesta (extras gravados, visibles y ocultos) con una diferencia de redondeo de pocos centavos
  assert(Math.abs(t.taxCents - toCents(summary.customItemsNonExoneratedITBISUSD)) <= 2, `${mode}: mismo ITBIS (${t.taxCents})`);
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

// --- Descuentos: los mismos importes; con líneas gravadas el ITBIS se calcula sobre la base descontada ------------------
{
  const p = project((x) => { x.financials = { ...x.financials, customDiscounts: discounts }; });
  const summary = calculateProjectFinancialSummary(p);
  const { value } = convert(p);
  const t = totals(value);
  assert.equal(t.discountCents, toCents(summary.listGrossInvestmentUSD - summary.grossInvestmentUSD), 'mismo descuento total');
  assert.deepEqual(value.discounts.map((d) => [d.type, d.label]), [['fixed', 'Pronto pago (5 %)'], ['fixed', 'Cortesía · equipos (Ley 57-07)']]);
  assert.equal(value.discounts[1].value, 25_000);
  assert.equal(t.totalCents, contractCents(p), 'sin líneas gravadas el total cuadra al centavo');
}
{
  const p = project((x) => { x.financials = { ...x.financials, customItems: [taxableExtra], customDiscounts: discounts }; });
  const { value, build } = convert(p);
  const t = totals(value);
  // Tolerancia exacta documentada: la propuesta cobra el ITBIS de los extras antes del descuento; la cotización lo
  // calcula sobre la base gravada ya descontada (ITBIS sobre lo que se cobra). Diferencia = ITBIS de la propuesta − ITBIS de la cotización.
  assert.equal(t.totalCents, build.proposalTotalCents - (build.proposalTaxCents - t.taxCents));
  const taxableShare = t.lines.filter((l, i) => value.items[i].taxable).reduce((sum, l) => sum + l.allocatedDiscountCents, 0);
  assert(taxableShare > 0);
  assert(Math.abs((build.proposalTaxCents - t.taxCents) - Math.round(taxableShare * 0.18)) <= 3, 'la diferencia es el ITBIS del descuento asignado a lo gravado');
  // La diferencia exacta (con signo) viaja en el resultado para mostrarla fuera de los avisos plegados.
  assert.equal(build.totalDifferenceCents, t.totalCents - build.proposalTotalCents);
  assert(build.totalDifferenceCents < 0);
  assert.equal(build.notices.some((n) => /base descontada/.test(n)), false, 'no va entre los avisos plegados');
}

// --- (1) Exención apagada con 10 % de descuento: diferencia exacta en USD y en DOP; DOP con descuentos y extras -------
for (const [currencyOn, rate] of [[true, 1], [false, 58.5]] as const) {
  const p = project((x) => {
    x.financials = { ...x.financials, applyITBISExemption: false, customITBISSavedUSD: undefined, customDiscounts: [{ id: 'd', description: 'Cierre', type: 'percentage', value: 10 }] };
  });
  const { value, build } = convert(p, blocks({ currency: currencyOn }));
  const t = totals(value);
  assert.equal(build.proposalTotalCents, contractCents(p, rate));
  assert.equal(build.totalDifferenceCents, t.totalCents - build.proposalTotalCents, `diferencia exacta (${value.currency})`);
  assert(build.totalDifferenceCents < -1000, `el ITBIS sobre la base descontada deja el total por debajo (${build.totalDifferenceCents})`);
  assert.equal(build.totalDifferenceReason, 'discounted_itbis');
  assert.equal(t.discountCents, toCents((calculateProjectFinancialSummary(p).listGrossInvestmentUSD - calculateProjectFinancialSummary(p).grossInvestmentUSD) * rate), 'mismo descuento');
}
{
  const p = project((x) => { x.financials = { ...x.financials, customItems: [taxableExtra, exemptExtra], customDiscounts: discounts }; });
  const { value, build } = convert(p, blocks({ currency: false }));
  assert.equal(value.currency, 'DOP');
  assert.equal(build.totalDifferenceCents, totals(value).totalCents - contractCents(p, 58.5));
  assert.notEqual(build.totalDifferenceCents, 0);
}
{
  const { build } = convert(project());
  assert.equal(build.totalDifferenceCents, 0, 'sin descuentos, sin diferencia');
  assert.equal(build.totalDifferenceReason, null);
}

// --- (2) Recorte por puntos de código: un emoji en el límite no parte el par sustituto ----------------------------------
{
  const longEmoji = { ...exemptExtra, id: 'x-emoji', description: 'a'.repeat(499) + '😀' };
  const fits = { ...exemptExtra, id: 'x-fits', description: 'b'.repeat(498) + '😀' };
  const { value } = convert(project((x) => { x.financials = { ...x.financials, customItems: [longEmoji, fits] }; x.client.name = 'c'.repeat(254) + '😀'; }));
  const descriptions = value.items.map((l) => l.description);
  assert(descriptions.includes('a'.repeat(499)), 'el emoji que no cabe entero se quita');
  assert(descriptions.includes('b'.repeat(498) + '😀'), 'el que cabe se conserva');
  assert.equal(value.client.name, 'c'.repeat(254));
}

// --- (3) Más de 20 descuentos: los sobrantes se agrupan en «Otros descuentos» y la suma es exacta -----------------------
{
  const many: CustomQuotationDiscount[] = Array.from({ length: 21 }, (_, i) => ({ id: `d-${i}`, description: `Desc ${i + 1}`, type: 'fixed', value: 10 + i }));
  const p = project((x) => { x.financials = { ...x.financials, customDiscounts: many }; });
  const summary = calculateProjectFinancialSummary(p);
  const { value } = convert(p);
  assert.equal(value.discounts.length, 20);
  assert.equal(value.discounts[19].label, 'Otros descuentos (2)');
  assert.equal(value.discounts[19].value, (29 + 30) * 100);
  assert.equal(totals(value).discountCents, toCents(summary.listGrossInvestmentUSD - summary.grossInvestmentUSD));
  assert.equal(totals(value).totalCents, contractCents(p));
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
  assert(Math.abs(t.taxCents - toCents(summary.contractPriceUSD - summary.grossInvestmentUSD)) <= 1);
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
  assert(onlyItems.items.length > 0 && onlyItems.discounts.length === 2);
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

// --- Documentos: referencias reutilizables como «Solo relacionado»; sin referencia, se omiten -------------------------
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
