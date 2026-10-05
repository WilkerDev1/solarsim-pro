import type { Env } from './bindings';
import { isRecord, readBoundedJson } from './validation';
export interface PublicationIdentity {
  userId: string;
  organizationId: string;
  featurePolicy: { version: number; settings: { selfConsumptionProjection: boolean } };
}
export class AuthorizationError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 503) { super(message); }
}
export async function authorizePublication(env: Env, authorization: string | undefined, requestFetch: typeof fetch = fetch): Promise<PublicationIdentity> {
  if (!authorization || !/^Bearer [\w.-]+$/.test(authorization) || authorization.length > 8192) throw new AuthorizationError('Inicia sesión para publicar una propuesta.', 401);
  let endpoint: URL;
  try {
    endpoint = new URL(env.AUTH_API_URL);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid endpoint');
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/api/auth/share-authorization`;
  } catch { throw new AuthorizationError('El servicio de autorización no está configurado.', 503); }
  let response: Response;
  try {
    response = await requestFetch(endpoint, { method: 'POST', headers: { Authorization: authorization }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  } catch { throw new AuthorizationError('No se pudo verificar la sesión. Intenta nuevamente.', 503); }
  if (response.status === 401 || response.status === 403) throw new AuthorizationError('La cuenta no tiene permiso para publicar propuestas.', response.status);
  if (!response.ok) throw new AuthorizationError('El servicio de autorización no está disponible.', 503);
  const value: unknown = await readBoundedJson(response, 8192).catch(() => null);
  if (!isRecord(value) || value.success !== true || typeof value.userId !== 'string' || typeof value.organizationId !== 'string' || !isRecord(value.featurePolicy) || !Number.isSafeInteger(value.featurePolicy.version) || !isRecord(value.featurePolicy.settings) || typeof value.featurePolicy.settings.selfConsumptionProjection !== 'boolean') throw new AuthorizationError('El servicio de autorización devolvió una respuesta no válida.', 503);
  return { userId: value.userId, organizationId: value.organizationId, featurePolicy: { version: value.featurePolicy.version as number, settings: { selfConsumptionProjection: value.featurePolicy.settings.selfConsumptionProjection } } };
}
