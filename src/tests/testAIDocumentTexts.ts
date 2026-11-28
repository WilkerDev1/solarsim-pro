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
import { AGENT_RULES_ES, assistantTurnContext } from '../../shared/agentTools/rules';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { documentTextContextFor } from '../utils/documentTextContext';
import { executeAgentTool, executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { assistantProjectId, assistantVisibleIn } from '../features/assistant/assistantScope';
import { runAssistant } from '../features/assistant/service';
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
assert(request.contents[0].parts[1].text.includes('quotation.warranty.panel'), 'los textos del documento van en el contexto estable del proyecto');

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
const draft = normalizeProposalDraft(raw, catalog, context);
assert.equal(draft.requiresReview, false, JSON.stringify(draft.validationIssues));
assert.deepEqual(draft.documentTexts?.map((t) => [t.key, t.text]), [...Object.entries(WARRANTIES), ['quote.validityDays', '15']]);
assert.equal(draft.documentTexts?.[0].label, 'Garantía de paneles');
assert(draft.validationIssues?.some((i) => i.code === 'unknown_document_text' && i.severity === 'warning'));
assert(draft.validationIssues?.some((i) => i.code === 'document_text_is_draft_field'));


// 3. Una nueva vuelta de conversación sin documentTexts conserva los del borrador; [] los quita.
const revised = normalizeProposalDraft({ ...raw, documentTexts: undefined, clientName: 'Garantías QA 2' }, catalog, { ...context, currentDraft: draft });
assert.equal(revised.documentTexts?.length, 5);
assert.equal(normalizeProposalDraft({ ...raw, documentTexts: [] }, catalog, { ...context, currentDraft: draft }).documentTexts?.length, 0);
assert.deepEqual(normalizeProposalDraft(draft, catalog, context).documentTexts, draft.documentTexts, 'idempotente');

// 3b. Vigencia estricta: entero de 1 a 365, opcionalmente seguido de «día(s)»; el resto se rechaza.
const validity = (text: string) => normalizeProposalDraft({ ...raw, documentTexts: [{ key: 'quote.validityDays', text }] }, catalog, context);
for (const [text, days] of [['15', '15'], ['15 días', '15'], ['1 día', '1'], ['30 dias', '30']] as const) assert.equal(validity(text).documentTexts?.[0]?.text, days, text);
for (const text of ['-15', '1 día (antes 2)', '15 días laborables', '0', '400', 'quince', '1.5']) {
  const rejected = validity(text);
  assert.equal(rejected.documentTexts?.length, 0, text);
  assert(rejected.validationIssues?.some((i) => i.code === 'invalid_document_text'), text);
}

// 3c. Textos completos al modelo dentro de un presupuesto; si uno se recorta, el borrador lo avisa en la fila.
const longNote = 'Términos y condiciones. '.repeat(100).trim(); // > tope por texto
const longProject = { ...open, customization: { ...open.customization, validityNote: longNote } };
const fullCatalog = aiDocumentTextCatalog(longProject, documentTextContextFor(store.getState(), longProject, 'legacy'));
const regulatory = fullCatalog.find((t) => t.key === 'projectDescription.regulatoryNote')!;
assert(regulatory.text!.length > 800 && !regulatory.truncated, 'la nota regulatoria de fábrica viaja completa');
const cut = fullCatalog.find((t) => t.key === 'quotation.validityNote')!;
assert.equal(cut.truncated, true);
assert(cut.text!.length < longNote.length);
assert(JSON.stringify(fullCatalog).length < 16000, 'presupuesto total acotado');
const partial = normalizeProposalDraft({ ...raw, documentTexts: [{ key: 'quotation.validityNote', text: 'Nuevo término.' }, { key: 'quotation.warranty.panel', text: '12 años' }] }, catalog, { ...context, documentTexts: fullCatalog });
assert.equal(partial.documentTexts?.find((t) => t.key === 'quotation.validityNote')?.partial, true);
assert.equal(partial.documentTexts?.find((t) => t.key === 'quotation.warranty.panel')?.partial, undefined);
assert(partial.validationIssues?.some((i) => i.code === 'document_text_seen_partially' && i.severity === 'warning'));
assert.equal(normalizeProposalDraft(partial, catalog, context).documentTexts?.find((t) => t.key === 'quotation.validityNote')?.partial, true, 'el aviso sobrevive a la revisión');

assert.match(PROPOSAL_SYSTEM_INSTRUCTION, /dynamic/);


// ── Camino (a): asistente general en la vista del documento (modo edición) ──
store.setState({ projects: [open], activeProjectId: open.id, activeView: 'pdf-preview', agentActivity: [] });
assert(assistantVisibleIn('pdf-preview'), 'el asistente está disponible en la vista del documento');
assert.equal(assistantProjectId('pdf-preview', open.id), open.id, 'y conoce la propuesta abierta');
assert.equal(assistantProjectId('dashboard', open.id), undefined);
assert.match(AGENT_RULES_ES, /set_document_text/, 'las reglas distinguen textos del documento de datos del proyecto');
assert.match(assistantTurnContext(open.id, 'pdf-preview'), /viendo el documento PDF/);
assert.doesNotMatch(assistantTurnContext(open.id, 'pdf-preview'), /modo edición/, 'la vista también tiene modo lectura');

// 7. Descubrir claves con un filtro de texto (contexto mínimo) y fijar varias en una sola acción con deshacer.
const listed = await executeAgentTool({ name: 'list_document_texts', args: { proposalId: open.id, query: 'garantia' } }, { source: 'app-assistant', owner: assistantOwner() });
assert(listed.status === 'ok');
const keys = (listed.data as { texts: { key: string }[] }).texts.map((t) => t.key);
for (const key of Object.keys(WARRANTIES)) assert(keys.includes(key), key);
assert(keys.length <= 12, `filtro acotado: ${keys.join(', ')}`);

// 7b. Lotes: null restablece, [] es un error claro y una clave desconocida rechaza el lote entero (nada a medias).
const chat = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
assert((await executeAgentTool({ name: 'set_document_texts', args: { proposalId: open.id, texts: [{ key: 'quotation.warranty.panel', text: 'Temporal' }] } }, chat())).status === 'applied');
const resetBatch = await executeAgentTool({ name: 'set_document_texts', args: { proposalId: open.id, texts: [{ key: 'quotation.warranty.panel', text: null }] } }, chat());
assert(resetBatch.status === 'applied', JSON.stringify(resetBatch));
assert.equal(textOf(byId(open.id), 'quotation.warranty.panel'), '25 Años de Producción Lineal');
const empty = await executeAgentTool({ name: 'set_document_texts', args: { proposalId: open.id, texts: [] } }, chat());
assert(empty.status === 'error' && /al menos un texto/.test(empty.message), JSON.stringify(empty));
const before = JSON.stringify(byId(open.id));
const mixed = await executeAgentTool({ name: 'set_document_texts', args: { proposalId: open.id, texts: [
  { key: 'quotation.warranty.panel', text: '40 años' }, { key: 'quotation.noExiste', text: 'x' }, { key: 'otra.clave', text: 'y' },
] } }, chat());
assert(mixed.status === 'error', JSON.stringify(mixed));
assert.match(mixed.message, /quotation\.noExiste/);
assert.match(mixed.message, /otra\.clave/);
assert.match(mixed.message, /no se aplicó ningún/i);
assert.equal(JSON.stringify(byId(open.id)), before, 'el lote no se aplica a medias');
store.setState({ agentActivity: [] });

const seen: string[] = [];
const transport: GeminiTransport = async (_url, body: any) => {
  // La propuesta activa y la vista cierran el turno del usuario (la instrucción de sistema es estable).
  const turn = [...body.contents].reverse().find((c: any) => c.role === 'user' && c.parts.at(-1)?.text);
  seen.push(turn.parts.at(-1).text);
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
assert.match(seen[0], /viendo el documento PDF/, 'y que el usuario está en el documento');
assert.equal(reply.applied?.length, 1, 'un solo cambio aplicado con deshacer');
for (const [key, text] of Object.entries(WARRANTIES)) assert.equal(textOf(byId(open.id), key), text, key);
assert.equal(store.getState().undoAgentActivity(reply.applied![0].activityId).success, true);
assert.equal(textOf(byId(open.id), 'quotation.warranty.panel'), '25 Años de Producción Lineal');

console.log('PASS: la IA fija textos del documento (garantías, vigencia) en el borrador y en el chat, con revisión y deshacer.');
