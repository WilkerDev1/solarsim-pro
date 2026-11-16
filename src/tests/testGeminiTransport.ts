import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  GeminiRequestError,
  parseGeminiJson,
  requestGeminiJson,
  type GeminiTransport,
} from '../../shared/geminiTransport';

// Fuente: https://ai.google.dev/gemini-api/docs/models/gemini-4-hydrogen (lista de modelos, noviembre de 2026).
assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-4-hydrogen');
assert.notEqual(FALLBACK_GEMINI_MODEL, DEFAULT_GEMINI_MODEL);

const ok = (text = '{}') => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
const sent: any[] = [];
const recorder: GeminiTransport = async (url, body) => { sent.push({ url, body }); return ok(); };

// Gemini 4: thinkingLevel (nunca thinkingBudget) y sin muestreo (el servidor lo ignora y fuera de rango responde 400).
await requestGeminiJson({ apiKey: 'synthetic', body: { generationConfig: { temperature: 0.1, topP: 0.95, topK: 40, responseMimeType: 'application/json', maxOutputTokens: 8192 } } }, recorder);
let config = sent.at(-1).body.generationConfig;
assert.match(sent.at(-1).url, /models\/gemini-4-hydrogen:generateContent$/);
assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'low' });
assert.equal(config.temperature, undefined);
assert.equal(config.topP, undefined);
assert.equal(config.topK, undefined);
assert.equal(config.responseMimeType, 'application/json');
assert.equal(config.maxOutputTokens, 8192);

await requestGeminiJson({ apiKey: 'synthetic', thinkingLevel: 'medium', body: { generationConfig: { thinkingConfig: { thinkingBudget: 2048 } } } }, recorder);
assert.deepEqual(sent.at(-1).body.generationConfig.thinkingConfig, { thinkingLevel: 'medium' }, 'thinkingBudget plus thinkingLevel is a 400 on Gemini 4');

// La elección explícita de un modelo anterior conserva su política.
await requestGeminiJson({ apiKey: 'synthetic', model: 'gemini-3.8-flash', body: { generationConfig: { temperature: 0.1 } } }, recorder);
config = sent.at(-1).body.generationConfig;
assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'low' });
assert.equal(config.temperature, 0.1);
await requestGeminiJson({ apiKey: 'synthetic', model: 'gemini-2.5-flash', body: {} }, recorder);
assert.deepEqual(sent.at(-1).body.generationConfig.thinkingConfig, { thinkingBudget: 1024 });
await requestGeminiJson({ apiKey: 'synthetic', model: 'models/gemini-4-argon', body: {} }, recorder);
assert.match(sent.at(-1).url, /models\/gemini-4-argon:/);
assert.deepEqual(sent.at(-1).body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });

// MAX_TOKENS: sin un límite propio la respuesta ya usó el máximo del modelo; repetirla cobra otra vez sin poder ayudar.
let calls = 0;
const truncated: GeminiTransport = async () => { calls++; return { candidates: [{ finishReason: 'MAX_TOKENS' }] }; };
await assert.rejects(() => requestGeminiJson({ apiKey: 'synthetic', body: {} }, truncated), /Reduce/);
assert.equal(calls, 1, 'no paid retry when the default output limit was exhausted');
calls = 0;
await assert.rejects(() => requestGeminiJson({ apiKey: 'synthetic', body: { generationConfig: { maxOutputTokens: 65536 } } }, truncated), /Reduce/);
assert.equal(calls, 1, 'already at the Gemini 4 synchronous ceiling');
calls = 0;
const limits: number[] = [];
const recovered = await requestGeminiJson({ apiKey: 'synthetic', body: { generationConfig: { maxOutputTokens: 16384 } } }, async (_url, body: any) => {
  calls++; limits.push(body.generationConfig.maxOutputTokens);
  return calls === 1 ? { candidates: [{ finishReason: 'MAX_TOKENS' }] } : ok();
});
assert.deepEqual(limits, [16384, 32768]);
assert(recovered.modelWarning);
calls = 0; limits.length = 0;
await requestGeminiJson({ apiKey: 'synthetic', body: { generationConfig: { maxOutputTokens: 40000 } } }, async (_url, body: any) => {
  calls++; limits.push(body.generationConfig.maxOutputTokens);
  return calls === 1 ? { candidates: [{ finishReason: 'MAX_TOKENS' }] } : ok();
});
assert.deepEqual(limits, [40000, 65536], 'Gemini 4 recovers up to 65,536 synchronous tokens');

// Fallo transitorio del modelo base: un único intento con el respaldo estable.
const urls: string[] = [];
const transient = await requestGeminiJson({ apiKey: 'synthetic', body: {} }, async (url) => {
  urls.push(url);
  if (urls.length === 1) throw new GeminiRequestError('Sobrecarga', 503);
  return ok();
});
assert.equal(urls.length, 2);
assert.match(urls[1], new RegExp(`models/${FALLBACK_GEMINI_MODEL}:`));
assert.equal(transient.modelUsed, FALLBACK_GEMINI_MODEL);
assert.match(transient.modelWarning || '', /temporalmente/);

// Un modelo elegido que Google retiró (404) cae en el predeterminado con un aviso para actualizar Ajustes.
urls.length = 0;
const retired = await requestGeminiJson({ apiKey: 'synthetic', model: 'gemini-2.0-flash', body: {} }, async (url) => {
  urls.push(url);
  if (urls.length === 1) throw new GeminiRequestError('models/gemini-2.0-flash is not found', 404);
  return ok();
});
assert.equal(retired.modelUsed, DEFAULT_GEMINI_MODEL);
assert.match(retired.modelWarning || '', /Ajustes/);
calls = 0;
await assert.rejects(() => requestGeminiJson({ apiKey: 'synthetic', body: {} }, async () => { calls++; throw new GeminiRequestError('not found', 404); }), /not found/);
assert.equal(calls, 1, 'the default model has no 404 fallback');
calls = 0;
await assert.rejects(() => requestGeminiJson({ apiKey: 'synthetic', body: {} }, async () => { calls++; throw new GeminiRequestError('cuota', 429); }), /cuota/);
assert.equal(calls, 1, '429 never chains billed requests');

// JSON estructurado común a los escáneres.
assert.deepEqual(parseGeminiJson(ok('```json\n{"a":1}\n```'), 'fallo'), { a: 1 });
assert.throws(() => parseGeminiJson(ok('{"a":'), 'Sin datos aplicados.'), /Sin datos aplicados/);
assert.throws(() => parseGeminiJson(ok('[1]'), 'Sin datos aplicados.'), /Sin datos aplicados/);
assert.throws(() => parseGeminiJson({ candidates: [{ finishReason: 'SAFETY' }] }, 'x'), /SAFETY/);

console.log('Gemini 4 Hydrogen transport policy, bounded recovery and structured parsing passed.');
