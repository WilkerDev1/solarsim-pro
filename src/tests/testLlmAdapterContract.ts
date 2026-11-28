// Contrato del adaptador LlmClient sobre @google/genai: se mira lo que el SDK manda de verdad con un fetch falso
// (el fetch global lanza en las pruebas; nunca hay red ni clave real).
import assert from 'node:assert/strict';
import { createGeminiLlmClient, GEMINI_API_VERSION, knownSdkFinishReasons, mapFinishReason } from '../services/llm/geminiAdapter';
import { LlmError } from '../services/llm/errors';
import type { LlmContent, LlmStreamEvent } from '../services/llm/types';
import { sseResponse, transportAsFetch, type RecordedRequest } from './support/transportAsFetch';
import { GeminiRequestError, type GeminiTransport } from '../../shared/geminiTransport';

const KEY = 'synthetic-key-for-tests';
const BASE = 'https://generativelanguage.googleapis.com';
const user = (text: string): LlmContent => ({ role: 'user', parts: [{ type: 'text', text }] });
const stop = (parts: unknown[], extra: Record<string, unknown> = {}) => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }], ...extra });

function client(transport: GeminiTransport) {
  const requests: RecordedRequest[] = [];
  return { requests, llm: createGeminiLlmClient({ apiKey: KEY, fetch: transportAsFetch(transport, requests) }) };
}
const keyNeverInUrl = (requests: RecordedRequest[]) => {
  for (const r of requests) {
    assert(!r.url.includes(KEY), 'the API key never travels in the URL');
    assert(!/[?&]key=/.test(r.url), 'no ?key= query parameter');
    assert.equal(r.headers['x-goog-api-key'], KEY, 'the API key travels in x-goog-api-key');
  }
};

assert.equal(GEMINI_API_VERSION, 'v1beta', 'API version is pinned in code, never the SDK default (v1)');

// --- generate: URL, cabecera, cuerpo sin muestreo, herramientas por JSON Schema, modo y razonamiento.
{
  const { llm, requests } = client(async () => stop(
    [{ text: 'Hola' }, { functionCall: { id: 'call-1', name: 'search_projects', args: { query: 'x' } }, thoughtSignature: 'sig-1' }],
    { usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 4, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 18 } },
  ));
  const schema = { type: 'object', properties: { query: { type: 'string', maxLength: 200 }, n: { type: 'integer', enum: [1, 2] } }, required: ['query'], additionalProperties: false };
  const response = await llm.generate({
    model: 'models/gemini-4-hydrogen',
    systemInstruction: 'Eres un asistente.',
    contents: [user('Busca')],
    tools: [{ name: 'search_projects', description: 'Busca', parameters: schema }, { name: 'list_all', description: 'Sin argumentos' }],
    toolMode: 'validated',
    allowedFunctionNames: ['search_projects'],
    maxOutputTokens: 65536,
    thinkingLevel: 'medium',
    includeThoughts: true,
    // Campos de muestreo colados por un llamador sin tipos: el adaptador no los reenvía.
    ...({ temperature: 0.2, topP: 0.9, topK: 40 } as object),
  } as any);
  assert.equal(requests.length, 1);
  const [req] = requests;
  assert.equal(req.url, `${BASE}/v1beta/models/gemini-4-hydrogen:generateContent`, 'v1beta, model without models/ prefix');
  assert.equal(req.method, 'POST');
  keyNeverInUrl(requests);
  const config = req.body.generationConfig ?? {};
  for (const sampling of ['temperature', 'topP', 'topK']) assert.equal(config[sampling], undefined, `${sampling} is never sent`);
  assert.equal(config.maxOutputTokens, 65536);
  assert.equal(String(config.thinkingConfig?.thinkingLevel).toLowerCase(), 'medium');
  assert.equal(config.thinkingConfig?.includeThoughts, true);
  assert.equal(req.body.automaticContinuation, undefined, 'SDK-only switches never reach the wire');
  assert.equal(config.automaticContinuation, undefined);
  assert.deepEqual(req.body.systemInstruction?.parts, [{ text: 'Eres un asistente.' }]);
  const declarations = req.body.tools?.[0]?.functionDeclarations;
  assert.equal(declarations?.length, 2);
  assert.deepEqual(declarations[0].parametersJsonSchema, schema, 'declarations travel as JSON Schema, untouched');
  assert.equal(declarations[0].parameters, undefined, 'never the lossy OpenAPI dialect');
  assert.equal(declarations[1].parametersJsonSchema, undefined, 'argument-less tool: no schema');
  assert.equal(req.body.toolConfig?.functionCallingConfig?.mode, 'VALIDATED');
  assert.deepEqual(req.body.toolConfig?.functionCallingConfig?.allowedFunctionNames, ['search_projects']);
  assert.equal(response.text, 'Hola');
  assert.equal(response.finishReason, 'stop');
  assert.equal(response.model, 'gemini-4-hydrogen');
  assert.deepEqual(response.functionCalls, [{ id: 'call-1', name: 'search_projects', args: { query: 'x' } }], 'functionCall.id is kept');
  assert.deepEqual(response.usage, { inputTokens: 10, cachedTokens: 4, outputTokens: 5, thinkingTokens: 3, totalTokens: 18 });
}

// --- Firmas de pensamiento y partes completas: vuelven intactas en la petición siguiente.
{
  const modelParts = [
    { text: 'pensando…', thought: true, thoughtSignature: 'sig-thought' },
    { functionCall: { id: 'call-7', name: 'get_project', args: { projectId: 'p1' } }, thoughtSignature: 'sig-call' },
    { functionCall: { name: 'search_equipment', args: { query: 'batería' } } },
    { text: '', thoughtSignature: 'sig-empty' },
  ];
  let round = 0;
  const { llm, requests } = client(async () => (++round === 1 ? stop(modelParts) : stop([{ text: 'Listo.' }])));
  const first = await llm.generate({ model: 'gemini-4-hydrogen', contents: [user('Hazlo')] });
  assert.equal(first.text, '', 'thought text is not visible text');
  assert.deepEqual(first.functionCalls.map((c) => c.id), ['call-7', undefined], 'a missing id is tolerated');
  assert.equal(first.content.role, 'model');
  assert.equal(first.content.parts.length, 4, 'empty text parts carrying a signature are kept');
  const history: LlmContent[] = [
    user('Hazlo'),
    first.content,
    { role: 'user', parts: [
      { type: 'functionResponse', id: 'call-7', name: 'get_project', response: { output: { ok: true } } },
      { type: 'functionResponse', name: 'search_equipment', response: { output: [] } },
    ] },
  ];
  const second = await llm.generate({ model: 'gemini-4-hydrogen', contents: history });
  assert.equal(second.text, 'Listo.');
  const sent = requests[1].body.contents;
  assert.deepEqual(sent[1].parts, modelParts, 'model parts (thought signatures, ids, thought flags) go back unchanged');
  assert.equal(sent[1].role, 'model');
  assert.deepEqual(sent[2].parts[0].functionResponse, { id: 'call-7', name: 'get_project', response: { output: { ok: true } } });
  assert.equal('id' in sent[2].parts[1].functionResponse, false, 'no id is invented when the call had none');
}

// --- Cero reintentos del SDK ante 429 y 503, también en streaming.
for (const status of [429, 503]) {
  for (const mode of ['generate', 'stream'] as const) {
    const { llm, requests } = client(async () => { throw Object.assign(new GeminiRequestError(`fallo ${status}`, status), { status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE' }); });
    const run = mode === 'generate'
      ? () => llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] })
      : async () => { for await (const _ of llm.stream({ model: 'gemini-4-hydrogen', contents: [user('x')] })) { /* drain */ } };
    await assert.rejects(run, (error: unknown) => {
      assert(error instanceof LlmError);
      assert.equal(error.kind, status === 429 ? 'rate_limited' : 'server');
      assert.equal(error.status, status);
      assert.equal(error.serverMessage, `fallo ${status}`);
      return true;
    });
    assert.equal(requests.length, 1, `${mode} ${status}: exactly one billed request, no SDK retry`);
  }
}

// --- Otros errores HTTP: clave rechazada y 400 con el mensaje del servidor.
{
  const { llm } = client(async () => new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(() => llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }), (e: any) => e instanceof LlmError && e.kind === 'invalid_key');
  const bad = client(async () => { throw new GeminiRequestError('Invalid JSON payload received. Unknown name "foo"', 400); });
  await assert.rejects(() => bad.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }), (e: any) => {
    assert.equal(e.kind, 'bad_request');
    assert.equal(e.serverMessage, 'Invalid JSON payload received. Unknown name "foo"');
    assert.match(e.message, /Unknown name "foo"/, 'the server message reaches the user');
    return true;
  });
  const gone = client(async () => { throw new GeminiRequestError('models/gemini-old is not found', 404); });
  await assert.rejects(() => gone.llm.generate({ model: 'gemini-old', contents: [user('x')] }), (e: any) => e.kind === 'not_found');
  const broken = client(async () => new Response('<html>proxy</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  await assert.rejects(() => broken.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }), (e: any) => e.kind === 'malformed_response');
  const offline = client(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(() => offline.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }), (e: any) => e.kind === 'network');
  await assert.rejects(() => offline.llm.generate({ model: 'gemini 4/../x', contents: [user('x')] }), /modelo/i, 'invalid model ids never reach the URL');
  assert.equal(offline.requests.length, 1);
}

// --- Sin continuación automática: un CONTINUATION con token no encadena otra petición facturada.
{
  // Solo la primera respuesta trae token: con la continuación activa habría una segunda petición (y no un bucle).
  let hops = 0;
  const { llm, requests } = client(async () => (++hops === 1
    ? { candidates: [{ finishReason: 'CONTINUATION', continuationToken: 'tok-1', content: { role: 'model', parts: [{ text: 'parte 1' }] } }] }
    : stop([{ text: 'parte 2' }])));
  const response = await llm.generate({ model: 'gemini-4-hydrogen', contents: [user('largo')] });
  assert.equal(requests.length, 1, 'generate: no automatic continuation');
  assert.equal(response.finishReason, 'continuation');
  let streamHops = 0;
  const streamed = client(async () => (++streamHops === 1
    ? [{ candidates: [{ content: { role: 'model', parts: [{ text: 'parte 1' }] } }] }, { candidates: [{ finishReason: 'CONTINUATION', continuationToken: 'tok-2' }] }]
    : [stop([{ text: 'parte 2' }])]));
  const events: LlmStreamEvent[] = [];
  for await (const event of streamed.llm.stream({ model: 'gemini-4-hydrogen', contents: [user('largo')] })) events.push(event);
  assert.equal(streamed.requests.length, 1, 'stream: no automatic continuation');
  const done = events.at(-1);
  assert(done?.type === 'done' && done.response.finishReason === 'continuation');
}

// --- Streaming: alt=sse, eventos tipados y turno completo acumulado con sus firmas.
{
  const { llm, requests } = client(async () => [
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Revisando', thought: true }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Hola, ' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'mundo.' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'get_project', args: { projectId: 'p' } }, thoughtSignature: 'sig-s' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '', thoughtSignature: 'sig-end' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } },
  ]);
  const events: LlmStreamEvent[] = [];
  for await (const event of llm.stream({ model: 'gemini-4-hydrogen', contents: [user('Hola')], includeThoughts: true })) events.push(event);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${BASE}/v1beta/models/gemini-4-hydrogen:streamGenerateContent?alt=sse`);
  keyNeverInUrl(requests);
  assert.deepEqual(events.filter((e) => e.type === 'thought'), [{ type: 'thought', text: 'Revisando' }]);
  assert.deepEqual(events.filter((e) => e.type === 'text').map((e: any) => e.text), ['Hola, ', 'mundo.']);
  assert.deepEqual(events.filter((e) => e.type === 'functionCall'), [{ type: 'functionCall', call: { id: 'c1', name: 'get_project', args: { projectId: 'p' } }, signature: 'sig-s' }]);
  assert.deepEqual(events.filter((e) => e.type === 'usage'), [{ type: 'usage', usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } }]);
  const done = events.at(-1);
  assert(done?.type === 'done');
  assert.equal(done.response.text, 'Hola, mundo.');
  assert.equal(done.response.finishReason, 'stop');
  assert.deepEqual(done.response.functionCalls, [{ id: 'c1', name: 'get_project', args: { projectId: 'p' } }]);
  const signatures = done.response.content.parts.map((p: any) => p.signature).filter(Boolean);
  assert.deepEqual(signatures, ['sig-s', 'sig-end'], 'stream keeps every signature, including the empty-text one');
  // El turno acumulado vuelve al servidor tal cual.
  const echo = client(async () => stop([{ text: 'ok' }]));
  await echo.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('Hola'), done.response.content, user('¿y?')] });
  assert.deepEqual(echo.requests[0].body.contents[1].parts, [
    { text: 'Revisando', thought: true },
    { text: 'Hola, mundo.' },
    { functionCall: { id: 'c1', name: 'get_project', args: { projectId: 'p' } }, thoughtSignature: 'sig-s' },
    { text: '', thoughtSignature: 'sig-end' },
  ]);
}

// --- Cancelación con nuestra razón: antes de enviar, a mitad de petición y a mitad de stream.
{
  const reason = new Error('El usuario pulsó Detener.');
  const before = new AbortController();
  before.abort(reason);
  const { llm, requests } = client(async () => stop([{ text: 'no' }]));
  await assert.rejects(() => llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { signal: before.signal }), (e: any) => {
    assert(e instanceof LlmError);
    assert.equal(e.kind, 'cancelled');
    assert.equal(e.reason, reason, 'our reason, not the SDK reason-less AbortError');
    return true;
  });
  await assert.rejects(async () => { for await (const _ of llm.stream({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { signal: before.signal })) { /* */ } }, (e: any) => e.kind === 'cancelled' && e.reason === reason);
  assert.equal(requests.length, 0, 'an aborted signal sends nothing');

  // A mitad de una petición: el fetch falso espera hasta que la señal se aborta.
  const during = new AbortController();
  const hanging = client((_url, _body, _headers, _timeout, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true });
    setTimeout(() => during.abort('motivo-propio'), 5);
  }));
  await assert.rejects(() => hanging.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { signal: during.signal }), (e: any) => e.kind === 'cancelled' && e.reason === 'motivo-propio');
  assert(hanging.requests[0].signal?.aborted, 'the request signal reaching fetch is aborted');

  // A mitad de stream: llega un trozo, se cancela, y el siguiente no llega nunca.
  const mid = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const streaming = client(async () => (async function* () {
    yield { candidates: [{ content: { role: 'model', parts: [{ text: 'primer trozo' }] } }] };
    await gate;
    yield { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'nunca' }] } }] };
  })());
  const seen: string[] = [];
  await assert.rejects(async () => {
    for await (const event of streaming.llm.stream({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { signal: mid.signal })) {
      if (event.type === 'text') { seen.push(event.text); mid.abort(reason); }
    }
  }, (e: any) => e instanceof LlmError && e.kind === 'cancelled' && e.reason === reason);
  release();
  assert.deepEqual(seen, ['primer trozo']);
  assert.equal(streaming.requests.length, 1);

  // Un fetch que ignora la señal (proxy, polyfill) tampoco cuelga la cancelación: el adaptador corta con nuestro motivo.
  const deaf = new AbortController();
  const deafClient = createGeminiLlmClient({ apiKey: KEY, fetch: () => new Promise<Response>(() => {}) });
  setTimeout(() => deaf.abort(reason), 5);
  await assert.rejects(() => deafClient.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { signal: deaf.signal, timeoutMs: 5000 }), (e: any) => e.kind === 'cancelled' && e.reason === reason);
  await assert.rejects(() => deafClient.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { timeoutMs: 20 }), (e: any) => e.kind === 'timeout');
}

// --- Nuestro plazo (no el del SDK): un fetch colgado termina en `timeout`, sin cabecera de plazo del SDK.
{
  const { llm, requests } = client((_url, _body, _headers, _timeout, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(() => llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { timeoutMs: 20 }), (e: any) => e instanceof LlmError && e.kind === 'timeout');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers['x-server-timeout'], undefined, 'the SDK timeout is not used');
  // Stream que se cuelga a mitad: también vence nuestro plazo.
  const slow = client(async () => (async function* () {
    yield { candidates: [{ content: { role: 'model', parts: [{ text: 'a' }] } }] };
    await new Promise(() => {});
  })());
  await assert.rejects(async () => { for await (const _ of slow.llm.stream({ model: 'gemini-4-hydrogen', contents: [user('x')] }, { timeoutMs: 30 })) { /* */ } }, (e: any) => e.kind === 'timeout');
}

// --- Bloqueo de seguridad del prompt.
{
  const { llm } = client(async () => ({ promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(() => llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] }), (e: any) => e.kind === 'blocked' && e.blockReason === 'SAFETY');
  const candidate = client(async () => ({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] }));
  const response = await candidate.llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] });
  assert.equal(response.finishReason, 'safety', 'a blocked candidate is reported, the loop decides');
}

// --- finishReason: conjunto propio cerrado con «unknown» explícito para valores nuevos.
assert.equal(mapFinishReason(undefined), 'unknown');
assert.equal(mapFinishReason('A_REASON_ADDED_NEXT_YEAR'), 'unknown');
assert.equal(mapFinishReason('MALFORMED_FUNCTION_CALL'), 'malformed_function_call');
assert.equal(mapFinishReason('MAX_TOKENS'), 'max_tokens');
for (const value of knownSdkFinishReasons()) assert.notEqual(mapFinishReason(value), 'unknown', `SDK 3.6.1 value ${value} is mapped explicitly`);
{
  const { llm } = client(async () => ({ candidates: [{ finishReason: 'A_REASON_ADDED_NEXT_YEAR', content: { role: 'model', parts: [{ text: 'x' }] } }] }));
  const response = await llm.generate({ model: 'gemini-4-hydrogen', contents: [user('x')] });
  assert.equal(response.finishReason, 'unknown');
  assert.equal(response.rawFinishReason, 'A_REASON_ADDED_NEXT_YEAR');
}

// --- Salida estructurada: JSON Schema y JSON parseado; inválido o truncado nunca se aplica.
{
  const schema = { type: 'object', properties: { total: { type: 'number' } }, required: ['total'] };
  const { llm, requests } = client(async () => stop([{ text: '```json\n{"total": 12.5}\n```' }]));
  const result = await llm.structured<{ total: number }>({ model: 'gemini-4-hydrogen', contents: [user('Lee la factura')], schema, maxOutputTokens: 8192, thinkingLevel: 'low' });
  assert.deepEqual(result.data, { total: 12.5 });
  const config = requests[0].body.generationConfig;
  assert.equal(config.responseMimeType, 'application/json');
  assert.deepEqual(config.responseJsonSchema, schema);
  assert.equal(config.responseSchema, undefined);
  assert.equal(requests[0].body.tools, undefined);
  const invalid = client(async () => stop([{ text: '{"total": 12' }]));
  await assert.rejects(() => invalid.llm.structured({ model: 'gemini-4-hydrogen', contents: [user('x')], schema }), (e: any) => e.kind === 'malformed_response');
  assert.equal(invalid.requests.length, 1, 'the adapter never retries invalid JSON: that is caller policy');
  const truncated = client(async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ text: '{"total"' }] } }] }));
  await assert.rejects(() => truncated.llm.structured({ model: 'gemini-4-hydrogen', contents: [user('x')], schema }), (e: any) => e.kind === 'malformed_response' && e.finishReason === 'max_tokens');
  const array = client(async () => stop([{ text: '[1,2]' }]));
  await assert.rejects(() => array.llm.structured({ model: 'gemini-4-hydrogen', contents: [user('x')], schema }), (e: any) => e.kind === 'malformed_response', 'only a JSON object is accepted');
}

// --- Listado de modelos: GET v1beta, clave en cabecera y todas las páginas.
{
  const { llm, requests } = client(async (url) => /pageToken=p2/.test(url)
    ? { models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] }] }
    : { models: [{ name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', description: 'base', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent', 'countTokens'] }], nextPageToken: 'p2' });
  const models = await llm.listModels();
  assert.equal(requests.length, 2, 'follows nextPageToken');
  for (const r of requests) {
    assert.equal(r.method, 'GET');
    assert.match(r.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?/);
  }
  keyNeverInUrl(requests);
  assert.deepEqual(models, [
    { id: 'gemini-4-hydrogen', name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', description: 'base', supportedActions: ['generateContent', 'countTokens'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { id: 'gemini-3.8-flash', name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedActions: ['generateContent'] },
  ]);
  const denied = client(async () => { throw new GeminiRequestError('API key not valid.', 400); });
  await assert.rejects(() => denied.llm.listModels(), (e: any) => e.kind === 'invalid_key');
  assert.equal(denied.requests.length, 1);
}

// --- transportAsFetch: un fixture que devuelve un Response propio pasa tal cual (stream SSE construido a mano).
{
  const { llm } = client(async () => sseResponse([{ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'directo' }] } }] }]));
  let text = '';
  for await (const event of llm.stream({ model: 'gemini-4-hydrogen', contents: [user('x')] })) if (event.type === 'text') text += event.text;
  assert.equal(text, 'directo');
}

// --- Sin clave no hay petición.
assert.throws(() => createGeminiLlmClient({ apiKey: '  ', fetch: async () => { throw new Error('no'); } }), /API Key/);

console.log('LlmClient adapter contract (v1beta, key header, no SDK retries/continuation/AFC, abort reason, signatures) passed.');
