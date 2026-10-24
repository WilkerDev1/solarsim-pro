import assert from 'node:assert/strict';
import { hydrateSimulationStore, serverUrlFingerprint } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { useSimulationStore } from '../store/useSimulationStore';

/** URL del servidor tras hidratar un estado guardado con `serverUrl`. */
function hydratedServerUrl(serverUrl: string | undefined): string | undefined {
  const base = serializeSimulationStore({ ...useSimulationStore.getState(), projects: [] });
  const durable = JSON.parse(JSON.stringify({ ...base, syncSettings: { ...base.syncSettings, serverUrl } }));
  hydrateSimulationStore(durable);
  return durable.syncSettings.serverUrl;
}

const OFFICIAL = 'https://solarsim.electsun.net';

// La huella es FNV-1a de 32 bits (vectores conocidos), así que la URL retirada se reconoce sin escribirla.
assert.equal(serverUrlFingerprint(''), '811c9dc5');
assert.equal(serverUrlFingerprint('a'), 'e40c292c');
assert.equal(serverUrlFingerprint('foobar'), 'bf9cf968');

// El dominio anterior y la URL vacía pasan al dominio oficial.
for (const legacy of ['https://api.electsun.com', '', undefined]) {
  assert.equal(hydratedServerUrl(legacy), OFFICIAL, `migra ${String(legacy)}`);
}

// Un servidor propio, también en la LAN 10.x sin TLS, se conserva: solo migra la URL exacta del servidor retirado.
for (const kept of [OFFICIAL, 'http://10.20.30.40', 'http://10.20.30.40:3000', 'https://10.20.30.40', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.5:3000', 'https://staging.example.test']) {
  assert.equal(hydratedServerUrl(kept), kept, `conserva ${kept}`);
}

console.log('Legacy server URL: dominio anterior, vacío y el servidor LAN retirado migran; los servidores propios se conservan.');
