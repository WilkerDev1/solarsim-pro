// Soporte de pruebas (no entra en el bundle). Un cliente real del puerto (adaptador del SDK) cuyo `fetch` es un
// fixture REST con la firma de `GeminiTransport`: los escáneres conservan sus respuestas de siempre y la prueba
// ve lo que el SDK manda de verdad. Sin red: el fixture decide cada respuesta.
import { type GeminiTransport } from './restFixture';
import { createGeminiLlmClient } from '../../services/llm/geminiAdapter';
import type { LlmClient } from '../../services/llm/types';
import { transportAsFetch, type RecordedRequest } from './transportAsFetch';

export function clientFromTransport(transport: GeminiTransport, requests?: RecordedRequest[], apiKey = 'synthetic-key'): LlmClient {
  return createGeminiLlmClient({ apiKey, fetch: transportAsFetch(transport, requests) });
}
