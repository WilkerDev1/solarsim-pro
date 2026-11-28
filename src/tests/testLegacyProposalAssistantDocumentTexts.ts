// LEGADO: se elimina en F6 junto con el modal ai-invoice (ProposalDocumentTextsReview), draftDocumentTexts y la herramienta apply_proposal_draft (fuente proposal-assistant).
// Lo que de testAIDocumentTexts solo prueba el asistente de propuestas: revisión de textos, catálogo del borrador nuevo, texto visto parcialmente y aplicación del borrador.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { aiDocumentTextCatalog } from '../../shared/documentTexts/aiDraft';
import { resolveDocumentText } from '../../shared/documentTexts';
import { processExtractedInvoice } from '../utils/aiProposalNormalization';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { documentTextContextFor } from '../utils/documentTextContext';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { draftDocumentTextCatalog } from '../utils/draftDocumentTexts';
import { ProposalDocumentTextsReview } from '../components/common/ai-invoice/components/ProposalDocumentTextsReview';
import type { ProjectSimulation } from '../types';

// Mismo estado, propuesta abierta y borrador de partida que testAIDocumentTexts.

const store = useSimulationStore;
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const open = { ...structuredClone(BENCHMARK_PROJECT), id: 'doc-ai-open', status: 'Draft' as const, syncStatus: 'local_only' as const };
store.setState({ workspaceScope: 'local', projects: [open], activeProjectId: open.id, activeView: 'pdf-preview', equipmentCatalog: catalog, deletedEquipmentIds: [],
  sessionGeneration: 0, agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], appAssistantEnabled: true,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });

const textOf = (project: ProjectSimulation, key: string) => resolveDocumentText(key, project, documentTextContextFor(store.getState(), project, 'legacy')).text;
const byId = (id: string) => store.getState().projects.find((p) => p.id === id)!;
const WARRANTIES = {
  'quotation.warranty.panel': '12 Años de Garantía de Producto',
  'quotation.warranty.inverter': '10 Años de Fábrica',
  'quotation.warranty.battery': '8 Años (según fabricante)',
  'quotation.warranty.workmanship': '2 Años en Instalación y Soporte Técnico',
};
// 2. La respuesta con garantías concretas llega normalizada al borrador (y se descartan claves inválidas con aviso).
const tariffReference = buildAITariffContext(store.getState().tariffMatrix);
const context = { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference };
const raw = {
  responseKind: 'draft', assistantMessage: 'Actualicé las garantías.', clientName: 'Garantías QA', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
  averageMonthlyKWh: 700, consumptionSource: 'estimated', dopExchangeRate: 60, energyCostPerKWhDOP: 12,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: 28, marginOnSalePct: null, installationUnitPriceUSD: 150, installationTotalUSD: null, customItems: [], customDiscounts: [] },
  documentTexts: [
    ...Object.entries(WARRANTIES).map(([key, text]) => ({ key, text })),
    { key: 'quote.validityDays', text: '15 días' },
    { key: 'quotation.noExiste', text: 'x' },
    { key: 'client.phone', text: '809-000-0000' },
  ],
};
const draft = processExtractedInvoice(JSON.stringify(raw), { equipmentCatalog: catalog, context });

// La revisión de textos del documento (UI del modal), el catálogo de textos del borrador nuevo, el texto visto parcialmente y la
// aplicación con apply_proposal_draft (fuente proposal-assistant), con su deshacer.
const longNote = 'Términos y condiciones. '.repeat(100).trim();
const longProject = { ...open, customization: { ...open.customization, validityNote: longNote } };
const fullCatalog = aiDocumentTextCatalog(longProject, documentTextContextFor(store.getState(), longProject, 'legacy'));
// 2b. La revisión del borrador muestra los cambios de texto antes de aplicarlos.
const reviewHtml = renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft, update: () => {} }));
assert.match(reviewHtml, /Textos del documento/);
assert.match(reviewHtml, /Garantía de paneles/);
assert.match(reviewHtml, /12 Años de Garantía de Producto/);
assert.equal(renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft: { ...draft, documentTexts: [] }, update: () => {} })), '');
{
  // Sin textos pero con avisos el destino del enlace del resumen existe y muestra los avisos.
  const html = renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft: { ...draft, documentTexts: [] }, update: () => {}, issues: [{ code: 'unknown_document_text', severity: 'warning', tier: 'info', message: 'El documento no tiene el texto «x».' }] as never }));
  assert.match(html, /id="proposal-document-texts"/);
  assert.match(html, /El documento no tiene el texto/);
  assert.doesNotMatch(html, /0 cambios/);
}
// Para una propuesta nueva el contexto sale de la plantilla de la empresa activa.
assert(draftDocumentTextCatalog(store.getState(), undefined, 'Santiago').some((t) => t.key === 'quotation.warranty.inverter'));
const partial = processExtractedInvoice(JSON.stringify({ ...raw, documentTexts: [{ key: 'quotation.validityNote', text: 'Nuevo término.' }, { key: 'quotation.warranty.panel', text: '12 años' }] }),
  { equipmentCatalog: catalog, context: { ...context, documentTexts: fullCatalog } });
assert.equal(partial.documentTexts?.find((t) => t.key === 'quotation.validityNote')?.partial, true);
assert.equal(partial.documentTexts?.find((t) => t.key === 'quotation.warranty.panel')?.partial, undefined);
assert(partial.validationIssues?.some((i) => i.code === 'document_text_seen_partially' && i.severity === 'warning'));
assert.equal(normalizeProposalDraft(partial, catalog, context).documentTexts?.find((t) => t.key === 'quotation.validityNote')?.partial, true, 'el aviso sobrevive a la revisión');
assert.match(renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft: partial, update: () => {} })), /solo vio el inicio de este texto/);
// 3d. Propuesta nueva: los textos que dependen del proyecto no muestran cifras del caso de referencia.
const newCatalog = draftDocumentTextCatalog(store.getState(), undefined, 'Santiago');
for (const key of ['projectDescription.paragraph1', 'projectDescription.paragraph2', 'projectDescription.subtitle', 'projectDescription.regulatoryNote', 'quotation.validityNote', 'client.contact', 'quote.validityDays']) {
  const entry = newCatalog.find((t) => t.key === key)!;
  assert.equal(entry.text, undefined, key);
  assert.equal(entry.dynamic, true, key);
}
assert(!JSON.stringify(newCatalog).includes(BENCHMARK_PROJECT.client.name), 'sin datos del caso de referencia');
assert.equal(newCatalog.find((t) => t.key === 'quotation.warranty.panel')?.text, '25 Años de Producción Lineal');
// 4. Crear una propuesta nueva: los textos llegan al documento por el escritor del registro.
const ctx = () => ({ source: 'proposal-assistant' as const, owner: assistantOwner() });
const created = await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: true } }, ctx());
assert(created.status === 'applied', JSON.stringify(created));
const createdProject = store.getState().getActiveProject();
for (const [key, text] of Object.entries(WARRANTIES)) assert.equal(textOf(createdProject, key), text, key);
assert.equal(createdProject.customization?.panelWarrantyText, WARRANTIES['quotation.warranty.panel'], 'se guarda en el campo heredado (visor y 2.6.x)');
assert.equal(createdProject.client.quoteValidityDays, 15, 'la vigencia vive en client');
assert(store.getState().agentActivity[0].changes.some((c) => c.label === 'Garantía de paneles'), 'la actividad muestra el cambio de texto');

// 5. Actualizar la propuesta abierta («Usar datos de SP-XXXX») y deshacer.
store.setState({ projects: [open], activeProjectId: open.id, activeView: 'simulator' });
const updated = await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: draft as unknown as Record<string, unknown>, createNew: false } }, ctx());
assert(updated.status === 'applied', JSON.stringify(updated));
assert.equal(textOf(byId(open.id), 'quotation.warranty.inverter'), WARRANTIES['quotation.warranty.inverter']);
assert.equal(textOf(byId(open.id), 'quotation.warranty.workmanship'), WARRANTIES['quotation.warranty.workmanship']);
assert.equal(store.getState().undoAgentActivity(updated.activityId).success, true);
assert.equal(textOf(byId(open.id), 'quotation.warranty.panel'), '25 Años de Producción Lineal', 'deshacer devuelve los textos');
assert.equal(byId(open.id).client.quoteValidityDays, open.client.quoteValidityDays);

// 6. Un borrador con un restablecimiento (text null) vuelve al texto predeterminado.
store.setState({ projects: [{ ...open, customization: { ...open.customization, panelWarrantyText: 'Personalizado' } }] });
const reset = normalizeProposalDraft({ ...raw, documentTexts: [{ key: 'quotation.warranty.panel', text: null }] }, catalog, context);
assert((await executeAgentTool({ name: 'apply_proposal_draft', args: { draft: reset as unknown as Record<string, unknown>, createNew: false } }, ctx())).status === 'applied');
assert.equal(textOf(byId(open.id), 'quotation.warranty.panel'), '25 Años de Producción Lineal');
console.log('PASS (legado): proposal assistant document texts: review, draft catalog, partial text and apply_proposal_draft.');