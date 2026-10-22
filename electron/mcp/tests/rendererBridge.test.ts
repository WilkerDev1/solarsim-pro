import assert from 'node:assert/strict';
import type { McpInvokeMessage } from '../../../shared/agentTools/bridge';
import type { AgentToolDefinition, AgentToolOutcome } from '../../../shared/agentTools/types';
import { BridgeError, RendererBridge } from '../rendererBridge';

const tool = (name: string, kind: AgentToolDefinition['kind']): AgentToolDefinition =>
  ({ name, title: name, description: name, kind, category: 'proposals', inputSchema: { type: 'object' }, surfaces: ['mcp'] });
const snapshot = { tools: [tool('search_projects', 'read'), tool('create_proposal', 'draft')] };
const ok: AgentToolOutcome = { status: 'ok', data: { n: 1 } };
const sent: McpInvokeMessage[] = [];
let deliver = true;
const bridge = new RendererBridge({ send: (m) => { sent.push(m); return deliver; }, readTimeoutMs: 40, draftTimeoutMs: 120 });
const code = (p: Promise<unknown>) => p.then(() => 'resolved', (e) => (e instanceof BridgeError ? e.code : 'other'));

// Not ready until the renderer announces its tools.
assert.equal(bridge.ready, false);
assert.equal(await code(bridge.invoke({ name: 'search_projects', args: {} })), 'renderer_not_ready');
assert.equal(sent.length, 0);

// Round trip keeps the client label and resolves with the renderer's outcome.
bridge.setReady(snapshot);
assert.equal(bridge.ready, true);
assert.deepEqual(bridge.tools.map((t) => t.name), ['search_projects', 'create_proposal']);
const first = bridge.invoke({ name: 'search_projects', args: { q: 'x' } }, 'claude-code');
assert.equal(sent[0].clientLabel, 'claude-code');
assert.deepEqual(sent[0].call, { name: 'search_projects', args: { q: 'x' } });
assert.equal(bridge.respond(sent[0].requestId, ok), true);
assert.deepEqual(await first, ok);

// Unknown ids and repeated answers are ignored.
assert.equal(bridge.respond('nope', ok), false);
assert.equal(bridge.respond(sent[0].requestId, ok), false);

// Timeouts: 15 s read / 30 s draft in production (scaled here); a late answer is dropped.
const started = Date.now();
const slowRead = bridge.invoke({ name: 'search_projects', args: {} });
const lateId = sent[sent.length - 1].requestId;
assert.equal(await code(slowRead), 'timeout');
assert(Date.now() - started < 110, 'read timeout is shorter than draft timeout');
assert.equal(bridge.respond(lateId, ok), false);
const draftStarted = Date.now();
assert.equal(await code(bridge.invoke({ name: 'create_proposal', args: {} })), 'timeout');
assert(Date.now() - draftStarted >= 100, 'draft tools get the longer timeout');

// The wait tool is not cut off by the read timeout.
const waiting = bridge.invoke({ name: 'get_agent_action_status', args: { actionId: 'a', waitSeconds: 20 } });
await new Promise((r) => setTimeout(r, 80));
assert.equal(bridge.respond(sent[sent.length - 1].requestId, ok), true);
assert.deepEqual(await waiting, ok);

// No window: send reports failure, nothing stays pending.
deliver = false;
assert.equal(await code(bridge.invoke({ name: 'search_projects', args: {} })), 'renderer_unavailable');
deliver = true;

// Renderer gone rejects everything in flight and requires a new ready().
const a = bridge.invoke({ name: 'search_projects', args: {} });
const b = bridge.invoke({ name: 'create_proposal', args: {} });
bridge.rendererGone();
assert.equal(await code(a), 'renderer_unavailable');
assert.equal(await code(b), 'renderer_unavailable');
assert.equal(bridge.ready, false);
assert.equal(await code(bridge.invoke({ name: 'search_projects', args: {} })), 'renderer_not_ready');
console.log('MCP rendererBridge: round trip, timeouts, unknown ids and renderer loss verified.');
