import { ApplicationFeatureSettings, DEFAULT_FEATURE_SETTINGS, featureScope, normalizeFeatureSettings, OrganizationFeaturePolicy } from '../../../shared/applicationFeatures';
import type { SyncSettings } from '../../types';

export interface FeaturePolicyState {
  localFeatureSettings: ApplicationFeatureSettings;
  organizationFeaturePolicies: Record<string, OrganizationFeaturePolicy>;
  syncSettings: SyncSettings;
}
export function effectiveFeatureSettings(state: FeaturePolicyState): ApplicationFeatureSettings {
  const { currentUser, serverUrl } = state.syncSettings;
  if (!currentUser) return normalizeFeatureSettings(state.localFeatureSettings);
  const policy = state.organizationFeaturePolicies[featureScope(serverUrl, currentUser.organizationId)];
  return policy?.organizationId === currentUser.organizationId
    ? normalizeFeatureSettings(policy.settings)
    : { ...DEFAULT_FEATURE_SETTINGS };
}
