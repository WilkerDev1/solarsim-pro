// Único adaptador del puerto LlmClient sobre el SDK oficial @google/genai (versión exacta en package.json).
// Es el único sitio de la app que importa el SDK (ADR 0008; lo comprueba testLlmBoundary). Corre en el renderer:
// electron/ no lo importa ni directa ni transitivamente.
//
// Valores de fábrica del SDK que este archivo fija a mano:
// - apiVersion 'v1beta' escrita aquí (la 3.x usa v1, sin modelos -preview ni alias -latest);
// - automaticContinuation: false (de fábrica encadena peticiones facturadas);
// - sin retryOptions (su lista reintenta el 429): la política de reintentos y de modelo de reserva es del bucle;
// - sin httpOptions.timeout: plazo propio con un AbortController por intento que distingue plazo y cancelación
//   (el SDK aborta sin motivo) y propaga el motivo de quien cancela;
// - llamada automática a funciones desactivada; declaraciones por parametersJsonSchema;
// - nunca temperature, topP ni topK.
import {
  FinishReason,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Model,
  type Part,
} from '@google/genai/web';
import { LlmError, llmErrorFromHttp } from './errors';
import type {
  LlmCallOptions, LlmClient, LlmContent, LlmFetch, LlmFinishReason, LlmFunctionCall, LlmModel, LlmPart, LlmRequest,
  LlmResponse, LlmStreamEvent, LlmStructuredRequest, LlmStructuredResponse, LlmUsage,
} from './types';

export const GEMINI_API_VERSION = 'v1beta';
export const DEFAULT_LLM_TIMEOUT_MS = 60000;
/** Tope de páginas del listado de modelos (1000 por página): nunca un bucle sin fin ante un token repetido. */
const MAX_MODEL_PAGES = 10;

export interface GeminiLlmClientOptions {
  apiKey: string;
  /** fetch inyectable (pruebas); por defecto el global. */
  fetch?: LlmFetch;
  defaultTimeoutMs?: number;
}

// ----- finishReason: del SDK a un conjunto propio cerrado.
const FINISH_REASONS: Record<string, LlmFinishReason> = {
  [FinishReason.STOP]: 'stop',
  [FinishReason.MAX_TOKENS]: 'max_tokens',
  [FinishReason.SAFETY]: 'safety',
  [FinishReason.BLOCKLIST]: 'safety',
  [FinishReason.PROHIBITED_CONTENT]: 'safety',
  [FinishReason.SPII]: 'safety',
  [FinishReason.IMAGE_SAFETY]: 'safety',
  [FinishReason.IMAGE_PROHIBITED_CONTENT]: 'safety',
  [FinishReason.MODEL_ARMOR]: 'safety',
  [FinishReason.RECITATION]: 'recitation',
  [FinishReason.IMAGE_RECITATION]: 'recitation',
  [FinishReason.MALFORMED_FUNCTION_CALL]: 'malformed_function_call',
  [FinishReason.UNEXPECTED_TOOL_CALL]: 'unexpected_tool_call',
  [FinishReason.TOO_MANY_TOOL_CALLS]: 'too_many_tool_calls',
  [FinishReason.MISSING_THOUGHT_SIGNATURE]: 'missing_thought_signature',
  [FinishReason.MALFORMED_RESPONSE]: 'malformed_response',
  [FinishReason.CONTINUATION]: 'continuation',
  [FinishReason.LANGUAGE]: 'other',
  [FinishReason.OTHER]: 'other',
  [FinishReason.IMAGE_OTHER]: 'other',
  [FinishReason.NO_IMAGE]: 'other',
  [FinishReason.ESCALATION]: 'other',
  [FinishReason.PUP_LIMITED_DISABLED]: 'other',
  [FinishReason.FINISH_REASON_UNSPECIFIED]: 'other',
};
export function mapFinishReason(value: string | undefined): LlmFinishReason {
  return (value && Object.hasOwn(FINISH_REASONS, value) ? FINISH_REASONS[value] : undefined) ?? 'unknown';
}
/** Valores que trae el SDK instalado (la prueba de contrato exige que todos tengan correspondencia explícita). */
export const knownSdkFinishReasons = (): string[] => Object.values(FinishReason) as string[];

const TOOL_MODES = {
  auto: FunctionCallingConfigMode.AUTO,
  any: FunctionCallingConfigMode.ANY,
  none: FunctionCallingConfigMode.NONE,
  validated: FunctionCallingConfigMode.VALIDATED,
} as const;
const THINKING_LEVELS = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;

// ----- Partes: del puerto al SDK y vuelta, sin perder campos.
function toSdkPart(part: LlmPart): Part {
  switch (part.type) {
    case 'text':
      return { ...part.opaque, text: part.text, ...(part.thought !== undefined ? { thought: part.thought } : {}), ...(part.signature ? { thoughtSignature: part.signature } : {}) };
    case 'functionCall':
      return { ...part.opaque, functionCall: { ...(part.call.id ? { id: part.call.id } : {}), name: part.call.name, args: part.call.args }, ...(part.signature ? { thoughtSignature: part.signature } : {}) };
    case 'functionResponse':
      return { functionResponse: { ...(part.id ? { id: part.id } : {}), name: part.name, response: part.response } };
    case 'inlineData':
      return { inlineData: { mimeType: part.mimeType, data: part.data } };
    case 'opaque':
      return { ...part.part } as Part;
  }
}
const toSdkContent = (content: LlmContent): Content => ({ role: content.role, parts: content.parts.map(toSdkPart) });

const rest = (value: Record<string, unknown>) => (Object.keys(value).length ? { opaque: value } : {});
function fromSdkPart(part: Part): LlmPart {
  const { text, thought, thoughtSignature, functionCall, functionResponse, inlineData, ...others } = part as Part & Record<string, unknown>;
  const signature = typeof thoughtSignature === 'string' && thoughtSignature ? { signature: thoughtSignature } : {};
  if (functionCall?.name) {
    // Solo id, name y args: es todo lo que el SDK 3.6.1 serializa para la API de Gemini. willContinue y partialArgs
    // son de Vertex y el SDK LANZA si se le reenvían, así que guardarlos rompería la petición siguiente.
    return { type: 'functionCall', call: { ...(functionCall.id ? { id: functionCall.id } : {}), name: functionCall.name, args: functionCall.args ?? {} }, ...signature, ...rest(others) };
  }
  if (typeof text === 'string' && !functionResponse && !inlineData) {
    return { type: 'text', text, ...(thought !== undefined ? { thought } : {}), ...signature, ...rest(others) };
  }
  // Cualquier otra forma (incluida una que la app no conoce) se guarda entera y se devuelve tal cual.
  return { type: 'opaque', part: { ...(part as Record<string, unknown>) } };
}
const callOf = (part: LlmPart): LlmFunctionCall | undefined => (part.type === 'functionCall' ? part.call : undefined);
const visibleText = (parts: LlmPart[]) => parts.map((p) => (p.type === 'text' && !p.thought ? p.text : '')).join('');

function usageOf(response: GenerateContentResponse): LlmUsage | undefined {
  const u = response.usageMetadata;
  if (!u) return undefined;
  const out: LlmUsage = {};
  if (u.promptTokenCount !== undefined) out.inputTokens = u.promptTokenCount;
  if (u.cachedContentTokenCount !== undefined) out.cachedTokens = u.cachedContentTokenCount;
  if (u.candidatesTokenCount !== undefined) out.outputTokens = u.candidatesTokenCount;
  if (u.thoughtsTokenCount !== undefined) out.thinkingTokens = u.thoughtsTokenCount;
  if (u.totalTokenCount !== undefined) out.totalTokens = u.totalTokenCount;
  return out;
}
function assertNotBlocked(response: GenerateContentResponse) {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw new LlmError('blocked', { blockReason: String(blockReason), serverMessage: response.promptFeedback?.blockReasonMessage });
}
function buildResponse(model: string, parts: LlmPart[], rawFinishReason: string | undefined, usage: LlmUsage | undefined): LlmResponse {
  return {
    model,
    content: { role: 'model', parts },
    text: visibleText(parts),
    functionCalls: parts.map(callOf).filter((c): c is LlmFunctionCall => !!c),
    finishReason: mapFinishReason(rawFinishReason),
    ...(rawFinishReason ? { rawFinishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

function modelId(model: string): string {
  const id = model?.trim().replace(/^models\//, '');
  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) throw new LlmError('bad_request', { message: 'El identificador del modelo Gemini no es válido.' });
  return id;
}

// ----- Intento: AbortController propio, plazo propio, errores del SDK → LlmError.
interface Attempt { signal: AbortSignal; guard<T>(promise: Promise<T>): Promise<T>; translate(error: unknown): LlmError; dispose(): void }
function startAttempt(options: LlmCallOptions | undefined, defaultTimeoutMs: number): Attempt {
  const caller = options?.signal;
  if (caller?.aborted) throw new LlmError('cancelled', { reason: caller.reason });
  const controller = new AbortController();
  const onAbort = () => controller.abort(new LlmError('cancelled', { reason: caller?.reason }));
  caller?.addEventListener('abort', onAbort, { once: true });
  const ms = typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : defaultTimeoutMs;
  const timer = setTimeout(() => controller.abort(new LlmError('timeout')), ms);
  // Una promesa que falla con nuestro motivo en cuanto se aborta: ningún await del SDK puede colgar el intento.
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  aborted.catch(() => {});
  controller.signal.addEventListener('abort', () => rejectAbort(controller.signal.reason), { once: true });
  const translate = (error: unknown): LlmError => (controller.signal.aborted ? controller.signal.reason as LlmError : translateSdkError(error));
  return {
    signal: controller.signal,
    guard: async <T>(promise: Promise<T>) => {
      try { return await Promise.race([promise, aborted]); } catch (error) { throw translate(error); }
    },
    translate,
    dispose: () => { clearTimeout(timer); caller?.removeEventListener('abort', onAbort); },
  };
}
function translateSdkError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  const e = error as { name?: string; status?: unknown; message?: unknown } | undefined;
  if (e?.name === 'ApiError' && typeof e.status === 'number') {
    let body: unknown;
    try { body = JSON.parse(String(e.message)); } catch { body = undefined; }
    return llmErrorFromHttp(e.status, body, error);
  }
  const message = String(e?.message ?? '');
  if (error instanceof SyntaxError || /Incomplete JSON segment|exception parsing stream chunk|Response body is empty/.test(message)) {
    return new LlmError('malformed_response', { cause: error });
  }
  return new LlmError('network', { cause: error });
}

// ----- Petición.
function buildConfig(request: LlmRequest, signal: AbortSignal, extra: GenerateContentConfig = {}): GenerateContentConfig {
  const config: GenerateContentConfig = {
    abortSignal: signal,
    automaticContinuation: false,
    automaticFunctionCalling: { disable: true },
    ...extra,
  };
  if (request.systemInstruction) config.systemInstruction = request.systemInstruction;
  if (request.maxOutputTokens !== undefined) config.maxOutputTokens = request.maxOutputTokens;
  if (request.thinkingLevel || request.includeThoughts !== undefined) {
    config.thinkingConfig = {
      ...(request.thinkingLevel ? { thinkingLevel: THINKING_LEVELS[request.thinkingLevel] } : {}),
      ...(request.includeThoughts !== undefined ? { includeThoughts: request.includeThoughts } : {}),
    };
  }
  if (request.tools?.length) {
    config.tools = [{
      functionDeclarations: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        ...(tool.parameters !== undefined ? { parametersJsonSchema: tool.parameters } : {}),
      })),
    }];
  }
  if (request.toolMode || request.allowedFunctionNames?.length) {
    config.toolConfig = {
      functionCallingConfig: {
        ...(request.toolMode ? { mode: TOOL_MODES[request.toolMode] } : {}),
        ...(request.allowedFunctionNames?.length ? { allowedFunctionNames: [...request.allowedFunctionNames] } : {}),
      },
    };
  }
  return config;
}

function parseJsonObject(text: string, finishReason: LlmFinishReason): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Sin texto visible (vacío o solo razonamiento) no hay nada que reintentar: se distingue del JSON inválido.
  if (!cleaned) throw new LlmError('malformed_response', { finishReason, emptyOutput: true });
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* abajo */ }
  throw new LlmError('malformed_response', { finishReason });
}

/** Mergea deltas de texto contiguos del stream cuando no llevan firma: el historial queda compacto sin perder firmas. */
function appendStreamPart(parts: LlmPart[], part: LlmPart) {
  const last = parts.at(-1);
  if (part.type === 'text' && last?.type === 'text' && !last.signature && !part.signature && !last.opaque && !part.opaque && !!last.thought === !!part.thought) {
    parts[parts.length - 1] = { ...last, text: last.text + part.text };
    return;
  }
  parts.push(part);
}

export function createGeminiLlmClient(options: GeminiLlmClientOptions): LlmClient {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error('Configura una API Key de Google Gemini en Ajustes.');
  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: GEMINI_API_VERSION,
    ...(options.fetch ? { httpOptions: { fetch: options.fetch } } : {}),
  });
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;

  async function generate(request: LlmRequest, callOptions?: LlmCallOptions, extra?: GenerateContentConfig): Promise<LlmResponse> {
    const model = modelId(request.model);
    const attempt = startAttempt(callOptions, defaultTimeoutMs);
    try {
      const response = await attempt.guard(ai.models.generateContent({
        model, contents: request.contents.map(toSdkContent), config: buildConfig(request, attempt.signal, extra),
      }));
      assertNotBlocked(response);
      const candidate = response.candidates?.[0];
      return buildResponse(model, (candidate?.content?.parts ?? []).map(fromSdkPart), candidate?.finishReason, usageOf(response));
    } catch (error) {
      throw attempt.translate(error);
    } finally { attempt.dispose(); }
  }

  async function* stream(request: LlmRequest, callOptions?: LlmCallOptions): AsyncGenerator<LlmStreamEvent> {
    const model = modelId(request.model);
    const attempt = startAttempt(callOptions, defaultTimeoutMs);
    let iterator: AsyncIterator<GenerateContentResponse> | undefined;
    try {
      const chunks = await attempt.guard(ai.models.generateContentStream({
        model, contents: request.contents.map(toSdkContent), config: buildConfig(request, attempt.signal),
      }));
      iterator = chunks[Symbol.asyncIterator]();
      const parts: LlmPart[] = [];
      let finish: string | undefined;
      let usage: LlmUsage | undefined;
      while (true) {
        const next = await attempt.guard(iterator.next());
        if (next.done) break;
        const chunk = next.value;
        assertNotBlocked(chunk);
        const candidate = chunk.candidates?.[0];
        for (const sdkPart of candidate?.content?.parts ?? []) {
          const part = fromSdkPart(sdkPart);
          appendStreamPart(parts, part);
          if (part.type === 'text' && part.text) yield part.thought ? { type: 'thought', text: part.text } : { type: 'text', text: part.text };
          if (part.type === 'functionCall') yield { type: 'functionCall', call: part.call, ...(part.signature ? { signature: part.signature } : {}) };
          if (attempt.signal.aborted) throw attempt.signal.reason;
        }
        if (candidate?.finishReason) finish = candidate.finishReason;
        const chunkUsage = usageOf(chunk);
        if (chunkUsage) { usage = chunkUsage; yield { type: 'usage', usage: chunkUsage }; }
        if (attempt.signal.aborted) throw attempt.signal.reason;
      }
      yield { type: 'done', response: buildResponse(model, parts, finish, usage) };
    } catch (error) {
      throw attempt.translate(error);
    } finally {
      attempt.dispose();
      // Libera el lector del cuerpo si se salió a mitad (cancelación, error o `break` de quien consume).
      iterator?.return?.(undefined)?.catch?.(() => {});
    }
  }

  return {
    generate: (request, callOptions) => generate(request, callOptions),
    stream,
    async structured<T = Record<string, unknown>>(request: LlmStructuredRequest, callOptions?: LlmCallOptions): Promise<LlmStructuredResponse<T>> {
      const { schema, ...rest } = request;
      const response = await generate(rest, callOptions, { responseMimeType: 'application/json', responseJsonSchema: schema });
      if (response.finishReason === 'safety') throw new LlmError('blocked', { finishReason: response.finishReason });
      // Una respuesta sin finishReason (ni candidatos) se trata como completa: lo que cuenta es si trae un objeto JSON.
      const finishReason = response.finishReason === 'unknown' && !response.rawFinishReason ? 'stop' : response.finishReason;
      if (finishReason !== 'stop') throw new LlmError('malformed_response', { finishReason });
      return { data: parseJsonObject(response.text, finishReason) as T, response };
    },
    async listModels(callOptions?: LlmCallOptions): Promise<LlmModel[]> {
      const attempt = startAttempt(callOptions, defaultTimeoutMs);
      try {
        const pager = await attempt.guard(ai.models.list({ config: { pageSize: 1000, abortSignal: attempt.signal } }));
        const models: Model[] = [...pager.page];
        for (let page = 1; page < MAX_MODEL_PAGES && pager.hasNextPage(); page++) models.push(...await attempt.guard(pager.nextPage()));
        return models.filter((m) => typeof m.name === 'string' && m.name).map(toLlmModel);
      } catch (error) {
        throw attempt.translate(error);
      } finally { attempt.dispose(); }
    },
  };
}

function toLlmModel(model: Model): LlmModel {
  const name = model.name!;
  return {
    id: name.replace(/^models\//, ''),
    name,
    ...(model.displayName ? { displayName: model.displayName } : {}),
    ...(model.description ? { description: model.description } : {}),
    supportedActions: [...(model.supportedActions ?? [])],
    ...(model.inputTokenLimit !== undefined ? { inputTokenLimit: model.inputTokenLimit } : {}),
    ...(model.outputTokenLimit !== undefined ? { outputTokenLimit: model.outputTokenLimit } : {}),
  };
}
