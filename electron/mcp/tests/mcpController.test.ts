import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { loadMcpConfig, mcpConfigPath, saveMcpConfig } from '../config';
import { McpController } from '../mcpController';

const freePort = () => new Promise<number>((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as net.AddressInfo;
    probe.close(() => resolve(port));
  });
});
const file = mcpConfigPath(mkdtempSync(path.join(os.tmpdir(), 'solarsim-mcp-ctl-')));
const port = await freePort();
saveMcpConfig(file, { ...loadMcpConfig(file), port });
const copied: string[] = [];
const controller = new McpController({ configFile: file, version: '0.0.0-test', send: () => false, copyText: (t) => void copied.push(t) });

// Disabled by default: nothing listens until the user turns it on.
await controller.init();
let status = controller.status();
assert.deepEqual({ enabled: status.enabled, running: status.running, port: status.port }, { enabled: false, running: false, port });
assert.equal(status.url, `http://127.0.0.1:${port}/mcp`);
assert.equal(JSON.stringify(status).includes(loadMcpConfig(file).token), false, 'status never carries the token');

// Enabling starts the server and persists the choice; disabling stops it.
status = await controller.setEnabled(true);
assert.equal(status.running, true);
assert.equal(loadMcpConfig(file).enabled, true);
const probe = await new Promise<number>((resolve) => net.connect(port, '127.0.0.1').on('connect', function (this: net.Socket) { this.destroy(); resolve(1); }).on('error', () => resolve(0)));
assert.equal(probe, 1);
status = await controller.setEnabled(false);
assert.equal(status.running, false);
assert.equal(loadMcpConfig(file).enabled, false);

// Token: copied from main, rotated on demand, and the rotation is persisted.
const oldToken = loadMcpConfig(file).token;
assert.equal(controller.copyToken(), true);
assert.deepEqual(copied, [oldToken]);
const rotated = await controller.regenerateToken();
assert.notEqual(loadMcpConfig(file).token, oldToken);
assert.equal(JSON.stringify(rotated).includes(loadMcpConfig(file).token), false);
assert(!readFileSync(file, 'utf8').includes(oldToken));

// A port already in use is reported, not thrown, and leaves the server off.
const blocker = net.createServer().listen(port, '127.0.0.1');
await new Promise((r) => blocker.once('listening', r));
status = await controller.setEnabled(true);
assert.equal(status.running, false);
assert.match(status.error ?? '', /47|puerto|uso/i);
blocker.close();
await controller.setEnabled(false);
// Overlapping toggles are serialized: the last request wins, in both orders, and the server matches the persisted choice.
const isUp = () => new Promise<boolean>((resolve) => net.connect(port, '127.0.0.1').on('connect', function (this: net.Socket) { this.destroy(); resolve(true); }).on('error', () => resolve(false)));
const [, off1] = await Promise.all([controller.setEnabled(true), controller.setEnabled(false)]);
assert.equal(off1.running, false);
assert.equal(off1.enabled, false);
assert.equal(await isUp(), false, 'disable issued while enabling must leave the endpoint closed');
assert.equal(loadMcpConfig(file).enabled, false);
const [, on2] = await Promise.all([controller.setEnabled(false), controller.setEnabled(true)]);
assert.equal(on2.running, true);
assert.equal(on2.enabled, true);
assert.equal(await isUp(), true, 'enable issued while disabling must leave the endpoint open');
assert.equal(loadMcpConfig(file).enabled, true);
await controller.setEnabled(false);
assert.equal(await isUp(), false);
console.log('MCP controller: enable, disable, token rotation and port conflicts verified.');
