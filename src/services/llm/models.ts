// Catálogo de modelos de Ajustes → IA. Sin SDK: lo reexporta geminiInvoiceService para electron/ai (hasta F6),
// así que no puede importar el adaptador.
import type { GeminiModelInfo } from '../../types/aiInvoice';
import { DEFAULT_GEMINI_MODEL } from '../../../shared/geminiTransport';

// El bucle nuevo toma de aquí los nombres de modelo (no del transporte antiguo): cuando F6 borre shared/geminiTransport,
// las constantes se mueven solo en este sitio.
export { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from '../../../shared/geminiTransport';
import type { LlmModel } from './types';

// Presets are documented endpoints (https://ai.google.dev/gemini-api/docs/models); quotas depend on the account, not this list.
export const DEFAULT_POPULAR_MODELS: GeminiModelInfo[] = [
  { id: DEFAULT_GEMINI_MODEL, name: 'Gemini 4 Hydrogen', description: 'Modelo base: razonamiento ajustable, salida estructurada y PDF.', isRecommended: true },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'Flash estable de la generación anterior.', isRecommended: true },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', isRecommended: true },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', description: 'Modelo de menor coste para extracción.', isRecommended: true },
];

/** Modelos de texto de la cuenta que la app puede usar (sin imagen, voz ni tiempo real), con los presets marcados. */
export function geminiModelInfos(models: readonly LlmModel[]): GeminiModelInfo[] {
  return models
    .filter((m) => m.supportedActions.includes('generateContent') && /^models\/gemini-/.test(m.name) && !/image|tts|audio|live/.test(m.name))
    .map((m) => ({
      id: m.id,
      name: m.displayName || m.id,
      description: m.description,
      isRecommended: DEFAULT_POPULAR_MODELS.some((p) => p.id === m.id && p.isRecommended),
    }));
}

/** Misma lista desde el JSON REST de `GET /models` (la usa el listado por IPC de electron/ai hasta F6). */
export function mapGeminiModels(data: any): GeminiModelInfo[] {
  const models: LlmModel[] = (Array.isArray(data?.models) ? data.models : [])
    .filter((m: any) => typeof m?.name === 'string')
    .map((m: any) => ({
      id: m.name.replace(/^models\//, ''),
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      supportedActions: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
    }));
  return geminiModelInfos(models);
}
