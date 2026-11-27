import { ApplicationFeatureSettings, DEFAULT_FEATURE_SETTINGS, featureScope, normalizeFeatureSettings, OrganizationFeaturePolicy, type ApplicationFeatureId } from '../../../shared/applicationFeatures';
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

/**
 * Claves de la política que el servidor gestiona para la versión de este cliente: solo esas se cambian y se envían al
 * guardar. Una política guardada por una versión anterior (sin `managedFeatures`) se trata como la de dos claves, así
 * nunca se envía una clave que el servidor no haya confirmado.
 */
export function organizationManagedFeatures(policy: Pick<OrganizationFeaturePolicy, 'managedFeatures'> | undefined): ApplicationFeatureId[] {
  return policy?.managedFeatures ?? ['selfConsumptionProjection', 'netMeteringRegimeSelector'];
}
