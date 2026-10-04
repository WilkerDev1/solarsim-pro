import { ApplicationFeatureSettings, DEFAULT_FEATURE_SETTINGS, featureScope, normalizeFeatureSettings, OrganizationFeaturePolicy } from '../../../shared/applicationFeatures';
import { requestFeaturePolicy } from '../../services/featurePolicyService';
import { SimulationSlice } from '../types';

export interface FeatureSettingsSlice {
  localFeatureSettings: ApplicationFeatureSettings;
  organizationFeaturePolicies: Record<string, OrganizationFeaturePolicy>;
  featurePolicyRequest: { scope: string; status: 'loading' | 'saving' | 'ready' | 'error'; error?: string } | null;
  setLocalFeatureSettings: (settings: ApplicationFeatureSettings) => void;
  loadOrganizationFeaturePolicy: () => Promise<void>;
  saveOrganizationFeaturePolicy: (settings: ApplicationFeatureSettings) => Promise<void>;
}

export const createFeatureSettingsSlice: SimulationSlice<FeatureSettingsSlice> = (set, get) => {
  let requestSequence = 0;
  const request = async (settings?: ApplicationFeatureSettings) => {
    const { serverUrl, authToken, currentUser } = get().syncSettings;
    if (!currentUser || !authToken) return;
    const generation = get().sessionGeneration;
    const scope = featureScope(serverUrl, currentUser.organizationId);
    const sequence = ++requestSequence;
    const stillCurrent = () => {
      const session = get().syncSettings;
      return generation === get().sessionGeneration && sequence === requestSequence && session.currentUser?.id === currentUser.id && session.currentUser.organizationId === currentUser.organizationId && session.serverUrl === serverUrl && !!session.authToken;
    };
    set({ featurePolicyRequest: { scope, status: settings ? 'saving' : 'loading' } });
    try {
      const confirmed = get().organizationFeaturePolicies[scope];
      if (settings && currentUser.role !== 'ADMIN') throw new Error('Solo un administrador puede cambiar esta configuración.');
      if (settings && !confirmed) throw new Error('Consulta primero la configuración del servidor.');
      const policy = await requestFeaturePolicy(serverUrl, authToken, currentUser.organizationId, settings ? { settings: normalizeFeatureSettings(settings), baseVersion: confirmed.version } : undefined);
      if (!stillCurrent()) return;
      set((state) => ({ organizationFeaturePolicies: { ...state.organizationFeaturePolicies, [scope]: policy }, featurePolicyRequest: { scope, status: 'ready' } }));
    } catch (error) {
      if (stillCurrent()) set({ featurePolicyRequest: { scope, status: 'error', error: error instanceof Error ? error.message : 'No se pudo consultar la configuración.' } });
    }
  };
  return {
    localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS }, organizationFeaturePolicies: {}, featurePolicyRequest: null,
    setLocalFeatureSettings: (settings) => {
      if (!get().syncSettings.currentUser) set({ localFeatureSettings: normalizeFeatureSettings(settings) });
    },
    loadOrganizationFeaturePolicy: () => request(),
    saveOrganizationFeaturePolicy: (settings) => request(settings),
  };
};
