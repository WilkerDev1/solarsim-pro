import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { AgentToolDefinition } from '../../../shared/agentTools/types';
import { LineSplitter, runStdioProxy, type ProxyConfig } from '../stdioProxy';
import { LocalMcpServer } from '../mcpServer';
import { RendererBridge } from '../rendererBridge';

// --- Framing: one JSON-RPC message per line; chunk boundaries, CRLF and multi-byte characters never corrupt a line.
{
  const splitter = new LineSplitter();
  assert.deepEqual(splitter.push('{"a":1}\n{"b"'), ['{"a":1}']);
  assert.deepEqual(splitter.push(':2}\r\n\n  \n'), ['{"b":2}']);
  const bytes = Buffer.from('{"t":"ñá"}\n');
  const cut = bytes.indexOf(0xc3) + 1;
  assert.deepEqual(splitter.push(bytes.subarray(0, cut)), [], 'a split multi-byte sequence is held back');
  assert.deepEqual(splitter.push(bytes.subarray(cut)), ['{"t":"ñá"}']);
  assert.deepEqual(splitter.push('{"tail":true}'), []);
  assert.equal(splitter.flush(), '{"tail":true}');
  assert.equal(splitter.flush(), undefined);
}

// --- Proxy against the real local server.
const token = 'S'.repeat(43);
const tool: AgentToolDefinition = { name: 'search_projects', title: 'Buscar', description: 'Busca', kind: 'read', category: 'proposals', surfaces: ['mcp'], inputSchema: { type: 'object' } };
const bridge = new RendererBridge({ send: (m) => { setImmediate(() => bridge.respond(m.requestId, { status: 'ok', data: { echoed: m.clientLabel } })); return true; } });
bridge.setReady({ tools: [tool] });
const server = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test' });
const port = await server.start(0);

let config: ProxyConfig | null = { enabled: true, port, token };
function session() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const lines: any[] = [];
  const waiters: (() => void)[] = [];
  let read = 0;
  const splitter = new LineSplitter();
  stdout.on('data', (chunk) => {
    for (const line of splitter.push(chunk)) lines.push(JSON.parse(line));
    waiters.splice(0).forEach((w) => w());
  });
  const done = runStdioProxy({ stdin, stdout, readConfig: () => config });
  return {
    send: (message: unknown) => stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`),
    end: () => stdin.end(),
    lines,
    done,
    /** Next unread output line (replies can arrive synchronously, so reads are sequential, not length-based). */
    next: async () => {
      const deadline = Date.now() + 3000;
      while (lines.length <= read) {
        assert(Date.now() < deadline, `timed out waiting for line ${read + 1}; got ${JSON.stringify(lines)}`);
        await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 100); });
      }
      return lines[read++];
    },
  };
}

const s = session();
s.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-desktop', version: '9' } } });
const init = await s.next();
assert.equal(init.id, 1);
assert.equal(init.result.serverInfo.name, 'solarsim');

// Notifications produce no output; the session id from initialize is reused so the client is labeled.
s.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
s.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
assert.deepEqual((await s.next()).result.tools.map((t: any) => t.name), ['search_projects']);
assert.equal(s.lines.length, 2, 'a notification yields nothing');
s.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_projects', arguments: {} } });
assert.equal((await s.next()).result.structuredContent.data.echoed, 'claude-desktop');

// Concurrent requests are answered by id, in any order.
s.send({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
s.send({ jsonrpc: '2.0', id: 5, method: 'tools/list' });
const [c4, c5] = [await s.next(), await s.next()];
assert.deepEqual([c4.id, c5.id].sort(), [4, 5]);

// Garbage never reaches the server: JSON-RPC parse error with null id.
s.send('{not json');
const bad = await s.next();
assert.equal(bad.id, null);
assert.equal(bad.error.code, -32700);

// Wrong token (rotated in the app): clear error for the request id.
config = { enabled: true, port, token: 'W'.repeat(43) };
s.send({ jsonrpc: '2.0', id: 6, method: 'tools/list' });
const unauthorized = await s.next();
assert.equal(unauthorized.id, 6);
assert.match(unauthorized.error.message, /token/i);

// MCP switched off, config missing, and app closed each give an actionable message.
config = { enabled: false, port, token };
s.send({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
assert.match((await s.next()).error.message, /Ajustes/);
config = null;
s.send({ jsonrpc: '2.0', id: 8, method: 'tools/list' });
assert.match((await s.next()).error.message, /abre SolarSim/i);
await server.stop();
config = { enabled: true, port, token };
s.send({ jsonrpc: '2.0', id: 9, method: 'tools/list' });
const closed = await s.next();
assert.equal(closed.id, 9);
assert.match(closed.error.message, /abre SolarSim/i);

// HTTP-level rejections (here: body over the server's cap) keep the request id so the host can correlate the failure.
const small = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test', maxBodyBytes: 512 });
const smallPort = await small.start(0);
config = { enabled: true, port: smallPort, token };
s.send({ jsonrpc: '2.0', id: 'big-1', method: 'tools/call', params: { name: 'search_projects', arguments: { q: 'x'.repeat(2000) } } });
const tooBig = await s.next();
assert.equal(tooBig.id, 'big-1');
assert.equal(tooBig.error.code, -32000);
assert.match(tooBig.error.message, /demasiado grande/);
await small.stop();
config = { enabled: true, port, token };
const countBefore = s.lines.length;
s.send({ jsonrpc: '2.0', method: 'notifications/cancelled' });
s.end();
await s.done;
assert.equal(s.lines.length, countBefore, 'notifications are dropped silently when the app is closed');
console.log('MCP stdio proxy: framing, forwarding, session reuse and closed-app errors verified.');
