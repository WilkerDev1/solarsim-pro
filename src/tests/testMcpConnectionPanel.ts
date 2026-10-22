import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMcpSnippets, MCP_TOKEN_PLACEHOLDER } from '../features/agentTools/mcpSnippets';
import { McpConnectionPanelView } from '../components/settings/sections/agents/McpConnectionPanel';
import type { McpServerStatus } from '../../shared/agentTools/bridge';

const url = 'http://127.0.0.1:47321/mcp';

// Snippets are copy-ready, never contain a real token and always point at the status URL.
const snippets = buildMcpSnippets(url);
assert.equal(
  snippets.claudeCode,
  `claude mcp add --transport http solarsim ${url} --header "Authorization: Bearer ${MCP_TOKEN_PLACEHOLDER}"`,
);
assert.equal(snippets.codex, `[mcp_servers.solarsim]\nurl = "${url}"\nbearer_token_env_var = "SOLARSIM_MCP_TOKEN"`);
assert.match(snippets.codexEnv, /SOLARSIM_MCP_TOKEN/);
assert.equal(buildMcpSnippets('http://127.0.0.1:50000/mcp').claudeCode.includes(':50000/mcp'), true);

const base: McpServerStatus = { enabled: true, running: true, port: 47321, url, clients: [{ name: 'claude-code', lastSeenAt: '2026-10-21T12:00:00.000Z' }] };
const noop = () => {};
const html = (status: McpServerStatus | null, extra: Partial<React.ComponentProps<typeof McpConnectionPanelView>> = {}) =>
  renderToStaticMarkup(React.createElement(McpConnectionPanelView, { status, busy: false, onToggle: noop, onCopyToken: noop, onRegenerate: noop, onCopy: noop, ...extra }));

// Running: URL, client, snippets and token actions.
const running = html(base);
assert(running.includes(url));
assert(running.includes('claude-code'));
assert(running.includes('Escuchando'));
assert(running.includes('claude mcp add --transport http solarsim'));
assert(running.includes('bearer_token_env_var'));
assert(running.includes('Copiar token'));
assert(running.includes('Regenerar token'));
assert(running.includes('aria-checked="true"'));

// Off: no snippets to copy, and the switch says so.
const off = html({ ...base, enabled: false, running: false, clients: [] });
assert(off.includes('aria-checked="false"'));
assert(off.includes('Desactivado'));
assert(!off.includes('claude mcp add'));

// Errors from main (port in use) are shown as alerts.
const failed = html({ ...base, running: false, error: 'El puerto 47321 está en uso por otra aplicación.' });
assert(failed.includes('role="alert"'));
assert(failed.includes('en uso'));

// Web build (no Electron bridge) and first load.
assert(html(null, { unavailable: true }).includes('aplicación de escritorio'));
assert(html(null).includes('Cargando'));
console.log('MCP connection panel: snippets, states and errors verified.');
