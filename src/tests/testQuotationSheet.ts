// Hoja A4 de la cotización (src/components/quotations/sheet/): caso real de referencia en las tres disposiciones, con y
// sin logo y sello, y guarda de las reglas html2canvas sobre el código fuente.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyQuotationContent, type QuotationContent, type QuotationLine } from '../../shared/quotations';
import { QUOTATION_SHEET_TEXTS, formatSheetDate, formatQuantity } from '../../shared/quotations/sheetTexts';
import { QuotationSheet } from '../components/quotations/sheet/QuotationSheet';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const SEAL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const line = (n: number, description: string, quantity: number, unit: string, unitPriceCents: number): QuotationLine => ({
  id: `l-${n}`, kind: 'item', description, quantity, unit, unitPriceCents, discountPct: 0, taxable: true,
});
const reference: QuotationContent = emptyQuotationContent('2026-11-23', {
  exchangeRate: 60,
  validUntil: '2026-11-30',
  seller: 'Mayler Capellán',
  projectLabel: 'Alimentación de planta eléctrica',
  paymentTerms: 'Pago del 70% con la orden y 30% al concluir.',
  client: { name: 'Sr. Miguel Bona', attention: 'Sr. Miguel Bona', taxId: '', phone: '829-696-9863', email: '', address: '' },
  issuer: { name: 'M&A Electsun SRL', taxId: '1-32-04088-2', address: 'Calle Ercilia Pepín No. 1, Plaza Toledo', phone: '809-378-6590', email: 'info@electsun.com.do', website: 'electsun.com.do', logo: PNG },
  items: [
    line(1, 'Pies alambre 10.0 mm² negro para alimentación de planta', 250, 'pies', 3920),
    line(2, 'Breaker europeo 63 A / 2P', 1, 'UD', 98000),
    line(3, 'Breaker doble tiro de 100 A / 6P', 1, 'UD', 600000),
    line(4, 'Pies cable UTP cat. 5 blindado', 150, 'pies', 1200),
    line(5, 'Pies tubería LQT de 3/4 y accesorios', 50, 'pies', 6800),
    line(6, 'Mano de obra y gastos operativos', 1, 'UD', 850000),
  ],
});
const render = (content: QuotationContent, number: string | null = 'COT-2026-0147', stampImage?: string) =>
  renderToStaticMarkup(React.createElement(QuotationSheet, { quotation: { ...content, number }, stampImage }));

for (const layout of ['clasica', 'banda', 'minimal'] as const) {
  for (const typography of ['sans', 'serif'] as const) {
    const content = { ...reference, design: { ...reference.design, layout, typography } };
    for (const withLogo of [true, false]) {
      for (const withStamp of [true, false]) {
        const label = `${layout}/${typography}/${withLogo ? 'logo' : 'sin logo'}/${withStamp ? 'sello' : 'sin sello'}`;
        const html = render({ ...content, issuer: { ...content.issuer, logo: withLogo ? PNG : '' } }, 'COT-2026-0147', withStamp ? SEAL : undefined);
        for (const amount of ['30,480.00', '5,486.40', '35,966.40', '9,800.00', '39.20']) assert.ok(html.includes(amount), `${label}: contiene ${amount}`);
        assert.ok(html.includes('COT-2026-0147'), `${label}: número`);
        assert.ok(html.includes(QUOTATION_SHEET_TEXTS.title), `${label}: título`);
        assert.ok(html.includes(QUOTATION_SHEET_TEXTS.itbis), `${label}: etiqueta de ITBIS`);
        assert.ok(html.includes('Página 1 de 1'), `${label}: pie`);
        assert.ok(html.includes('data-quotation-page="1"'), `${label}: página marcada para exportar`);
        assert.equal(html.includes(PNG), withLogo, `${label}: logo`);
        assert.equal(html.includes(SEAL), withStamp, `${label}: sello`);
        assert.ok(html.includes('Mayler Capellán') && html.includes(QUOTATION_SHEET_TEXTS.quotedBy) && html.includes(QUOTATION_SHEET_TEXTS.receivedBy), `${label}: firmas`);
        assert.ok(html.includes('Sr. Miguel Bona') && html.includes('M&amp;A Electsun SRL'), `${label}: De y Para`);
        assert.ok(html.includes('Alimentación de planta eléctrica') && html.includes('Pago del 70% con la orden'), `${label}: proyecto y condiciones`);
        assert.ok(html.includes('width:850px') && html.includes('height:1202px'), `${label}: A4 de 850×1202`);
        if (!withLogo) assert.ok(!html.includes('<img alt="Logo'), `${label}: sin logo no hay imagen de logo`);
        if (typography === 'serif') assert.ok(html.includes('Georgia'), `${label}: títulos con serif`);
      }
    }
  }
}

// La disposición banda pinta la cabecera con el acento.
assert.ok(render({ ...reference, design: { ...reference.design, layout: 'banda', accent: '#1f3fb4' } }).includes('background:#1f3fb4'));
// Una referencia asset:sha256: sin resolver se omite sin romper el diseño (se ve el nombre del emisor).
const assetRef = render({ ...reference, issuer: { ...reference.issuer, logo: `asset:sha256:${'a'.repeat(64)}` } });
assert.ok(!assetRef.includes('asset:sha256:'));
assert.ok(assetRef.includes('35,966.40'));
// Sin sello pedido en el diseño no se pinta aunque exista.
assert.ok(!render({ ...reference, design: { ...reference.design, showStamp: false } }, 'COT-2026-0147', SEAL).includes(SEAL));
// Sin número: «Borrador».
assert.ok(render(reference, null).includes(QUOTATION_SHEET_TEXTS.draftNumber));
// Líneas descriptivas sin precio; descuentos globales visibles.
const withDetail = render({
  ...reference,
  items: [...reference.items, { id: 'd', kind: 'detail', description: 'Incluye canalización y pruebas', quantity: 0, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false }],
  discounts: [{ id: 'g', label: 'Pronto pago', type: 'fixed', value: 48000 }],
});
assert.ok(withDetail.includes('Incluye canalización y pruebas'));
assert.ok(withDetail.includes('Pronto pago') && withDetail.includes('-480.00'));
// Documento en dólares.
assert.ok(render({ ...reference, currency: 'USD' }).includes('US$'));
// Varias páginas: «Página X de N» en cada una.
const many = render({ ...reference, items: Array.from({ length: 60 }, (_, i) => line(i + 1, `Ítem ${i + 1}`, 1, 'UD', 1000)) });
const pageCount = (many.match(/data-quotation-page="/g) ?? []).length;
assert.ok(pageCount >= 2);
assert.ok(many.includes(`Página ${pageCount} de ${pageCount}`));

// Textos y formatos.
assert.equal(QUOTATION_SHEET_TEXTS.itbis, 'ITBIS 18%');
assert.equal(formatSheetDate('2026-11-23'), '23 nov 2026');
assert.equal(formatSheetDate(null), QUOTATION_SHEET_TEXTS.noValidity);
assert.equal(formatQuantity(250), '250');
assert.equal(formatQuantity(1234.5), '1,234.5');
assert.equal(formatQuantity(0.125), '0.125');

// Guarda html2canvas: nada de recortes de texto ni la tasa de ITBIS escrita a mano en la hoja.
const sheetDir = path.join(process.cwd(), 'src/components/quotations/sheet');
const files = readdirSync(sheetDir, { recursive: true }).map(String).filter((f) => /\.(ts|tsx|css)$/.test(f));
assert.ok(files.length >= 1);
const FORBIDDEN = [/\btruncate\b/, /overflow-hidden/, /line-clamp/, /overflow\s*:\s*['"]?hidden/, /text-overflow/, /0\.18/];
for (const file of files) {
  const source = readFileSync(path.join(sheetDir, file), 'utf8');
  for (const pattern of FORBIDDEN) assert.ok(!pattern.test(source), `${file}: ${pattern} no se admite en la hoja (reglas html2canvas / ITBIS_RATE)`);
}
// el detector funciona
for (const bad of ['className="truncate"', 'className="overflow-hidden"', 'line-clamp-2', "style={{ overflow: 'hidden' }}", 'rate = 0.18']) {
  assert.ok(FORBIDDEN.some((p) => p.test(bad)), `debería detectar: ${bad}`);
}

console.log('Quotation sheet tests passed.');
