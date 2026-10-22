// Request checks for the loopback MCP endpoint. Order matters: Host and Origin first (browser attacks), then credentials.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const MAX_BODY_BYTES = 12 * 1024 * 1024;

export type GuardResult = { ok: true } | { ok: false; status: 401 | 403; message: string };

const bytes = (value: string) => Buffer.from(value, 'utf8');

function sameSecret(received: string, expected: string): boolean {
  const a = bytes(received);
  const b = bytes(expected);
  // Equal-length compare keeps timingSafeEqual from throwing without leaking the length through an early return.
  const padded = Buffer.alloc(b.length);
  a.copy(padded, 0, 0, Math.min(a.length, b.length));
  return timingSafeEqual(padded, b) && a.length === b.length;
}

export function authorizeRequest(headers: IncomingHttpHeaders, options: { port: number; token: string }): GuardResult {
  // DNS rebinding: a hostile page can resolve its own name to 127.0.0.1, but the browser still sends its own Host.
  const host = headers.host;
  if (host !== `127.0.0.1:${options.port}` && host !== `localhost:${options.port}`)
    return { ok: false, status: 403, message: 'Host no permitido.' };
  // Native MCP clients never send Origin; any value means a browser context.
  if (headers.origin !== undefined) return { ok: false, status: 403, message: 'Origin no permitido.' };
  const match = /^Bearer ([^\s]+)$/i.exec(headers.authorization ?? '');
  if (!match || !sameSecret(match[1], options.token)) return { ok: false, status: 401, message: 'Token inválido.' };
  return { ok: true };
}

export class BodyTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`El cuerpo supera ${limit} bytes.`);
  }
}

/** Reads a request body, failing as soon as the limit is crossed (also by declared Content-Length). */
export function readLimitedBody(req: AsyncIterable<Buffer | string> & { headers?: IncomingHttpHeaders }, limit = MAX_BODY_BYTES): Promise<Buffer> {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(new BodyTooLargeError(limit));
  return (async () => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = typeof chunk === 'string' ? bytes(chunk) : chunk;
      size += buffer.length;
      if (size > limit) throw new BodyTooLargeError(limit);
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  })();
}

