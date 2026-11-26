// Línea de cotización desde el catálogo de equipos (src/features/quotations/catalogLine.ts): precio con el resolvedor
// único (oferta utilizable → genérico → nada) y el margen de venta, moneda del documento y exención de ITBIS.
import assert from 'node:assert/strict';
import { validateQuotationContent, emptyQuotationContent } from '../../shared/quotations';
import { CATALOG_PRICE_NOTICES, catalogItemDescription, catalogQuotationLine } from '../features/quotations/catalogLine';
import type { SolarEquipmentItem } from '../types/equipment';

const item = (extra: Partial<SolarEquipmentItem>): SolarEquipmentItem => ({
  id: 'eq-bat', type: 'battery', brand: 'QA', modelSeries: 'B16', displayName: 'Batería QA 16 kWh', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});
const offer = (id: string, priceUSD: number, extra = {}) => ({ id, supplierName: `Proveedor ${id}`, priceUSD, updatedAt: '2026-01-01T00:00:00Z', ...extra });
const generic = { priceUSD: 80, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000001' };
const dop = { currency: 'DOP' as const, exchangeRate: 60, saleMarginMultiplier: 1.25 };
const newId = () => 'line-1';

// Oferta utilizable (la más barata) con el margen de venta, convertida a pesos con la tasa del documento.
const supplied = catalogQuotationLine(item({ supplierPrices: [offer('a', 120), offer('b', 100)] }), { ...dop, genericPrice: generic }, newId);
assert.equal(supplied.priceSource, 'supplier');
assert.equal(supplied.supplierName, 'Proveedor b');
assert.equal(supplied.line.unitPriceCents, 750000, '100 USD × 1.25 × 60 = RD$ 7,500.00');
assert.equal(supplied.notice, null);
assert.deepEqual({ ...supplied.line }, { id: 'line-1', kind: 'item', description: 'Batería QA 16 kWh', quantity: 1, unit: 'UD', unitPriceCents: 750000, discountPct: 0, taxable: true, catalogItemId: 'eq-bat' });

// La preferida gana aunque no sea la más barata; una agotada no cuenta.
assert.equal(catalogQuotationLine(item({ supplierPrices: [offer('a', 120), offer('b', 100)], preferredSupplierId: 'a' }), dop, newId).line.unitPriceCents, 900000);
const soldOut = catalogQuotationLine(item({ supplierPrices: [offer('a', 50, { stockStatus: 'out_of_stock' })] }), { ...dop, genericPrice: generic }, newId);
assert.equal(soldOut.priceSource, 'generic');

// Sin oferta: precio genérico (con el mismo margen), señalado.
assert.equal(soldOut.line.unitPriceCents, 600000, '80 USD × 1.25 × 60');
assert.equal(soldOut.notice, CATALOG_PRICE_NOTICES.generic);
assert.equal(CATALOG_PRICE_NOTICES.generic, 'precio genérico, sin proveedor');

// Sin ninguno: precio 0 y se indica.
const none = catalogQuotationLine(item({}), dop, newId);
assert.equal(none.priceSource, 'none');
assert.equal(none.line.unitPriceCents, 0);
assert.equal(none.notice, CATALOG_PRICE_NOTICES.none);

// Documento en dólares: sin conversión.
assert.equal(catalogQuotationLine(item({ supplierPrices: [offer('a', 100)] }), { ...dop, currency: 'USD' }, newId).line.unitPriceCents, 12500);
// Otra tasa del documento.
assert.equal(catalogQuotationLine(item({ supplierPrices: [offer('a', 100)] }), { ...dop, exchangeRate: 58.5 }, newId).line.unitPriceCents, 731250);

// Paneles e inversores sin ITBIS; baterías gravadas.
assert.equal(catalogQuotationLine(item({ type: 'panel', powerW: 600 }), dop, newId).line.taxable, false);
assert.equal(catalogQuotationLine(item({ type: 'inverter', powerKW: 8 }), dop, newId).line.taxable, false);
assert.equal(catalogQuotationLine(item({ type: 'battery' }), dop, newId).line.taxable, true);

// Descripción: el nombre visible del catálogo; sin él, marca y serie.
assert.equal(catalogItemDescription(item({ displayName: '  Módulos JAM 550 W ' })), 'Módulos JAM 550 W');
assert.equal(catalogItemDescription(item({ displayName: '' })), 'QA B16');
assert.equal(catalogItemDescription(item({ displayName: 'x'.repeat(600) })).length, 500, 'se recorta al tope de la descripción');

// El resultado es contenido válido.
const content = emptyQuotationContent('2026-11-26', { exchangeRate: 60, items: [supplied.line, { ...none.line, id: 'line-2' }] });
assert.ok(validateQuotationContent(content).ok);

console.log('Quotation catalog line tests passed.');
