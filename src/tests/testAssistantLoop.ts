// F4: el bucle nuevo del asistente de la app sobre el puerto LlmClient (`src/features/assistant/session/agentLoop.ts`),
// probado con ScriptedLlm y un ejecutor falso (sin store): aquí solo el contrato del bucle. El escenario de extremo a extremo
// («crea una propuesta» desde Inicio, con el store y el conjunto de F3a reales) está en testAssistantSession.
//  · Un turno entra en el historial solo cerrado: ningún functionCall sin su functionResponse, ni tras Stop ni tras un error.
//  · El contexto vivo viaja dentro de functionResponse.response (appContext); las rondas ≥ 2 no llevan partes de texto.
//  · Declaraciones e instrucción fijas en todo el turno; respaldo de modelo solo antes de la primera respuesta del modelo.
//  · Sin reintentos ni continuación automática fuera de la tabla del bucle; Stop no reenvía nada.
//  · Límite de pasos con cierre limpio; herramientas que fallan vuelven al modelo; las escrituras van en orden, una a una.
import assert from 'node:assert/strict';
import { ScriptedLlm, type ScriptedCall } from './support/scriptedLlm';
import { LlmError } from '../services/llm/errors';
import type { LlmContent, LlmRequest, LlmToolDeclaration } from '../services/llm/types';
import { closedTurnProblems, runAgentLoop, type AgentLoopOptions, type LoopToolCall } from '../features/assistant/session/agentLoop';

const TOOLS: LlmToolDeclaration[] = [
  { name: 'read_a', description: 'Lee A', parameters: { type: 'object', properties: {} } },
  { name: 'write_b', description: 'Escribe B', parameters: { type: 'object', properties: { n: { type: 'number' } } } },
];
const SYSTEM = 'Instrucción fija del turno.';
const userTurn = (text: string): LlmContent => ({ role: 'user', parts: [{ type: 'text', text }, { type: 'text', text: '{"appContext":{"view":"dashboard"}}' }] });

interface Harness {
  llm: ScriptedLlm;
  executed: LoopToolCall[];
  context: { view: string };
  controller: AbortController;
  options: (overrides?: Partial<AgentLoopOptions>) => AgentLoopOptions;
}
function harness(script: ConstructorParameters<typeof ScriptedLlm>[0], execute?: AgentLoopOptions['execute']): Harness {
  const llm = new ScriptedLlm(script);
  const executed: LoopToolCall[] = [];
  const context = { view: 'dashboard' };
  const controller = new AbortController();
  return {
    llm, executed, context, controller,
    options: (overrides = {}) => ({
      client: llm,
      model: 'gemini-4-hydrogen',
      fallbackModel: 'gemini-3.8-flash',
      systemInstruction: SYSTEM,
      tools: TOOLS,
      history: [],
      user: userTurn('Hola'),
      signal: controller.signal,
      liveContext: () => ({ view: context.view }),
      execute: execute ?? (async (call) => { executed.push(call); return { status: 'ok', tool: call.name, echo: call.args }; }),
      sleep: async () => {},
      ...overrides,
    }),
  };
}
const requests = (llm: ScriptedLlm) => llm.calls.map((c) => c.request as LlmRequest);
const assertClosed = (contents: readonly LlmContent[], label: string) => assert.deepEqual(closedTurnProblems(contents), [], `${label}: el turno cerrado está bien formado`);
const frParts = (content: LlmContent) => content.parts.filter((p) => p.type === 'functionResponse');

// ── 1. Turno normal con una herramienta: historial cerrado, contexto vivo en functionResponse.response, prefijo fijo ──────
{
  const h = harness([
    { functionCalls: [{ id: 'fc-1', name: 'read_a', args: {} }], text: 'Voy a mirar.' },
    (call: ScriptedCall) => {
      // Ronda 2: la última parte del turno del usuario es SOLO la respuesta de la herramienta (sin texto aparte).
      const last = (call.request as LlmRequest).contents.at(-1)!;
      assert.equal(last.role, 'user');
      assert.ok(last.parts.every((p) => p.type === 'functionResponse'), 'ronda ≥ 2: ninguna parte de texto en el turno del usuario');
      return { text: 'Listo: A está bien.' };
    },
  ]);
  const events: string[] = [];
  const result = await runAgentLoop(h.options({ onEvent: (e) => events.push(e.type) }));
  assert.equal(result.outcome, 'finished');
  assert.equal(result.text, 'Voy a mirar.\n\nListo: A está bien.');
  assertClosed(result.contents, 'turno normal');
  assert.equal(result.contents[0].role, 'user');
  assert.equal(result.contents.at(-1)!.role, 'model', 'el turno cerrado termina en el modelo');
  const fr = result.contents[2].parts[0];
  assert.ok(fr.type === 'functionResponse' && fr.id === 'fc-1' && fr.name === 'read_a', 'la respuesta lleva el id y el nombre de la llamada');
  assert.deepEqual((fr as { response: Record<string, unknown> }).response.appContext, { view: 'dashboard' }, 'el contexto vivo viaja DENTRO de functionResponse.response');
  const [r1, r2] = requests(h.llm);
  assert.equal(r1.systemInstruction, SYSTEM);
  assert.deepEqual(r2.tools, r1.tools, 'mismas declaraciones en todas las rondas');
  assert.equal(r2.systemInstruction, r1.systemInstruction, 'misma instrucción en todas las rondas');
  assert.deepEqual(h.llm.calls.map((c) => c.method), ['stream', 'stream'], 'el bucle transmite');
  assert.ok(events.includes('tool_started') && events.includes('tool_finished') && events.includes('text'));
  h.llm.assertDone();
}

// ── 2. Las declaraciones no cambian durante el turno aunque cambien fuera (navegar, otra política) ───────────────────────
{
  const tools = structuredClone(TOOLS);
  const h = harness([
    { functionCalls: [{ id: 'a', name: 'write_b', args: { n: 1 } }] },
    { functionCalls: [{ id: 'b', name: 'read_a', args: {} }] },
    { text: 'Fin.' },
  ], async (call) => {
    // La herramienta «navega» y alguien muta el array que se pasó: el bucle ya copió el suyo al empezar.
    tools.pop();
    h.context.view = 'simulator';
    return { status: 'applied', tool: call.name };
  });
  const result = await runAgentLoop(h.options({ tools }));
  assert.equal(result.outcome, 'finished');
  const sent = requests(h.llm);
  assert.equal(sent.length, 3);
  for (const r of sent) assert.deepEqual(r.tools, TOOLS, 'declaraciones fijas durante todo el turno');
  const lastFr = frParts(result.contents.at(-2)!)[0] as { response: Record<string, unknown> };
  assert.deepEqual(lastFr.response.appContext, { view: 'simulator' }, 'el contexto vivo se recalcula en cada resultado');
}

// ── 3. Una herramienta que falla no cuelga el turno: el error vuelve al modelo y el modelo cambia de estrategia ─────────────
{
  const h = harness([
    { functionCalls: [{ id: 'x', name: 'write_b', args: { n: 1 } }] },
    (call: ScriptedCall) => {
      const fr = (call.request as LlmRequest).contents.at(-1)!.parts[0] as { response: Record<string, any> };
      assert.equal(fr.response.status, 'error');
      assert.equal(fr.response.error.code, 'tool_failed');
      assert.match(fr.response.error.message, /se rompió/);
      return { functionCalls: [{ id: 'y', name: 'read_a', args: {} }] };
    },
    { text: 'Lo hice por otro camino.' },
  ], async (call) => {
    if (call.name === 'write_b') throw new Error('La herramienta se rompió.');
    return { status: 'ok', tool: call.name };
  });
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'finished', 'el turno no se cuelga ni falla por una herramienta');
  assert.equal(result.text, 'Lo hice por otro camino.');
  assertClosed(result.contents, 'herramienta que falla');
}

// ── 4. Stop a mitad de una llamada: la ejecutada lleva su resultado, las demás «cancelada»; no se reenvía nada ─────────────
{
  const h = harness([
    { functionCalls: [{ id: 'w1', name: 'write_b', args: { n: 1 } }, { id: 'w2', name: 'write_b', args: { n: 2 } }, { id: 'r3', name: 'read_a', args: {} }] },
  ]);
  const controller = h.controller;
  let ran = 0;
  const result = await runAgentLoop(h.options({
    execute: async (call, signal) => {
      ran++;
      if (call.callId === 'c1') {
        controller.abort('stop');
        assert.ok(signal.aborted, 'la herramienta en curso recibe la señal');
        return { status: 'error', tool: call.name, error: { code: 'cancelled', message: 'Solicitud cancelada.' } };
      }
      return { status: 'applied', tool: call.name, activityId: `act-${call.callId}` };
    },
  }));
  assert.equal(result.outcome, 'cancelled');
  assert.equal(ran, 2, 'tras Stop no se ejecuta ninguna llamada más');
  assert.equal(h.llm.calls.length, 1, 'Stop no reenvía nada al modelo');
  assertClosed(result.contents, 'Stop a mitad de llamada');
  const frs = frParts(result.contents[2]) as Array<{ id?: string; response: Record<string, any> }>;
  assert.deepEqual(frs.map((p) => p.id), ['w1', 'w2', 'r3'], 'una respuesta por llamada, en el orden del modelo');
  assert.equal(frs[0].response.status, 'applied', 'la ejecutada conserva su resultado real');
  assert.equal(frs[0].response.activityId, 'act-c0');
  assert.equal(frs[2].response.error.code, 'cancelled', 'las no ejecutadas reciben «cancelada»');
  assert.equal(frs[2].response.error.retryable, false);
  assert.equal(result.contents.at(-1)!.role, 'model', 'cierre sintético del modelo: el turno siguiente alterna bien');
  // El turno siguiente funciona sobre ese historial: la primera petición lo lleva tal cual, sin huérfanos.
  const next = harness([{ text: 'Sigo aquí.' }]);
  const again = await runAgentLoop(next.options({ history: result.contents, user: userTurn('¿Sigues?') }));
  assert.equal(again.outcome, 'finished');
  assertClosed([...result.contents, ...again.contents], 'historial tras Stop');
  assert.deepEqual(requests(next.llm)[0].contents.slice(0, result.contents.length), result.contents);
}

// ── 5. Stop a mitad del stream del modelo: lo parcial no entra en el historial y no hay más peticiones ─────────────────────
{
  const h = harness([]);
  h.llm.push(() => { h.controller.abort('stop'); return { functionCalls: [{ id: 'z', name: 'write_b', args: {} }] }; });
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'cancelled');
  assert.equal(h.executed.length, 0, 'la llamada del stream cortado no se ejecuta');
  assert.deepEqual(result.contents, [], 'sin contenido del modelo y sin herramientas: el turno no entra en el historial');
  assert.equal(h.llm.calls.length, 1);
  // Con rondas anteriores, lo cerrado se conserva y lo parcial se descarta.
  const h2 = harness([{ functionCalls: [{ id: 'k', name: 'read_a', args: {} }] }]);
  h2.llm.push({ stream: [{ type: 'text', text: 'Escribiendo a medi' }, { error: new LlmError('cancelled', { reason: 'stop' }) }] });
  const r2 = await runAgentLoop(h2.options({ onEvent: (e) => { if (e.type === 'text') h2.controller.abort('stop'); } }));
  assert.equal(r2.outcome, 'cancelled');
  assertClosed(r2.contents, 'stream cortado en la ronda 2');
  assert.equal(r2.contents.length, 4, 'usuario, llamada, respuesta y cierre sintético');
  assert.ok(!JSON.stringify(r2.contents).includes('a medi'), 'el texto parcial no entra en el historial');
}

// ── 6. Límite de pasos: cierre limpio con resumen, sin otra petición al modelo ─────────────────────────────────────────────
{
  const h = harness([
    { functionCalls: [{ id: '1', name: 'read_a', args: {} }, { id: '2', name: 'read_a', args: {} }] },
    { functionCalls: [{ id: '3', name: 'write_b', args: {} }, { id: '4', name: 'write_b', args: {} }] },
  ]);
  const result = await runAgentLoop(h.options({ limits: { maxToolCalls: 3 }, closingText: (outcome) => `Cierre: ${outcome}` }));
  assert.equal(result.outcome, 'step_limit');
  assert.equal(h.executed.length, 3, 'se ejecutan exactamente los pasos del presupuesto');
  assert.equal(h.llm.calls.length, 2, 'al agotar el presupuesto no se pide otra ronda');
  assertClosed(result.contents, 'límite de pasos');
  const frs = frParts(result.contents[4]) as Array<{ response: Record<string, any> }>;
  assert.equal(frs[1].response.error.code, 'step_limit', 'la llamada que sobra recibe su respuesta, no queda huérfana');
  assert.deepEqual(result.contents.at(-1), { role: 'model', parts: [{ type: 'text', text: 'Cierre: step_limit' }] }, 'cierre con resumen');
  h.llm.assertDone();
}

// ── 7. Como mucho N llamadas por respuesta: las que sobran reciben error en orden y no cuentan ───────────────────────────
{
  const calls = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: 'read_a', args: {} }));
  const h = harness([{ functionCalls: calls }, { text: 'ok' }]);
  const result = await runAgentLoop(h.options());
  assert.equal(h.executed.length, 8);
  const frs = frParts(result.contents[2]) as Array<{ id?: string; response: Record<string, any> }>;
  assert.deepEqual(frs.map((p) => p.id), calls.map((c) => c.id));
  assert.equal(frs[9].response.error.code, 'too_many_calls');
  assertClosed(result.contents, 'tope por respuesta');
}

// ── 8. Respaldo de modelo SOLO antes de la primera respuesta del modelo en el turno ───────────────────────────────────────
{
  // Ronda 1 sin contenido del modelo: un 503 pasa al respaldo, que se queda para todo el turno.
  const h = harness([
    { error: new LlmError('server', { status: 503 }) },
    { functionCalls: [{ id: 'f', name: 'read_a', args: {} }] },
    { text: 'Hecho con el respaldo.' },
  ]);
  const events: Array<{ type: string; from?: string; to?: string }> = [];
  const result = await runAgentLoop(h.options({ onEvent: (e) => events.push(e as never) }));
  assert.equal(result.outcome, 'finished');
  assert.deepEqual(requests(h.llm).map((r) => r.model), ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.8-flash'], 'el respaldo se fija para el turno');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.ok(events.some((e) => e.type === 'model_fallback' && e.from === 'gemini-4-hydrogen' && e.to === 'gemini-3.8-flash'));
}
{
  // Ronda 2: un 503 nunca cambia de modelo (firmas de pensamiento del modelo base en el turno): un reintento con el mismo.
  const h = harness([
    { functionCalls: [{ id: 'f', name: 'read_a', args: {} }] },
    { error: new LlmError('server', { status: 503 }) },
    { text: 'Hecho tras reintentar.' },
  ]);
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'finished');
  assert.deepEqual(requests(h.llm).map((r) => r.model), ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-4-hydrogen'], 'un 503 en la ronda 2 nunca cambia de modelo');
}
{
  // Ronda 1 con contenido ya recibido (texto parcial) y luego un 503: tampoco hay respaldo.
  const h = harness([{ stream: [{ type: 'text', text: 'Empiezo' }, { error: new LlmError('server', { status: 503 }) }] }, { text: 'Reintento con el mismo.' }]);
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'finished');
  assert.deepEqual(requests(h.llm).map((r) => r.model), ['gemini-4-hydrogen', 'gemini-4-hydrogen'], 'tras la primera respuesta del modelo no hay respaldo');
}
{
  // Ronda 2 que vuelve a fallar: el turno se cierra (fallido) con lo hecho, sin otro modelo y sin quedar huérfano.
  const h = harness([
    { functionCalls: [{ id: 'f', name: 'write_b', args: {} }] },
    { error: new LlmError('server', { status: 503 }) },
    { error: new LlmError('server', { status: 503 }) },
  ]);
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'failed');
  assert.equal(result.error?.kind, 'server');
  assert.equal(h.llm.calls.length, 3, 'un único reintento');
  assertClosed(result.contents, 'ronda 2 fallida');
  assert.equal(h.executed.length, 1, 'lo aplicado se conserva y se informa');
}
{
  // Clave inválida en la ronda 1: no hay respaldo ni reintento, y el turno no entra en el historial.
  const h = harness([{ error: new LlmError('invalid_key', { status: 401 }) }]);
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'failed');
  assert.equal(result.error?.kind, 'invalid_key');
  assert.equal(h.llm.calls.length, 1);
  assert.deepEqual(result.contents, []);
}

// ── 9. Sin continuación automática y tabla de motivos de fin ──────────────────────────────────────────────────────────────
{
  // CONTINUATION / MAX_TOKENS con solo texto: se cierra con lo recibido; el bucle no encadena otra petición.
  for (const finishReason of ['continuation', 'max_tokens'] as const) {
    const h = harness([{ text: 'Respuesta larga a medias', finishReason }]);
    const result = await runAgentLoop(h.options());
    assert.equal(h.llm.calls.length, 1, `${finishReason}: sin continuación automática`);
    assert.equal(result.outcome, 'finished');
    assert.equal(result.truncated, true);
    assertClosed(result.contents, finishReason);
  }
  // MALFORMED_FUNCTION_CALL: un único reintento de la ronda; su contenido no entra en el historial.
  const h = harness([{ text: '', finishReason: 'malformed_function_call' }, { text: 'Ahora sí.' }]);
  const result = await runAgentLoop(h.options());
  assert.equal(result.outcome, 'finished');
  assert.equal(h.llm.calls.length, 2);
  assert.equal(result.contents.length, 2, 'el contenido mal formado se descarta');
  const twice = harness([{ text: '', finishReason: 'unexpected_tool_call' }, { text: '', finishReason: 'malformed_function_call' }]);
  const failed = await runAgentLoop(twice.options());
  assert.equal(failed.outcome, 'failed');
  assert.equal(twice.llm.calls.length, 2, 'un solo reintento');
  // TOO_MANY_TOOL_CALLS y SAFETY: cierre con resumen local, sin reintentar.
  for (const finishReason of ['too_many_tool_calls', 'safety'] as const) {
    const s = harness([{ text: '', finishReason }]);
    const r = await runAgentLoop(s.options());
    assert.equal(s.llm.calls.length, 1, `${finishReason}: sin reintento`);
    assert.equal(r.outcome, 'failed');
    assert.equal(r.error?.code, finishReason);
  }
  // Respuesta vacía con STOP: se cierra con el texto de cierre local, no con un error.
  const empty = harness([{ functionCalls: [{ id: 'e', name: 'read_a', args: {} }] }, { text: '' }]);
  const closed = await runAgentLoop(empty.options({ closingText: () => 'Resumen local.' }));
  assert.equal(closed.outcome, 'finished');
  assert.equal(closed.text, '');
  assertClosed(closed.contents, 'respuesta vacía');
  assert.deepEqual(closed.contents.at(-1), { role: 'model', parts: [{ type: 'text', text: 'Resumen local.' }] });
}

// ── 10. Las llamadas de una respuesta se ejecutan en orden, una a una (las escrituras nunca en paralelo) ─────────────────
{
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const h = harness([
    { functionCalls: [{ id: 'a', name: 'write_b', args: { n: 1 } }, { id: 'b', name: 'read_a', args: {} }, { id: 'c', name: 'write_b', args: { n: 2 } }] },
    { text: 'ok' },
  ], async (call) => {
    active++;
    maxActive = Math.max(maxActive, active);
    order.push(call.args.n === undefined ? call.name : `${call.name}:${call.args.n}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { status: 'ok', tool: call.name };
  });
  await runAgentLoop(h.options());
  assert.deepEqual(order, ['write_b:1', 'read_a', 'write_b:2'], 'en el orden que pidió el modelo');
  assert.equal(maxActive, 1, 'nunca dos herramientas a la vez');
}

// ── 11. Ids de llamada por turno y firmas devueltas intactas ───────────────────────────────────────────────────────────
{
  const h = harness([
    { parts: [{ type: 'text', text: '', signature: 'sig-0' }, { type: 'functionCall', call: { name: 'read_a', args: {} }, signature: 'sig-1' }] },
    { text: 'fin' },
  ]);
  const result = await runAgentLoop(h.options());
  assert.equal(h.executed[0].callId, 'c0', 'el bucle numera las llamadas del turno (clave de idempotencia turno:llamada)');
  assert.deepEqual(result.contents[1].parts, [{ type: 'text', text: '', signature: 'sig-0' }, { type: 'functionCall', call: { name: 'read_a', args: {} }, signature: 'sig-1' }], 'el turno del modelo vuelve tal cual, con sus firmas');
  const fr = result.contents[2].parts[0];
  assert.ok(fr.type === 'functionResponse' && fr.id === undefined && fr.name === 'read_a', 'sin id del modelo, la respuesta va sin id');
  assert.deepEqual(requests(h.llm)[1].contents.slice(0, 3), result.contents.slice(0, 3));
}

// ── 12. El validador de turnos cerrados detecta lo que daría 400 ────────────────────────────────────────────────────────
assert.ok(closedTurnProblems([userTurn('x'), { role: 'model', parts: [{ type: 'functionCall', call: { id: 'q', name: 'read_a', args: {} } }] }]).length > 0, 'functionCall sin respuesta');
assert.ok(closedTurnProblems([userTurn('x'), { role: 'model', parts: [{ type: 'functionCall', call: { id: 'q', name: 'read_a', args: {} } }] }, { role: 'user', parts: [{ type: 'functionResponse', id: 'otro', name: 'read_a', response: {} }] }, { role: 'model', parts: [{ type: 'text', text: 'x' }] }]).length > 0, 'respuesta con otro id');
assert.ok(closedTurnProblems([{ role: 'model', parts: [{ type: 'text', text: 'x' }] }]).length > 0, 'un turno empieza en el usuario');
assert.ok(closedTurnProblems([userTurn('x')]).length > 0, 'un turno cerrado termina en el modelo');
assert.deepEqual(closedTurnProblems([]), [], 'vacío es válido (turno descartado)');

console.log('PASS: assistant agent loop (closed turns, live context, fixed declarations, fallback, stop, limits).');
