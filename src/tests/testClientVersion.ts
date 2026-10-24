import assert from 'node:assert/strict';
import {
  CLIENT_HEADER,
  CLIENT_OUTDATED,
  DEFAULT_MIN_CLIENT_VERSION,
  clientOutdatedBody,
  compareSemver,
  formatClientHeader,
  isClientGateOpen,
  isClientOutdated,
  isStableSemver,
  parseClientHeader,
} from '../../shared/clientVersion';

assert.equal(CLIENT_HEADER, 'X-SolarSim-Client');
assert.equal(CLIENT_OUTDATED, 'client_outdated');
assert.equal(DEFAULT_MIN_CLIENT_VERSION, '2.7.1');
assert.equal(formatClientHeader('desktop', '2.7.1'), 'desktop/2.7.1');

// Formato del encabezado: nombre/versión, nada más.
assert.deepEqual(parseClientHeader('desktop/2.7.1'), { name: 'desktop', version: '2.7.1' });
assert.deepEqual(parseClientHeader('  share-viewer/2.8.0-beta.1+build.5 '), { name: 'share-viewer', version: '2.8.0-beta.1+build.5' });
const malformed = [undefined, null, '', 'desktop', '/2.7.1', 'desktop/', 'desktop/2.7', 'desktop/v2.7.1', 'desktop/2.7.1/extra', 'desk top/2.7.1', 'desktop/02.7.1', 'desktop/2.7.1-', 'desktop/2.7.1-01', 'a'.repeat(200) + '/2.7.1'];
for (const bad of malformed) assert.equal(parseClientHeader(bad as string | null | undefined), null, String(bad));

// Comparación semver (precedencia de SemVer 2.0.0).
const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.7.0', '2.7.1-beta.1', '2.7.1', '2.7.2', '2.10.0', '10.0.0'];
for (let i = 0; i < order.length; i++) for (let j = 0; j < order.length; j++) {
  assert.equal(Math.sign(compareSemver(order[i], order[j])!), Math.sign(i - j), `${order[i]} vs ${order[j]}`);
}
assert.equal(compareSemver('2.7.1+a', '2.7.1+b'), 0, 'los metadatos de compilación no cuentan');
assert.equal(compareSemver('999999999999999999999.0.0', '2.7.1')! > 0, true, 'sin desbordar enteros');
assert.equal(compareSemver('2.7', '2.7.1'), null);
assert.equal(compareSemver('x', '2.7.1'), null);

// Cliente obsoleto: sin encabezado, versión menor, malformado o prelanzamiento del mínimo.
assert.equal(isClientOutdated(undefined, '2.7.1'), true, 'sin encabezado');
assert.equal(isClientOutdated(null, '2.7.1'), true);
assert.equal(isClientOutdated('desktop/2.7.0', '2.7.1'), true, 'anterior');
assert.equal(isClientOutdated('desktop/2.6.0', '2.7.1'), true);
assert.equal(isClientOutdated('desktop/2.7.1', '2.7.1'), false, 'igual');
assert.equal(isClientOutdated('desktop/2.7.2', '2.7.1'), false, 'posterior');
assert.equal(isClientOutdated('mcp/2.10.0', '2.7.1'), false, 'comparación numérica, no de texto');
assert.equal(isClientOutdated('desktop/2.7.1-beta.1', '2.7.1'), true, 'un prelanzamiento es anterior a su versión final');
assert.equal(isClientOutdated('desktop/2.8.0-beta.1', '2.7.1'), false);
assert.equal(isClientOutdated('desktop/latest', '2.7.1'), true, 'malformado');
assert.equal(isClientOutdated('2.7.1', '2.7.1'), true, 'sin nombre');
assert.equal(isClientOutdated('desktop/2.7.1', 'no-es-semver'), true, 'un mínimo inválido nunca deja pasar a nadie');

assert.deepEqual(['2.7.1', '0.0.0', '10.20.30'].map(isStableSemver), [true, true, true]);
assert.deepEqual(['2.7.1-beta.1', '2.7.1+build', '2.7', 'v2.7.1', ''].map(isStableSemver), [false, false, false, false, false], 'el mínimo configurado es major.minor.patch');

assert.deepEqual(clientOutdatedBody('2.7.1'), {
  error: 'client_outdated',
  minVersion: '2.7.1',
  message: 'Actualiza SolarSim a la versión 2.7.1 o superior para seguir sincronizando.',
});

// Rutas abiertas: salud, inicio de sesión, renovación, identidad de sesión y preflight CORS.
for (const path of ['/api/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/me']) assert.equal(isClientGateOpen('GET', path), true, path);
assert.equal(isClientGateOpen('OPTIONS', '/api/sync/push'), true);
for (const path of ['/api/sync/pull', '/api/sync/push', '/api/projects/x', '/api/auth/register', '/api/auth/share-authorization', '/api/auth/me/extra', '/api/health/', '/api/clients', '/api/equipment', '/api/users']) assert.equal(isClientGateOpen('POST', path), false, path);
console.log('PASS: encabezado de cliente, semver, cliente obsoleto y rutas abiertas.');
