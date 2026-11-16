import assert from 'node:assert/strict';
import { energyCalculationMode, featureScope, netMeteringRegimeSelectorVisible } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../features/application/featurePolicy';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { requestFeaturePolicy } from '../services/featurePolicyService';
import { useSimulationStore } from '../store/useSimulationStore';
import type { SimulationStore } from '../store/types';

/**
 * Política de funciones de una sola clave (estado guardado por 2.7.4 y API anterior o lectura para clientes
 * anteriores): se conserva `selfConsumptionProjection` y el selector de régimen toma su valor por defecto (visible).
 */
const initial = useSimulationStore.getState();
const originalFetch = globalThis.fetch;
const serverUrl = 'https://qa.example.invalid';
const user = { id: 'u-274', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'org-274' };
const scope = featureScope(serverUrl, user.organizationId);
try {
  // 1. Hidratación real de un estado persistido por 2.7.4 (una clave en local y en la política de la organización).
  const persisted = {
    ...initial, projects: [], equipmentCatalog: [],
    localFeatureSettings: { selfConsumptionProjection: true },
    organizationFeaturePolicies: { [scope]: { organizationId: user.organizationId, version: 3, settings: { selfConsumptionProjection: true } } },
    // Preferencia que solo existió en una rama de desarrollo: se ignora.
    netMeteringRegimeSelectorEnabled: false,
  } as unknown as SimulationStore;
  hydrateSimulationStore(persisted);
  useSimulationStore.setState({
    localFeatureSettings: persisted.localFeatureSettings,
    organizationFeaturePolicies: persisted.organizationFeaturePolicies,
    syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null },
  });
  let settings = effectiveFeatureSettings(useSimulationStore.getState());
  assert.equal(energyCalculationMode(settings), 'self_consumption', 'sin conexión: la proyección guardada se conserva');
  assert.equal(netMeteringRegimeSelectorVisible(settings), true);
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, serverUrl, authToken: 'synthetic', currentUser: user } });
  settings = effectiveFeatureSettings(useSimulationStore.getState());
  assert.equal(energyCalculationMode(settings), 'self_consumption', 'política de la organización de una clave: se conserva');
  assert.equal(netMeteringRegimeSelectorVisible(settings), true);

  // 2. Respuesta HTTP sintética de una clave (API anterior o lectura para cliente anterior): aceptada y completada.
  globalThis.fetch = (async () => Response.json({ organizationId: user.organizationId, version: 4, settings: { selfConsumptionProjection: true } })) as typeof fetch;
  const policy = await requestFeaturePolicy(serverUrl, 'synthetic', user.organizationId);
  assert.deepEqual(policy.settings, { selfConsumptionProjection: true, netMeteringRegimeSelector: true });
  globalThis.fetch = (async () => Response.json({ organizationId: user.organizationId, version: 5, settings: { selfConsumptionProjection: false, netMeteringRegimeSelector: false } })) as typeof fetch;
  assert.deepEqual((await requestFeaturePolicy(serverUrl, 'synthetic', user.organizationId)).settings, { selfConsumptionProjection: false, netMeteringRegimeSelector: false });
  globalThis.fetch = (async () => Response.json({ organizationId: user.organizationId, version: 5, settings: { selfConsumptionProjection: false, unknown: true } })) as typeof fetch;
  await assert.rejects(() => requestFeaturePolicy(serverUrl, 'synthetic', user.organizationId), /inválida/);
} finally {
  globalThis.fetch = originalFetch;
  useSimulationStore.setState(initial, true);
}
console.log('Política de funciones: estado y respuestas de una clave se leen sin perder la proyección.');
