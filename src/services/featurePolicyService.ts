import { fetchWithSessionRetry } from './syncService';
import { isCompatibleFeatureSettings, managedFeatureKeys, normalizeFeatureSettings, type ApplicationFeatureSettings, type OrganizationFeaturePolicy } from '../../shared/applicationFeatures';

export async function requestFeaturePolicy(serverUrl: string, authToken: string, organizationId: string, change?: { settings: Partial<ApplicationFeatureSettings>; baseVersion: number }): Promise<OrganizationFeaturePolicy> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchWithSessionRetry(`${serverUrl.trim().replace(/\/+$/, '')}/api/organization/features`, {
      method: change ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${authToken}`, ...(change ? { 'Content-Type': 'application/json' } : {}) },
      body: change ? JSON.stringify(change) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Este servidor todavía no admite la configuración de funciones. Actualiza el backend para gestionarla.');
      if (response.status === 409) throw new Error('Otro administrador modificó esta configuración. Actualiza antes de guardar.');
      if (response.status === 403) throw new Error('Solo un administrador puede cambiar las funciones de la organización.');
      throw new Error(`No se pudo consultar la configuración (HTTP ${response.status}).`);
    }
    const policy = await response.json() as OrganizationFeaturePolicy;
    if (policy.organizationId !== organizationId || !Number.isSafeInteger(policy.version) || policy.version < 1 || !isCompatibleFeatureSettings(policy.settings)) throw new Error('El servidor devolvió una configuración de funciones inválida.');
    // El servidor envía las claves que gestiona para la versión de este cliente: solo esas se pueden cambiar
    // (`managedFeatures`); las demás toman su valor por defecto para mostrarse.
    return { organizationId: policy.organizationId, version: policy.version, settings: normalizeFeatureSettings(policy.settings), managedFeatures: managedFeatureKeys(policy.settings) };
  } finally { clearTimeout(timeout); }
}
