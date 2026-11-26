/** Pure capability contract shared by the desktop app and the organization API. */
import { FEATURE_POLICY_V2_CLIENT_VERSION, FEATURE_POLICY_V3_CLIENT_VERSION, isClientOutdated } from './clientVersion.js';
export type FeatureStage = 'stable' | 'beta' | 'experimental';
export type EnergyCalculationMode = 'legacy' | 'self_consumption';
/**
 * Política de funciones de la organización. Tiene tres claves desde la versión que introduce las cotizaciones (dos
 * desde el régimen de medición neta); la API solo guarda la forma completa (`isFeatureSettings`), así que un cliente
 * anterior (una o dos claves) no puede sobrescribirla. Una respuesta o una política guardada con menos claves se sigue
 * leyendo (`isCompatibleFeatureSettings`) y la clave que falta toma su valor por defecto.
 */
export interface ApplicationFeatureSettings { selfConsumptionProjection: boolean; netMeteringRegimeSelector: boolean; quotations: boolean }
export interface OrganizationFeaturePolicy {
  organizationId: string;
  version: number;
  /** Política efectiva: las claves que el servidor no envió valen su defecto (`normalizeFeatureSettings`). */
  settings: ApplicationFeatureSettings;
  /**
   * Claves que el servidor envió para la versión con la que se identifica este cliente (`featureKeysForClient`): solo
   * esas se pueden cambiar y solo esas se envían al guardar. Ausente en políticas guardadas por versiones anteriores.
   */
  managedFeatures?: ApplicationFeatureId[];
}
export const APPLICATION_FEATURES = [{
  id: 'selfConsumptionProjection',
  title: 'Proyección de autoconsumo',
  description: 'Perfil de carga diurna, despacho diario de baterías y su efecto en el ahorro, los gráficos y las propuestas.',
  disabledNote: 'Desactivada: cálculo clásico de autoconsumo (75% sin baterías, 90% con baterías), sin perfil diurno en los parámetros.',
  stage: 'experimental' as FeatureStage,
  available: true,
  visibilityWhenDisabled: 'hidden' as 'hidden' | 'labelled',
  defaultEnabled: false,
}, {
  id: 'netMeteringRegimeSelector',
  title: 'Selector de régimen de medición neta',
  description: 'Selector temporal en los parámetros de tarifa para calcular una propuesta con la retención % anterior o con el cargo por kWh inyectado del Reglamento SIE-007-2026, para pruebas y casos especiales.',
  disabledNote: 'Desactivada: el selector no se muestra. No cambia el régimen de ninguna propuesta: las nuevas nacen en SIE-007-2026 y las guardadas conservan el suyo.',
  stage: 'beta' as FeatureStage,
  available: true,
  visibilityWhenDisabled: 'hidden' as 'hidden' | 'labelled',
  defaultEnabled: true,
}, {
  id: 'quotations',
  title: 'Cotizaciones',
  description: 'Catálogo y editor de cotizaciones: documentos comerciales simples con líneas, descuentos, ITBIS y total, independientes de las propuestas.',
  disabledNote: 'Desactivada: el botón y las vistas de cotizaciones no se muestran. Las cotizaciones guardadas se conservan y se siguen sincronizando.',
  stage: 'beta' as FeatureStage,
  available: true,
  visibilityWhenDisabled: 'hidden' as 'hidden' | 'labelled',
  defaultEnabled: true,
}] as const;
export type ApplicationFeatureId = keyof ApplicationFeatureSettings;
const FEATURE_KEYS = APPLICATION_FEATURES.map((feature) => feature.id) as ApplicationFeatureId[];
export const DEFAULT_FEATURE_SETTINGS: ApplicationFeatureSettings = Object.fromEntries(APPLICATION_FEATURES.map((feature) => [feature.id, feature.defaultEnabled])) as unknown as ApplicationFeatureSettings;

/** Una función se usa solo si está disponible en esta versión; si no, vale su valor por defecto… o falso si no está disponible. */
export const isApplicationFeatureAvailable = (id: ApplicationFeatureId): boolean => APPLICATION_FEATURES.some((feature) => feature.id === id && feature.available);

/** Política efectiva: cada clave booleana se respeta; la que falta o no es booleana toma su valor por defecto. */
export function normalizeFeatureSettings(value: unknown): ApplicationFeatureSettings {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, typeof record[key] === 'boolean' ? record[key] : DEFAULT_FEATURE_SETTINGS[key]])) as unknown as ApplicationFeatureSettings;
}
/** Forma completa que la API acepta al guardar: exactamente las claves de esta versión, booleanas. */
export function isFeatureSettings(value: unknown): value is ApplicationFeatureSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === FEATURE_KEYS.length && FEATURE_KEYS.every((key) => typeof record[key] === 'boolean');
}
/**
 * Forma que el cliente acepta al leer (respuesta de la API o política guardada): la completa o la de una o dos claves
 * de las API y clientes anteriores (siempre con `selfConsumptionProjection`). Claves desconocidas o no booleanas: no
 * válida.
 */
export function isCompatibleFeatureSettings(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return typeof record.selfConsumptionProjection === 'boolean' && keys.every((key) => (FEATURE_KEYS as string[]).includes(key) && typeof record[key] === 'boolean');
}
/**
 * Claves de la política que gestiona un cliente según su versión (`X-SolarSim-Client`), porque cada versión valida
 * exactamente las claves que conoce: anterior a `FEATURE_POLICY_V2_CLIENT_VERSION`, o sin encabezado válido, solo
 * `selfConsumptionProjection`; desde esa versión y antes de `FEATURE_POLICY_V3_CLIENT_VERSION` (prerreleases de esta
 * incluidas), también `netMeteringRegimeSelector`; desde esta última, todas. Sin encabezado se elige la forma más
 * antigua: es la que entiende cualquier cliente que no se identifica.
 */
export function featureKeysForClient(clientHeader: string | null | undefined): ApplicationFeatureId[] {
  if (isClientOutdated(clientHeader, FEATURE_POLICY_V2_CLIENT_VERSION)) return ['selfConsumptionProjection'];
  if (isClientOutdated(clientHeader, FEATURE_POLICY_V3_CLIENT_VERSION)) return ['selfConsumptionProjection', 'netMeteringRegimeSelector'];
  return [...FEATURE_KEYS];
}
/** Política tal como la lee un cliente según su versión: solo sus claves (`featureKeysForClient`), completadas con el defecto. */
export function featureSettingsForClient(stored: unknown, clientHeader: string | null | undefined): Partial<ApplicationFeatureSettings> {
  const settings = normalizeFeatureSettings(stored);
  return Object.fromEntries(featureKeysForClient(clientHeader).map((key) => [key, settings[key]]));
}
/**
 * Forma que la API acepta al guardar desde un cliente: exactamente sus claves (`featureKeysForClient`), booleanas. Las
 * claves que esa versión no conoce se conservan tal como están guardadas, así un cliente anterior a V3 nunca cambia ni
 * reinicia `quotations`. Los anteriores a `FEATURE_POLICY_V2_CLIENT_VERSION` (o sin encabezado válido) no guardan.
 */
export function isFeatureSettingsForClient(value: unknown, clientHeader: string | null | undefined): value is Partial<ApplicationFeatureSettings> {
  if (isClientOutdated(clientHeader, FEATURE_POLICY_V2_CLIENT_VERSION)) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = featureKeysForClient(clientHeader);
  return Object.keys(record).length === keys.length && keys.every((key) => typeof record[key] === 'boolean');
}
/** Claves conocidas y booleanas de una política recibida: las que el servidor gestiona para este cliente. */
export function managedFeatureKeys(value: unknown): ApplicationFeatureId[] {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return FEATURE_KEYS.filter((key) => typeof record[key] === 'boolean');
}
/** Solo las claves `keys` de `settings`: lo que un cliente envía al guardar, sin inventar valores para las demás. */
export function pickFeatureSettings(settings: ApplicationFeatureSettings, keys: readonly ApplicationFeatureId[]): Partial<ApplicationFeatureSettings> {
  return Object.fromEntries(FEATURE_KEYS.filter((key) => keys.includes(key)).map((key) => [key, settings[key]]));
}
/** ¿Se muestra el selector de régimen de medición neta? Función disponible y activada en la política efectiva. */
export function netMeteringRegimeSelectorVisible(settings: ApplicationFeatureSettings): boolean {
  return isApplicationFeatureAvailable('netMeteringRegimeSelector') && settings.netMeteringRegimeSelector;
}
/** ¿Se muestran el botón y las vistas de cotizaciones? Función disponible y activada en la política efectiva. */
export function quotationsFeatureEnabled(settings: ApplicationFeatureSettings): boolean {
  return isApplicationFeatureAvailable('quotations') && settings.quotations;
}
export function featureScope(serverUrl: string, organizationId: string): string {
  return `${serverUrl.trim().replace(/\/+$/, '')}|${organizationId}`;
}
export function energyCalculationMode(settings: ApplicationFeatureSettings): EnergyCalculationMode {
  return settings.selfConsumptionProjection && isApplicationFeatureAvailable('selfConsumptionProjection') ? 'self_consumption' : 'legacy';
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
}, {
  id: 'proposalEnergyFlowDiagram', title: 'Diagrama de flujo energético en la propuesta web',
  description: 'Diagrama animado e interactivo con valores aproximados de cómo fluye la energía (paneles, casa, batería y red) de día, de noche y en un apagón; no cambia el cálculo energético.',
  stage: 'stable' as FeatureStage, available: true, visibilityWhenDisabled: 'labelled' as const, defaultEnabled: true, configurable: false,
}] as const;
export type BuiltInFeatureId = (typeof BUILT_IN_APPLICATION_FEATURES)[number]['id'];
export const isBuiltInFeatureAvailable = (id: BuiltInFeatureId): boolean => BUILT_IN_APPLICATION_FEATURES.some((f) => f.id === id && f.available && f.defaultEnabled);

/**
 * Capabilities decided per device. They are not part of `ApplicationFeatureSettings`: every client version and the API validate exactly
 * the organization keys they know, and an organization must not be able to open a local port on a member's computer.
 */
export const DEVICE_APPLICATION_FEATURES = [{
  id: 'localMcpServer', title: 'Servidor MCP local',
  description: 'Permite que Claude Code, Codex u otros clientes MCP de este equipo usen las herramientas de agentes con los permisos de «Agentes externos».',
  stage: 'beta' as FeatureStage, available: true, defaultEnabled: false, scope: 'device' as const,
}] as const;
export type DeviceFeatureId = (typeof DEVICE_APPLICATION_FEATURES)[number]['id'];
export const isDeviceFeatureAvailable = (id: DeviceFeatureId): boolean => DEVICE_APPLICATION_FEATURES.some((f) => f.id === id && f.available);
