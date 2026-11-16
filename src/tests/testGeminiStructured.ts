import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MAX_INLINE_FILE_BASE64, requestGeminiStructured, type GeminiTransport } from '../../shared/geminiTransport';
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
const schema = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } };
const base = { apiKey: 'synthetic-key', invalidMessage: 'JSON inválido: no se aplicó nada.', body: {
  systemInstruction: { parts: [{ text: 'Sistema' }] }, contents: [{ role: 'user', parts: [{ text: 'Datos' }] }],
  generationConfig: { temperature: 0.1, responseSchema: schema } } };

// 1. Respuesta válida: una sola llamada, esquema y tipo MIME JSON siempre presentes.
replies.push('{"ok":true}');
let result = await requestGeminiStructured(base, transport);
assert.deepEqual(result.data, { ok: true });
assert.equal(result.attempts, 1);
assert.equal(bodies.at(-1).generationConfig.responseMimeType, 'application/json');
assert.deepEqual(bodies.at(-1).generationConfig.responseSchema, schema);

// 2. JSON inválido: un reintento acotado con la misma petición; si se repara, se usa.
bodies.length = 0;
replies.push('Aquí tienes: {"ok":true}', '{"ok":true}');
result = await requestGeminiStructured(base, transport);
assert.equal(result.attempts, 2);
assert.equal(bodies.length, 2);
assert.equal(JSON.stringify(bodies[0]), JSON.stringify(bodies[1]), 'el reintento repite la misma petición (mismo prefijo cacheable)');

// 3. Inválido dos veces: error con el mensaje del llamador y nunca más de dos llamadas facturadas.
bodies.length = 0;
replies.push('{"ok":', '[1,2]', '{"ok":true}');
await assert.rejects(requestGeminiStructured(base, transport), /JSON inválido: no se aplicó nada\./);
assert.equal(bodies.length, 2);
replies.length = 0;
// Sin reintentos si el llamador lo pide.
bodies.length = 0;
replies.push('nope');
await assert.rejects(requestGeminiStructured({ ...base, invalidJsonRetries: 0 }, transport), /JSON inválido/);
assert.equal(bodies.length, 1);
// El tope de reintentos no se puede subir para multiplicar llamadas.
bodies.length = 0;
replies.push('a', 'b', 'c', 'd');
await assert.rejects(requestGeminiStructured({ ...base, invalidJsonRetries: 5 }, transport));
assert.equal(bodies.length, 2, 'como mucho un reintento por JSON inválido');
replies.length = 0;

// 4. Un error del proveedor o una respuesta incompleta no se reintentan aquí (lo decide requestGeminiJson).
bodies.length = 0;
const truncated: GeminiTransport = async (_url, body) => { bodies.push(body); return { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] }; };
await assert.rejects(requestGeminiStructured(base, truncated), /SAFETY/);
assert.equal(bodies.length, 1);

// 5. Límites: un documento inline mayor que 20 MiB se rechaza antes de llamar al modelo.
bodies.length = 0;
const big = { ...base, body: { ...base.body, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'A'.repeat(MAX_INLINE_FILE_BASE64 + 4) } }] }] } };
await assert.rejects(requestGeminiStructured(big, transport), /20 MB/);
assert.equal(bodies.length, 0);
await assert.rejects(requestGeminiStructured({ ...base, apiKey: ' ' }, transport), /API Key/);

// 6. El borrador de propuesta usa el mismo helper (reintento incluido) con su transporte inyectado.
bodies.length = 0;
replies.push('{"clientName":', JSON.stringify({ responseKind: 'draft', assistantMessage: 'Listo', clientName: 'Cliente QA', panels: [], inverters: [], batteries: [], monthlyConsumptionKWh: [] }));
const draft = await parseProposalWithAI({ apiKey: 'synthetic-key', projectRequirementsText: 'Cliente QA', equipmentCatalog: [] }, undefined, transport);
assert.equal(draft.clientName, 'Cliente QA');
assert.equal(bodies.length, 2);

// 7. Ningún servicio arma su propia variante: las peticiones estructuradas pasan por requestGeminiStructured.
for (const file of readdirSync('src/services').filter((name) => /^gemini.*Service\.ts$/.test(name))) {
  const source = readFileSync(`src/services/${file}`, 'utf8');
  assert(!/requestGeminiJson|parseGeminiJson|geminiResponseText/.test(source), `${file} usa requestGeminiStructured`);
}
console.log('Gemini structured requests: one helper, injected transport, bounded JSON retry and limits (synthetic only).');
