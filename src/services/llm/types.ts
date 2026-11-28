// Puerto LlmClient: tipos propios de la app para hablar con un modelo de lenguaje.
// Este archivo no importa el SDK: solo `geminiAdapter.ts` lo hace (ADR 0008, guarda en testLlmBoundary).

/** Firma de pensamiento del modelo: dato opaco que se devuelve intacto en la petición siguiente. */
export type LlmThoughtSignature = string;

export interface LlmFunctionCall {
  /** Id que pone el modelo; puede faltar (la respuesta se manda entonces sin id). */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Una parte de un turno. `opaque` guarda los campos de la parte del modelo que la app no interpreta
 * (metadatos nuevos de la API, por ejemplo) para devolverlos tal cual: el historial conserva la parte completa.
 */
export type LlmPart =
  | { type: 'text'; text: string; thought?: boolean; signature?: LlmThoughtSignature; opaque?: Record<string, unknown> }
  | { type: 'functionCall'; call: LlmFunctionCall; signature?: LlmThoughtSignature; opaque?: Record<string, unknown> }
  | { type: 'functionResponse'; id?: string; name: string; response: Record<string, unknown> }
  | { type: 'inlineData'; mimeType: string; data: string }
  /** Parte del modelo de una forma que la app no interpreta: se guarda entera y se devuelve tal cual. */
  | { type: 'opaque'; part: Record<string, unknown> };

export interface LlmContent {
  role: 'user' | 'model';
  parts: LlmPart[];
}

export interface LlmToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema de los argumentos (se envía como `parametersJsonSchema`); sin él la herramienta no lleva argumentos. */
  parameters?: unknown;
}

/** `validated`: el modelo responde con llamadas válidas según el esquema o con texto. */
export type LlmToolMode = 'auto' | 'any' | 'none' | 'validated';
export type LlmThinkingLevel = 'low' | 'medium' | 'high';

export interface LlmRequest {
  model: string;
  systemInstruction?: string;
  contents: LlmContent[];
  tools?: LlmToolDeclaration[];
  toolMode?: LlmToolMode;
  allowedFunctionNames?: string[];
  maxOutputTokens?: number;
  thinkingLevel?: LlmThinkingLevel;
  /** Pide los resúmenes de pensamiento (eventos `thought`). */
  includeThoughts?: boolean;
}

export interface LlmStructuredRequest extends Omit<LlmRequest, 'tools' | 'toolMode' | 'allowedFunctionNames'> {
  /** JSON Schema de la salida (se envía como `responseJsonSchema`). */
  schema: unknown;
}

export interface LlmCallOptions {
  signal?: AbortSignal;
  /** Plazo del intento en ms (por defecto 60 s); al vencer, `LlmError` de tipo `timeout`. */
  timeoutMs?: number;
}

/** Conjunto cerrado de motivos de fin; `unknown` recoge los valores que la API añada en el futuro. */
export const LLM_FINISH_REASONS = [
  'stop', 'max_tokens', 'safety', 'recitation', 'malformed_function_call', 'unexpected_tool_call',
  'too_many_tool_calls', 'missing_thought_signature', 'malformed_response', 'continuation', 'other', 'unknown',
] as const;
export type LlmFinishReason = typeof LLM_FINISH_REASONS[number];

export interface LlmUsage {
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  /** Modelo al que se pidió (sin el prefijo `models/`). */
  model: string;
  /** Turno completo del modelo, con firmas y partes de pensamiento: va tal cual al historial. */
  content: LlmContent;
  /** Texto visible (sin partes de pensamiento). */
  text: string;
  functionCalls: LlmFunctionCall[];
  finishReason: LlmFinishReason;
  /** Valor original de la API, para diagnóstico. */
  rawFinishReason?: string;
  usage?: LlmUsage;
}

export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'functionCall'; call: LlmFunctionCall; signature?: LlmThoughtSignature }
  | { type: 'usage'; usage: LlmUsage }
  | { type: 'done'; response: LlmResponse };

export interface LlmStructuredResponse<T> {
  data: T;
  response: LlmResponse;
}

export interface LlmModel {
  /** Identificador sin prefijo, p. ej. `gemini-4-hydrogen`. */
  id: string;
  /** Nombre del recurso tal como lo devuelve la API, p. ej. `models/gemini-4-hydrogen`. */
  name: string;
  displayName?: string;
  description?: string;
  supportedActions: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface LlmClient {
  generate(request: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse>;
  stream(request: LlmRequest, options?: LlmCallOptions): AsyncIterable<LlmStreamEvent>;
  structured<T = Record<string, unknown>>(request: LlmStructuredRequest, options?: LlmCallOptions): Promise<LlmStructuredResponse<T>>;
  listModels(options?: LlmCallOptions): Promise<LlmModel[]>;
}

/** Mismo contrato que `fetch`; se inyecta en el adaptador (pruebas, o un proxy futuro). */
export type LlmFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
