// LEGADO: se elimina en F6 junto con geminiInvoiceService.parseProposalWithAI.
// Lo que de testGeminiStructured (sección 6) solo prueba que el borrador del asistente de propuestas usa el helper estructurado.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import type { GeminiTransport } from '../../shared/geminiTransport';
import { parseProposalWithAI } from '../services/geminiInvoiceService';

// Un único helper para salida estructurada: transporte inyectado, esquema JSON, parseo estricto y reintento acotado.
const replies: unknown[] = [];
const bodies: any[] = [];
const transport: GeminiTransport = async (_url, body, headers) => {
  assert.equal(headers['x-goog-api-key'], 'synthetic-key');
  bodies.push(structuredClone(body));
  const next = replies.shift();
  if (next instanceof Error) throw next;
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: String(next) }] } }] };
};

// 6. El borrador de propuesta usa el mismo helper (reintento incluido) con su transporte inyectado.
bodies.length = 0;
replies.push('{"clientName":', JSON.stringify({ responseKind: 'draft', assistantMessage: 'Listo', clientName: 'Cliente QA', panels: [], inverters: [], batteries: [], monthlyConsumptionKWh: [] }));
const draft = await parseProposalWithAI({ apiKey: 'synthetic-key', projectRequirementsText: 'Cliente QA', equipmentCatalog: [] }, undefined, transport);
assert.equal(draft.clientName, 'Cliente QA');
assert.equal(bodies.length, 2);
console.log('PASS (legado): el borrador del asistente de propuestas usa el helper de salida estructurada.');