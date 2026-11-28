// Soporte de pruebas (no entra en el bundle: solo lo importan suites de src/tests).
// Convierte un fixture REST con la firma de `GeminiTransport` (url, cuerpo JSON, cabeceras, plazo, señal) en un `fetch`
// falso para el adaptador del SDK: así F1b y F4 reutilizan los fixtures actuales sin red real.
import type { GeminiTransport } from '../../../shared/geminiTransport';
import type { LlmFetch } from '../../services/llm/types';

/** Lo que vio el fetch falso en cada petición. */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  signal?: AbortSignal;
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/**
 * Cuerpo SSE como lo emite la API (`data: {...}\n\n`). Los trozos pueden ser un array o un iterable asíncrono (para
 * simular pausas a mitad de stream); el cuerpo falla con el motivo de la señal cuando esta se aborta, como `fetch`.
 */
export function sseResponse(chunks: Iterable<unknown> | AsyncIterable<unknown>, signal?: AbortSignal | null): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const fail = () => { try { controller.error(signal?.reason ?? new DOMException('Aborted', 'AbortError')); } catch { /* ya cerrado */ } };
      if (signal?.aborted) return fail();
      signal?.addEventListener('abort', fail, { once: true });
      try {
        for await (const chunk of chunks as AsyncIterable<unknown>) {
          if (cancelled || signal?.aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        if (!signal?.aborted) controller.close();
      } catch (error) {
        controller.error(error);
      } finally { signal?.removeEventListener('abort', fail); }
    },
    cancel() { cancelled = true; },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Cabeceras de `init` como objeto con claves en minúsculas (el SDK las manda en un `Headers`). */
export function headersOf(init?: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

/**
 * Adapta un `GeminiTransport` a `fetch`:
 * - devuelve JSON con `Response`; si la URL pide `alt=sse`, un stream SSE (un array = varios trozos, un iterable
 *   asíncrono = trozos con pausas, cualquier otro valor = un único trozo);
 * - un error con `statusCode` (p. ej. `GeminiRequestError`) se convierte en la respuesta HTTP de error de Google;
 * - un `Response` devuelto por el fixture pasa tal cual.
 * `requests` (opcional) recibe cada petición para inspeccionar lo que el SDK mandó de verdad.
 */
export function transportAsFetch(transport: GeminiTransport, requests?: RecordedRequest[]): LlmFetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = headersOf(init);
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const body = raw ? JSON.parse(raw) : undefined;
    const signal = init?.signal ?? undefined;
    requests?.push({ url, method: init?.method ?? 'GET', headers, body, signal });
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    let result: any;
    try {
      result = await transport(url, body, headers, 60000, signal);
    } catch (error: any) {
      const status = error?.statusCode;
      if (typeof status !== 'number') throw error;
      return json({ error: { code: status, message: error.message, status: error.status ?? 'ERROR' } }, status);
    }
    if (result instanceof Response) return result;
    if (/[?&]alt=sse\b/.test(url)) {
      const chunks = Array.isArray(result) || (result && typeof result[Symbol.asyncIterator] === 'function') ? result : [result];
      return sseResponse(chunks, signal);
    }
    return json(result);
  };
}
