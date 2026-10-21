/** Pure capability contract shared by the desktop app and the organization API. */
export type FeatureStage = 'stable' | 'beta' | 'experimental';
export type EnergyCalculationMode = 'legacy' | 'self_consumption';
export interface ApplicationFeatureSettings { selfConsumptionProjection: boolean }
export interface OrganizationFeaturePolicy {
  organizationId: string;
  version: number;
  settings: ApplicationFeatureSettings;
}
export const DEFAULT_FEATURE_SETTINGS: ApplicationFeatureSettings = { selfConsumptionProjection: false };
export const APPLICATION_FEATURES = [{
  id: 'selfConsumptionProjection',
  title: 'Proyección de autoconsumo',
  description: 'Perfil de carga diurna, despacho diario de baterías y su efecto en el ahorro, los gráficos y las propuestas.',
  stage: 'experimental' as FeatureStage,
  available: true,
  visibilityWhenDisabled: 'hidden' as 'hidden' | 'labelled',
  defaultEnabled: false,
}] as const;

export function normalizeFeatureSettings(value: unknown): ApplicationFeatureSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { selfConsumptionProjection: record.selfConsumptionProjection === true };
}
export function isFeatureSettings(value: unknown): value is ApplicationFeatureSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.selfConsumptionProjection === 'boolean';
}
export function featureScope(serverUrl: string, organizationId: string): string {
  return `${serverUrl.trim().replace(/\/+$/, '')}|${organizationId}`;
}
export function energyCalculationMode(settings: ApplicationFeatureSettings): EnergyCalculationMode {
  return settings.selfConsumptionProjection ? 'self_consumption' : 'legacy';
}

/** Stable product capabilities: always present, separate from organization calculation switches. */
export const BUILT_IN_APPLICATION_FEATURES = [{
  id: 'proposalCommercialTracking', title: 'Seguimiento comercial de propuestas',
  description: 'Estados de aprobación, notas, responsables y resultados comerciales; disponible sin alterar el cálculo energético.',
  stage: 'stable' as FeatureStage, available: true, visibilityWhenDisabled: 'labelled' as const, defaultEnabled: true, configurable: false,
}, {
  id: 'clientsDirectory', title: 'Directorio de clientes',
  description: 'Clientes de la organización enlazados a propuestas, con resumen de estados; no cambia los datos impresos ni el cálculo.',
  stage: 'stable' as FeatureStage, available: true, visibilityWhenDisabled: 'labelled' as const, defaultEnabled: true, configurable: false,
}] as const;
