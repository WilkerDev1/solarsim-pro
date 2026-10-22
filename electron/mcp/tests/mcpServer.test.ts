import assert from 'node:assert/strict';
import http from 'node:http';
import { AGENT_RULES_ES } from '../../../shared/agentTools/rules';
import type { AgentToolDefinition, AgentToolOutcome } from '../../../shared/agentTools/types';
import { LocalMcpServer } from '../mcpServer';
import { RendererBridge } from '../rendererBridge';

const token = 'T'.repeat(43);
const tool = (name: string, kind: AgentToolDefinition['kind']): AgentToolDefinition => ({
  name, title: `Título ${name}`, description: `Descripción ${name}`, kind, category: 'proposals', surfaces: ['mcp'],
  inputSchema: { type: 'object', properties: { q: { type: 'string' } }, additionalProperties: false },
});
const tools = [tool('search_projects', 'read'), tool('create_proposal', 'draft'), tool('update_supplier_price', 'guarded')];
const outcomes: Record<string, AgentToolOutcome> = {
  search_projects: { status: 'ok', data: { projects: [{ id: 'p1' }] } },
  create_proposal: { status: 'applied', data: { id: 'p2' }, activityId: 'act-1' },
  update_supplier_price: { status: 'pending_confirmation', actionId: 'act-9', summary: 'Cambiar precio' },
};
const invoked: { name: string; client?: string }[] = [];
const bridge = new RendererBridge({
  send: (m) => {
    invoked.push({ name: m.call.name, client: m.clientLabel });
    setImmediate(() => bridge.respond(m.requestId, outcomes[m.call.name] ?? { status: 'error', code: 'unknown_tool', message: 'Herramienta no permitida.' }));
    return true;
  },
});
const server = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test', maxBodyBytes: 2048 });
const port = await server.start(0);
assert(port > 0 && port !== 47321);

interface Reply { status: number; headers: http.IncomingHttpHeaders; json?: any; text: string }
function request(body: string | object | undefined, headers: Record<string, string | undefined> = {}, opts: { method?: string; path?: string } = {}): Promise<Reply> {
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const finalHeaders: Record<string, string> = {};
  const base = { host: `127.0.0.1:${port}`, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers };
  for (const [k, v] of Object.entries(base)) if (v !== undefined) finalHeaders[k] = v;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: opts.method ?? 'POST', path: opts.path ?? '/mcp', headers: finalHeaders, setHost: false }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let json: any;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, json, text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
const rpc = (id: number, method: string, params?: object, headers?: Record<string, string | undefined>) => request({ jsonrpc: '2.0', id, method, params }, headers);

// initialize: protocol handshake, instructions, tools capability, per-client session id.
const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1.2.3' } });
assert.equal(init.status, 200, init.text);
assert.equal(init.json.result.serverInfo.name, 'solarsim');
assert.equal(init.json.result.instructions, AGENT_RULES_ES);
assert(init.json.result.capabilities.tools);
const session = init.headers['mcp-session-id'] as string;
assert(session, 'initialize assigns a session id so later stateless calls can be attributed');
assert.deepEqual(server.clients().map((c) => c.name), ['claude-code']);
assert.equal((await request({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-session-id': session })).status, 202);

// Renderer not ready: tools/list is empty and tools/call is a tool error (isError), never a transport failure.
const early = await rpc(2, 'tools/call', { name: 'search_projects', arguments: {} }, { 'mcp-session-id': session });
assert.equal(early.status, 200);
assert.equal(early.json.result.isError, true);
assert.match(early.json.result.content[0].text, /no está listo/);
assert.deepEqual((await rpc(3, 'tools/list', {}, { 'mcp-session-id': session })).json.result.tools, []);

// tools/list mirrors the renderer snapshot (already filtered by the device policy).
bridge.setReady({ tools });
const listed = (await rpc(4, 'tools/list', {}, { 'mcp-session-id': session })).json.result.tools;
assert.deepEqual(listed.map((t: any) => t.name), tools.map((t) => t.name));
assert.equal(listed[0].inputSchema.type, 'object');
assert.equal(listed[0].annotations.readOnlyHint, true);
assert.equal(listed[1].annotations.readOnlyHint, false);
assert.equal(listed[0].outputSchema, undefined);

// tools/call: text + structuredContent, forwards the client label, maps statuses.
const read = (await rpc(5, 'tools/call', { name: 'search_projects', arguments: { q: 'x' } }, { 'mcp-session-id': session })).json.result;
assert.equal(read.isError, false);
assert.deepEqual(read.structuredContent, outcomes.search_projects);
assert.equal(read.content[0].type, 'text');
assert.match(read.content[0].text, /p1/);
assert.deepEqual(invoked[0], { name: 'search_projects', client: 'claude-code' });
const draft = (await rpc(6, 'tools/call', { name: 'create_proposal', arguments: {} }, { 'mcp-session-id': session })).json.result;
assert.equal(draft.isError, false);
assert.match(draft.content[0].text, /act-1/);
const pending = (await rpc(7, 'tools/call', { name: 'update_supplier_price', arguments: {} }, { 'mcp-session-id': session })).json.result;
assert.equal(pending.isError, false);
assert.match(pending.content[0].text, /act-9/);
assert.match(pending.content[0].text, /get_agent_action_status/);
const failed = (await rpc(8, 'tools/call', { name: 'delete_everything', arguments: {} })).json.result;
assert.equal(failed.isError, true);
assert.equal(failed.structuredContent.code, 'unknown_tool');
assert.equal(invoked[invoked.length - 1].client, 'mcp', 'without a session or User-Agent the client gets a generic label');

// Malformed calls never reach the renderer.
const before = invoked.length;
const malformed = await rpc(9, 'tools/call', { name: 42 });
assert(malformed.json.error || malformed.json.result?.isError);
assert.equal(invoked.length, before);

// Transport guards: auth, Host, Origin, size, method, path.
assert.equal((await rpc(10, 'tools/list', {}, { authorization: undefined })).status, 401);
assert.equal((await rpc(10, 'tools/list', {}, { authorization: `Bearer ${'x'.repeat(43)}` })).status, 401);
assert.equal((await rpc(10, 'tools/list', {}, { host: 'evil.example' })).status, 403);
assert.equal((await rpc(10, 'tools/list', {}, { host: `127.0.0.1:${port + 1}` })).status, 403);
assert.equal((await rpc(10, 'tools/list', {}, { origin: 'http://localhost:3000' })).status, 403);
assert.equal((await request('x'.repeat(4096))).status, 413);
assert.equal((await request('{not json')).status, 400);
assert.equal((await request(undefined, {}, { method: 'GET' })).status, 405);
assert.equal((await request(undefined, {}, { method: 'DELETE' })).status, 405);
assert.equal((await request({}, {}, { path: '/other' })).status, 404);

// Rotating the token invalidates the old one at once and forgets clients.
let currentToken = token;
const rotating = new LocalMcpServer({ bridge, getToken: () => currentToken, version: '0.0.0-test' });
const rotatingPort = await rotating.start(0);
const call = (t: string) => new Promise<number>((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: rotatingPort, method: 'POST', path: '/mcp', headers: { host: `127.0.0.1:${rotatingPort}`, authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, setHost: false }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
  req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
});
assert.equal(await call(token), 200);
currentToken = 'R'.repeat(43);
assert.equal(await call(token), 401);
assert.equal(await call(currentToken), 200);
await rotating.stop();

await server.stop();
assert.equal(server.running, false);

// stop() issued while a start is still binding waits for it and closes the endpoint (no late listener).
const racing = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test' });
const pendingStart = racing.start(0);
await racing.stop();
await pendingStart;
assert.equal(racing.running, false, 'a start that was stopped before it finished must not stay listening');
assert.equal(await racing.start(0) > 0, true, 'the server can be started again afterwards');
await racing.stop();
console.log('MCP server: JSON-RPC, tool mapping and transport guards verified.');
