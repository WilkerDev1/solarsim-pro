import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RemoteMcpPanelView, type RemoteMcpPanelViewProps } from '../components/settings/sections/agents/RemoteMcpPanel';
import { buildRemoteMcpSnippets, REMOTE_TOKEN_PLACEHOLDER } from '../features/agentTools/remoteMcpSnippets';
import { AgentAccessService } from '../services/agentAccessService';
import type { AgentGrantSummary } from '../../shared/agentAccess';

const url = 'https://mcp.example.test/mcp';

// Snippets never embed a real token.
const snippets = buildRemoteMcpSnippets(url);
assert.equal(snippets.claudeCode, `claude mcp add --transport http solarsim-remoto ${url} --header "Authorization: Bearer ${REMOTE_TOKEN_PLACEHOLDER}"`);
assert.match(snippets.codex, /bearer_token_env_var = "SOLARSIM_REMOTE_MCP_TOKEN"/);
assert.deepEqual(JSON.parse(snippets.geminiCli).mcpServers['solarsim-remoto'], { httpUrl: url, headers: { Authorization: `Bearer ${REMOTE_TOKEN_PLACEHOLDER}` } });

const grant: AgentGrantSummary = { id: 'agr-1', kind: 'token', name: 'Claude Code portátil', scope: 'write', tokenPrefix: 'ssm_pat_AbCdEf', createdAt: '2026-11-01T12:00:00.000Z', expiresAt: '2027-01-30T12:00:00.000Z', lastUsedAt: null };
const noop = () => {};
const base: RemoteMcpPanelViewProps = {
  signedIn: true, canWriteRole: true, status: { enabled: true, oauthEnabled: true, mcpUrl: url }, grants: [grant],
  activity: [{ id: '1', userName: 'Ana', grantName: 'ChatGPT', tool: 'create_client', clientLabel: 'chatgpt', method: 'PUT', route: '/api/clients/:id', status: 200, createdAt: '2026-11-02T12:00:00.000Z' }],
  busy: false, onCreate: noop, onRevoke: noop, onDismissToken: noop, onCopy: noop,
};
const html = (extra: Partial<RemoteMcpPanelViewProps> = {}) => renderToStaticMarkup(React.createElement(RemoteMcpPanelView, { ...base, ...extra }));

// Signed out, disabled server, enabled server.
assert.match(html({ signedIn: false }), /Inicia sesión en la nube/);
const disabled = html({ status: { enabled: false, oauthEnabled: false } });
assert.match(disabled, /no tiene habilitado el MCP remoto/);
assert.ok(!disabled.includes('Crear token personal'));
const enabled = html();
assert.ok(enabled.includes(url));
assert.match(enabled, /ChatGPT y Claude\.ai/);
assert.ok(enabled.includes('Claude Code portátil'));
assert.ok(enabled.includes('ssm_pat_AbCdEf'));
assert.ok(enabled.includes('create_client'));
assert.ok(enabled.includes('Lectura y borradores'));
assert.equal((enabled.match(/<pre/g) || []).length, 4);
assert.match(html({ status: { enabled: true, oauthEnabled: false, mcpUrl: url } }), /solo acepta tokens personales/);
// A reader cannot even pick the write scope.
assert.ok(!html({ canWriteRole: false }).includes('value="write"'));
// The new token is shown once with a warning, and the form is hidden meanwhile.
const created = html({ newToken: 'ssm_pat_SECRET' });
assert.match(created, /no se volverá a mostrar/);
assert.ok(created.includes('ssm_pat_SECRET'));
assert.ok(!created.includes('Crear token personal'));

// Service over a synthetic transport (no network).
const calls: { path: string; init?: RequestInit }[] = [];
const transport = async (path: string, init?: RequestInit) => {
  calls.push({ path, init });
  if (path === '/status') return Response.json({ success: true, enabled: true, oauthEnabled: false, mcpUrl: url });
  if (path === '/grants' && init?.method === 'POST') return Response.json({ success: true, grant, token: 'ssm_pat_x' }, { status: 201 });
  if (path === '/grants') return Response.json({ success: true, grants: [grant] });
  if (path.startsWith('/grants/') && init?.method === 'DELETE') return Response.json({ success: true });
  if (path.startsWith('/activity')) return Response.json({ success: true, activity: [] });
  return Response.json({ error: 'nope' }, { status: 404 });
};
const status = await AgentAccessService.status(transport);
assert.deepEqual(status, { enabled: true, oauthEnabled: false, mcpUrl: url });
assert.deepEqual(await AgentAccessService.status(async () => new Response('', { status: 404 })), { enabled: false, oauthEnabled: false }, 'an older API means disabled');
assert.equal((await AgentAccessService.create(transport, { name: 'x', scope: 'read', expiresInDays: 30 })).token, 'ssm_pat_x');
assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)), { name: 'x', scope: 'read', expiresInDays: 30 });
await AgentAccessService.revoke(transport, 'agr 1');
assert.equal(calls.at(-1)!.path, '/grants/agr%201');
await AgentAccessService.activity(transport, true);
assert.equal(calls.at(-1)!.path, '/activity?scope=organization');
await assert.rejects(AgentAccessService.create(async () => Response.json({ error: 'Tu rol solo permite tokens de solo lectura' }, { status: 403 }), { name: 'x', scope: 'write', expiresInDays: 30 }), /solo lectura/);

console.log('testRemoteMcpPanel: ok');
