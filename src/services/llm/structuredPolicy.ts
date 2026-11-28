// Política de salida estructurada sobre el puerto LlmClient: lo que hacía shared/geminiTransport
// (`requestGeminiStructured` + `requestGeminiJson`) para los escáneres, ahora fuera del adaptador (ADR 0008: el
// adaptador no reintenta ni cambia de modelo; lo decide quien llama). No importa el SDK.
//
// Contrato (idéntico al transporte REST para los escáneres):
// - como mucho dos intentos facturados por vuelta: un fallo transitorio (HTTP 408/500/502/503/504) cambia una vez al
//   modelo de reserva, un modelo elegido que Google retiró (404) cae una vez en el predeterminado, y un truncado
//   (MAX_TOKENS) se recupera una vez con un límite mayor, solo si la petición fijó uno menor que el techo del modelo;
// - una respuesta completa que no es un objeto JSON válido se reintenta una sola vez con la misma petición
//   (`invalidJsonRetries`, 0 o 1); nunca se repara ni se aplica una respuesta parcial;
// - un único plazo global (`timeoutMs`, 60 s por defecto) para todos los intentos: cada uno dura como mucho lo que
//   queda y el siguiente se omite si queda menos de la cuarta parte del plazo;
// - el total de los documentos inline se comprueba antes de facturar (20 MiB, en base64);
// - la cancelación de quien llama se propaga con su razón tal cual (la que puso en `signal.abort(reason)`), sin
//   reintentos ni cambio de modelo.
// 429, 401 y 403 nunca encadenan peticiones facturadas.
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL, MAX_INLINE_FILE_BASE64 } from '../../../shared/geminiTransport';
import { LlmError } from './errors';
import type { LlmClient, LlmContent, LlmStructuredRequest, LlmStructuredResponse, LlmThinkingLevel, LlmUsage } from './types';

export { MAX_INLINE_FILE_BASE64 };

/** Petición de un escáner: sin las opciones de herramientas ni las del puerto que decide la política (modelo, nivel). */
export interface StructuredPolicyRequest {
  /** Modelo elegido en Ajustes (con o sin `models/`); vacío o ausente usa el predeterminado. */
  model?: string;
  systemInstruction?: string;
  contents: LlmContent[];
  /** JSON Schema de la salida. */
  schema: unknown;
  /** Límite de salida propio. Sin él no hay recuperación de truncado: ya se usó el máximo del modelo. */
  maxOutputTokens?: number;
  /** Nivel de razonamiento de las familias 3 y 4 de Gemini (por defecto `low`); las demás no lo reciben. */
  thinkingLevel?: LlmThinkingLevel;
}

export interface StructuredPolicyOptions {
  client: LlmClient;
  request: StructuredPolicyRequest;
  signal?: AbortSignal;
  /** Plazo global en ms para todos los intentos (60 s por defecto; un valor no finito o no positivo cuenta como el predeterminado). */
  timeoutMs?: number;
  /** Mensaje si la respuesta no es un objeto JSON válido tras el reintento; debe decir que no se aplicó nada. */
  invalidMessage: string;
  /** Reintentos ante JSON inválido: 0 o 1 (por defecto 1; un valor mayor se limita a 1 y uno no finito cuenta como 0). */
  invalidJsonRetries?: number;
  /** Reloj inyectable (pruebas). */
  now?: () => number;
}

export interface StructuredPolicyResult<T> {
  data: T;
  /** Modelo que respondió y modelo que se pidió; difieren si hubo modelo de reserva. */
  modelUsed: string;
  requestedModel: string;
  /** Aviso para el usuario (modelo de reserva, modelo retirado, truncado recuperado) del intento que respondió. */
  modelWarning?: string;
  /** Vueltas completas (1 = sin reintento por JSON inválido). */
  attempts: number;
  usage?: LlmUsage;
}

/** La respuesta llegó completa pero no es un objeto JSON válido: lo único que se reintenta como vuelta nueva. */
export class StructuredInvalidJsonError extends Error {
  constructor(message: string) { super(message); this.name = 'StructuredInvalidJsonError'; }
}

const DEFAULT_TIMEOUT_MS = 60_000;
/** Códigos HTTP del servidor que justifican el modelo de reserva (el resto de 5xx, p. ej. 501, no). */
const TRANSIENT_STATUS = [408, 500, 502, 503, 504];
/** Techo de salida síncrona: tras él un truncado no se puede recuperar. */
const outputCeiling = (model: string) => (/^gemini-4[.-]/.test(model) ? 65_536 : 32_768);
/** Margen para intentar otra llamada dentro del plazo global: la cuarta parte del plazo (proporcional, también con plazos cortos). */
const retryMargin = (totalMs: number) => totalMs * 0.25;
const validTimeout = (ms?: number) => (typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_TIMEOUT_MS);
/** Solo las familias 3 y 4 aceptan `thinkingLevel` (`thinkingBudget` de la 2.5 no existe en el puerto). */
const thinkingFor = (model: string, level: LlmThinkingLevel = 'low') => (/^gemini-[34][.-]/.test(model) ? level : undefined);
const TRUNCATED = 'Gemini agotó el límite de respuesta. Reduce los adjuntos o divide las instrucciones. Tu borrador anterior se conserva; no se aplicaron datos parciales.';

/** El valor que se lanza al cancelar: la razón de quien canceló, o un error genérico si no dio ninguna. */
const cancellation = (signal: AbortSignal | undefined, error?: LlmError): unknown =>
  error?.reason ?? signal?.reason ?? new Error(error?.message || 'Solicitud cancelada.');

function inlineBase64Length(contents: LlmContent[]): number {
  let total = 0;
  for (const content of contents) for (const part of content.parts) if (part.type === 'inlineData') total += part.data.length;
  return total;
}

function resolveModel(model?: string): string {
  const id = model?.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL;
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('El identificador del modelo Gemini no es válido.');
  return id;
}

export async function requestStructured<T extends Record<string, unknown> = Record<string, unknown>>(
  options: StructuredPolicyOptions,
): Promise<StructuredPolicyResult<T>> {
  const { client, request, signal } = options;
  // El límite es la suma de los documentos de la petición, no cada uno por separado.
  if (inlineBase64Length(request.contents) > MAX_INLINE_FILE_BASE64) throw new Error('Los documentos superan 20 MB en total. Reduce el tamaño antes de analizarlos.');
  const requestedModel = resolveModel(request.model);
  const retries = Number.isFinite(options.invalidJsonRetries) ? Math.min(1, Math.max(0, Math.floor(options.invalidJsonRetries!))) : options.invalidJsonRetries === undefined ? 1 : 0;
  const allowed = 1 + retries;
  const now = options.now ?? Date.now;
  const total = validTimeout(options.timeoutMs);
  const deadline = now() + total;
  const remaining = () => Math.min(total, deadline - now());
  const canRetry = () => remaining() >= retryMargin(total);

  /** Una vuelta: hasta dos intentos facturados (modelo de reserva o recuperación de truncado). */
  async function oneRound(): Promise<{ response: LlmStructuredResponse<T>; modelUsed: string; modelWarning?: string }> {
    let model = requestedModel;
    let maxOutputTokens = request.maxOutputTokens;
    let warning: string | undefined;
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw cancellation(signal);
      // Con el plazo global vencido no se abre otra petición.
      if (remaining() <= 0) throw new LlmError('timeout');
      const structured: LlmStructuredRequest = {
        model,
        contents: request.contents,
        schema: request.schema,
        ...(request.systemInstruction ? { systemInstruction: request.systemInstruction } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(thinkingFor(model, request.thinkingLevel) ? { thinkingLevel: thinkingFor(model, request.thinkingLevel) } : {}),
      };
      try {
        const response = await client.structured<T>(structured, { signal, timeoutMs: remaining() });
        return { response, modelUsed: model, modelWarning: warning };
      } catch (error) {
        if (signal?.aborted) throw cancellation(signal, error instanceof LlmError && error.kind === 'cancelled' ? error : undefined);
        if (!(error instanceof LlmError)) throw error;
        if (error.kind === 'cancelled') throw cancellation(signal, error);
        if (error.kind === 'malformed_response' && error.finishReason) {
          if (error.finishReason === 'stop') throw new StructuredInvalidJsonError(options.invalidMessage);
          if (error.finishReason === 'max_tokens') {
            const larger = maxOutputTokens ? Math.min(outputCeiling(model), Math.max(16_384, maxOutputTokens * 2)) : undefined;
            if (attempt || !larger || larger <= maxOutputTokens! || !canRetry()) throw new Error(TRUNCATED);
            maxOutputTokens = larger;
            warning = 'Se recuperó una respuesta truncada con un único intento adicional.';
            continue;
          }
          throw new Error(`Gemini no completó la respuesta (${error.finishReason.toUpperCase()}). No se aplicaron datos parciales.`);
        }
        if (attempt || !canRetry()) throw error;
        if (error.kind === 'server' && (error.status === undefined || TRANSIENT_STATUS.includes(error.status))) {
          model = requestedModel === DEFAULT_GEMINI_MODEL ? FALLBACK_GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
          warning = `El modelo ${requestedModel} no respondió temporalmente. Se utilizó ${model}.`;
        } else if (error.kind === 'not_found' && requestedModel !== DEFAULT_GEMINI_MODEL) {
          model = DEFAULT_GEMINI_MODEL;
          warning = `Google ya no ofrece el modelo ${requestedModel}. Se utilizó ${model}; actualiza el modelo en Ajustes → IA.`;
        } else throw error;
      }
    }
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const { response, modelUsed, modelWarning } = await oneRound();
      // El aviso es el de la vuelta que respondió, no el de una descartada.
      return { data: response.data, modelUsed, requestedModel, modelWarning, attempts: attempt, usage: response.response.usage };
    } catch (error) {
      // Solo el JSON inválido se reintenta, y solo si queda margen en el plazo global.
      if (!(error instanceof StructuredInvalidJsonError)) throw error;
      if (signal?.aborted) throw cancellation(signal);
      if (attempt >= allowed || deadline - now() < retryMargin(total)) throw error;
    }
  }
}
