import assert from 'node:assert/strict';
import { runAssistant } from '../features/assistant/service';
import type { GeminiTransport } from '../../shared/geminiTransport';

// Gemini 4 batches read/search calls in one turn: an over-budget round answers the extra calls instead of failing the chat.
const requests: any[] = [];
const transport: GeminiTransport = async (_url, body: any) => {
  requests.push(structuredClone(body));
  if (requests.length > 1) return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Listo.' }] } }] };
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: Array.from({ length: 6 }, (_, i) => ({ functionCall: { id: `c${i}`, name: 'search_projects', args: { query: `q${i}` } }, ...(i === 0 ? { thoughtSignature: 'sig' } : {}) })) },
    }],
  };
};
let running = 0;
const order: string[] = [];
const reply = await runAssistant({
  apiKey: 'synthetic',
  model: 'gemini-4-hydrogen',
  prompt: 'Busca seis propuestas',
  history: [],
  signal: new AbortController().signal,
  transport,
  execute: async (call) => {
    running++;
    assert.equal(running, 1, 'tool calls run one at a time: deterministic order, no concurrent mutations');
    await new Promise((resolve) => setTimeout(resolve, 1));
    order.push(String(call.args.query));
    running--;
    return { data: { ok: call.args.query } };
  },
});
assert.equal(reply.text, 'Listo.');
assert.deepEqual(order, ['q0', 'q1', 'q2', 'q3']);
const followUp = requests[1].contents;
const modelTurn = followUp.at(-2);
assert.equal(modelTurn.parts[0].thoughtSignature, 'sig', 'model parts (and thought signatures) are returned unchanged');
const responses = followUp.at(-1).parts.map((p: any) => p.functionResponse);
assert.equal(responses.length, 6, 'every functionCall receives exactly one functionResponse');
assert.deepEqual(responses.map((r: any) => r.id), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
assert.match(responses[5].response.error, /cuatro herramientas/);
assert(requests[0].generationConfig.maxOutputTokens >= 8192, 'thinking shares the output budget on Gemini 4');
console.log('Assistant tool round: bounded sequential execution, answered overflow and preserved signatures passed.');
