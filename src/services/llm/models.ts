// Modelos de Gemini que usa la app y el catálogo de Ajustes → IA. Sin SDK: lo importan Ajustes, el almacén (migración del
// modelo guardado), el bucle del asistente y los escáneres, así que no puede importar el adaptador.
import type { GeminiModelInfo } from '../../types/aiInvoice';

/** Modelo base (https://ai.google.dev/gemini-api/docs/models/gemini-4-hydrogen). */
export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
/** Un único respaldo ante fallos transitorios del modelo base: el Flash estable de la generación anterior. */
export const FALLBACK_GEMINI_MODEL = 'gemini-3.8-flash';
/** Predeterminados de fábrica anteriores; se guardaban con cada instalación aunque nadie los eligiera. */
export const INHERITED_DEFAULT_GEMINI_MODELS: readonly string[] = ['gemini-2.0-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.8-flash'];
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
