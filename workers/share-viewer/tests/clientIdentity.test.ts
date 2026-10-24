import assert from 'node:assert/strict';
import pkg from '../package.json';
import { createShareViewer } from '../src/index';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { clientOutdatedBody, isClientOutdated } from '../../../shared/clientVersion';

// El Worker se presenta ante la API como share-viewer/<versión de package.json> en cada autorización.
const kv = { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true, cursor: '' }) };
const env: any = { AUTH_API_URL: 'https://auth.example.test', PROPOSALS_KV: kv };
const identity = { success: true, userId: 'editor-a', userName: 'Ana', organizationId: 'org-a', authors: [], featurePolicy: { version: 1, settings: { selfConsumptionProjection: false } } };
const sent: { url: string; client: string | null; authorization: string | null }[] = [];
const app = createShareViewer(async (input, init) => {
  const headers = new Headers(init?.headers);
  sent.push({ url: String(input), client: headers.get('X-SolarSim-Client'), authorization: headers.get('Authorization') });
  // La API real rechaza a quien no se identifica con una versión suficiente.
  if (isClientOutdated(headers.get('X-SolarSim-Client'), pkg.version)) return Response.json(clientOutdatedBody(pkg.version), { status: 426 });
  return Response.json(identity);
});
const request = (path: string, method = 'GET', body?: unknown) => app.request('https://worker.example.test' + path, { method, headers: { Authorization: 'Bearer signed.session.test', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, env);
const payload = { project: BENCHMARK_PROJECT, summary: calculateProjectFinancialSummary(BENCHMARK_PROJECT), validityDays: 7, calculationSnapshot: { mode: 'legacy', organizationId: 'org-a', policyVersion: 1, capturedAt: new Date().toISOString() } };

async function main() {
assert.equal((await request('/api/share', 'POST', payload)).status, 200);
assert.equal((await request('/api/share/history')).status, 200);
assert.equal(sent.length, 2);
for (const call of sent) {
  assert.equal(call.client, `share-viewer/${pkg.version}`);
  assert.equal(call.authorization, 'Bearer signed.session.test');
}
assert.ok(sent[0].url.endsWith('/api/auth/share-authorization'));
assert.ok(sent[1].url.endsWith('/api/auth/share-history-authorization'));
// El preflight de CORS acepta el encabezado nuevo por si un cliente lo envía directamente al Worker.
const preflight = await app.request('https://worker.example.test/api/share', { method: 'OPTIONS', headers: { Origin: 'file://', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,x-solarsim-client' } }, env);
assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /X-SolarSim-Client/i);
console.log('PASS: el Worker envía share-viewer/<versión> a la API de autorización.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
