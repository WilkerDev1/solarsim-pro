import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMcpApps } from '../../../scripts/buildMcpApps.mjs';
import { isMcpAppCardType, MCP_APP_CARD_TYPES, mcpAppUri, type AgentCard } from '../../../shared/agentCards';
import { AGENT_TOOL_DEFINITIONS } from '../../../shared/agentTools/definitions';
import { escapeHtml, extractCards, renderCards } from '../apps/render';
import { LocalMcpServer } from '../mcpServer';
import { RendererBridge } from '../rendererBridge';

const MIME = 'text/html;profile=mcp-app';

// --- Pure rendering: text is escaped, empty results fall back to the plain text.
assert.equal(escapeHtml(`<img src=x onerror="a()">&'`), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
const hostile = '<script>alert(1)</script>';
const proposal: AgentCard = { type: 'proposal', id: 'p1', title: hostile, detail: 'Santo Domingo', status: 'draft', systemKWp: 18.6, priceUSD: 15234.5 };
const proposalHtml = renderCards('proposal', [proposal]);
assert(!proposalHtml.includes('<script>'), 'card text is never interpreted as markup');
assert(proposalHtml.includes('&lt;script&gt;'));
assert.match(proposalHtml, /18[,.]6 kWp/);
assert.match(proposalHtml, /15[,.]235/);
const audit = renderCards('catalog-audit', [{ type: 'catalog-audit', id: 'a', title: 'Auditoría', findings: [
  { code: 'no_price', severity: 'error', equipmentId: 'eq-1', message: 'Sin precio' },
  { code: 'no_stock', severity: 'info', message: 'Sin stock' },
  { code: 'dup', severity: 'warning', message: 'Duplicado <b>' },
], detail: '45 hallazgos en 12 equipos' }]);
// The card lists a capped subset: the real total must show, and the counts must say they cover only what is listed.
assert.match(audit, /45 hallazgos en 12 equipos/);
assert.match(audit, /mostrados/i);
assert.match(audit, /Sin precio/);
assert(audit.includes('Duplicado &lt;b&gt;'));
assert.match(audit, /1 error/);
const pending = renderCards('pending-action', [{ type: 'pending-action', id: 'x', title: 'Cambiar precio', actionId: 'act-1', changes: [{ label: 'Precio', before: '100', after: '120' }] }]);
assert.match(pending, /act-1/);
assert.match(pending, /confirmación/i);
assert.match(pending, /100/);
assert.match(pending, /120/);

// extractCards reads the tool outcome envelope and keeps only the view's own card type.
const result = { structuredContent: { status: 'ok', data: {}, cards: [proposal, { type: 'equipment', id: 'e', title: 'Panel' }, { type: 'proposal', id: 'p2', title: 'Otra' }, 'junk'] } };
assert.deepEqual(extractCards(result, 'proposal').map((c) => c.id), ['p1', 'p2']);
assert.deepEqual(extractCards({ content: [{ type: 'text', text: 'hola' }] }, 'proposal'), []);
assert.deepEqual(extractCards(undefined, 'proposal'), []);

// --- Build: one self-contained document per card type, with a strict CSP and no external loads.
const outDir = mkdtempSync(path.join(os.tmpdir(), 'solarsim-mcp-apps-'));
const built = await buildMcpApps(outDir);
assert.deepEqual(built.map((b) => b.type).sort(), [...MCP_APP_CARD_TYPES].sort());
for (const { type, file, html } of built) {
  assert.equal(readFileSync(file, 'utf8'), html);
  assert(html.startsWith('<!doctype html>'));
  assert(html.includes(`data-card="${type}"`));
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  for (const directive of ["default-src 'none'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "object-src 'none'"])
    assert(csp.includes(directive), `${type}: CSP lacks ${directive}`);
  assert(!/https?:\/\//.test(csp), 'CSP allows no remote origin');
  assert(!/\s(src|href|action|poster|data)=["'](?!#)/i.test(html.replace(/<script>[\s\S]*<\/script>/, '')), `${type}: no external attribute loads`);
  assert(!/<link\b|@import|url\(\s*["']?https?:/i.test(html.replace(/<script>[\s\S]*<\/script>/, '')), `${type}: no external stylesheets`);
  assert((html.match(/<script/g) ?? []).length === 1, 'exactly one inline script');
  assert(html.length < 1_500_000);
}

// --- Server: tools advertise their card, resources serve the documents.
const bridge = new RendererBridge({ send: () => false });
bridge.setReady({ tools: AGENT_TOOL_DEFINITIONS.filter((d) => d.surfaces.includes('mcp')) });
const token = 'A'.repeat(43);
const server = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test', cardHtml: (type) => built.find((b) => b.type === type)?.html });
const port = await server.start(0);
const rpc = (id: number, method: string, params?: object) => new Promise<any>((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/mcp', setHost: false, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, (res) => {
    let text = '';
    res.on('data', (c) => (text += c));
    res.on('end', () => resolve(JSON.parse(text)));
  });
  req.on('error', reject);
  req.end(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
});

const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'host', version: '1' } });
assert(init.result.capabilities.resources, 'resources capability is advertised');
const tools = (await rpc(2, 'tools/list')).result.tools as { name: string; _meta?: any }[];
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
for (const definition of AGENT_TOOL_DEFINITIONS.filter((d) => d.surfaces.includes('mcp'))) {
  const meta = byName[definition.name]._meta;
  if (isMcpAppCardType(definition.card)) {
    assert.equal(meta.ui.resourceUri, mcpAppUri(definition.card), definition.name);
    assert.equal(meta['ui/resourceUri'], mcpAppUri(definition.card), 'legacy key for older hosts');
  } else assert.equal(meta, undefined, `${definition.name} has no view`);
}
assert.equal(byName.audit_catalog._meta.ui.resourceUri, 'ui://solarsim/cards/catalog-audit');

const listed = (await rpc(3, 'resources/list')).result.resources as { uri: string; mimeType: string; name: string }[];
assert.deepEqual(listed.map((r) => r.uri).sort(), MCP_APP_CARD_TYPES.map(mcpAppUri).sort());
assert(listed.every((r) => r.mimeType === MIME && r.name));
for (const type of MCP_APP_CARD_TYPES) {
  const read = (await rpc(4, 'resources/read', { uri: mcpAppUri(type) })).result.contents[0];
  assert.equal(read.uri, mcpAppUri(type));
  assert.equal(read.mimeType, MIME);
  assert.equal(read.text, built.find((b) => b.type === type)!.html);
  assert.deepEqual(read._meta.ui.csp, {}, 'no extra origins are requested from the host');
  assert.equal(read._meta.ui.domain, undefined);
  assert.equal(read._meta.ui.permissions, undefined);
}
const missing = await rpc(5, 'resources/read', { uri: 'ui://solarsim/cards/unknown' });
assert(missing.error, 'unknown resources are errors');
assert((await rpc(6, 'resources/read', { uri: 'file:///etc/passwd' })).error);
await server.stop();

// Without built documents (e.g. a partial dev build) nothing is advertised instead of failing.
const bare = new LocalMcpServer({ bridge, getToken: () => token, version: '0.0.0-test', cardHtml: () => undefined });
const barePort = await bare.start(0);
const bareList = await new Promise<any>((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: barePort, method: 'POST', path: '/mcp', setHost: false, headers: { host: `127.0.0.1:${barePort}`, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, (res) => {
    let text = '';
    res.on('data', (c) => (text += c));
    res.on('end', () => resolve(JSON.parse(text)));
  });
  req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/list' }));
});
assert.deepEqual(bareList.result.resources, []);
// Tools do not advertise a view whose document is unavailable (hosts would hit a resource error instead of the text fallback).
const bareTools = await new Promise<any>((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: barePort, method: 'POST', path: '/mcp', setHost: false, headers: { host: `127.0.0.1:${barePort}`, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, (res) => {
    let text = '';
    res.on('data', (c) => (text += c));
    res.on('end', () => resolve(JSON.parse(text)));
  });
  req.end(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
});
assert(bareTools.result.tools.length > 0);
assert(bareTools.result.tools.every((t: any) => t._meta === undefined), 'no UI metadata without built documents');
await bare.stop();
console.log('MCP Apps: rendering, strict CSP, resources and tool metadata verified.');
