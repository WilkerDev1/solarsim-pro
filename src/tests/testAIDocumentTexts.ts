// La IA integrada cambia datos que viven en textos del documento (garantías, vigencia, condiciones…)
// por los dos caminos: el asistente general (function calling) y el borrador del asistente de propuestas.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { buildProposalRequest, normalizeProposalDraft, PROPOSAL_JSON_SCHEMA, PROPOSAL_SYSTEM_INSTRUCTION } from '../../shared/aiProposal';
import { aiDocumentTextCatalog, AI_DRAFT_DOCUMENT_TEXT_KEYS } from '../../shared/documentTexts/aiDraft';
import { resolveDocumentText } from '../../shared/documentTexts';
import { AGENT_RULES_ES, assistantSystemPrompt } from '../../shared/agentTools/rules';
import { processExtractedInvoice } from '../utils/aiProposalNormalization';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { documentTextContextFor } from '../utils/documentTextContext';
import { executeAgentTool, executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { assistantProjectId, assistantVisibleIn } from '../features/assistant/assistantScope';
import { runAssistant } from '../features/assistant/service';
import { draftDocumentTextCatalog } from '../utils/draftDocumentTexts';
import { ProposalDocumentTextsReview } from '../components/common/ai-invoice/components/ProposalDocumentTextsReview';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GeminiTransport } from '../../shared/geminiTransport';
import type { ProjectSimulation } from '../types';

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

// ── Camino (b): borrador del asistente de propuestas ─────────────────────────
// 1. El modelo recibe las claves (clave, etiqueta, valor actual) y puede devolverlas en el esquema.
assert(AI_DRAFT_DOCUMENT_TEXT_KEYS.includes('quotation.warranty.panel'));
assert(AI_DRAFT_DOCUMENT_TEXT_KEYS.includes('quote.validityDays'), 'vigencia');
assert(AI_DRAFT_DOCUMENT_TEXT_KEYS.includes('quotation.servicesIncluded'), 'alcance/condiciones');
assert(!AI_DRAFT_DOCUMENT_TEXT_KEYS.includes('client.phone'), 'los campos propios del borrador no se duplican');
assert(!AI_DRAFT_DOCUMENT_TEXT_KEYS.some((k) => k.startsWith('page.') || k.startsWith('toc.') || k.startsWith('costMatrix.')), 'sin etiquetas fijas');
const catalogForAI = aiDocumentTextCatalog(open, documentTextContextFor(store.getState(), open, 'legacy'));
assert.deepEqual(catalogForAI.find((t) => t.key === 'quotation.warranty.panel'), { key: 'quotation.warranty.panel', label: 'Garantía de paneles', text: '25 Años de Producción Lineal' });
assert(JSON.stringify(catalogForAI).length < 8000, `contexto acotado (${JSON.stringify(catalogForAI).length} bytes)`);
assert(PROPOSAL_JSON_SCHEMA.properties.documentTexts, 'el esquema de respuesta admite textos del documento');
assert.match(PROPOSAL_SYSTEM_INSTRUCTION, /documentTexts/);
const request = buildProposalRequest({ projectRequirementsText: 'Garantía de 12 años en paneles', equipmentCatalog: catalog, context: { documentTexts: catalogForAI } });
assert(request.contents[0].parts[0].text.includes('quotation.warranty.panel'));

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
assert.equal(draft.requiresReview, false, JSON.stringify(draft.validationIssues));
assert.deepEqual(draft.documentTexts?.map((t) => [t.key, t.text]), [...Object.entries(WARRANTIES), ['quote.validityDays', '15']]);
assert.equal(draft.documentTexts?.[0].label, 'Garantía de paneles');
assert(draft.validationIssues?.some((i) => i.code === 'unknown_document_text' && i.severity === 'warning'));
assert(draft.validationIssues?.some((i) => i.code === 'document_text_is_draft_field'));

// 2b. La revisión del borrador muestra los cambios de texto antes de aplicarlos.
const reviewHtml = renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft, update: () => {} }));
assert.match(reviewHtml, /Textos del documento/);
assert.match(reviewHtml, /Garantía de paneles/);
assert.match(reviewHtml, /12 Años de Garantía de Producto/);
assert.equal(renderToStaticMarkup(createElement(ProposalDocumentTextsReview, { draft: { ...draft, documentTexts: [] }, update: () => {} })), '');
// Para una propuesta nueva el contexto sale de la plantilla de la empresa activa.
assert(draftDocumentTextCatalog(store.getState(), undefined, 'Santiago').some((t) => t.key === 'quotation.warranty.inverter'));

// 3. Una nueva vuelta de conversación sin documentTexts conserva los del borrador; [] los quita.
const revised = normalizeProposalDraft({ ...raw, documentTexts: undefined, clientName: 'Garantías QA 2' }, catalog, { ...context, currentDraft: draft });
assert.equal(revised.documentTexts?.length, 5);
assert.equal(normalizeProposalDraft({ ...raw, documentTexts: [] }, catalog, { ...context, currentDraft: draft }).documentTexts?.length, 0);
assert.deepEqual(normalizeProposalDraft(draft, catalog, context).documentTexts, draft.documentTexts, 'idempotente');

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

// ── Camino (a): asistente general en la vista del documento (modo edición) ──
store.setState({ projects: [open], activeProjectId: open.id, activeView: 'pdf-preview', agentActivity: [] });
assert(assistantVisibleIn('pdf-preview'), 'el asistente está disponible en la vista del documento');
assert.equal(assistantProjectId('pdf-preview', open.id), open.id, 'y conoce la propuesta abierta');
assert.equal(assistantProjectId('dashboard', open.id), undefined);
assert.match(AGENT_RULES_ES, /set_document_text/, 'las reglas distinguen textos del documento de datos del proyecto');
assert.match(assistantSystemPrompt(open.id, 'pdf-preview'), /documento/i);

// 7. Descubrir claves con un filtro de texto (contexto mínimo) y fijar varias en una sola acción con deshacer.
const listed = await executeAgentTool({ name: 'list_document_texts', args: { proposalId: open.id, query: 'garantia' } }, { source: 'app-assistant', owner: assistantOwner() });
assert(listed.status === 'ok');
const keys = (listed.data as { texts: { key: string }[] }).texts.map((t) => t.key);
for (const key of Object.keys(WARRANTIES)) assert(keys.includes(key), key);
assert(keys.length <= 12, `filtro acotado: ${keys.join(', ')}`);

const seen: string[] = [];
const transport: GeminiTransport = async (_url, body: any) => {
  seen.push(body.systemInstruction.parts[0].text);
  const last = body.contents.at(-1).parts[0];
  if (!last.functionResponse) {
    return { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ functionCall: { name: 'set_document_texts', args: {
      proposalId: open.id, texts: Object.entries(WARRANTIES).map(([key, text]) => ({ key, text })),
    } } }] } }] };
  }
  assert.equal(last.functionResponse.response.error, undefined, JSON.stringify(last.functionResponse));
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Listo: garantías actualizadas.' }] } }] };
};
const reply = await runAssistant({
  apiKey: 'synthetic-key', model: 'gemini-synthetic', prompt: 'Pon 12 años de garantía en paneles, 10 en el inversor, 8 en baterías y 2 en mano de obra',
  history: [], activeProjectId: open.id, activeView: 'pdf-preview', signal: new AbortController().signal, transport,
  execute: (call) => executeForAssistant(call, { source: 'app-assistant', owner: assistantOwner() }),
});
assert.match(seen[0], new RegExp(open.id), 'el modelo sabe qué propuesta está abierta');
assert.match(seen[0], /documento/i, 'y que el usuario está en el documento');
assert.equal(reply.applied?.length, 1, 'un solo cambio aplicado con deshacer');
for (const [key, text] of Object.entries(WARRANTIES)) assert.equal(textOf(byId(open.id), key), text, key);
assert.equal(store.getState().undoAgentActivity(reply.applied![0].activityId).success, true);
assert.equal(textOf(byId(open.id), 'quotation.warranty.panel'), '25 Años de Producción Lineal');

console.log('PASS: la IA fija textos del documento (garantías, vigencia) en el borrador y en el chat, con revisión y deshacer.');
