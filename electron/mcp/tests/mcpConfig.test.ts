import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MCP_PORT, generateMcpToken, loadMcpConfig, mcpConfigPath, saveMcpConfig } from '../config';

const dir = mkdtempSync(path.join(os.tmpdir(), 'solarsim-mcp-'));
const file = mcpConfigPath(dir);

// First run: disabled, default port, 32-byte base64url token, owner-only file.
const first = loadMcpConfig(file);
assert.equal(first.enabled, false);
assert.equal(first.port, DEFAULT_MCP_PORT);
assert.equal(DEFAULT_MCP_PORT, 47321);
assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
assert.notEqual(generateMcpToken(), generateMcpToken());

// Reload keeps the same token; saving keeps mode 0600.
assert.deepEqual(loadMcpConfig(file), first);
saveMcpConfig(file, { ...first, enabled: true });
assert.equal(loadMcpConfig(file).enabled, true);
if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);

// Corrupt or tampered values are repaired, never trusted (privileged ports, short tokens, non-boolean flags).
writeFileSync(file, JSON.stringify({ enabled: 'yes', port: 80, token: 'short' }));
const repaired = loadMcpConfig(file);
assert.equal(repaired.enabled, false);
assert.equal(repaired.port, DEFAULT_MCP_PORT);
assert.match(repaired.token, /^[A-Za-z0-9_-]{43}$/);
assert.equal(JSON.parse(readFileSync(file, 'utf8')).token, repaired.token);
writeFileSync(file, '{not json');
assert.equal(loadMcpConfig(file).enabled, false);
console.log('MCP config: defaults, permissions and repair verified.');
