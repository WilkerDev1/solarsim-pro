import assert from 'node:assert/strict';
import { FixedWindowLimiter } from '../../shared/fixedWindowLimiter';
import { ipInRange, normalizeIp, parseClientIpHeader, parseTrustedProxies, resolveClientIp, socketAddress } from '../../shared/clientIp';
import { matchAgentRoute, parseOAuthScope, safeAgentLabel } from '../../shared/agentAccess';

// Limiter: per key, window reset, and a full map evicts the oldest key instead of blocking everyone.
let now = 0;
const limiter = new FixedWindowLimiter(2, 1000, 3, () => now);
assert.equal(limiter.take('a'), true);
assert.equal(limiter.take('a'), true);
assert.equal(limiter.take('a'), false);
assert.equal(limiter.retryAfter('a'), 1);
for (const key of ['x1', 'x2', 'x3', 'x4', 'x5']) limiter.take(key);
assert.equal(limiter.size, 3, 'bounded');
assert.equal(limiter.take('legit'), true, 'a flood of new keys never locks out a new legitimate key');
now = 1000;
assert.equal(limiter.take('a'), true, 'new window');
const failures = new FixedWindowLimiter(2, 1000, 10, () => now);
assert.equal(failures.exceeded('ip'), false);
failures.take('ip');
failures.take('ip');
assert.equal(failures.exceeded('ip'), true, 'exceeded() counts nothing itself');

// Client IP: only the socket by default; proxy headers only from configured trusted proxies.
assert.equal(normalizeIp('::ffff:10.0.0.5'), '10.0.0.5');
assert.equal(normalizeIp('[2001:db8::1]'), '2001:db8::1');
assert.equal(normalizeIp('not-an-ip'), null);
assert.equal(normalizeIp('1.2.3'), null);
assert.ok(ipInRange('172.18.0.4', '172.18.0.0/16'));
assert.ok(!ipInRange('172.19.0.4', '172.18.0.0/16'));
assert.ok(ipInRange('2001:db8::5', '2001:db8::/32'));
assert.ok(!ipInRange('10.0.0.1', '2001:db8::/32'));
assert.ok(ipInRange('::ffff:127.0.0.1', '127.0.0.1'));
assert.ok(ipInRange('::ffff:0102:0304', '::ffff:0102:0300/120'), 'IPv6 with hex groups');
assert.throws(() => parseTrustedProxies('10.0.0.0/33'));
assert.throws(() => parseTrustedProxies('caddy'));
assert.deepEqual(parseTrustedProxies(' 172.18.0.0/16 , ::1 '), ['172.18.0.0/16', '::1']);
assert.throws(() => parseClientIpHeader('x-real-ip'));
const headers = (values: Record<string, string>) => (name: string) => values[name];
const forged = headers({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '8.8.8.8' });
assert.equal(resolveClientIp('203.0.113.7', forged, { trustedProxies: [] }), '203.0.113.7', 'no trusted proxy: headers ignored');
assert.equal(resolveClientIp('203.0.113.7', forged, { trustedProxies: ['172.18.0.0/16'], header: 'cf-connecting-ip' }), '203.0.113.7', 'untrusted peer cannot spoof');
assert.equal(resolveClientIp('172.18.0.3', forged, { trustedProxies: ['172.18.0.0/16'], header: 'cf-connecting-ip' }), '9.9.9.9');
assert.equal(resolveClientIp('172.18.0.3', headers({ 'x-forwarded-for': '6.6.6.6, 5.5.5.5, 172.18.0.9' }), { trustedProxies: ['172.18.0.0/16'], header: 'x-forwarded-for' }), '5.5.5.5', 'right-most untrusted hop, a client-supplied prefix is ignored');
assert.equal(resolveClientIp('172.18.0.3', headers({ 'cf-connecting-ip': 'garbage' }), { trustedProxies: ['172.18.0.0/16'], header: 'cf-connecting-ip' }), '172.18.0.3');
assert.equal(resolveClientIp(undefined, forged, { trustedProxies: ['0.0.0.0/0'], header: 'cf-connecting-ip' }), 'unknown');
assert.equal(socketAddress({ incoming: { socket: { remoteAddress: '::1' } } }), '::1');
assert.equal(socketAddress(undefined), undefined);

// Agent route allowlist and scopes.
assert.equal(matchAgentRoute('GET', '/api/projects/p1')?.scope, 'read');
assert.equal(matchAgentRoute('PUT', '/api/projects/p1/client-link')?.scope, 'write');
assert.equal(matchAgentRoute('GET', '/api/auth/me'), undefined);
assert.equal(matchAgentRoute('GET', '/api/projects//'), undefined);
assert.equal(parseOAuthScope('solarsim:read solarsim:write'), 'write');
assert.equal(parseOAuthScope('openid'), null);
assert.equal(safeAgentLabel('claude<script>'), 'claudescript');

console.log('testAgentAccessShared: ok');
