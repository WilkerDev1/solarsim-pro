import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MAX_INLINE_FILE_BASE64, requestGeminiStructured, type GeminiTransport } from '../../shared/geminiTransport';

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


// 8. Revisión: reintentos finitos, plazo global, aviso del intento válido, límite sobre la suma y cercos ```json.
{
  // Un valor no finito nunca deja un bucle de llamadas facturadas.
  let calls = 0;
  const invalid: GeminiTransport = async () => { if (++calls > 5) throw new Error('bucle sin fin'); return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no-json' }] } }] }; };
  for (const retries of [NaN, Infinity, -Infinity, -1]) {
    calls = 0;
    await assert.rejects(requestGeminiStructured({ ...base, invalidJsonRetries: retries }, invalid), /JSON inválido/);
    assert(calls <= 2, `invalidJsonRetries=${retries}: ${calls} llamadas`);
  }
  // Plazo global: el reintento usa el tiempo que queda y se omite si queda poco.
  let clock = 0;
  const timeouts: number[] = [];
  const slow: GeminiTransport = async (_url, _body, _headers, timeoutMs) => { timeouts.push(timeoutMs); clock += 50_000; return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no-json' }] } }] }; };
  await assert.rejects(requestGeminiStructured({ ...base, timeoutMs: 120_000, now: () => clock }, slow), /JSON inválido/);
  assert.deepEqual(timeouts, [120_000, 70_000], 'el segundo intento solo tiene lo que queda del plazo');
  clock = 0; timeouts.length = 0;
  const slower: GeminiTransport = async (url, body, headers, timeoutMs) => { clock += 100_000; return slow(url, body, headers, timeoutMs); };
  await assert.rejects(requestGeminiStructured({ ...base, timeoutMs: 120_000, now: () => clock }, slower), /JSON inválido/);
  assert.equal(timeouts.length, 1, 'sin margen no se reintenta');
  // El reintento interno de requestGeminiJson (modelo de respaldo) también respeta el plazo global.
  clock = 0; timeouts.length = 0;
  const transient: GeminiTransport = async (_url, _body, _headers, timeoutMs) => {
    timeouts.push(timeoutMs); clock += 30_000;
    if (timeouts.length === 1) throw Object.assign(new Error('503'), { statusCode: 503 });
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] };
  };
  const recovered = await requestGeminiStructured({ ...base, timeoutMs: 120_000, now: () => clock }, transient);
  assert.deepEqual(timeouts, [120_000, 90_000]);
  assert.match(recovered.modelWarning || '', /no respondió temporalmente/, 'el aviso es del intento que sí respondió');
  // Un aviso de un intento descartado no se arrastra al válido.
  let round = 0;
  const flaky: GeminiTransport = async () => {
    round++;
    if (round === 1) throw Object.assign(new Error('503'), { statusCode: 503 });
    if (round === 2) return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no-json' }] } }] };
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] };
  };
  const clean = await requestGeminiStructured(base, flaky);
  assert.equal(clean.attempts, 2);
  assert.equal(clean.modelWarning, undefined, 'el intento válido no usó modelo de respaldo');
  // 20 MiB es el total de los documentos de la petición, no cada uno.
  bodies.length = 0;
  const half = 'A'.repeat(Math.ceil(MAX_INLINE_FILE_BASE64 / 2) + 4);
  const two = { ...base, body: { ...base.body, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: half } }, { inlineData: { mimeType: 'image/png', data: half } }] }] } };
  await assert.rejects(requestGeminiStructured(two, transport), /20 MB/);
  assert.equal(bodies.length, 0);
  // Los cercos ```json se limpian como en robustParseJson.
  replies.push('```json\n{"ok":true}\n```');
  assert.deepEqual((await requestGeminiStructured(base, transport)).data, { ok: true });
}

// 9. Revisión del plazo: nunca se llama con el plazo vencido, el margen es proporcional y el plazo se valida.
{
  const json = (text: string) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
  // Plazo corto (10 s) y primer fallo rápido: el reintento cabe.
  let clock = 0;
  const timeouts: number[] = [];
  const fast: GeminiTransport = async (_u, _b, _h, timeoutMs) => { timeouts.push(timeoutMs); clock += 50; return json(timeouts.length === 1 ? 'no-json' : '{"ok":true}'); };
  const short = await requestGeminiStructured({ ...base, timeoutMs: 10_000, now: () => clock }, fast);
  assert.equal(short.attempts, 2, 'con 10 s y un fallo a los 50 ms se reintenta');
  assert.deepEqual(timeouts, [10_000, 9_950]);
  // Lo mismo con el fallo transitorio que reintenta requestGeminiJson.
  clock = 0; timeouts.length = 0;
  const transient: GeminiTransport = async (_u, _b, _h, timeoutMs) => {
    timeouts.push(timeoutMs); clock += 50;
    if (timeouts.length === 1) throw Object.assign(new Error('503'), { statusCode: 503 });
    return json('{"ok":true}');
  };
  assert.equal((await requestGeminiStructured({ ...base, timeoutMs: 10_000, now: () => clock }, transient)).data.ok, true);
  assert.equal(timeouts.length, 2);
  // Plazo vencido: no se llama al transporte con 1 ms; se informa el tiempo agotado.
  clock = 0; timeouts.length = 0;
  const late: GeminiTransport = async (_u, _b, _h, timeoutMs) => { timeouts.push(timeoutMs); clock += 20_000; throw Object.assign(new Error('503'), { statusCode: 503 }); };
  await assert.rejects(requestGeminiStructured({ ...base, timeoutMs: 10_000, now: () => clock }, late), /503|tardó/);
  assert.deepEqual(timeouts, [10_000], 'sin plazo restante no hay segunda llamada');
  assert(!timeouts.some(t => t < 1000), 'nunca una llamada con un plazo de milisegundos');
  // Plazo no finito o no positivo: se usa el predeterminado (60 s), nunca NaN ni 0 en el transporte.
  for (const timeoutMs of [NaN, Infinity, 0, -5]) {
    timeouts.length = 0; clock = 0;
    replies.push('{"ok":true}');
    await requestGeminiStructured({ ...base, timeoutMs, now: () => clock }, async (url, body, headers, t) => { timeouts.push(t); return transport(url, body, headers, t); });
    assert.deepEqual(timeouts, [60_000], `timeoutMs=${timeoutMs}`);
  }
}

// 7. Los escáneres (F1b) ya no pasan por este helper REST: usan la política sobre el puerto LlmClient
// (src/services/llm/structuredPolicy.ts, probada en testStructuredPolicy). Este helper queda solo para el camino legado
// (parseProposalWithAI y electron/ai) hasta F6, y ningún servicio gemini*Service lo importa.
for (const file of readdirSync('src/services').filter((name) => /^gemini.*Service\.ts$/.test(name) && name !== 'geminiInvoiceService.ts')) {
  const source = readFileSync(`src/services/${file}`, 'utf8');
  assert(!/geminiTransport|requestGeminiStructured|requestGeminiJson|parseGeminiJson|geminiResponseText|GeminiTransport/.test(source), `${file} no usa shared/geminiTransport`);
  assert(/structuredPolicy/.test(source), `${file} pide la salida estructurada por la política del puerto`);
}
console.log('Gemini structured requests: one helper, injected transport, bounded JSON retry and limits (synthetic only).');
