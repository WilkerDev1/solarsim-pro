// LEGADO: se elimina en F6 junto con el modal ai-invoice (ProposalCommercialReview).
// Lo que de testAIProposalGenericPrice (sección «Revisión») solo prueba la etiqueta del precio genérico en la revisión del asistente de propuestas.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeProposalDraft, type AIProposalContext } from '../../shared/aiProposal';
import type { GenericPriceInfo } from '../../shared/equipmentPrices';
import type { SolarEquipmentItem } from '../types/equipment';
import { ProposalCommercialReview } from '../components/common/ai-invoice/components/ProposalCommercialReview';

const item = (over: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'QA', modelSeries: over.id, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over }) as SolarEquipmentItem;
const offer = (id: string, supplierName: string, priceUSD: number, extra: Record<string, unknown> = {}) => ({ id, supplierName, priceUSD, updatedAt: '2026-11-01', ...extra });
const generic = (priceUSD: number, observationId = 'po-00000000-0000-4000-8000-000000000001'): GenericPriceInfo => ({ priceUSD, observedAt: '2026-11-10T00:00:00.000Z', observationId });

const panel = item({ id: 'pan-1', type: 'panel', displayName: 'Panel Genérico 600', powerW: 600 });
const inverter = item({ id: 'inv-1', type: 'inverter', displayName: 'Inversor Oferta 8', powerKW: 8, supplierPrices: [offer('o-1', 'Alfa', 1200)] as SolarEquipmentItem['supplierPrices'] });
const battery = item({ id: 'bat-1', type: 'battery', displayName: 'Batería Sin Precio', capacityKWh: 10 });
const catalog = [panel, inverter, battery];
const context: AIProposalContext = { province: 'Santiago', genericPrices: { 'pan-1': generic(95), 'inv-1': generic(999) } };
const raw = {
  clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS2', monthlyConsumptionKWh: Array(12).fill(500), consumptionSource: 'observed',
  panels: [{ equipmentId: 'pan-1', quantity: 10 }], inverters: [{ equipmentId: 'inv-1', quantity: 1 }], batteries: [{ equipmentId: 'bat-1', quantity: 1 }], hasBattery: true, commercial: {},
};
const first = normalizeProposalDraft(raw, catalog, context);
// --- Revisión: etiqueta propia, no «Oferta del inventario». ---
const reviewHtml = renderToStaticMarkup(React.createElement(ProposalCommercialReview, { draft: first, update: () => {} }));
assert.match(reviewHtml, /Precio genérico \(sin proveedor\)/);
assert.match(reviewHtml, /Oferta del inventario/, 'el inversor con oferta conserva su etiqueta');
console.log('PASS (legado): la revisión del asistente de propuestas etiqueta el precio genérico.');