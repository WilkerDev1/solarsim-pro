// Cliente del puerto para los escáneres (tarifas, fichas técnicas y listas de precios). El adaptador (y con él el SDK,
// ~460 kB) se carga bajo demanda en el primer escaneo, igual que el listado de modelos: el bundle principal no lo lleva.
import type { LlmClient } from './types';

export async function createScannerClient(apiKey: string): Promise<LlmClient> {
  return (await import('./geminiAdapter')).createGeminiLlmClient({ apiKey });
}
