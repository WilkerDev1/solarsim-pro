/** Shared Gemini transport policy. Credentials travel in a header, never URLs. */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
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
export async function requestGeminiJson(
  options: { apiKey: string; model?: string; body: unknown; signal?: AbortSignal; timeoutMs?: number },
  transport: GeminiTransport = webGeminiTransport,
): Promise<{ response: any; modelUsed: string; requestedModel: string; modelWarning?: string }> {
  if (!options.apiKey?.trim()) throw new Error('Configura una API Key de Google Gemini en Ajustes.');
  const requestedModel = options.model?.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL;
  if (!/^[a-zA-Z0-9._-]+$/.test(requestedModel)) throw new Error('El identificador del modelo Gemini no es válido.');
  const fallback = requestedModel === DEFAULT_GEMINI_MODEL ? 'gemini-3.5-flash-lite' : DEFAULT_GEMINI_MODEL;
  let model=requestedModel;
  let recovered=false;
  for(let index=0;index<2;index++) {
    if(options.signal?.aborted)throw options.signal.reason || new Error('Solicitud cancelada.');
    const original:any=options.body;
    const config={...original?.generationConfig};
    // Google Generate Content: the output budget includes thinking. Use model-specific controls.
    if(/^gemini-3[.-]/.test(model))config.thinkingConfig={thinkingLevel:'low'};
    else if(/^gemini-2\.5-(?:flash|pro)/.test(model))config.thinkingConfig={thinkingBudget:1024};
    if(recovered)config.maxOutputTokens=Math.min(32768,Math.max(16384,(config.maxOutputTokens || 8192)*2));
    try {
      const response=await transport(`${GEMINI_API_BASE}/models/${model}:generateContent`,{...original,generationConfig:config},
        {'Content-Type':'application/json','x-goog-api-key':options.apiKey.trim()},options.timeoutMs ?? 60000,options.signal);
      if(response?.candidates?.[0]?.finishReason==='MAX_TOKENS') {
        if(index===0) {recovered=true;continue;}
        throw new Error('Gemini agotó el límite de respuesta incluso tras un intento de recuperación. Reduce los adjuntos o divide las instrucciones. Tu borrador anterior se conserva; no se aplicaron datos parciales.');
      }
      return {response,modelUsed:model,requestedModel,modelWarning:model!==requestedModel ? `El modelo ${requestedModel} no respondió temporalmente. Se utilizó ${model}.` : recovered ? 'Se recuperó una respuesta truncada con un único intento adicional.' : undefined};
    } catch(error:any) {
      if(options.signal?.aborted || index || ![408,500,502,503,504].includes(error?.statusCode))throw error;
      model=fallback;
    }
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
