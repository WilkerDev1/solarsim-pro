/** Opt-in real runtime rehearsal. No production credentials, databases or KV bindings. */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setDefaultResultOrder } from 'node:dns';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
// Prefer the reachable IPv4 path on office networks without an IPv6 route.
setDefaultResultOrder('ipv4first');
const cloudflared = process.env.QA_CLOUDFLARED;
if (!cloudflared) throw new Error('Set QA_CLOUDFLARED to the official cloudflared executable.');
const dir = mkdtempSync(join(tmpdir(), 'solarsim-runtime-qa-'));
chmodSync(dir, 0o700);
const instanceId = randomBytes(32).toString('hex');
const name = `solarsim-runtime-qa-${randomBytes(5).toString('hex')}`;
const dbPassword = randomBytes(32).toString('hex');
const fixtureConfig = join(root, 'scripts/qa/fixtures/runtime-config.json');
const processes: ChildProcess[] = [];
const runtimeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:TUNNEL_|CLOUDFLARE_|CF_|JWT_SECRET$|DB_)/.test(key)));
const failures = new Map<ChildProcess, Error>();
let containerId: string | undefined;
let ownsFixtureConfig = false;
let stopping: Promise<void> | undefined;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function alive(child: ChildProcess) {
  const failure = failures.get(child);
  if (failure) throw failure;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    throw new Error('A QA child exited before readiness or rehearsal completed.');
}
function start(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  if (stopping) throw new Error('QA run is stopping.');
  const child = spawn(command, args, { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  // A spawn failure must always have a listener, including before readiness is installed.
  child.on('error', error => failures.set(child, error));
  return child;
}
function signal(child: ChildProcess, value: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, value);
    else child.kill(value);
  } catch { /* Already exited. */ }
}
async function terminate(child: ChildProcess) {
  signal(child, 'SIGTERM');
  const end = Date.now() + 4000;
  while (child.pid && child.exitCode === null && child.signalCode === null && !failures.has(child) && Date.now() < end) await delay(50);
  // Kill the private process group as well: Wrangler owns a workerd child.
  signal(child, 'SIGKILL');
  const killedEnd = Date.now() + 1500;
  while (child.pid && child.exitCode === null && child.signalCode === null && !failures.has(child) && Date.now() < killedEnd) await delay(50);
}
function stop(): Promise<void> {
  return stopping ??= (async () => {
    await Promise.all(processes.map(terminate));
    if (containerId) {
      try { execFileSync('docker', ['rm', '-f', containerId], { stdio: 'ignore', timeout: 10000 }); } catch { console.error('QA container cleanup failed; remove the isolated runtime container manually.'); }
    }
    if (ownsFixtureConfig) {
      try {
        if (JSON.parse(readFileSync(fixtureConfig, 'utf8')).instanceId === instanceId) rmSync(fixtureConfig);
      } catch { /* Never remove another run's configuration. */ }
    }
    rmSync(dir, { recursive: true, force: true });
  })();
}
process.once('SIGINT', () => { void stop().then(() => process.exit(130)); });
process.once('SIGTERM', () => { void stop().then(() => process.exit(143)); });

const allocatedPorts = new Set<number>();
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (allocatedPorts.has(port)) return unusedPort();
  allocatedPorts.add(port);
  return port;
}
async function ready(url: string, children: ChildProcess[], expectedInstance?: string) {
  // Quick-tunnel DNS records are new; office/Tailscale resolvers may cache an initial NXDOMAIN.
  const end = Date.now() + (new URL(url).protocol === 'https:' ? 150000 : 45000);
  let status = 'not reachable';
  while (Date.now() < end) {
    if (stopping) throw new Error('QA run is stopping.');
    children.forEach(alive);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
      status = `HTTP ${response.status}`;
      if (response.ok) {
        if (expectedInstance) {
          const body = await response.json();
          assert.equal(body.qaInstance, expectedInstance, 'Refuse a foreign service on the QA port or tunnel.');
        }
        children.forEach(alive);
        return;
      }
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      status = error instanceof Error ? `${error.message}: ${(error.cause as { code?: string } | undefined)?.code ?? ''}` : 'network error';
    }
    await delay(400);
  }
  throw new Error(`QA service did not start: ${url} (${status})`);
}
async function tunnel(port: number) {
  // HTTP/2 works on office networks that block QUIC/UDP. These are uncredentialed quick tunnels.
  const child = start(cloudflared!, ['tunnel', '--config', join(dir, 'cloudflared.yml'), '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--edge-ip-version', '4', '--no-autoupdate', '--grace-period', '2s'], runtimeEnv);
  const url = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => finish(new Error('Temporary QA HTTPS tunnel unavailable')), 45000);
    function finish(error?: Error, result?: string) {
      clearTimeout(timeout);
      child.off('exit', exited);
      child.off('error', failed);
      error ? reject(error) : resolve(result!);
    }
    const accept = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-12000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) finish(undefined, match[0]);
    };
    const exited = (code: number | null) => finish(new Error(`QA tunnel exited ${code}`));
    const failed = (error: Error) => finish(error);
    child.stdout!.on('data', accept);
    child.stderr!.on('data', accept);
    child.once('error', failed);
    child.once('exit', exited);
  });
  // Log transport failures, but never enable debug headers after authentication begins.
  child.stderr!.on('data', chunk => {
    const text = chunk.toString();
    if (text.includes(' ERR ') || text.includes('Registered tunnel connection')) process.stderr.write(text);
  });
  return { url, child };
}

try {
  // An existing fixture may belong to another active run. Never overwrite it.
  writeFileSync(fixtureConfig, JSON.stringify({ instanceId, initializing: true }), { mode: 0o600, flag: 'wx' });
  ownsFixtureConfig = true;
  writeFileSync(join(dir, 'cloudflared.yml'), '{}\n', { mode: 0o600 });
  containerId = execFileSync('docker', ['run', '--detach', '--name', name, '--label', 'solarsim.qa=runtime', '--memory', '256m', '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=qa', '--env', `POSTGRES_PASSWORD=${dbPassword}`, '--env', 'POSTGRES_DB=solarsim_runtime_qa', 'postgres:16-alpine'], { encoding: 'utf8' }).trim();
  const mapping = execFileSync('docker', ['port', containerId, '5432'], { encoding: 'utf8' }).trim();
  const dbPort = mapping.split(':').at(-1)!;
  for (let i = 0; i < 60; i++) {
    try { execFileSync('docker', ['exec', containerId, 'pg_isready', '-U', 'qa', '-d', 'solarsim_runtime_qa'], { stdio: 'ignore' }); break; }
    catch { if (i === 59) throw new Error('QA PostgreSQL unavailable'); await delay(250); }
  }
  const apiPort = await unusedPort();
  const api = `http://127.0.0.1:${apiPort}`;
  const apiProcess = start(process.execPath, ['--import', 'tsx', 'scripts/qa/runtimeServer.ts'], { ...runtimeEnv, DB_HOST: '127.0.0.1', DB_PORT: dbPort, DB_USER: 'qa', DB_NAME: 'solarsim_runtime_qa', DB_PASSWORD: dbPassword, JWT_SECRET: randomBytes(48).toString('hex'), PORT: String(apiPort), QA_INSTANCE_ID: instanceId });
  apiProcess.stderr!.on('data', chunk => process.stderr.write(chunk));
  await ready(api + '/qa-instance', [apiProcess], instanceId);
  await ready(api + '/api/health', [apiProcess]);
  const apiTunnel = await tunnel(apiPort);
  console.log(`QA temporary API origin: ${apiTunnel.url}`);
  await ready(apiTunnel.url + '/qa-instance', [apiProcess, apiTunnel.child], instanceId);
  await ready(apiTunnel.url + '/api/health', [apiProcess, apiTunnel.child]);
  const config = join(dir, 'wrangler.json');
  // A private readiness adapter identifies this actual workerd instance without changing product routes.
  const workerEntry = join(dir, 'runtime-worker.ts');
  writeFileSync(workerEntry, `import worker from ${JSON.stringify(join(root, 'workers/share-viewer/src/index.ts'))};\nexport default { fetch(request, env, context) {\n if (new URL(request.url).pathname === '/qa-instance') return Response.json({ qaInstance: ${JSON.stringify(instanceId)} });\n return worker.fetch(request, env, context);\n} };\n`, { mode: 0o600 });
  writeFileSync(config, JSON.stringify({ name: 'solarsim-isolated-runtime-qa', main: workerEntry, compatibility_date: '2026-10-03', compatibility_flags: ['nodejs_compat'], vars: { AUTH_API_URL: apiTunnel.url }, kv_namespaces: [{ binding: 'PROPOSALS_KV', id: '00000000000000000000000000000000' }] }), { mode: 0o600 });
  const workerPort = await unusedPort(), inspectorPort = await unusedPort();
  const workerProcess = start(join(root, 'workers/share-viewer/node_modules/.bin/wrangler'), ['dev', '--local', '--config', config, '--ip', '127.0.0.1', '--port', String(workerPort), '--inspector-port', String(inspectorPort), '--persist-to', join(dir, 'kv')], { ...runtimeEnv, WRANGLER_SEND_METRICS: 'false' });
  workerProcess.stderr!.on('data', chunk => process.stderr.write(chunk));
  await ready(`http://127.0.0.1:${workerPort}/qa-instance`, [workerProcess, apiProcess], instanceId);
  await ready(`http://127.0.0.1:${workerPort}/api/health`, [workerProcess, apiProcess]);
  const workerTunnel = await tunnel(workerPort);
  const worker = workerTunnel.url;
  console.log(`QA temporary Worker origin: ${worker}`);
  await ready(worker + '/qa-instance', [workerProcess, workerTunnel.child, apiProcess, apiTunnel.child], instanceId);
  await ready(worker + '/api/health', [workerProcess, workerTunnel.child, apiProcess, apiTunnel.child]);
  const allServices = [apiProcess, apiTunnel.child, workerProcess, workerTunnel.child];
  const password = 'isolated-qa-only';
  const request = async (path: string, body: unknown, token?: string) => {
    allServices.forEach(alive);
    // Check the nonce immediately before every seed mutation, including a recycled API port.
    await ready(api + '/qa-instance', [apiProcess], instanceId);
    const response = await fetch(api + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json(); assert.ok(response.ok && data.success, `${path}: ${data.error}`); return data;
  };
  const admin = await request('/api/auth/register', { name: 'Ana QA', email: 'ana@staging.example.invalid', password, organizationName: 'QA SolarSim — A' });
  await request('/api/users', { name: 'Bruno QA', email: 'bruno@staging.example.invalid', password, role: 'EDITOR' }, admin.token);
  await request('/api/users', { name: 'Vera QA', email: 'vera@staging.example.invalid', password, role: 'VIEWER' }, admin.token);
  await request('/api/auth/register', { name: 'Eva QA', email: 'eva@staging.example.invalid', password, organizationName: 'QA SolarSim — B' });
  // Synthetic configuration only. JWTs are never persisted or printed.
  writeFileSync(fixtureConfig, JSON.stringify({ api, worker, organizationId: admin.user.organizationId, instanceId }), { mode: 0o600 });
  const rehearsal = start(process.execPath, ['--import', 'tsx', 'scripts/qa/stagingRehearsal.ts'], { ...runtimeEnv, QA_API_URL: api, QA_WORKER_URL: worker });
  rehearsal.stdout!.pipe(process.stdout); rehearsal.stderr!.pipe(process.stderr);
  const code = await new Promise<number | null>((resolve, reject) => {
    const watchdog = setInterval(() => { try { allServices.forEach(alive); } catch (error) { finish(error as Error); } }, 500);
    const timeout = setTimeout(() => finish(new Error('QA HTTP rehearsal timed out.')), 120000);
    const exited = (code: number | null) => finish(undefined, code);
    const failed = (error: Error) => finish(error);
    function finish(error?: Error, code?: number | null) {
      clearInterval(watchdog); clearTimeout(timeout);
      rehearsal.off('exit', exited); rehearsal.off('error', failed);
      error ? reject(error) : resolve(code!);
    }
    rehearsal.once('exit', exited); rehearsal.once('error', failed);
  });
  assert.equal(code, 0, 'Real HTTP rehearsal must pass.');
  allServices.forEach(alive);
  console.log('QA RUNTIME READY: browser fixture /scripts/qa/fixtures/runtimeFlow.html; Ctrl+C removes DB/KV/tunnels/config.');
  // Catch an unexpected runtime exit while the browser rehearsal is active.
  while (!stopping) { allServices.forEach(alive); await delay(500); }
  await stopping;
} catch (error) {
  await stop();
  throw error;
}
