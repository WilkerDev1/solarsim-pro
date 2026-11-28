import type { LlmFinishReason } from './types';

/**
 * Errores tipados del puerto. La política (reintentos, modelo de reserva, plazo global) la decide quien llama
 * mirando `kind`, nunca el adaptador.
 * - `cancelled`: la señal de quien llama se abortó; `reason` lleva su motivo.
 * - `timeout`: venció nuestro plazo del intento.
 * - `rate_limited` (429), `server` (5xx y 408 del servidor), `invalid_key` (clave rechazada), `bad_request` (otro 4xx,
 *   con el mensaje del servidor), `not_found` (404: modelo inexistente o retirado), `network` (sin respuesta HTTP).
 * - `malformed_response`: la respuesta no se pudo leer o no trae lo pedido (JSON inválido, salida truncada).
 * - `blocked`: la petición o la respuesta se bloqueó por seguridad.
 */
export type LlmErrorKind =
  | 'cancelled' | 'timeout' | 'rate_limited' | 'server' | 'invalid_key' | 'bad_request' | 'not_found' | 'network'
  | 'malformed_response' | 'blocked';

const MESSAGES: Record<LlmErrorKind, string> = {
  cancelled: 'Solicitud cancelada.',
  timeout: 'Google Gemini tardó demasiado. Reintenta la solicitud.',
  rate_limited: 'Google Gemini rechazó la solicitud por límite de uso o cuota. Espera un momento o revisa tu plan.',
  server: 'Google Gemini no respondió temporalmente. Reintenta en unos minutos.',
  invalid_key: 'Google Gemini rechazó la API Key. Revísala en Ajustes → IA.',
  bad_request: 'Google Gemini rechazó la solicitud.',
  not_found: 'Google Gemini no ofrece ese modelo. Elige otro en Ajustes → IA.',
  network: 'No se pudo conectar con Google Gemini. Revisa la conexión.',
  malformed_response: 'Google Gemini devolvió una respuesta inválida. No se aplicaron datos parciales.',
  blocked: 'Google Gemini bloqueó la solicitud por sus filtros de seguridad.',
};

export interface LlmErrorDetails {
  status?: number;
  /** Mensaje que devolvió el servidor (sin la clave: la clave nunca viaja en la URL ni en el cuerpo). */
  serverMessage?: string;
  /** Motivo de la cancelación de quien llama (`signal.reason`). */
  reason?: unknown;
  finishReason?: LlmFinishReason;
  blockReason?: string;
  cause?: unknown;
  message?: string;
}

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly serverMessage?: string;
  readonly reason?: unknown;
  readonly finishReason?: LlmFinishReason;
  readonly blockReason?: string;
  constructor(kind: LlmErrorKind, details: LlmErrorDetails = {}) {
    const base = details.message ?? MESSAGES[kind];
    super(kind === 'bad_request' && details.serverMessage ? `${base} ${details.serverMessage}` : base, { cause: details.cause });
    this.name = 'LlmError';
    this.kind = kind;
    this.status = details.status;
    this.serverMessage = details.serverMessage;
    this.reason = details.reason;
    this.finishReason = details.finishReason;
    this.blockReason = details.blockReason;
  }
}

export const isLlmError = (error: unknown, kind?: LlmErrorKind): error is LlmError =>
  error instanceof LlmError && (kind === undefined || error.kind === kind);

/** Error HTTP de la API → error del puerto. `body` es el JSON de error de Google si se pudo leer. */
export function llmErrorFromHttp(status: number, body: unknown, cause?: unknown): LlmError {
  const error = (body as { error?: { message?: unknown; status?: unknown; details?: unknown } } | undefined)?.error;
  const serverMessage = typeof error?.message === 'string' ? error.message : undefined;
  const details = Array.isArray(error?.details) ? error.details : [];
  const keyRejected = details.some((d: any) => d?.reason === 'API_KEY_INVALID') || /API key not valid/i.test(serverMessage ?? '');
  const common = { status, serverMessage, cause };
  if (keyRejected || status === 401 || status === 403) return new LlmError('invalid_key', common);
  if (status === 429) return new LlmError('rate_limited', common);
  if (status === 404) return new LlmError('not_found', common);
  if (status === 408 || status >= 500) return new LlmError('server', common);
  return new LlmError('bad_request', common);
}
