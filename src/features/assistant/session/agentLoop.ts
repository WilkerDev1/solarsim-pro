/**
 * Bucle del asistente de la app (F4, ADR 0011) sobre el puerto LlmClient. No conoce el store ni React: recibe el cliente, las
 * declaraciones, el historial cerrado, el turno del usuario y un ejecutor de herramientas, y devuelve el turno CERRADO.
 *
 * Reglas que no se negocian (revisión del plan):
 *  1. Un turno entra en el historial solo cerrado: el resultado (`contents`) empieza en el usuario, termina en el modelo y
 *     cada functionCall lleva su functionResponse (mismo id y nombre, en el orden del modelo, en un solo content). Tras Stop,
 *     plazo o error, las llamadas ejecutadas llevan su resultado real y las demás uno sintético «cancelada»; lo parcial del
 *     stream se descarta. Sin nada que conservar, `contents` va vacío (el turno no entra).
 *  2. El contexto vivo viaja dentro de functionResponse.response (`appContext`), nunca como una parte de texto aparte.
 *  3. Declaraciones e instrucción se copian al empezar y no cambian durante el turno.
 *  4. El modelo de respaldo solo entra antes de la primera respuesta del modelo en el turno (ronda 1 sin contenido recibido);
 *     después se reintenta una vez con el MISMO modelo.
 *  5. Sin reintentos del SDK ni continuación automática: la tabla de motivos de fin la decide este bucle.
 *  6. Presupuesto de pasos (llamadas a herramientas) y de tiempo por turno, con cierre limpio y resumen.
 *  7. Stop cierra el turno y no envía nada más.
 *  8. Las llamadas de una respuesta se ejecutan en orden, una a una: una escritura nunca va en paralelo con otra ni con una
 *     lectura que dependa de ella.
 * Una herramienta que falla (o lanza) devuelve su error al modelo como functionResponse para que cambie de estrategia.
 */
import { isLlmError, LlmError, type LlmErrorKind } from '../../../services/llm/errors';
import type {
  LlmClient, LlmContent, LlmFinishReason, LlmFunctionCall, LlmPart, LlmRequest, LlmResponse, LlmToolDeclaration,
} from '../../../services/llm/types';

export interface LoopLimits {
  /** Llamadas a herramientas ejecutadas por turno. */
  maxToolCalls: number;
  /** Llamadas que se ejecutan de una misma respuesta del modelo; las demás reciben un error y no cuentan. */
  maxCallsPerResponse: number;
  /** Rondas (peticiones con respuesta) por turno: red de seguridad aparte de los pasos. */
  maxRounds: number;
  /** Plazo del turno (ms); se comprueba antes de cada ronda. */
  turnTimeoutMs: number;
  /** Plazo total de cada petición (ms), acotado por lo que quede del turno. */
  requestTimeoutMs: number;
}
export const DEFAULT_LOOP_LIMITS: LoopLimits = {
  maxToolCalls: 24, maxCallsPerResponse: 8, maxRounds: 30, turnTimeoutMs: 180_000, requestTimeoutMs: 120_000,
};

export interface LoopToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Número de la llamada en el turno (`c0`, `c1`…): con el turno forma la clave de idempotencia. */
  callId: string;
  /** Id que puso el modelo (puede faltar). */
  modelCallId?: string;
}

export type LoopOutcome = 'finished' | 'cancelled' | 'step_limit' | 'time_limit' | 'failed';

export type LoopEvent =
  /** Empieza una petición (también un reintento): lo transmitido antes en la misma ronda se descarta. */
  | { type: 'round_started'; round: number; model: string }
  /** La respuesta de la ronda se aceptó: su texto visible ya es parte del turno. */
  | { type: 'round_finished'; round: number; text: string }
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_started'; call: LoopToolCall }
  | { type: 'tool_finished'; call: LoopToolCall; response: Record<string, unknown> }
  | { type: 'model_fallback'; from: string; to: string; reason: LlmErrorKind }
  | { type: 'round_retry'; round: number; reason: string };

export interface AgentLoopOptions {
  client: LlmClient;
  model: string;
  /** Modelo de respaldo (solo antes de la primera respuesta del modelo en el turno). */
  fallbackModel?: string;
  systemInstruction: string;
  tools: readonly LlmToolDeclaration[];
  /** Turnos anteriores, todos cerrados. */
  history: readonly LlmContent[];
  /** Mensaje del usuario de este turno (texto, adjuntos y, como última parte, el contexto de la app). */
  user: LlmContent;
  /** Ejecuta una herramienta y devuelve el cuerpo de functionResponse.response. Puede lanzar: el error vuelve al modelo. */
  execute(call: LoopToolCall, signal: AbortSignal): Promise<Record<string, unknown>>;
  /** Contexto vivo que se añade a cada resultado como `appContext` (se lee después de ejecutar cada llamada). */
  liveContext?(): Record<string, unknown>;
  onEvent?(event: LoopEvent): void;
  signal: AbortSignal;
  limits?: Partial<LoopLimits>;
  /** Texto con que se cierra el turno en el historial cuando el modelo no dio respuesta final (Stop, límite, error). */
  closingText?(outcome: LoopOutcome, error?: LoopError): string;
  /** Opciones de razonamiento según el modelo (p. ej. resúmenes de pensamiento solo donde la familia los admite). */
  thinking?(model: string): Pick<LlmRequest, 'includeThoughts' | 'thinkingLevel'>;
  /** Espera antes del reintento sobre el mismo modelo (inyectable en pruebas). */
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

export interface LoopError {
  code: string;
  message: string;
  kind?: LlmErrorKind;
}

export interface AgentLoopResult {
  outcome: LoopOutcome;
  /** El turno cerrado para el historial (vacío si no hay nada que conservar). */
  contents: LlmContent[];
  /** Texto visible de las respuestas completas del modelo en el turno. */
  text: string;
  /** Modelo con que terminó el turno. */
  model: string;
  toolCalls: number;
  /** La última respuesta se cortó por longitud (MAX_TOKENS o CONTINUATION): se cerró con lo recibido. */
  truncated?: boolean;
  error?: LoopError;
}

const RETRY_DELAY_MS = 800;
/** Motivos de fin que permiten un único reintento de la ronda (el contenido mal formado no entra en el historial). */
const RETRY_ROUND: ReadonlySet<LlmFinishReason> = new Set(['malformed_function_call', 'unexpected_tool_call', 'malformed_response']);
/** Motivos de fin que cierran el turno sin reintentar. */
const CLOSE_TURN: Readonly<Partial<Record<LlmFinishReason, string>>> = {
  too_many_tool_calls: 'El modelo pidió demasiadas herramientas a la vez.',
  missing_thought_signature: 'Error interno del asistente con el historial del turno.',
  safety: 'Google Gemini bloqueó la respuesta por sus filtros de seguridad.',
  recitation: 'Google Gemini cortó la respuesta por citar contenido protegido.',
  other: 'Google Gemini terminó la respuesta sin completarla.',
};

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const cancelledResponse = (name: string) => ({
  status: 'error', tool: name, error: { code: 'cancelled', message: 'Turno detenido por el usuario antes de ejecutar esta llamada.', retryable: false },
});
const errorResponse = (name: string, code: string, message: string) => ({ status: 'error', tool: name, error: { code, message } });

function frPart(call: LlmFunctionCall, response: Record<string, unknown>): LlmPart {
  return { type: 'functionResponse', ...(call.id ? { id: call.id } : {}), name: call.name, response };
}
const modelText = (text: string): LlmContent => ({ role: 'model', parts: [{ type: 'text', text }] });
const visible = (content: LlmContent) => content.parts.map((p) => (p.type === 'text' && !p.thought ? p.text : '')).join('');

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const limits: LoopLimits = { ...DEFAULT_LOOP_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  const started = now();
  // Fijos para todo el turno (regla 3): copias, no referencias.
  const tools: LlmToolDeclaration[] = structuredClone([...options.tools]);
  const systemInstruction = options.systemInstruction;
  const history = structuredClone([...options.history]);
  const turn: LlmContent[] = [structuredClone(options.user)];
  const emit = (event: LoopEvent) => { try { options.onEvent?.(event); } catch { /* la interfaz nunca rompe el bucle */ } };

  let model = options.model;
  let receivedModelContent = false;
  let toolCalls = 0;
  let callSeq = 0;
  let executedAny = false;
  const texts: string[] = [];
  let truncated = false;

  const close = (outcome: LoopOutcome, error?: LoopError): AgentLoopResult => {
    let contents = turn;
    // Sin respuesta del modelo ni herramientas ejecutadas: nada que conservar (Stop o error antes de responder).
    if (!executedAny && turn.length === 1 && outcome !== 'finished') contents = [];
    else if (contents.at(-1)?.role !== 'model') contents = [...contents, modelText(options.closingText?.(outcome, error) ?? defaultClosing(outcome, error))];
    const result: AgentLoopResult = { outcome, contents, text: texts.join('\n\n'), model, toolCalls, ...(truncated ? { truncated } : {}), ...(error ? { error } : {}) };
    return result;
  };
  const cancelled = () => options.signal.aborted;

  for (let round = 1; round <= limits.maxRounds; round++) {
    if (cancelled()) return close('cancelled');
    if (now() - started >= limits.turnTimeoutMs) return close('time_limit', { code: 'time_limit', message: 'Se agotó el tiempo del turno.' });

    // ── Una ronda: una petición, con a lo sumo un reintento (respaldo en la ronda 1, mismo modelo después). ──
    let response: LlmResponse | undefined;
    let retried = false;
    while (!response) {
      const request: LlmRequest = { model, systemInstruction, contents: [...history, ...turn], tools, ...options.thinking?.(model) };
      emit({ type: 'round_started', round, model });
      let receivedThisAttempt = false;
      try {
        const remaining = limits.turnTimeoutMs - (now() - started);
        const timeoutMs = Math.max(1_000, Math.min(limits.requestTimeoutMs, remaining));
        for await (const event of options.client.stream(request, { signal: options.signal, timeoutMs })) {
          if (event.type === 'text') { receivedThisAttempt = true; emit({ type: 'text', text: event.text }); }
          else if (event.type === 'thought') { receivedThisAttempt = true; emit({ type: 'thought', text: event.text }); }
          else if (event.type === 'functionCall') receivedThisAttempt = true;
          else if (event.type === 'done') response = event.response;
        }
        if (!response) throw new LlmError('malformed_response');
      } catch (error) {
        response = undefined;
        if (cancelled() || isLlmError(error, 'cancelled')) return close('cancelled');
        const kind: LlmErrorKind = isLlmError(error) ? error.kind : 'network';
        const message = error instanceof Error ? error.message : 'No se pudo completar la consulta.';
        const firstContact = round === 1 && !receivedModelContent && !receivedThisAttempt;
        if (!retried && firstContact && options.fallbackModel && options.fallbackModel !== model && (kind === 'server' || kind === 'not_found')) {
          retried = true;
          emit({ type: 'model_fallback', from: model, to: options.fallbackModel, reason: kind });
          model = options.fallbackModel;
          continue;
        }
        if (!retried && (kind === 'server' || kind === 'timeout' || kind === 'network')) {
          retried = true;
          emit({ type: 'round_retry', round, reason: kind });
          await sleep(RETRY_DELAY_MS);
          if (cancelled()) return close('cancelled');
          continue;
        }
        return close('failed', { code: kind, kind, message });
      }
      if (receivedThisAttempt) receivedModelContent = true;
      const reason = response.finishReason;
      if (RETRY_ROUND.has(reason)) {
        response = undefined;
        if (retried) return close('failed', { code: reason, message: 'El modelo devolvió una llamada mal formada dos veces.' });
        retried = true;
        emit({ type: 'round_retry', round, reason });
        continue;
      }
    }
    receivedModelContent = true;
    const reason = response.finishReason;
    const closing = CLOSE_TURN[reason];
    if (closing) return close('failed', { code: reason, message: closing });
    if (reason === 'max_tokens' || reason === 'continuation') truncated = true;

    const content = response.content;
    const calls = response.functionCalls;
    const text = visible(content);
    if (text) texts.push(text);
    emit({ type: 'round_finished', round, text });
    if (!calls.length) {
      // Respuesta final. Sin texto visible (Gemini a veces responde vacío tras una herramienta) no entra: el turno se
      // cierra con el texto local, así nunca queda un turno del modelo vacío en el historial.
      if (text.trim()) turn.push(content);
      return close('finished');
    }
    turn.push(content);

    // ── Herramientas, en orden y una a una. ──
    const responses: LlmPart[] = [];
    let stop: { outcome: LoopOutcome; error?: LoopError } | undefined;
    for (const [index, call] of calls.entries()) {
      if (stop || cancelled()) {
        if (!stop) stop = { outcome: 'cancelled' };
        responses.push(frPart(call, stop.outcome === 'cancelled' ? cancelledResponse(call.name) : errorResponse(call.name, 'step_limit', 'Se agotó el presupuesto de pasos del turno.')));
        continue;
      }
      if (index >= limits.maxCallsPerResponse) {
        responses.push(frPart(call, withContext(errorResponse(call.name, 'too_many_calls', `Máximo ${limits.maxCallsPerResponse} herramientas por respuesta: pide esta en la siguiente.`), options)));
        continue;
      }
      if (toolCalls >= limits.maxToolCalls) {
        stop = { outcome: 'step_limit', error: { code: 'step_limit', message: 'Se agotó el presupuesto de pasos del turno.' } };
        responses.push(frPart(call, errorResponse(call.name, 'step_limit', 'Se agotó el presupuesto de pasos del turno.')));
        continue;
      }
      const loopCall: LoopToolCall = { name: call.name, args: { ...(call.args ?? {}) }, callId: `c${callSeq++}`, ...(call.id ? { modelCallId: call.id } : {}) };
      toolCalls++;
      executedAny = true;
      emit({ type: 'tool_started', call: loopCall });
      let body: Record<string, unknown>;
      try {
        body = await options.execute(loopCall, options.signal);
        if (!body || typeof body !== 'object' || Array.isArray(body)) body = { status: 'ok', tool: call.name, data: body };
      } catch (error) {
        body = errorResponse(call.name, 'tool_failed', error instanceof Error ? error.message : 'La herramienta falló.');
      }
      body = withContext(body, options);
      emit({ type: 'tool_finished', call: loopCall, response: body });
      responses.push(frPart(call, body));
    }
    turn.push({ role: 'user', parts: responses });
    if (stop) return close(stop.outcome, stop.error);
    if (cancelled()) return close('cancelled');
  }
  return close('step_limit', { code: 'step_limit', message: 'Se agotó el número de rondas del turno.' });
}

function withContext(body: Record<string, unknown>, options: AgentLoopOptions): Record<string, unknown> {
  if (!options.liveContext) return body;
  try {
    return { ...body, appContext: options.liveContext() };
  } catch {
    return body;
  }
}

function defaultClosing(outcome: LoopOutcome, error?: LoopError): string {
  switch (outcome) {
    case 'cancelled': return 'Turno detenido por el usuario.';
    case 'step_limit': return 'Turno cerrado: se alcanzó el límite de pasos.';
    case 'time_limit': return 'Turno cerrado: se agotó el tiempo.';
    case 'failed': return `Turno cerrado por un error${error ? `: ${error.message}` : '.'}`;
    default: return 'Listo.';
  }
}

/**
 * Problemas de un historial de turnos cerrados (vacío si está bien): cada turno empieza en un mensaje del usuario con texto,
 * los roles alternan, cada content con functionCall va seguido de un content del usuario con UNA functionResponse por llamada
 * (mismo nombre e id, en orden) y el historial termina en el modelo. Es lo que Gemini exige; un fallo aquí sería un 400.
 */
export function closedTurnProblems(contents: readonly LlmContent[]): string[] {
  const problems: string[] = [];
  if (!contents.length) return problems;
  if (contents[0].role !== 'user') problems.push('El historial empieza en el modelo.');
  if (contents.at(-1)!.role !== 'model') problems.push('El último turno no está cerrado (no termina en el modelo).');
  contents.forEach((content, index) => {
    if (!content.parts.length) problems.push(`#${index}: content sin partes.`);
    if (index > 0 && contents[index - 1].role === content.role) problems.push(`#${index}: dos contents seguidos de ${content.role}.`);
    const calls = content.parts.flatMap((p) => (p.type === 'functionCall' ? [p.call] : []));
    const responses = content.parts.filter((p): p is Extract<LlmPart, { type: 'functionResponse' }> => p.type === 'functionResponse');
    if (content.role === 'user' && responses.length) {
      const previous = contents[index - 1];
      const asked = previous?.role === 'model' ? previous.parts.flatMap((p) => (p.type === 'functionCall' ? [p.call] : [])) : [];
      if (asked.length !== responses.length) problems.push(`#${index}: ${responses.length} respuestas para ${asked.length} llamadas.`);
      responses.forEach((r, i) => {
        const c = asked[i];
        if (!c || c.name !== r.name || (c.id ?? undefined) !== (r.id ?? undefined)) problems.push(`#${index}: la respuesta ${i} (${r.name}) no corresponde a su llamada.`);
      });
      if (content.parts.length !== responses.length) problems.push(`#${index}: texto mezclado con las respuestas de herramientas.`);
    }
    if (calls.length) {
      const next = contents[index + 1];
      const answered = next?.role === 'user' ? next.parts.filter((p) => p.type === 'functionResponse').length : 0;
      if (answered !== calls.length) problems.push(`#${index}: ${calls.length} llamadas sin su respuesta (functionCall huérfano).`);
    }
  });
  return problems;
}
