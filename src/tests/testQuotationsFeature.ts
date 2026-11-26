import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  APPLICATION_FEATURES, DEFAULT_FEATURE_SETTINGS, featureScope, featureSettingsForClient, isCompatibleFeatureSettings, isFeatureSettings,
  normalizeFeatureSettings, quotationsFeatureEnabled,
} from '../../shared/applicationFeatures';
import { FEATURE_POLICY_V2_CLIENT_VERSION, FEATURE_POLICY_V3_CLIENT_VERSION, compareSemver } from '../../shared/clientVersion';
import { effectiveFeatureSettings } from '../features/application/featurePolicy';
import { enforceQuotationsFeature, isQuotationsView } from '../features/application/quotationsFeature';
import { requestFeaturePolicy } from '../services/featurePolicyService';
import { PrimaryIconDock } from '../components/layout/PrimaryIconDock';
import { useSimulationStore } from '../store/useSimulationStore';

// --- Registro ---------------------------------------------------------------------------------------------------------
const feature = APPLICATION_FEATURES.find((f) => f.id === 'quotations');
assert.ok(feature, 'la función quotations está registrada');
assert.equal(feature.title, 'Cotizaciones');
assert.equal(feature.stage, 'beta');
assert.equal(feature.defaultEnabled, true);
assert.equal(feature.available, true);
assert.equal(feature.visibilityWhenDisabled, 'hidden');
assert.equal(DEFAULT_FEATURE_SETTINGS.quotations, true);
assert.deepEqual(Object.keys(DEFAULT_FEATURE_SETTINGS).sort(), ['netMeteringRegimeSelector', 'quotations', 'selfConsumptionProjection']);

// --- Lectura compatible: una o dos claves se leen y la que falta toma su valor por defecto ------------------------------
assert.deepEqual(normalizeFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false }), {
  selfConsumptionProjection: true, netMeteringRegimeSelector: false, quotations: true,
});
assert.deepEqual(normalizeFeatureSettings({ selfConsumptionProjection: false }), { selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: true });
assert.equal(normalizeFeatureSettings({ selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: false }).quotations, false);
assert.equal(normalizeFeatureSettings({ quotations: 'no' }).quotations, true, 'un valor no booleano toma el defecto');
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false }), true);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, netMeteringRegimeSelector: true }), true);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: false }), true);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, quotations: 'sí' }), false);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, other: true }), false);

// --- Escritura: solo la forma completa de tres claves (un cliente anterior no puede sobrescribirla) ---------------------
assert.equal(isFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false }), false, '2.9.x envía dos claves: 400');
assert.equal(isFeatureSettings({ selfConsumptionProjection: true }), false);
assert.equal(isFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false, quotations: false }), true);
assert.equal(isFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false, quotations: false, extra: true }), false);

// --- Lectura según la versión del cliente -------------------------------------------------------------------------------
assert.ok((compareSemver(FEATURE_POLICY_V3_CLIENT_VERSION, FEATURE_POLICY_V2_CLIENT_VERSION) ?? 0) > 0);
assert.ok((compareSemver(FEATURE_POLICY_V3_CLIENT_VERSION, '2.9.4') ?? 0) > 0, 'la versión publicada actual (2.9.4) es anterior');
const stored = { selfConsumptionProjection: true, netMeteringRegimeSelector: false, quotations: false };
assert.deepEqual(featureSettingsForClient(stored, null), { selfConsumptionProjection: true });
assert.deepEqual(featureSettingsForClient(stored, 'desktop/2.7.4'), { selfConsumptionProjection: true });
assert.deepEqual(featureSettingsForClient(stored, 'desktop/2.9.4'), { selfConsumptionProjection: true, netMeteringRegimeSelector: false }, '2.9.x valida exactamente sus dos claves');
assert.deepEqual(featureSettingsForClient(stored, `desktop/${FEATURE_POLICY_V3_CLIENT_VERSION}`), stored);
assert.deepEqual(featureSettingsForClient({ selfConsumptionProjection: false, netMeteringRegimeSelector: true }, `desktop/${FEATURE_POLICY_V3_CLIENT_VERSION}`), {
  selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: true,
}, 'una fila guardada con dos claves se completa con el defecto');
assert.equal(quotationsFeatureEnabled(normalizeFeatureSettings(stored)), false);
assert.equal(quotationsFeatureEnabled(DEFAULT_FEATURE_SETTINGS), true);

const initial = { ...useSimulationStore.getState() };
/** renderToStaticMarkup lee la instantánea de servidor del store (su estado inicial): se alinea con el actual. */
const syncServerSnapshot = () => Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const originalFetch = globalThis.fetch;
const serverUrl = 'https://qa.example.invalid';
const user = { id: 'u-q', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'org-q' };
try {
  // Respuesta de la API anterior (dos claves): aceptada y completada.
  globalThis.fetch = (async () => Response.json({ organizationId: user.organizationId, version: 3, settings: { selfConsumptionProjection: false, netMeteringRegimeSelector: false } })) as typeof fetch;
  assert.deepEqual((await requestFeaturePolicy(serverUrl, 'synthetic', user.organizationId)).settings, { selfConsumptionProjection: false, netMeteringRegimeSelector: false, quotations: true });
  globalThis.fetch = (async () => Response.json({ organizationId: user.organizationId, version: 4, settings: { selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: false } })) as typeof fetch;
  assert.equal((await requestFeaturePolicy(serverUrl, 'synthetic', user.organizationId)).settings.quotations, false);

  // Política de la organización guardada con dos claves (estado persistido por 2.9.x): la función queda activada.
  const scope = featureScope(serverUrl, user.organizationId);
  useSimulationStore.setState({
    syncSettings: { ...initial.syncSettings, serverUrl, authToken: 'synthetic', currentUser: user },
    organizationFeaturePolicies: { [scope]: { organizationId: user.organizationId, version: 2, settings: { selfConsumptionProjection: false, netMeteringRegimeSelector: true } as never } },
  });
  assert.equal(effectiveFeatureSettings(useSimulationStore.getState()).quotations, true);

  // --- Botón del dock principal: solo con la función activa ---------------------------------------------------------
  const dock = () => { syncServerSnapshot(); return renderToStaticMarkup(React.createElement(PrimaryIconDock)); };
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null }, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS }, activeView: 'quotations-hub' });
  assert.match(dock(), /aria-label="Cotizaciones"/);
  assert.match(dock(), /aria-label="Cotizaciones"[^>]*aria-current="page"|aria-current="page"[^>]*aria-label="Cotizaciones"/, 'marcado como página actual');
  useSimulationStore.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS, quotations: false } });
  assert.doesNotMatch(dock(), /aria-label="Cotizaciones"/);

  // --- Apagar la función estando en el catálogo o el editor vuelve a Inicio, sin escribir nada más -------------------
  assert.equal(isQuotationsView('quotations-hub'), true);
  assert.equal(isQuotationsView('quotation-editor'), true);
  assert.equal(isQuotationsView('clients-hub'), false);
  for (const view of ['quotations-hub', 'quotation-editor'] as const) {
    useSimulationStore.setState({ activeView: view, activeQuotationId: 'q-open' });
    const before = useSimulationStore.getState();
    enforceQuotationsFeature();
    const after = useSimulationStore.getState();
    assert.equal(after.activeView, 'dashboard', `${view} → dashboard`);
    assert.equal(after.quotations, before.quotations);
    assert.equal(after.quotationChanges, before.quotationChanges);
    assert.equal(after.activeQuotationId, 'q-open', 'solo cambia la vista');
  }
  useSimulationStore.setState({ activeView: 'clients-hub' });
  enforceQuotationsFeature();
  assert.equal(useSimulationStore.getState().activeView, 'clients-hub', 'otras vistas no cambian');
  useSimulationStore.setState({ activeView: 'quotations-hub', localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS } });
  enforceQuotationsFeature();
  assert.equal(useSimulationStore.getState().activeView, 'quotations-hub', 'con la función activa no cambia nada');
} finally {
  globalThis.fetch = originalFetch;
  useSimulationStore.setState(initial, true);
  syncServerSnapshot();
}

console.log('Quotations feature tests passed.');
