// Doble de pruebas ScriptedLlm: implementa el puerto LlmClient con un guion y registra lo que recibió.
import assert from 'node:assert/strict';
import { ScriptedLlm, FakeLlmClient } from './support/scriptedLlm';
import { LlmError } from '../services/llm/errors';
import type { LlmClient, LlmContent, LlmStreamEvent } from '../services/llm/types';

const user = (text: string): LlmContent => ({ role: 'user', parts: [{ type: 'text', text }] });
const request = (text = 'hola') => ({ model: 'gemini-4-hydrogen', contents: [user(text)] });
const drain = async (iterable: AsyncIterable<LlmStreamEvent>) => { const out: LlmStreamEvent[] = []; for await (const e of iterable) out.push(e); return out; };

assert.equal(FakeLlmClient, ScriptedLlm, 'both names refer to the same double');

// Respuestas de texto y llamadas a función, en orden; registra cada petición (copia, no referencia).
{
  const llm: LlmClient & ScriptedLlm = new ScriptedLlm([
    { functionCalls: [{ id: 'c1', name: 'get_project', args: { projectId: 'p1' }, signature: 'sig-1' }, { name: 'search_equipment', args: { query: 'x' } }] },
    { text: 'Listo.', usage: { inputTokens: 3 } },
  ]);
  const req = request('busca');
  const first = await llm.generate(req, { timeoutMs: 1000 });
  req.contents.push(user('mutado después'));
  assert.equal(llm.calls[0].request!.contents.length, 1, 'recorded request is a snapshot');
  assert.equal(llm.calls[0].method, 'generate');
  assert.equal(llm.calls[0].options?.timeoutMs, 1000);
  assert.deepEqual(first.functionCalls, [{ id: 'c1', name: 'get_project', args: { projectId: 'p1' } }, { name: 'search_equipment', args: { query: 'x' } }]);
  assert.equal(first.content.role, 'model');
  assert.equal((first.content.parts[0] as any).signature, 'sig-1', 'signatures live in the model turn');
  assert.equal(first.finishReason, 'stop');
  const second = await llm.generate(request());
  assert.equal(second.text, 'Listo.');
  assert.deepEqual(second.usage, { inputTokens: 3 });
  assert.equal(llm.remaining, 0);
  llm.assertDone();
  await assert.rejects(() => llm.generate(request()), /guion/i, 'an exhausted script fails loudly');
}

// Errores guionizados (tipados o no) y finishReason propio.
{
  const llm = new ScriptedLlm([
    { error: new LlmError('rate_limited', { status: 429 }) },
    { text: 'cortado', finishReason: 'max_tokens' },
  ]);
  await assert.rejects(() => llm.generate(request()), (e: any) => e instanceof LlmError && e.kind === 'rate_limited');
  assert.equal((await llm.generate(request())).finishReason, 'max_tokens');
  llm.assertDone();
  assert.throws(() => new ScriptedLlm([{ text: 'sin usar' }]).assertDone(), /quedan 1/, 'unused steps fail assertDone');
  await assert.rejects(() => llm.generate(request()), /agotado/);
  assert.throws(() => llm.assertDone(), /1 llamadas sin guion/, 'unscripted calls fail assertDone');
}

// Pasos que dependen de la petición (p. ej. responder según el historial).
{
  const llm = new ScriptedLlm([(call) => ({ text: `recibí ${call.request!.contents.length} turnos` })]);
  assert.equal((await llm.generate({ model: 'm', contents: [user('a'), user('b')] })).text, 'recibí 2 turnos');
}

// Streaming: una respuesta se emite como eventos; un guion de trozos se respeta tal cual, con error a mitad.
{
  const llm = new ScriptedLlm([
    { thought: 'pensando', text: 'Hola', functionCalls: [{ id: 'c', name: 'get_project', args: {} }], usage: { outputTokens: 2 } },
    { stream: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] },
    { stream: [{ type: 'text', text: 'parcial' }, { error: new LlmError('server', { status: 503 }) }] },
  ]);
  const events = await drain(llm.stream(request()));
  assert.deepEqual(events.map((e) => e.type), ['thought', 'text', 'functionCall', 'usage', 'done']);
  const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
  assert.equal(done.response.text, 'Hola');
  const chunks = await drain(llm.stream(request()));
  assert.deepEqual(chunks.map((e) => (e.type === 'text' ? e.text : e.type)), ['A', 'B', 'done'], 'a final done is added');
  assert.equal((chunks.at(-1) as any).response.text, 'AB');
  const seen: string[] = [];
  await assert.rejects(async () => { for await (const e of llm.stream(request())) if (e.type === 'text') seen.push(e.text); }, (e: any) => e.kind === 'server');
  assert.deepEqual(seen, ['parcial']);
  assert.deepEqual(llm.calls.map((c) => c.method), ['stream', 'stream', 'stream']);
}

// generate también acepta un guion de trozos (se pliegan en una respuesta).
{
  const llm = new ScriptedLlm([{ stream: [{ type: 'text', text: 'x' }, { type: 'functionCall', call: { name: 'a', args: {} } }] }]);
  const response = await llm.generate(request());
  assert.equal(response.text, 'x');
  assert.deepEqual(response.functionCalls, [{ name: 'a', args: {} }]);
}

// Cancelación: respeta la señal con su motivo, antes y a mitad de stream.
{
  const reason = new Error('Detener');
  const controller = new AbortController();
  controller.abort(reason);
  const llm = new ScriptedLlm([{ text: 'nunca' }, { stream: [{ type: 'text', text: '1' }, { type: 'text', text: '2' }] }]);
  await assert.rejects(() => llm.generate(request(), { signal: controller.signal }), (e: any) => e.kind === 'cancelled' && e.reason === reason);
  assert.equal(llm.remaining, 2, 'a cancelled call consumes no step');
  await llm.generate(request());
  const mid = new AbortController();
  const seen: string[] = [];
  await assert.rejects(async () => {
    for await (const e of llm.stream(request(), { signal: mid.signal })) if (e.type === 'text') { seen.push(e.text); mid.abort(reason); }
  }, (e: any) => e.kind === 'cancelled' && e.reason === reason);
  assert.deepEqual(seen, ['1']);
}

// Salida estructurada y listado de modelos.
{
  const llm = new ScriptedLlm([{ data: { total: 5 } }, { text: '{"a":1}' }, { text: 'no es json' }], {
    models: [{ id: 'gemini-4-hydrogen', name: 'models/gemini-4-hydrogen', supportedActions: ['generateContent'] }],
  });
  const schema = { type: 'object' };
  assert.deepEqual((await llm.structured({ model: 'm', contents: [user('x')], schema })).data, { total: 5 });
  assert.deepEqual((await llm.structured({ model: 'm', contents: [user('x')], schema })).data, { a: 1 });
  await assert.rejects(() => llm.structured({ model: 'm', contents: [user('x')], schema }), (e: any) => e.kind === 'malformed_response');
  assert.deepEqual((await llm.listModels()).map((m) => m.id), ['gemini-4-hydrogen']);
  assert.equal(llm.calls.at(-1)!.method, 'listModels');
  assert.deepEqual((llm.calls[0].request as any).schema, schema);
  const failing = new ScriptedLlm([], { models: new LlmError('invalid_key') });
  await assert.rejects(() => failing.listModels(), (e: any) => e.kind === 'invalid_key');
}

console.log('ScriptedLlm double (script, records, stream events, errors, cancellation, structured, models) passed.');
