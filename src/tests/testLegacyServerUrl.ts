import assert from 'node:assert/strict';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
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

// Los servidores antiguos (dirección de la LAN sin TLS, dominio anterior, URL vacía) pasan al dominio oficial.
for (const legacy of ['http://10.20.30.40', 'http://10.20.30.40/', 'http://10.20.30.40:3000', 'https://api.electsun.com', '', undefined]) {
  assert.equal(hydratedServerUrl(legacy), OFFICIAL, `migra ${String(legacy)}`);
}

// Lo que el usuario configuró a propósito se conserva: el oficial, HTTPS propio, localhost y otras redes privadas.
for (const kept of [OFFICIAL, 'https://10.20.30.40', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.5:3000', 'https://staging.example.test']) {
  assert.equal(hydratedServerUrl(kept), kept, `conserva ${kept}`);
}

console.log('Legacy server URL: LAN sin TLS, dominio anterior y vacío migran; las demás URLs se conservan.');
