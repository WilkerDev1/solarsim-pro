// Soporte de pruebas (no entra en el bundle: solo lo importan suites de src/tests).
// ScriptedLlm (alias FakeLlmClient): implementa el puerto LlmClient con un guion de respuestas y registra cada
// llamada. Sirve para probar el bucle del asistente y los escáneres sin SDK, sin red y sin clave.
import { LlmError } from '../../services/llm/errors';
import type {
  LlmCallOptions, LlmClient, LlmFinishReason, LlmFunctionCall, LlmModel, LlmPart, LlmRequest, LlmResponse,
  LlmStreamEvent, LlmStructuredRequest, LlmStructuredResponse, LlmThoughtSignature, LlmUsage,
} from '../../services/llm/types';

export type ScriptedMethod = 'generate' | 'stream' | 'structured' | 'listModels';
export interface ScriptedCall {
  method: ScriptedMethod;
  /** Copia de la petición en el momento de la llamada. */
  request?: LlmRequest | LlmStructuredRequest;
  options?: Omit<LlmCallOptions, 'signal'> & { aborted?: boolean };
}

/** Respuesta del modelo: texto, pensamiento y llamadas, o partes exactas. */
export interface ScriptedResponse {
  text?: string;
  thought?: string;
  functionCalls?: Array<LlmFunctionCall & { signature?: LlmThoughtSignature }>;
  /** Partes exactas del turno (sustituyen a text/thought/functionCalls). */
  parts?: LlmPart[];
  finishReason?: LlmFinishReason;
  usage?: LlmUsage;
}
/** Paso ya resuelto (sin funciones ni errores). */
type ResolvedStep =
  | ScriptedResponse
  /** Trozos de stream tal cual; un `{ error }` lanza en ese punto; si no hay `done` se añade al final. */
  | { stream: Array<LlmStreamEvent | { error: unknown }> }
  /** Salida de `structured` (en generate/stream se ve como el texto JSON). */
  | { data: unknown };
export type ScriptedStep =
  | ResolvedStep
  | { error: unknown }
  | ((call: ScriptedCall) => ScriptedStep | Promise<ScriptedStep>);

const cancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new LlmError('cancelled', { reason: signal.reason });
};

function partsOf(step: ScriptedResponse): LlmPart[] {
  if (step.parts) return structuredClone(step.parts);
  const parts: LlmPart[] = [];
  if (step.thought) parts.push({ type: 'text', text: step.thought, thought: true });
  if (step.text !== undefined) parts.push({ type: 'text', text: step.text });
  for (const { signature, ...call } of step.functionCalls ?? []) parts.push({ type: 'functionCall', call: structuredClone(call), ...(signature ? { signature } : {}) });
  return parts;
}
function responseOf(model: string, parts: LlmPart[], finishReason: LlmFinishReason = 'stop', usage?: LlmUsage): LlmResponse {
  return {
    model,
    content: { role: 'model', parts },
    text: parts.map((p) => (p.type === 'text' && !p.thought ? p.text : '')).join(''),
    functionCalls: parts.flatMap((p) => (p.type === 'functionCall' ? [p.call] : [])),
    finishReason,
    ...(usage ? { usage } : {}),
  };
}
/** Pliega trozos de stream en la respuesta final (lo que haría el adaptador). */
function foldEvents(model: string, events: LlmStreamEvent[]): LlmResponse {
  const done = events.find((e): e is Extract<LlmStreamEvent, { type: 'done' }> => e.type === 'done');
  if (done) return done.response;
  const parts: LlmPart[] = [];
  let usage: LlmUsage | undefined;
  for (const event of events) {
    const last = parts.at(-1);
    if (event.type === 'text' || event.type === 'thought') {
      const thought = event.type === 'thought';
      if (last?.type === 'text' && !!last.thought === thought && !last.signature) last.text += event.text;
      else parts.push({ type: 'text', text: event.text, ...(thought ? { thought } : {}) });
    } else if (event.type === 'functionCall') parts.push({ type: 'functionCall', call: event.call, ...(event.signature ? { signature: event.signature } : {}) });
    else if (event.type === 'usage') usage = event.usage;
  }
  return responseOf(model, parts, 'stop', usage);
}
function eventsOf(response: LlmResponse): LlmStreamEvent[] {
  const events: LlmStreamEvent[] = [];
  for (const part of response.content.parts) {
    if (part.type === 'text' && part.text) events.push(part.thought ? { type: 'thought', text: part.text } : { type: 'text', text: part.text });
    if (part.type === 'functionCall') events.push({ type: 'functionCall', call: part.call, ...(part.signature ? { signature: part.signature } : {}) });
  }
  if (response.usage) events.push({ type: 'usage', usage: response.usage });
  events.push({ type: 'done', response });
  return events;
}

export class ScriptedLlm implements LlmClient {
  readonly calls: ScriptedCall[] = [];
  private readonly script: ScriptedStep[];
  private readonly models: LlmModel[] | Error;
  private extraCalls = 0;
  constructor(script: ScriptedStep[] = [], options: { models?: LlmModel[] | Error } = {}) {
    this.script = [...script];
    this.models = options.models ?? [];
  }
  /** Añade pasos al guion. */
  push(...steps: ScriptedStep[]) { this.script.push(...steps); }
  get remaining() { return this.script.length; }
  /** Falla si quedan pasos sin usar o si hubo llamadas sin guion. */
  assertDone() {
    if (this.script.length || this.extraCalls) throw new Error(`ScriptedLlm: el guion no terminó limpio (quedan ${this.script.length} pasos; ${this.extraCalls} llamadas sin guion).`);
  }

  private record(method: ScriptedMethod, request?: LlmRequest | LlmStructuredRequest, options?: LlmCallOptions): ScriptedCall {
    const { signal, ...rest } = options ?? {};
    const call: ScriptedCall = { method, ...(request ? { request: structuredClone(request) } : {}), ...(options ? { options: { ...rest, ...(signal ? { aborted: signal.aborted } : {}) } } : {}) };
    this.calls.push(call);
    return call;
  }
  private async next(call: ScriptedCall): Promise<ResolvedStep> {
    let step = this.script.shift();
    if (!step) {
      this.extraCalls++;
      throw new Error(`ScriptedLlm: guion agotado en la llamada ${this.calls.length} (${call.method}).`);
    }
    while (typeof step === 'function') step = await step(call);
    if ('error' in step) throw step.error;
    return step as ResolvedStep;
  }
  private responseFrom(model: string, step: ResolvedStep): LlmResponse {
    if ('stream' in step) return foldEvents(model, step.stream.filter((e): e is LlmStreamEvent => !('error' in e)));
    if ('data' in step) return responseOf(model, [{ type: 'text', text: JSON.stringify(step.data) }]);
    return responseOf(model, partsOf(step), step.finishReason, step.usage);
  }

  async generate(request: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse> {
    cancelled(options?.signal);
    const call = this.record('generate', request, options);
    const step = await this.next(call);
    if ('stream' in step) for (const e of step.stream) if ('error' in e) throw e.error;
    return this.responseFrom(request.model, step);
  }

  async *stream(request: LlmRequest, options?: LlmCallOptions): AsyncGenerator<LlmStreamEvent> {
    cancelled(options?.signal);
    const call = this.record('stream', request, options);
    const step = await this.next(call);
    const items: Array<LlmStreamEvent | { error: unknown }> = 'stream' in step ? step.stream : eventsOf(this.responseFrom(request.model, step));
    const emitted: LlmStreamEvent[] = [];
    for (const item of items) {
      cancelled(options?.signal);
      if ('error' in item) throw item.error;
      emitted.push(item);
      yield item;
      cancelled(options?.signal);
    }
    if (!emitted.some((e) => e.type === 'done')) yield { type: 'done', response: foldEvents(request.model, emitted) };
  }

  async structured<T = Record<string, unknown>>(request: LlmStructuredRequest, options?: LlmCallOptions): Promise<LlmStructuredResponse<T>> {
    cancelled(options?.signal);
    const call = this.record('structured', request, options);
    const step = await this.next(call);
    const response = this.responseFrom(request.model, step);
    if ('data' in step) return { data: structuredClone(step.data) as T, response };
    if (response.finishReason !== 'stop') throw new LlmError('malformed_response', { finishReason: response.finishReason });
    try {
      const data = JSON.parse(response.text);
      if (data && typeof data === 'object' && !Array.isArray(data)) return { data: data as T, response };
    } catch { /* abajo */ }
    throw new LlmError('malformed_response', { finishReason: response.finishReason });
  }

  async listModels(options?: LlmCallOptions): Promise<LlmModel[]> {
    cancelled(options?.signal);
    this.record('listModels', undefined, options);
    if (this.models instanceof Error) throw this.models;
    return structuredClone(this.models);
  }
}

export { ScriptedLlm as FakeLlmClient };
