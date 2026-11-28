// Propuestas automáticas con precio genérico (ADR 0006 §5): un solo resolvedor (oferta → genérico → nada), el genérico es
// automático como la oferta (se recalcula en cada normalización y nunca se vuelve manual) y se avisa en la revisión.
import assert from 'node:assert/strict';
import { buildProposalRequest, draftForPrompt, normalizeProposalDraft, type AIProposalContext } from '../../shared/aiProposal';
import { AGENT_RULES_ES } from '../../shared/agentTools/rules';
import { AGENT_TOOL_DEFINITIONS as AGENT_TOOLS } from '../../shared/agentTools/definitions';
import type { GenericPriceInfo } from '../../shared/equipmentPrices';
import type { SolarEquipmentItem } from '../types/equipment';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

// --- Oferta → genérico → nada; el genérico no tiene proveedor y lleva su copia. ---
const first = normalizeProposalDraft(raw, catalog, context);
const [p] = first.panels!;
assert.equal(p.unitPriceUSD, 95, 'sin oferta usa el precio genérico');
assert.equal(p.priceSource, 'generic');
assert.deepEqual(p.genericPriceInfo, generic(95));
assert.equal(p.selectedSupplierInfo, undefined, 'un precio genérico no tiene proveedor');
assert.equal(first.inverters![0].unitPriceUSD, 1200, 'la oferta gana sobre el genérico');
assert.equal(first.inverters![0].priceSource, 'supplier');
assert.equal(first.inverters![0].genericPriceInfo, undefined);
assert.equal(first.batteries![0].unitPriceUSD, undefined, 'sin oferta ni genérico queda sin precio');
assert.equal(first.autoSupplierPricing, true, 'un grupo genérico no apaga el precio automático');
const warning = first.validationIssues!.find((issue) => issue.code === 'generic_panel_price');
assert.ok(warning, 'aviso generic_panel_price');
assert.equal(warning!.severity, 'warning');
assert.match(warning!.message, /precio genérico, sin proveedor/);
assert.equal(first.validationIssues!.some((issue) => issue.code === 'missing_panel_price'), false, 'el genérico no es «sin precio»');
assert.ok(first.validationIssues!.some((issue) => issue.code === 'missing_battery_price'));
assert.equal(first.validationIssues!.some((issue) => issue.code === 'generic_inverter_price'), false);

// --- Idempotente: normalizar lo normalizado no lo vuelve manual. ---
const second = normalizeProposalDraft(first, catalog, context);
assert.deepEqual(second.panels, first.panels, 'normalizar dos veces es idempotente');
assert.equal(second.autoSupplierPricing, true);
const third = normalizeProposalDraft(second, catalog, { ...context, currentDraft: second });
assert.deepEqual(third.panels, first.panels, 'con el borrador vigente como contexto sigue siendo genérico');

// --- Se recalcula: el genérico cambia o llega una oferta después. ---
const repriced = normalizeProposalDraft(first, catalog, { ...context, genericPrices: { 'pan-1': generic(90, 'po-00000000-0000-4000-8000-000000000002') } });
assert.equal(repriced.panels![0].unitPriceUSD, 90, 'el genérico se recalcula en cada normalización');
const withOffer = [item({ ...panel, supplierPrices: [offer('o-9', 'Beta', 88)] as SolarEquipmentItem['supplierPrices'] }), inverter, battery];
const offered = normalizeProposalDraft(first, withOffer, context);
assert.equal(offered.panels![0].unitPriceUSD, 88, 'una oferta añadida después gana');
assert.equal(offered.panels![0].priceSource, 'supplier');
assert.equal(offered.panels![0].genericPriceInfo, undefined);
assert.equal(offered.panels![0].selectedSupplierInfo?.supplierName, 'Beta');
const outOfStock = [item({ ...panel, supplierPrices: [offer('o-9', 'Beta', 88, { stockStatus: 'out_of_stock' })] as SolarEquipmentItem['supplierPrices'] }), inverter, battery];
assert.equal(normalizeProposalDraft(first, outOfStock, context).panels![0].priceSource, 'generic', 'una oferta agotada no gana');
const noGeneric = normalizeProposalDraft(first, catalog, { province: 'Santiago' });
assert.equal(noGeneric.panels![0].unitPriceUSD, undefined, 'sin genérico (modo local) no queda precio arrastrado');
assert.notEqual(noGeneric.panels![0].priceSource, 'manual');

// --- Lo manual sigue manual. ---
const manual = normalizeProposalDraft({ ...first, panels: [{ ...first.panels![0], unitPriceUSD: 80, priceSource: 'manual' }] }, catalog, context);
assert.equal(manual.panels![0].unitPriceUSD, 80);
assert.equal(manual.panels![0].priceSource, 'manual');
assert.equal(manual.panels![0].genericPriceInfo, undefined);
assert.equal(manual.autoSupplierPricing, false);
assert.equal(normalizeProposalDraft(manual, catalog, context).panels![0].unitPriceUSD, 80, 'manual idempotente');

// --- Precios de contexto de una propuesta existente: solo los manuales se reutilizan como manuales. ---
const ctxGeneric = normalizeProposalDraft(raw, catalog, { ...context, equipmentPrices: [{ id: 'pan-1', unitPriceUSD: 70, priceSource: 'generic' }] });
assert.equal(ctxGeneric.panels![0].priceSource, 'generic', 'un genérico de contexto no se congela como manual');
assert.equal(ctxGeneric.panels![0].unitPriceUSD, 95);
const ctxSupplier = normalizeProposalDraft(raw, catalog, { ...context, equipmentPrices: [{ id: 'inv-1', unitPriceUSD: 1500, priceSource: 'supplier' }] });
assert.equal(ctxSupplier.inverters![0].unitPriceUSD, 1200, 'una oferta de contexto se recalcula');
const ctxManual = normalizeProposalDraft(raw, catalog, { ...context, equipmentPrices: [{ id: 'pan-1', unitPriceUSD: 70, priceSource: 'manual' }] });
assert.equal(ctxManual.panels![0].unitPriceUSD, 70);
assert.equal(ctxManual.panels![0].priceSource, 'manual');

// --- Prompt: el catálogo marca el genérico; el borrador no reenvía precio ni fuente de los grupos genéricos; el mapa no viaja en el contexto. ---
const request = buildProposalRequest({ projectRequirementsText: 'Sigue', equipmentCatalog: catalog, context: { ...context, currentDraft: first } });
const stable = JSON.parse(request.contents[0].parts[0].text!);
const panelEntry = stable.catalog.find((entry: { id: string }) => entry.id === 'pan-1');
assert.equal(panelEntry.priceUSD, 95);
assert.equal(panelEntry.priceKind, 'generic');
assert.equal(panelEntry.supplier, undefined);
const inverterEntry = stable.catalog.find((entry: { id: string }) => entry.id === 'inv-1');
assert.equal(inverterEntry.priceUSD, 1200);
assert.equal(inverterEntry.supplier, 'Alfa');
assert.equal(inverterEntry.priceKind, undefined);
assert.equal(request.contents[0].parts[1].text!.includes('genericPrices'), false, 'el mapa de genéricos no va en el contexto del proyecto');
const sent = JSON.parse(request.contents[0].parts.at(-1)!.text!).currentDraft;
assert.equal('unitPriceUSD' in sent.panels[0], false, 'sin precio del grupo genérico');
assert.equal('priceSource' in sent.panels[0], false, 'sin fuente del grupo genérico');
assert.equal(sent.inverters[0].unitPriceUSD, 1200);
assert.equal(sent.inverters[0].priceSource, 'supplier');
assert.equal('genericPriceInfo' in (draftForPrompt(first)!.panels as Record<string, unknown>[])[0], false);


// --- Política para los agentes: ofertas primero, genérico como respaldo etiquetado, nunca inventar. ---
assert.match(AGENT_RULES_ES, /precio genérico/);
const createProposal = AGENT_TOOLS.find((tool) => tool.name === 'create_proposal')!;
assert.match(createProposal.description, /precio genérico/);
console.log('PASS: propuestas automáticas con precio genérico (resolvedor único, idempotencia, aviso y políticas).');
