// Política de salida estructurada sobre el puerto LlmClient (F1b), con ScriptedLlm: sin SDK, sin red, sin clave.
// Recoge, caso por caso, lo que hacía `requestGeminiStructured`/`requestGeminiJson` de shared/geminiTransport
// (esas suites siguen cubriendo el camino REST legado hasta F6): modelo de reserva, recuperación de MAX_TOKENS,
// un reintento de JSON mal formado, plazo global, límite de 20 MiB inline y cancelación con su razón.
import assert from 'node:assert/strict';
import { LlmError } from '../services/llm/errors';
import { MAX_INLINE_FILE_BASE64, requestStructured, type StructuredPolicyOptions } from '../services/llm/structuredPolicy';
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from '../../shared/geminiTransport';
import type { LlmStructuredRequest } from '../services/llm/types';
import { clientFromTransport } from './support/clientFromTransport';
import { ScriptedLlm, type ScriptedStep } from './support/scriptedLlm';

const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
const contents = [{ role: 'user' as const, parts: [{ type: 'text' as const, text: 'Datos' }] }];
const INVALID = 'JSON inválido: no se aplicó nada.';
const ok = { data: { ok: true } } satisfies ScriptedStep;
const garbage = { text: 'no-json' } satisfies ScriptedStep; // el doble lo ve como malformed_response con finishReason stop
const serverError = (status: number) => ({ error: new LlmError('server', { status }) }) satisfies ScriptedStep;
const run = (llm: ScriptedLlm, extra: Partial<Omit<StructuredPolicyOptions, 'request'>> & { request?: Partial<StructuredPolicyOptions['request']> } = {}) => {
  const { request, ...rest } = extra;
  return requestStructured({ client: llm, invalidMessage: INVALID, ...rest, request: { systemInstruction: 'Sistema', contents, schema, ...request } });
};
const sent = (llm: ScriptedLlm) => llm.calls.map((call) => call.request as LlmStructuredRequest);

// 1. Una respuesta válida: una sola llamada con el esquema, la instrucción y el modelo predeterminado.
{
  const llm = new ScriptedLlm([ok]);
  const result = await run(llm);
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.attempts, 1);
  assert.equal(result.modelUsed, DEFAULT_GEMINI_MODEL);
  assert.equal(result.requestedModel, DEFAULT_GEMINI_MODEL);
  assert.equal(result.modelWarning, undefined);
  assert.equal(llm.calls[0].method, 'structured', 'los escáneres usan structured, no generate');
  const [request] = sent(llm);
  assert.deepEqual(request.schema, schema);
  assert.equal(request.systemInstruction, 'Sistema');
  assert.deepEqual(request.contents, contents);
  assert.equal(request.model, DEFAULT_GEMINI_MODEL);
  assert.equal(request.thinkingLevel, 'low', 'Gemini 4 exige thinkingLevel');
  assert((llm.calls[0].options?.timeoutMs ?? 0) > 59_000 && llm.calls[0].options!.timeoutMs! <= 60_000, 'plazo predeterminado: 60 s');
  llm.assertDone();
}

// 2. Modelo: prefijo models/ fuera, identificador validado y nivel de razonamiento por familia.
{
  const llm = new ScriptedLlm([ok, ok, ok, ok, ok]);
  await run(llm, { request: { model: ' models/gemini-4-argon ' } });
  await run(llm, { request: { model: 'gemini-3.8-flash' } });
  await run(llm, { request: { model: 'gemini-2.5-flash' } });
  await run(llm, { request: { model: 'gemini-2.0-flash' } });
  await run(llm, { request: { thinkingLevel: 'medium' } });
  assert.deepEqual(sent(llm).map((r) => r.model), ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', DEFAULT_GEMINI_MODEL]);
  assert.deepEqual(sent(llm).map((r) => r.thinkingLevel), ['low', 'low', undefined, undefined, 'medium'], 'solo las familias 3 y 4 reciben thinkingLevel (2.5 usaba thinkingBudget, que el puerto no expresa)');
  const bad = new ScriptedLlm([]);
  await assert.rejects(run(bad, { request: { model: 'gemini/../x' } }), /identificador del modelo/);
  assert.equal(bad.calls.length, 0);
}

// 3. JSON inválido: un reintento acotado con la misma petición; dos fallos dan el mensaje del llamador.
{
  const llm = new ScriptedLlm([garbage, ok]);
  const result = await run(llm);
  assert.equal(result.attempts, 2);
  assert.equal(JSON.stringify(sent(llm)[0]), JSON.stringify(sent(llm)[1]), 'el reintento repite la misma petición (mismo prefijo cacheable)');
  const twice = new ScriptedLlm([garbage, garbage, ok]);
  await assert.rejects(run(twice), (error: Error) => error.message === INVALID && error.name === 'StructuredInvalidJsonError');
  assert.equal(twice.calls.length, 2, 'nunca más de dos llamadas por JSON inválido');
  const none = new ScriptedLlm([garbage, ok]);
  await assert.rejects(run(none, { invalidJsonRetries: 0 }), new RegExp(INVALID));
  assert.equal(none.calls.length, 1);
  const many = new ScriptedLlm([garbage, garbage, garbage, garbage]);
  await assert.rejects(run(many, { invalidJsonRetries: 5 }), new RegExp(INVALID));
  assert.equal(many.calls.length, 2, 'el tope de reintentos no se puede subir');
  for (const retries of [NaN, Infinity, -Infinity, -1]) {
    const loop = new ScriptedLlm([garbage, garbage, garbage, garbage, garbage]);
    await assert.rejects(run(loop, { invalidJsonRetries: retries }), new RegExp(INVALID));
    assert(loop.calls.length <= 2, `invalidJsonRetries=${retries}: ${loop.calls.length} llamadas`);
  }
}

// 4. Respuestas incompletas o bloqueadas, y fallos del cuerpo: no se reintentan aquí.
{
  const recitation = new ScriptedLlm([{ text: '{}', finishReason: 'recitation' }, ok]);
  await assert.rejects(run(recitation), /no completó la respuesta \(RECITATION\)\. No se aplicaron datos parciales\./);
  assert.equal(recitation.calls.length, 1);
  const blocked = new ScriptedLlm([{ error: new LlmError('blocked', { finishReason: 'safety' }) }, ok]);
  await assert.rejects(run(blocked), (error: unknown) => error instanceof LlmError && error.kind === 'blocked');
  assert.equal(blocked.calls.length, 1);
  const unreadable = new ScriptedLlm([{ error: new LlmError('malformed_response') }, ok]);
  await assert.rejects(run(unreadable), (error: unknown) => error instanceof LlmError && error.kind === 'malformed_response');
  assert.equal(unreadable.calls.length, 1, 'un cuerpo ilegible (sin finishReason) no es JSON inválido: no se reintenta');
  const network = new ScriptedLlm([{ error: new LlmError('network') }, ok]);
  await assert.rejects(run(network), (error: unknown) => error instanceof LlmError && error.kind === 'network');
  assert.equal(network.calls.length, 1);
  const unexpected = new ScriptedLlm([{ error: new TypeError('fallo local') }, ok]);
  await assert.rejects(run(unexpected), /fallo local/);
  assert.equal(unexpected.calls.length, 1);
}

// 5. 20 MiB inline: la suma de los documentos de la petición, comprobada antes de facturar.
{
  const pdf = (data: string) => ({ type: 'inlineData' as const, mimeType: 'application/pdf', data });
  const withParts = (...parts: ReturnType<typeof pdf>[]) => ({ contents: [{ role: 'user' as const, parts: [{ type: 'text' as const, text: 'x' }, ...parts] }] });
  const big = new ScriptedLlm([ok]);
  await assert.rejects(run(big, { request: withParts(pdf('A'.repeat(MAX_INLINE_FILE_BASE64 + 4))) }), /superan 20 MB en total/);
  const half = 'A'.repeat(Math.ceil(MAX_INLINE_FILE_BASE64 / 2) + 4);
  await assert.rejects(run(big, { request: withParts(pdf(half), pdf(half)) }), /20 MB/);
  assert.equal(big.calls.length, 0, 'sin llamadas facturadas');
  await run(big, { request: withParts(pdf('A'.repeat(MAX_INLINE_FILE_BASE64))) });
  assert.equal(big.calls.length, 1, 'exactamente 20 MiB (en base64) cabe');
}

// 6. Plazo global: el reintento usa lo que queda y se omite sin margen (la cuarta parte del plazo).
{
  let clock = 0;
  const now = () => clock;
  const advance = (ms: number, step: ScriptedStep): ScriptedStep => () => { clock += ms; return step; };
  const slow = new ScriptedLlm([advance(50_000, garbage), advance(50_000, garbage)]);
  await assert.rejects(run(slow, { timeoutMs: 120_000, now }), new RegExp(INVALID));
  assert.deepEqual(slow.calls.map((c) => c.options?.timeoutMs), [120_000, 70_000], 'el segundo intento solo tiene lo que queda del plazo');
  clock = 0;
  const slower = new ScriptedLlm([advance(100_000, garbage), garbage]);
  await assert.rejects(run(slower, { timeoutMs: 120_000, now }), new RegExp(INVALID));
  assert.equal(slower.calls.length, 1, 'con 20 s restantes de 120 no se reintenta');
  // El reintento por modelo de reserva también cuenta contra el plazo global.
  clock = 0;
  const transient = new ScriptedLlm([advance(30_000, serverError(503)), ok]);
  const recovered = await run(transient, { timeoutMs: 120_000, now });
  assert.deepEqual(transient.calls.map((c) => c.options?.timeoutMs), [120_000, 90_000]);
  assert.match(recovered.modelWarning || '', /no respondió temporalmente/);
  // Plazo corto (10 s) y primer fallo rápido: el reintento cabe y el margen es proporcional.
  clock = 0;
  const fast = new ScriptedLlm([advance(50, garbage), advance(50, ok)]);
  assert.equal((await run(fast, { timeoutMs: 10_000, now })).attempts, 2);
  assert.deepEqual(fast.calls.map((c) => c.options?.timeoutMs), [10_000, 9_950]);
  // Plazo vencido tras el primer fallo: no se abre otra petición con un plazo de milisegundos.
  clock = 0;
  const late = new ScriptedLlm([advance(20_000, serverError(503)), ok]);
  await assert.rejects(run(late, { timeoutMs: 10_000, now }), (error: unknown) => error instanceof LlmError && error.kind === 'server');
  assert.deepEqual(late.calls.map((c) => c.options?.timeoutMs), [10_000]);
  // Plazo no finito o no positivo: el predeterminado (60 s), nunca NaN ni 0 hacia el puerto.
  for (const timeoutMs of [NaN, Infinity, 0, -5]) {
    const llm = new ScriptedLlm([ok]);
    clock = 0;
    await run(llm, { timeoutMs, now });
    assert.equal(llm.calls[0].options?.timeoutMs, 60_000, `timeoutMs=${timeoutMs}`);
  }
  // Un plazo propio (tarifas: 90 s) viaja tal cual.
  clock = 0;
  const custom = new ScriptedLlm([ok]);
  await run(custom, { timeoutMs: 90_000, now });
  assert.equal(custom.calls[0].options?.timeoutMs, 90_000);
  // Un fallo del tiempo del propio intento no se reintenta (lo que hacía el plazo global de requestGeminiStructured).
  const timedOut = new ScriptedLlm([{ error: new LlmError('timeout') }, ok]);
  await assert.rejects(run(timedOut), (error: unknown) => error instanceof LlmError && error.kind === 'timeout');
  assert.equal(timedOut.calls.length, 1);
}

// 7. Modelo de reserva y 404.
{
  const urls = (llm: ScriptedLlm) => sent(llm).map((r) => r.model);
  const llm = new ScriptedLlm([serverError(503), ok]);
  const result = await run(llm);
  assert.deepEqual(urls(llm), [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
  assert.equal(result.modelUsed, FALLBACK_GEMINI_MODEL);
  assert.equal(result.requestedModel, DEFAULT_GEMINI_MODEL);
  assert.match(result.modelWarning || '', /temporalmente/);
  // 408, 500, 502 y 504 también son transitorios; 501 no.
  for (const status of [408, 500, 502, 504]) {
    const retry = new ScriptedLlm([serverError(status), ok]);
    await run(retry);
    assert.equal(retry.calls.length, 2, `HTTP ${status} cambia al respaldo`);
  }
  const notImplemented = new ScriptedLlm([serverError(501), ok]);
  await assert.rejects(run(notImplemented), (error: unknown) => error instanceof LlmError && error.status === 501);
  assert.equal(notImplemented.calls.length, 1);
  // Un modelo elegido distinto del predeterminado recurre al predeterminado.
  const custom = new ScriptedLlm([serverError(500), ok]);
  assert.equal((await run(custom, { request: { model: 'gemini-3.6-flash' } })).modelUsed, DEFAULT_GEMINI_MODEL);
  // Dos fallos seguidos: el segundo se informa, sin tercera llamada.
  const twice = new ScriptedLlm([serverError(503), serverError(503), ok]);
  await assert.rejects(run(twice), (error: unknown) => error instanceof LlmError && error.kind === 'server');
  assert.equal(twice.calls.length, 2);
  // Un modelo elegido que Google retiró (404) cae en el predeterminado con un aviso para actualizar Ajustes.
  const retired = new ScriptedLlm([{ error: new LlmError('not_found', { status: 404 }) }, ok]);
  const fallen = await run(retired, { request: { model: 'gemini-2.0-flash' } });
  assert.equal(fallen.modelUsed, DEFAULT_GEMINI_MODEL);
  assert.match(fallen.modelWarning || '', /Ajustes/);
  const missing = new ScriptedLlm([{ error: new LlmError('not_found', { status: 404 }) }, ok]);
  await assert.rejects(run(missing), (error: unknown) => error instanceof LlmError && error.kind === 'not_found');
  assert.equal(missing.calls.length, 1, 'el modelo predeterminado no tiene respaldo ante 404');
  // 429 y 401 nunca encadenan peticiones facturadas.
  for (const kind of ['rate_limited', 'invalid_key', 'bad_request'] as const) {
    const one = new ScriptedLlm([{ error: new LlmError(kind, { status: 429 }) }, ok]);
    await assert.rejects(run(one), (error: unknown) => error instanceof LlmError && error.kind === kind);
    assert.equal(one.calls.length, 1, kind);
  }
  // El aviso de un intento descartado no se arrastra al válido: 503 → JSON inválido en el respaldo → intento limpio.
  const flaky = new ScriptedLlm([serverError(503), garbage, ok]);
  const clean = await run(flaky);
  assert.equal(clean.attempts, 2);
  assert.equal(clean.modelWarning, undefined);
  assert.equal(clean.modelUsed, DEFAULT_GEMINI_MODEL);
  assert.deepEqual(urls(flaky), [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL, DEFAULT_GEMINI_MODEL]);
}

// 8. MAX_TOKENS: se recupera una vez con un límite mayor, y solo si la petición fijó uno menor que el techo del modelo.
{
  const truncated = { text: '{"ok":', finishReason: 'max_tokens' } satisfies ScriptedStep;
  const limits = (llm: ScriptedLlm) => sent(llm).map((r) => r.maxOutputTokens);
  const unset = new ScriptedLlm([truncated, ok]);
  await assert.rejects(run(unset), /Reduce los adjuntos/);
  assert.equal(unset.calls.length, 1, 'sin límite propio no hay reintento pagado');
  const ceiling = new ScriptedLlm([truncated, ok]);
  await assert.rejects(run(ceiling, { request: { maxOutputTokens: 65_536 } }), /Reduce los adjuntos/);
  assert.equal(ceiling.calls.length, 1, 'ya en el techo síncrono de Gemini 4');
  const doubled = new ScriptedLlm([truncated, ok]);
  const recovered = await run(doubled, { request: { maxOutputTokens: 16_384 } });
  assert.deepEqual(limits(doubled), [16_384, 32_768]);
  assert.match(recovered.modelWarning || '', /truncada/);
  assert.equal(recovered.attempts, 1, 'recuperar el truncado no cuenta como JSON inválido');
  const large = new ScriptedLlm([truncated, ok]);
  await run(large, { request: { maxOutputTokens: 40_000 } });
  assert.deepEqual(limits(large), [40_000, 65_536], 'Gemini 4 recupera hasta 65.536 tokens');
  const tariff = new ScriptedLlm([truncated, ok]);
  await run(tariff, { request: { maxOutputTokens: 12_000 } });
  assert.deepEqual(limits(tariff), [12_000, 24_000], 'el límite de tarifas (12.000) se duplica');
  const older = new ScriptedLlm([truncated, ok]);
  await run(older, { request: { model: 'gemini-3.8-flash', maxOutputTokens: 30_000 } });
  assert.deepEqual(limits(older), [30_000, 32_768], 'las demás familias llegan a 32.768');
  const twice = new ScriptedLlm([truncated, truncated, ok]);
  await assert.rejects(run(twice, { request: { maxOutputTokens: 8_000 } }), /Reduce los adjuntos/);
  assert.equal(twice.calls.length, 2, 'un único intento adicional');
  // Tras pasar al modelo de reserva ya se gastó el segundo intento: un truncado no se recupera otra vez.
  const afterFallback = new ScriptedLlm([serverError(503), truncated, ok]);
  await assert.rejects(run(afterFallback, { request: { maxOutputTokens: 8_000 } }), /Reduce los adjuntos/);
  assert.equal(afterFallback.calls.length, 2);
  // Sin margen en el plazo no se recupera.
  let clock = 0;
  const noMargin = new ScriptedLlm([() => { clock += 55_000; return truncated; }, ok]);
  await assert.rejects(run(noMargin, { request: { maxOutputTokens: 8_000 }, now: () => clock }), /Reduce los adjuntos/);
  assert.equal(noMargin.calls.length, 1);
}

// 9. Cancelación: lo que cancelaba un escaneo lo sigue cancelando y la razón se propaga tal cual (sin envolver).
{
  const reason = new Error('el usuario cerró el diálogo');
  const before = new AbortController();
  before.abort(reason);
  const idle = new ScriptedLlm([ok]);
  await assert.rejects(run(idle, { signal: before.signal }), (error: unknown) => error === reason);
  assert.equal(idle.calls.length, 0, 'abortada antes de empezar: ninguna llamada');
  // Sin razón explícita, la de la señal es un AbortError.
  const bare = new AbortController();
  bare.abort();
  await assert.rejects(run(new ScriptedLlm([ok]), { signal: bare.signal }), (error: unknown) => error === bare.signal.reason && (error as Error).name === 'AbortError');
  // A mitad de la llamada: el puerto lanza «cancelled» con la razón y no se reintenta con ningún modelo.
  const during = new AbortController();
  const mid = new ScriptedLlm([() => { during.abort(reason); return { error: new LlmError('cancelled', { reason }) }; }, ok]);
  await assert.rejects(run(mid, { signal: during.signal }), (error: unknown) => error === reason);
  assert.equal(mid.calls.length, 1);
  assert.equal(mid.calls[0].options?.aborted, false, 'la señal viajó al puerto');
  // Entre el primer JSON inválido y el reintento.
  const between = new AbortController();
  const gap = new ScriptedLlm([() => { between.abort(reason); return garbage; }, ok]);
  await assert.rejects(run(gap, { signal: between.signal }), (error: unknown) => error === reason);
  assert.equal(gap.calls.length, 1, 'cancelado: no se paga el reintento');
  // Un fallo transitorio con la señal ya abortada no cambia de modelo.
  const abortedTransient = new AbortController();
  const noFallback = new ScriptedLlm([() => { abortedTransient.abort(reason); return serverError(503); }, ok]);
  await assert.rejects(run(noFallback, { signal: abortedTransient.signal }), (error: unknown) => error === reason);
  assert.equal(noFallback.calls.length, 1);
  // Una cancelación sin razón de la señal ni del error: mensaje en español.
  const plain = new ScriptedLlm([{ error: new LlmError('cancelled') }]);
  await assert.rejects(run(plain), /Solicitud cancelada/);
}

// 10. Respuestas vacías o sin finishReason, con el adaptador real del SDK sobre un transporte sintético: lo mismo que
// hacía requestGeminiStructured (shared/geminiTransport) en esos casos. Las suites de ScriptedLlm no las ven porque el
// doble no distingue «texto vacío» de «JSON inválido».
{
  const NO_DATA = /Gemini no devolvió datos para analizar\. Revisa el archivo o las instrucciones\./;
  const reply = (parts: unknown[], finishReason?: string) => ({ candidates: [{ content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }] });
  const viaAdapter = (responses: unknown[]) => {
    let calls = 0;
    const client = clientFromTransport(async () => responses[Math.min(calls++, responses.length - 1)] as never);
    return { run: () => requestStructured({ client, invalidMessage: INVALID, request: { contents, schema } }), calls: () => calls };
  };
  const good = reply([{ text: '{"ok":true}' }], 'STOP');
  // STOP con texto vacío, o solo con razonamiento: «no devolvió datos», sin pagar un segundo intento.
  for (const [name, response] of [
    ['texto vacío', reply([{ text: '' }], 'STOP')],
    ['solo razonamiento', reply([{ text: 'pienso', thought: true }], 'STOP')],
    ['sin partes', reply([], 'STOP')],
    ['sin candidatos', {}],
  ] as const) {
    const probe = viaAdapter([response, good]);
    await assert.rejects(probe.run(), NO_DATA, name);
    assert.equal(probe.calls(), 1, `${name}: sin reintento pagado`);
  }
  // JSON válido sin finishReason: se acepta (el transporte REST no lo exigía).
  const noFinish = viaAdapter([reply([{ text: '{"ok":true}' }])]);
  assert.deepEqual((await noFinish.run()).data, { ok: true });
  assert.equal(noFinish.calls(), 1);
  // Texto que no es JSON y sin finishReason: JSON inválido, un reintento (no «UNKNOWN»).
  const noFinishBad = viaAdapter([reply([{ text: 'no-json' }]), good]);
  assert.deepEqual((await noFinishBad.run()).data, { ok: true });
  assert.equal(noFinishBad.calls(), 2);
  // Un motivo de fin conocido distinto de STOP sigue dando «no completó la respuesta (…)», aunque el texto esté vacío.
  const other = viaAdapter([reply([{ text: '' }], 'OTHER'), good]);
  await assert.rejects(other.run(), /no completó la respuesta \(OTHER\)/);
  assert.equal(other.calls(), 1);
  // Seguridad: ni se reintenta ni se dice «no devolvió datos»; el mensaje es el del puerto, en español.
  const safety = viaAdapter([reply([{ text: '' }], 'SAFETY'), good]);
  await assert.rejects(safety.run(), (error: unknown) => error instanceof LlmError && error.kind === 'blocked' && /filtros de seguridad/.test(error.message));
  assert.equal(safety.calls(), 1);
  const promptBlocked = viaAdapter([{ promptFeedback: { blockReason: 'SAFETY' } }, good]);
  await assert.rejects(promptBlocked.run(), (error: unknown) => error instanceof LlmError && error.kind === 'blocked');
  assert.equal(promptBlocked.calls(), 1);
}

console.log('Structured policy over LlmClient: fallback model, MAX_TOKENS recovery, bounded JSON retry, deadline, 20 MiB and cancellation (ScriptedLlm only).');
