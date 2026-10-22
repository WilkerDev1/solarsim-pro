import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { authorizeRequest, BodyTooLargeError, readLimitedBody } from '../httpGuard';

const token = 'A'.repeat(43);
const options = { port: 47321, token };
const good = { host: '127.0.0.1:47321', authorization: `Bearer ${token}` };
const check = (headers: Record<string, string | undefined>) => authorizeRequest(headers, options);

assert.deepEqual(check(good), { ok: true });
assert.deepEqual(check({ ...good, host: 'localhost:47321' }), { ok: true });

// DNS rebinding: only the exact loopback Host with the real port passes.
for (const host of ['evil.example:47321', '127.0.0.1', '127.0.0.1:1', '127.0.0.1:47321.evil.example', 'LOCALHOST.evil.com:47321', '[::1]:47321', undefined])
  assert.deepEqual(check({ ...good, host }), { ok: false, status: 403, message: 'Host no permitido.' }, String(host));

// Browsers always send Origin; MCP CLIs never do. Any value, even "null", is refused before credentials are looked at.
for (const origin of ['http://127.0.0.1:47321', 'http://evil.example', 'null', '']) {
  const result = check({ ...good, origin, authorization: undefined });
  assert.deepEqual(result, { ok: false, status: 403, message: 'Origin no permitido.' }, origin);
}

// Credentials: missing, wrong scheme, wrong token, prefix/longer tokens.
for (const authorization of [undefined, '', token, `Basic ${token}`, `Bearer ${token}x`, `Bearer ${token.slice(0, 20)}`, 'Bearer ' + 'B'.repeat(43), `Bearer  ${token}`])
  assert.equal((check({ ...good, authorization }) as { status?: number }).status, 401, String(authorization));
assert.deepEqual(check({ ...good, authorization: `bearer ${token}` }), { ok: true });

// Body cap: by declared length and by streamed bytes.
const body = (chunks: string[], headers: Record<string, string> = {}) => Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers });
assert.equal((await readLimitedBody(body(['{"a":', '1}']), 100)).toString(), '{"a":1}');
await assert.rejects(readLimitedBody(body(['x'.repeat(60), 'x'.repeat(60)]), 100), BodyTooLargeError);
await assert.rejects(readLimitedBody(body(['x'], { 'content-length': '101' }), 100), BodyTooLargeError);
console.log('MCP httpGuard: host, origin, bearer and body limits verified.');
