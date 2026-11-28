// Listado de modelos a través del puerto LlmClient (Ajustes → IA), y compatibilidad de la reexportación que usan
// electron/ai y las suites antiguas.
import assert from 'node:assert/strict';
import { DEFAULT_POPULAR_MODELS, geminiModelInfos, mapGeminiModels } from '../services/llm/models';
import { listAvailableGeminiModels } from '../services/llm/listModels';
import * as legacy from '../services/geminiInvoiceService';
import { createGeminiLlmClient } from '../services/llm/geminiAdapter';
import { LlmError } from '../services/llm/errors';
import { ScriptedLlm } from './support/scriptedLlm';
import { transportAsFetch, type RecordedRequest } from './support/transportAsFetch';

assert.equal(legacy.DEFAULT_POPULAR_MODELS, DEFAULT_POPULAR_MODELS, 'geminiInvoiceService re-exports the same presets');
assert.equal(legacy.mapGeminiModels, mapGeminiModels, 'and the same REST mapper (electron/ai compiles unchanged)');

const models = [
  { id: 'gemini-4-hydrogen', name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', supportedActions: ['generateContent'] },
  { id: 'gemini-3.8-flash', name: 'models/gemini-3.8-flash', supportedActions: ['generateContent', 'countTokens'] },
  { id: 'gemini-tts', name: 'models/gemini-tts', supportedActions: ['generateContent'] },
  { id: 'gemini-embedding', name: 'models/gemini-embedding', supportedActions: ['embedContent'] },
  { id: 'imagen-4', name: 'models/imagen-4', supportedActions: ['predict'] },
];
// El filtro y el marcado de recomendados son los mismos por el puerto que por la vía REST.
const infos = geminiModelInfos(models);
assert.deepEqual(infos.map((m) => m.id), ['gemini-4-hydrogen', 'gemini-3.8-flash']);
assert.equal(infos[0].name, 'Gemini 4 Hydrogen');
assert.equal(infos[1].name, 'gemini-3.8-flash', 'without displayName the id is the label');
assert(infos.every((m) => m.isRecommended), 'documented presets stay recommended');
assert.deepEqual(mapGeminiModels({ models: models.map((m) => ({ name: m.name, displayName: m.displayName, supportedGenerationMethods: m.supportedActions })) }), infos);

// Éxito: el puerto devuelve los modelos de la cuenta.
{
  const llm = new ScriptedLlm([], { models });
  const result = await listAvailableGeminiModels('synthetic-key', { client: llm });
  assert.equal(result.success, true);
  assert.deepEqual(result.models.map((m) => m.id), ['gemini-4-hydrogen', 'gemini-3.8-flash']);
  assert.equal(llm.calls[0].method, 'listModels');
  assert.equal(llm.calls[0].options?.timeoutMs, 15000, 'Settings never waits more than 15 s');
}
// Sin clave no se consulta; con error se devuelven los presets y el mensaje del puerto.
{
  const llm = new ScriptedLlm([], { models });
  const empty = await listAvailableGeminiModels('   ', { client: llm });
  assert.deepEqual(empty, { success: false, error: 'API Key vacía.', models: DEFAULT_POPULAR_MODELS });
  assert.equal(llm.calls.length, 0);
  const denied = await listAvailableGeminiModels('synthetic-key', { client: new ScriptedLlm([], { models: new LlmError('invalid_key') }) });
  assert.equal(denied.success, false);
  assert.match(denied.error!, /API Key/);
  assert.equal(denied.models, DEFAULT_POPULAR_MODELS);
}
// De extremo a extremo con el adaptador real y un fetch falso: GET v1beta con la clave en la cabecera.
{
  const requests: RecordedRequest[] = [];
  const fetch = transportAsFetch(async () => ({ models: [{ name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', supportedGenerationMethods: ['generateContent'] }] }), requests);
  const result = await listAvailableGeminiModels('synthetic-key', { createClient: (apiKey) => createGeminiLlmClient({ apiKey, fetch }) });
  assert.equal(result.success, true);
  assert.deepEqual(result.models.map((m) => m.id), ['gemini-4-hydrogen']);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/v1beta\/models\?/);
  assert.equal(requests[0].headers['x-goog-api-key'], 'synthetic-key');
  assert(!requests[0].url.includes('synthetic-key'));
}

// Sin dependencias inyectadas carga el adaptador bajo demanda y usa el fetch global (que en pruebas lanza: sin red).
{
  const result = await listAvailableGeminiModels('synthetic-key');
  assert.equal(result.success, false);
  assert.match(result.error!, /conectar/, 'the lazily loaded adapter maps the failed fetch to a network error');
  assert.equal(result.models, DEFAULT_POPULAR_MODELS);
}

console.log('Model listing through the LlmClient port (filters, presets, errors, legacy re-export) passed.');
