/** Shared Gemini transport policy. Credentials travel in a header, never URLs. */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Modelo base (https://ai.google.dev/gemini-api/docs/models/gemini-4-hydrogen). */
export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
/** Un único respaldo ante fallos transitorios del modelo base: el Flash estable de la generación anterior. */
export const FALLBACK_GEMINI_MODEL = 'gemini-3.8-flash';
/** Predeterminados de fábrica anteriores; se guardaban con cada instalación aunque nadie los eligiera. */
export const INHERITED_DEFAULT_GEMINI_MODELS: readonly string[] = ['gemini-2.0-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.8-flash'];
/** Documento inline por solicitud de escáner: 20 MiB, comparado sobre su longitud en base64 (con relleno). */
export const MAX_INLINE_FILE_BYTES = 20 * 1024 * 1024;
export const base64LengthFor = (bytes: number) => Math.ceil(bytes / 3) * 4;
export const MAX_INLINE_FILE_BASE64 = base64LengthFor(MAX_INLINE_FILE_BYTES);
/** Niveles válidos en Gemini 4 y 3.8 (`minimal` se rechaza en ambos). */
export type GeminiThinkingLevel = 'low' | 'medium' | 'high';
export type GeminiTransport = (url: string, body: unknown, headers: Record<string, string>, timeoutMs: number, signal?: AbortSignal) => Promise<any>;
export class GeminiRequestError extends Error {
  constructor(message: string, public statusCode?: number) { super(message); this.name = 'GeminiRequestError'; }
}
export const webGeminiTransport: GeminiTransport = async (url, body, headers, timeoutMs, signal) => {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new GeminiRequestError('Google Gemini tardó demasiado. Reintenta la solicitud.', 408)), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const json = await response.json().catch(() => undefined);
    if (!response.ok) throw new GeminiRequestError(json?.error?.message || `Google Gemini: HTTP ${response.status}`, response.status);
    if (!json) throw new GeminiRequestError('Google Gemini devolvió una respuesta inválida.');
    return json;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason || error;
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
};

/**
 * Generation settings each model family accepts. Gemini 4 requires `thinkingLevel` (a `thinkingBudget` beside it is a 400)
 * and ignores sampling parameters, so they are removed; thinking tokens count against `maxOutputTokens` in every family.
 */
export function geminiGenerationConfig(model: string, config: Record<string, unknown> = {}, thinkingLevel: GeminiThinkingLevel = 'low'): Record<string, unknown> {
  const { thinkingConfig: _ignored, ...out } = config;
  if (/^gemini-4[.-]/.test(model)) {
    delete out.temperature; delete out.topP; delete out.topK;
    return { ...out, thinkingConfig: { thinkingLevel } };
  }
  if (/^gemini-3[.-]/.test(model)) return { ...out, thinkingConfig: { thinkingLevel } };
  if (/^gemini-2\.5-(?:flash|pro)/.test(model)) return { ...out, thinkingConfig: { thinkingBudget: 1024 } };
  return out;
}
/** Synchronous output ceiling used by the single MAX_TOKENS recovery. */
const outputCeiling = (model: string) => /^gemini-4[.-]/.test(model) ? 65536 : 32768;
const TRANSIENT = [408, 500, 502, 503, 504];
const TRUNCATED = 'Gemini agotó el límite de respuesta. Reduce los adjuntos o divide las instrucciones. Tu borrador anterior se conserva; no se aplicaron datos parciales.';

/**
 * At most two billed attempts: a transient failure (or a retired explicit model, 404) switches model once, and a truncated
 * response is retried once with a larger limit only when the request set a smaller one than the model ceiling.
 */
export async function requestGeminiJson(
  options: { apiKey: string; model?: string; body: unknown; signal?: AbortSignal; timeoutMs?: number; thinkingLevel?: GeminiThinkingLevel },
  transport: GeminiTransport = webGeminiTransport,
): Promise<{ response: any; modelUsed: string; requestedModel: string; modelWarning?: string }> {
  if (!options.apiKey?.trim()) throw new Error('Configura una API Key de Google Gemini en Ajustes.');
  const requestedModel = options.model?.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL;
  if (!/^[a-zA-Z0-9._-]+$/.test(requestedModel)) throw new Error('El identificador del modelo Gemini no es válido.');
  const original: any = options.body;
  let model = requestedModel;
  let maxOutputTokens: number | undefined = original?.generationConfig?.maxOutputTokens;
  let warning: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason || new Error('Solicitud cancelada.');
    const generationConfig = geminiGenerationConfig(model, { ...original?.generationConfig, ...(maxOutputTokens ? { maxOutputTokens } : {}) }, options.thinkingLevel);
    let response: any;
    try {
      response = await transport(`${GEMINI_API_BASE}/models/${model}:generateContent`, { ...original, generationConfig },
        { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey.trim() }, options.timeoutMs ?? 60000, options.signal);
    } catch (error: any) {
      if (options.signal?.aborted || attempt) throw error;
      if (TRANSIENT.includes(error?.statusCode)) {
        model = requestedModel === DEFAULT_GEMINI_MODEL ? FALLBACK_GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
        warning = `El modelo ${requestedModel} no respondió temporalmente. Se utilizó ${model}.`;
      } else if (error?.statusCode === 404 && requestedModel !== DEFAULT_GEMINI_MODEL) {
        model = DEFAULT_GEMINI_MODEL;
        warning = `Google ya no ofrece el modelo ${requestedModel}. Se utilizó ${model}; actualiza el modelo en Ajustes → IA.`;
      } else throw error;
      continue;
    }
    if (response?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      const larger = maxOutputTokens ? Math.min(outputCeiling(model), Math.max(16384, maxOutputTokens * 2)) : undefined;
      if (attempt || !larger || larger <= maxOutputTokens!) throw new Error(TRUNCATED);
      maxOutputTokens = larger;
      warning = 'Se recuperó una respuesta truncada con un único intento adicional.';
      continue;
    }
    return { response, modelUsed: model, requestedModel, modelWarning: warning };
  }
  throw new Error('No se recibió una respuesta de Gemini.');
}
export function geminiResponseText(response: any): string {
  const candidate = response?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error(`Gemini no completó la respuesta (${candidate.finishReason}). No se aplicaron datos parciales.`);
  const text = candidate?.content?.parts?.filter((part: any) => typeof part.text === 'string' && !part.thought).map((part: any) => part.text).join('');
  if (!text) throw new Error('Gemini no devolvió datos para analizar. Revisa el archivo o las instrucciones.');
  return text;
}
/** One JSON object from a structured response; a truncated or repaired payload is never applied. */
export function parseGeminiJson(response: any, invalidMessage: string): Record<string, any> {
  const text = geminiResponseText(response).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  throw new GeminiInvalidJsonError(invalidMessage);
}
/** La respuesta llegó completa pero no es un objeto JSON válido: lo único que `requestGeminiStructured` reintenta. */
export class GeminiInvalidJsonError extends Error {
  constructor(message: string) { super(message); this.name = 'GeminiInvalidJsonError'; }
}

export interface GeminiStructuredOptions {
  apiKey: string;
  model?: string;
  /** Petición de Gemini: instrucción, contenidos y configuración (el helper fija la salida JSON). */
  body: { systemInstruction?: unknown; contents: unknown[]; generationConfig?: Record<string, unknown> };
  signal?: AbortSignal;
  timeoutMs?: number;
  thinkingLevel?: GeminiThinkingLevel;
  /** Mensaje si la respuesta no es un objeto JSON válido tras el reintento; debe decir que no se aplicó nada. */
  invalidMessage: string;
  /** Reintentos ante JSON inválido: 0 o 1 (por defecto 1; un valor mayor se limita a 1). */
  invalidJsonRetries?: number;
}

/**
 * Única vía para las peticiones con salida estructurada (borrador de propuesta, pliegos tarifarios, fichas técnicas,
 * listas de precios): salida JSON con el esquema del llamador, límite del documento inline antes de facturar,
 * transporte inyectable, modelo de respaldo y recuperación de truncado (`requestGeminiJson`) y un único reintento
 * con la misma petición cuando el JSON llega inválido. Una respuesta reparada o parcial nunca se aplica.
 */
export async function requestGeminiStructured<T extends Record<string, any> = Record<string, any>>(
  options: GeminiStructuredOptions,
  transport: GeminiTransport = webGeminiTransport,
): Promise<{ data: T; modelUsed: string; requestedModel: string; modelWarning?: string; attempts: number }> {
  if (!options.apiKey?.trim()) throw new Error('Configura una API Key de Google Gemini en Ajustes.');
  for (const content of options.body.contents as any[])
    for (const part of content?.parts || [])
      if (typeof part?.inlineData?.data === 'string' && part.inlineData.data.length > MAX_INLINE_FILE_BASE64)
        throw new Error('El documento supera 20 MB. Reduce el tamaño antes de analizarlo.');
  const body = { ...options.body, generationConfig: { ...options.body.generationConfig, responseMimeType: 'application/json' } };
  const allowed = 1 + Math.min(1, Math.max(0, Math.floor(options.invalidJsonRetries ?? 1)));
  let warning: string | undefined;
  for (let attempt = 1; ; attempt++) {
    const result = await requestGeminiJson({ apiKey: options.apiKey, model: options.model, body, signal: options.signal, timeoutMs: options.timeoutMs, thinkingLevel: options.thinkingLevel }, transport);
    warning = result.modelWarning ?? warning;
    try {
      const data = parseGeminiJson(result.response, options.invalidMessage) as T;
      return { data, modelUsed: result.modelUsed, requestedModel: result.requestedModel, modelWarning: warning, attempts: attempt };
    } catch (error) {
      // Solo el JSON inválido se reintenta; una respuesta incompleta (finishReason) o vacía se informa tal cual.
      if (!(error instanceof GeminiInvalidJsonError) || attempt >= allowed || options.signal?.aborted) throw error;
    }
  }
}
