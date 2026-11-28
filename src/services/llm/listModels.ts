// Listado de modelos de Ajustes → IA a través del puerto LlmClient (un solo sitio, todas las páginas).
import type { GeminiModelInfo } from '../../types/aiInvoice';
import { DEFAULT_POPULAR_MODELS, geminiModelInfos } from './models';
import type { LlmClient } from './types';

export const MODEL_LIST_TIMEOUT_MS = 15000;
// El SDK se carga bajo demanda: Ajustes va en el bundle principal y el adaptador solo hace falta al consultar modelos.
const defaultClient = async (apiKey: string): Promise<LlmClient> => (await import('./geminiAdapter')).createGeminiLlmClient({ apiKey });

export interface ListModelsDeps {
  /** Cliente ya creado (pruebas). */
  client?: LlmClient;
  /** Fábrica del cliente a partir de la clave (por defecto el adaptador de Gemini, cargado bajo demanda). */
  createClient?: (apiKey: string) => LlmClient | Promise<LlmClient>;
}

export async function listAvailableGeminiModels(apiKey: string, deps: ListModelsDeps = {}): Promise<{ success: boolean; error?: string; models: GeminiModelInfo[] }> {
  const key = apiKey?.trim();
  if (!key) return { success: false, error: 'API Key vacía.', models: DEFAULT_POPULAR_MODELS };
  try {
    const client = deps.client ?? await (deps.createClient ?? defaultClient)(key);
    return { success: true, models: geminiModelInfos(await client.listModels({ timeoutMs: MODEL_LIST_TIMEOUT_MS })) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'No se pudo consultar Gemini.', models: DEFAULT_POPULAR_MODELS };
  }
}
