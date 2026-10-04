import assert from 'node:assert/strict';
import { DEFAULT_FEATURE_SETTINGS, energyCalculationMode, featureScope, normalizeFeatureSettings } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../features/application/featurePolicy';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { useSimulationStore } from '../store/useSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';

const project = structuredClone(BENCHMARK_PROJECT);
project.specs.hasBattery = false;
project.specs.daytimeLoadRatio = 15;
project.monthlyConsumption = Array(12).fill(5000);
const legacy = calculateProjectFinancialSummary(project);
const physical = calculateProjectFinancialSummary(project, 'self_consumption');
for (const month of legacy.monthlyBreakdown) {
  assert.equal(month.solarSelfConsumedKWh, Math.round(month.productionKWh * 0.75 * 10) / 10);
  assert.equal(month.batteryContributionKWh, 0);
  assert.ok(Math.abs(month.solarSelfConsumedKWh + month.gridExportedKWh - month.productionKWh) < 0.11);
  assert.equal(month.netExportCreditKWh, Math.round(month.gridExportedKWh * 0.75 * 10) / 10);
}
assert.notEqual(legacy.year1SavingsUSD, physical.year1SavingsUSD);
assert.notEqual(legacy.npvUSD, physical.npvUSD);
project.specs.daytimeLoadRatio = 95;
assert.equal(calculateProjectFinancialSummary(project).year1SavingsUSD, legacy.year1SavingsUSD);
project.specs.hasBattery = true;
for (const month of calculateProjectFinancialSummary(project).monthlyBreakdown) {
  assert.equal(month.solarSelfConsumedKWh, Math.round(month.productionKWh * 0.90 * 10) / 10);
}
project.rates.isZeroExport = true;
for (const month of calculateProjectFinancialSummary(project).monthlyBreakdown) assert.equal(month.gridExportedKWh, 0);
for (const mode of ['legacy', 'self_consumption'] as const) {
  const zero = calculateMonthlySolarProduction(project.client.province, project.specs, Array(12).fill(0), 0.2, 25, undefined, 'BTS2', false, mode);
  assert.ok(zero.every((month) => month.consumptionKWh === 0 && month.solarSelfConsumedKWh === 0));
}
assert.equal(energyCalculationMode(DEFAULT_FEATURE_SETTINGS), 'legacy');
assert.deepEqual(normalizeFeatureSettings({ selfConsumptionProjection: 'true' }), DEFAULT_FEATURE_SETTINGS);
assert.deepEqual(normalizeFeatureSettings(undefined), DEFAULT_FEATURE_SETTINGS);

const initial = useSimulationStore.getState();
const originalFetch = globalThis.fetch;
try {
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null }, localFeatureSettings: DEFAULT_FEATURE_SETTINGS });
  initial.setLocalFeatureSettings({ selfConsumptionProjection: true });
  assert.equal(energyCalculationMode(effectiveFeatureSettings(useSimulationStore.getState())), 'self_consumption');
  const user = { id: 'test-user', name: 'Synthetic reviewer', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'organization-a' };
  const serverUrl = 'https://qa.example.invalid';
  const scope = featureScope(serverUrl, user.organizationId);
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, serverUrl, authToken: 'synthetic', currentUser: user }, organizationFeaturePolicies: {
    [scope]: { organizationId: user.organizationId, version: 2, settings: { selfConsumptionProjection: false } },
  } });
  assert.equal(energyCalculationMode(effectiveFeatureSettings(useSimulationStore.getState())), 'legacy');
  initial.setLocalFeatureSettings({ selfConsumptionProjection: false });
  assert.equal(useSimulationStore.getState().localFeatureSettings.selfConsumptionProjection, true, 'Logged-in user cannot change a local preference used by another context');
  globalThis.fetch = async () => { throw new Error('Unexpected transport use'); };
  await initial.saveOrganizationFeaturePolicy({ selfConsumptionProjection: true });
  assert.equal(useSimulationStore.getState().organizationFeaturePolicies[scope].settings.selfConsumptionProjection, false);
  assert.equal(useSimulationStore.getState().featurePolicyRequest?.status, 'error');
  useSimulationStore.setState({ syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: { ...user, organizationId: 'organization-b' } } });
  assert.equal(energyCalculationMode(effectiveFeatureSettings(useSimulationStore.getState())), 'legacy', 'No policy reuse across organizations');

  const durable = serializeSimulationStore(useSimulationStore.getState());
  assert.equal(durable.localFeatureSettings.selfConsumptionProjection, true);
  assert.deepEqual(durable.companies, initial.companies);
  assert.deepEqual(durable.localUserProfile, initial.localUserProfile);
  assert.deepEqual(durable.snapshotsByProject, initial.snapshotsByProject);
  assert.ok(!('featurePolicyRequest' in durable));
  const hydrated = { ...initial, projects: [], equipmentCatalog: [], deletedEquipmentIds: DEFAULT_EQUIPMENT_CATALOG.map((equipment) => equipment.id), syncSettings: { ...initial.syncSettings, authToken: null } };
  hydrateSimulationStore(hydrated);
  assert.equal(hydrated.equipmentCatalog.length, 0, 'Removing the last equipment must not resurrect defaults');
} finally { globalThis.fetch = originalFetch; useSimulationStore.setState(initial, true); }
console.log('Application capability, energy mode, tenant scope and durable persistence regressions passed.');
