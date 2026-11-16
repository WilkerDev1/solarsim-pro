import assert from 'node:assert/strict';
import { buildProposalRequest, normalizeProposalDraft, type AIProposalContext } from '../../shared/aiProposal';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { useSimulationStore } from '../store/useSimulationStore';
import { runAssistant } from '../features/assistant/service';
import type { GeminiTransport } from '../../shared/geminiTransport';
import type { AssistantMessage } from '../features/assistant/types';

/** Bytes comunes al principio de dos peticiones serializadas en el orden en que el proveedor las lee (sistema, herramientas, contenidos). */
const ordered = (body: any) => JSON.stringify([body.systemInstruction, body.tools ?? null, body.contents]);
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
/** Longitud en caracteres de la serialización (comparable con `commonPrefix`); el informe usa bytes UTF-8. */
const bytes = (value: unknown) => JSON.stringify(value).length;
const utf8 = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

// --- Borrador de propuesta: lo estable (instrucciones, catálogo, tarifas, contexto del proyecto, adjuntos) va primero. ---
const catalog = DEFAULT_EQUIPMENT_CATALOG;
const tariffReference = buildAITariffContext(useSimulationStore.getState().tariffMatrix);
const base: AIProposalContext = { province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', tariffReference, monthlyConsumptionKWh: Array(12).fill(600), targetCoveragePct: 100,
  documentTexts: [{ key: 'quotation.warranty.panel', label: 'Garantía de paneles', text: '25 años' }] };
const file = { fileBase64: 'JVBERi0xLjcgc3ludGhldGlj', mimeType: 'application/pdf', fileName: 'factura.pdf' };
const first = buildProposalRequest({ projectRequirementsText: 'Propuesta con 10 paneles JA Solar', equipmentCatalog: catalog, dopExchangeRate: 60, files: [file], context: base });
const draft = normalizeProposalDraft({ clientName: 'Cliente', panels: [{ equipmentId: catalog.find(e => e.type === 'panel')!.id, quantity: 10 }], inverters: [], batteries: [] }, catalog, base);
const second = buildProposalRequest({ projectRequirementsText: 'Añade una batería HinaESS', equipmentCatalog: catalog, dopExchangeRate: 61, files: [file],
  context: { ...base, currentDraft: draft, conversation: [{ role: 'user', text: 'Propuesta con 10 paneles JA Solar' }, { role: 'assistant', text: 'Preparé el borrador.' }], reviewNotes: ['Indica el inversor.'] } as AIProposalContext });

// Partes estables idénticas byte a byte; solo la última (mensaje, conversación, borrador) cambia.
const stableParts = (request: any) => request.contents[0].parts.slice(0, -1);
assert.equal(JSON.stringify(first.systemInstruction), JSON.stringify(second.systemInstruction));
assert.equal(JSON.stringify(stableParts(first)), JSON.stringify(stableParts(second)), 'catálogo, tarifas, contexto del proyecto y adjuntos idénticos');
assert.deepEqual(first.generationConfig, second.generationConfig);
const stableBytes = bytes([first.systemInstruction, null, [{ role: 'user', parts: stableParts(first) }]]) - 4; // sin el cierre del arreglo y del objeto
const prefix = commonPrefix(ordered(first), ordered(second));
assert(prefix >= stableBytes, `el prefijo común (${prefix} B) cubre todo lo estable (${stableBytes} B)`);
const variable = JSON.parse(second.contents[0].parts.at(-1)!.text!);
assert.equal(variable.requirements, 'Añade una batería HinaESS', 'lo variable va al final');
assert.equal(variable.exchangeRate, 61);
assert.equal(variable.conversation.length, 2);
assert.deepEqual(variable.reviewNotes, ['Indica el inversor.']);
// El catálogo y la referencia tarifaria van una sola vez y en la parte estable.
assert(!second.contents[0].parts.at(-1)!.text!.includes('"catalog"'));
assert(!second.contents[0].parts.at(-1)!.text!.includes('"tariffReference"'));
// El borrador vigente se reenvía solo con las claves del esquema: nada de avisos, espejos ni datos de proveedor.
assert.equal(variable.currentDraft.validationIssues, undefined);
assert.equal(variable.currentDraft.selectedPanelId, undefined);
assert.equal(variable.currentDraft.selectedSupplierInfo, undefined);
assert.equal(variable.currentDraft.panels[0].selectedSupplierInfo, undefined);
assert.equal(variable.currentDraft.panels[0].equipmentId, draft.panels![0].id);
assert.equal(variable.currentDraft.panels[0].quantity, 10);
assert.equal(variable.currentDraft.clientName, 'Cliente');
const total = bytes([second.systemInstruction, second.contents]);
console.log(`Borrador: prefijo estable ${utf8([first.systemInstruction, stableParts(first)])} B de ${utf8([second.systemInstruction, second.contents])} B (${Math.round(stableBytes / total * 100)} %).`);
assert(stableBytes / total > 0.8, 'con el catálogo de fábrica, más del 80 % de la petición es cacheable');

// --- Asistente: instrucción y herramientas estables; la propuesta activa y la vista viajan al final del turno. ---
const bodies: any[] = [];
const transport: GeminiTransport = async (_url, body) => {
  bodies.push(structuredClone(body));
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Hecho.' }] } }] };
};
const history: AssistantMessage[] = [];
const ask = async (prompt: string, activeProjectId?: string, activeView?: string) => {
  const reply = await runAssistant({ apiKey: 'synthetic', model: 'synthetic', prompt, history: [...history], activeProjectId, activeView,
    signal: new AbortController().signal, transport, execute: () => ({ data: null }) });
  history.push({ role: 'user', text: prompt } as AssistantMessage, reply);
  return bodies.at(-1);
};
// Varias rondas, cambiando de propuesta y de vista: el prefijo (sistema + herramientas + historial previo) no cambia.
let previous = await ask('¿Qué propuestas tengo?');
for (let turn = 1; turn < 10; turn++) {
  const body = await ask(`Pregunta ${turn}`, turn % 2 ? 'p-1' : 'p-2', turn % 3 ? 'simulator' : 'pdf-preview');
  assert.equal(JSON.stringify(body.systemInstruction), JSON.stringify(previous.systemInstruction), 'instrucción de sistema estable');
  assert.equal(JSON.stringify(body.tools), JSON.stringify(previous.tools), 'herramientas estables');
  const shared = commonPrefix(ordered(previous), ordered(body));
  const staticPart = bytes([body.systemInstruction, body.tools]);
  assert(shared > staticPart, `turno ${turn}: el prefijo común (${shared} B) incluye sistema y herramientas (${staticPart} B)`);
  previous = body;
}
const lastTurn = previous.contents.at(-1).parts;
assert.match(lastTurn.at(-1).text, /Propuesta activa: p-1/, 'la propuesta activa viaja al final del turno');
assert.doesNotMatch(previous.systemInstruction.parts[0].text, /Propuesta activa: p-/);
// La ventana de historial avanza por bloques: entre dos turnos seguidos casi siempre se conserva el inicio.
let stableTurns = 0;
for (let i = 1; i < bodies.length; i++) if (JSON.stringify(bodies[i].contents[0]) === JSON.stringify(bodies[i - 1].contents[0])) stableTurns++;
assert(stableTurns >= bodies.length - 3, `historial estable en ${stableTurns} de ${bodies.length - 1} turnos`);
assert(previous.contents.length <= 18 + 1, 'ventana acotada');
console.log('AI prompt cache: stable prefixes first, variable data last (synthetic only).');
