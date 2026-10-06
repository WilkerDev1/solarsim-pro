import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runCompatibilityChecks } from '../verifyDeploymentCompatibility.js';

function createMockServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      const url = `http://127.0.0.1:${address.port}`;
      resolve({
        url,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

test('Compatibility Checker: detecta API caída y falla con status FAIL', async () => {
  const result = await runCompatibilityChecks({
    apiUrl: 'http://127.0.0.1:59999', // Closed port
    workerUrl: 'http://127.0.0.1:59998',
    silent: true,
  });

  assert.equal(result.success, false);
  const apiReachability = result.results.find((r) => r.name === 'API Reachability');
  assert.ok(apiReachability);
  assert.equal(apiReachability.status, 'FAIL');
});

test('Compatibility Checker: detecta API 2.2.0 antigua y rutas 404', async () => {
  const mockApi = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'Legacy API', version: '2.2.0', database: 'connected' }));
      return;
    }
    // All other routes 404 in legacy 2.2.0
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  });

  const mockWorker = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'SolarSim Pro Share Viewer' }));
      return;
    }
    if (req.url === '/api/share' && req.method === 'POST') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }
    if (req.url?.startsWith('/p/')) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html>Propuesta Vencida</html>');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const result = await runCompatibilityChecks({
      apiUrl: mockApi.url,
      workerUrl: mockWorker.url,
      silent: true,
    });

    assert.equal(result.success, false, 'Legacy API should result in failure');
    const legacyCheck = result.results.find((r) => r.name === 'API Health & Database');
    assert.ok(legacyCheck);
    assert.equal(legacyCheck.status, 'FAIL');
    assert.match(legacyCheck.message, /2\.2\.0/);

    const featureRoute = result.results.find((r) => r.name === 'Ruta API: GET /api/organization/features');
    assert.ok(featureRoute);
    assert.equal(featureRoute.status, 'FAIL');

    const shareAuthRoute = result.results.find((r) => r.name === 'Ruta API: POST /api/auth/share-authorization');
    assert.ok(shareAuthRoute);
    assert.equal(shareAuthRoute.status, 'FAIL');
  } finally {
    await mockApi.close();
    await mockWorker.close();
  }
});

test('Compatibility Checker: detecta base de datos desconectada o JSON malformado', async () => {
  const mockApi = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'API', version: '2.2.1', database: 'disconnected' }));
      return;
    }
    res.writeHead(503);
    res.end();
  });

  const mockWorker = await createMockServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  try {
    const result = await runCompatibilityChecks({
      apiUrl: mockApi.url,
      workerUrl: mockWorker.url,
      silent: true,
    });

    assert.equal(result.success, false);
    const dbCheck = result.results.find((r) => r.name === 'API Database Connectivity');
    assert.ok(dbCheck);
    assert.equal(dbCheck.status, 'FAIL');
  } finally {
    await mockApi.close();
    await mockWorker.close();
  }
});

test('Compatibility Checker: detecta endpoint desprotegido (responde 200 sin credenciales)', async () => {
  const mockApi = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'API', version: '2.2.1', database: 'connected' }));
      return;
    }
    // Buggy route returning 200 without Authorization
    if (req.url === '/api/organization/features') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ leaked: true }));
      return;
    }
    res.writeHead(401);
    res.end();
  });

  const mockWorker = await createMockServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  try {
    const result = await runCompatibilityChecks({
      apiUrl: mockApi.url,
      workerUrl: mockWorker.url,
      silent: true,
    });

    assert.equal(result.success, false);
    const vulnerableRoute = result.results.find((r) => r.name === 'Ruta API: GET /api/organization/features');
    assert.ok(vulnerableRoute);
    assert.equal(vulnerableRoute.status, 'FAIL');
    assert.match(vulnerableRoute.message, /PROTECCIÓN INVÁLIDA/);
  } finally {
    await mockApi.close();
    await mockWorker.close();
  }
});

test('Compatibility Checker: confirma éxito total cuando todos los contratos están satisfechos', async () => {
  const mockApi = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'SolarSim Pro Sync API', version: '2.2.1', database: 'connected' }));
      return;
    }
    // Protected routes must return 401 when no token is present
    if (!req.headers.authorization) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado' }));
      return;
    }
    // If token present, return valid response
    if (req.url === '/api/organization/features') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ organizationId: 'org-test', version: 1, settings: { selfConsumptionProjection: false } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });

  const mockWorker = await createMockServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'SolarSim Pro Share Viewer' }));
      return;
    }
    if (req.url === '/api/share' && req.method === 'POST') {
      if (!req.headers.authorization) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, shareUrl: 'https://propuesta.electsun.net/p/test' }));
      return;
    }
    if (req.url?.startsWith('/p/')) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html>Propuesta Vencida o No Disponible</html>');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const result = await runCompatibilityChecks({
      apiUrl: mockApi.url,
      workerUrl: mockWorker.url,
      authToken: 'mock-valid-jwt-token',
      silent: true,
    });

    assert.equal(result.success, true, 'Fully compatible mock environment should pass');
    const failures = result.results.filter((r) => r.status === 'FAIL');
    assert.equal(failures.length, 0);
  } finally {
    await mockApi.close();
    await mockWorker.close();
  }
});
