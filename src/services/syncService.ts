import { ProjectSimulation, UserProfile, UserRole } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { migrateLegacySpecs } from '../../shared/equipment';
import { CLIENT_OUTDATED, isClientGateOpen } from '../../shared/clientVersion';
import { CLIENT_IDENTITY_HEADER, CLIENT_IDENTITY_VALUE } from './clientIdentity';
import { clientOutdatedText, getClientOutdated, isServerBlocked, reportClientOutdated } from './clientVersionGate';

export type EquipmentPushOutcome =
  | { id: string; status: 'created' | 'updated'; version: number; item: SolarEquipmentItem }
  | { id: string; status: 'conflict'; reason: string; serverVersion?: number; serverItem?: SolarEquipmentItem };

export interface PingResult {
  online: boolean;
  latencyMs: number;
  service?: string;
  version?: string;
  database?: string;
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
  failure?: 'rejected' | 'unavailable';
}

export interface SyncPullResult {
  deletedIds?: string[];
  success: boolean;
  projects?: ProjectSimulation[];
  serverTimestamp?: string;
  count?: number;
  error?: string;
}

export type SyncPushOutcome =
  | { id: string; originalId?: string; status: 'created' | 'updated' | 'forked'; version: number; project?: ProjectSimulation; awaitingConfirmation?: boolean }
  | { id: string; originalId?: string; status: 'conflict'; reason?: string; serverVersion: number; serverProject?: ProjectSimulation; localVersion?: number; lastModifiedByName?: string; lastModifiedAt?: string };

export interface SyncPushResult {
  success: boolean;
  message?: string;
  serverTimestamp?: string;
  results?: SyncPushOutcome[];
  error?: string;
}

export type TokenRenewedCallback = (newToken: string, origin?: { serverUrl: string; token: string }) => void;
let tokenRenewedListeners: TokenRenewedCallback[] = [];

export function registerTokenRenewedListener(cb: TokenRenewedCallback): () => void {
  tokenRenewedListeners.push(cb);
  return () => {
    tokenRenewedListeners = tokenRenewedListeners.filter((l) => l !== cb);
  };
}

export function notifyTokenRenewed(newToken: string, origin?: { serverUrl: string; token: string }) {
  tokenRenewedListeners.forEach((cb) => {
    try {
      cb(newToken, origin);
    } catch (err) {
      console.error('Error en listener de renovación de token:', err);
    }
  });
}

export type SessionInvalidatedCallback = (origin: { serverUrl: string; token: string }) => void;
let sessionInvalidatedListeners: SessionInvalidatedCallback[] = [];

export function registerSessionInvalidatedListener(cb: SessionInvalidatedCallback): () => void {
  sessionInvalidatedListeners.push(cb);
  return () => {
    sessionInvalidatedListeners = sessionInvalidatedListeners.filter((l) => l !== cb);
  };
}

export function notifySessionInvalidated(origin: { serverUrl: string; token: string }) {
  sessionInvalidatedListeners.forEach((cb) => {
    try {
      cb(origin);
    } catch (err) {
      console.error('Error en listener de invalidación de sesión:', err);
    }
  });
}

async function computeTokenKey(serverUrl: string, token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return `${SyncService.cleanUrl(serverUrl)}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

const MAX_INVALID_TOKENS = 50;
const invalidTokens = new Set<string>();

export async function markTokenInvalid(serverUrl: string, token: string): Promise<void> {
  if (!serverUrl || !token) return;
  const key = await computeTokenKey(serverUrl, token);
  if (!invalidTokens.has(key) && invalidTokens.size >= MAX_INVALID_TOKENS) {
    const oldest = invalidTokens.values().next().value;
    if (oldest) invalidTokens.delete(oldest);
  }
  invalidTokens.add(key);
}

export async function clearInvalidToken(serverUrl: string, token: string): Promise<void> {
  if (!serverUrl || !token) return;
  invalidTokens.delete(await computeTokenKey(serverUrl, token));
}

const refreshRequests = new Map<string, Promise<string | null>>();

/** Identidad del cliente en una solicitud, conservando la forma de los encabezados que recibió. */
function withClientIdentity(headers: HeadersInit | undefined): HeadersInit {
  if (headers instanceof Headers) { const copy = new Headers(headers); copy.set(CLIENT_IDENTITY_HEADER, CLIENT_IDENTITY_VALUE); return copy; }
  if (Array.isArray(headers)) return [...headers.filter(([name]) => name.toLowerCase() !== CLIENT_IDENTITY_HEADER.toLowerCase()), [CLIENT_IDENTITY_HEADER, CLIENT_IDENTITY_VALUE]];
  return { ...headers, [CLIENT_IDENTITY_HEADER]: CLIENT_IDENTITY_VALUE };
}

/** 426 con la forma `client_outdated` de la API; el cuerpo se reescribe con el texto en español para quien lo muestre. */
const outdatedResponse = (minVersion: string | null) => Response.json({ success: false, error: clientOutdatedText(minVersion), code: CLIENT_OUTDATED, minVersion }, { status: 426 });

/** One bounded refresh on 401. A revoked account or forbidden role is never retried. */
export async function fetchWithSessionRetry(url: string, init: RequestInit = {}, sessionServerUrl?: string): Promise<Response> {
  const authorization = new Headers(init.headers).get('Authorization');
  // Worker requests authenticate against the API, so their renewal origin must be explicit.
  const apiStart = url.indexOf('/api/');
  const base = sessionServerUrl?.trim().replace(/\/+$/, '') || url.slice(0, apiStart);
  // Solo las solicitudes a la propia API llevan la identidad del cliente y se detienen con la versión mínima.
  const toApi = apiStart >= 0 && url.slice(0, apiStart).replace(/\/+$/, '') === base;
  const route = toApi ? url.slice(apiStart).split(/[?#]/)[0] : '';
  const send = async (options: RequestInit) => {
    const response = await fetch(url, { ...options, ...(toApi ? { headers: withClientIdentity(options.headers) } : {}), signal: options.signal ?? AbortSignal.timeout(12000) });
    if (!toApi || response.status !== 426) return response;
    const body = await response.clone().json().catch(() => null);
    if (body?.error !== CLIENT_OUTDATED) return response;
    return outdatedResponse(reportClientOutdated(base, body.minVersion).minVersion);
  };
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const key = base && token ? await computeTokenKey(base, token) : null;

  // Si el token ya fue marcado como definitivamente inválido, no enviamos solicitudes ni refrescos inútiles
  if (key && invalidTokens.has(key)) {
    return new Response(JSON.stringify({ success: false, error: 'Sesión no válida o expirada' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // La API ya dijo que esta versión no puede sincronizar: no se reintenta hasta actualizar (trabajo local intacto).
  if (toApi && !isClientGateOpen(init.method ?? 'GET', route) && isServerBlocked(base)) return outdatedResponse(getClientOutdated()?.minVersion ?? null);

  const response = await send(init);
  if (response.status !== 401 || !token || !base || /\/api\/auth\/(?:refresh|login|register)$/.test(url)) return response;

  let renewal = refreshRequests.get(key!);
  if (!renewal) {
    renewal = (async () => {
      try {
        const refreshed = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: withClientIdentity({ Authorization: authorization! }),
          signal: AbortSignal.timeout(8000),
        });
        if (refreshed.status === 401 || refreshed.status === 403) {
          // El token fue definitivamente rechazado por la API (firma inválida tras rotación o sesión revocada)
          await markTokenInvalid(base, token);
          notifySessionInvalidated({ serverUrl: base, token });
          return null;
        }
        if (!refreshed.ok) return null;
        const data = await refreshed.json().catch(() => null);
        if (!data?.success || typeof data.token !== 'string') return null;
        notifyTokenRenewed(data.token, { serverUrl: base, token });
        return data.token as string;
      } catch {
        // Error de red transitorio; no invalidar la sesión permanentemente
        return null;
      }
    })();
    refreshRequests.set(key!, renewal);
  }
  const renewed = await renewal;
  if (refreshRequests.get(key!) === renewal) refreshRequests.delete(key!);
  if (!renewed) {
    if (invalidTokens.has(key!)) return response;
    // A refresh outage is not evidence that the original session was revoked.
    const headers = new Headers(response.headers);
    headers.set('x-solarsim-session-status', 'unavailable');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${renewed}`);
  const retried = await send({ ...init, headers });
  if (retried.status === 401) {
    await markTokenInvalid(base, renewed);
    notifySessionInvalidated({ serverUrl: base, token: renewed });
  }
  return retried;
}

/**
 * Frontera de sincronización (ADR 0001): lo que viaja de ida y vuelta lleva los equipos solo como grupos. Una instantánea
 * anterior a 2.7.1 (historial del servidor restaurado, cliente viejo) puede traer el espejo heredado; `migrateLegacySpecs`
 * es invariante e idempotente, y devuelve el mismo objeto si no hay nada que migrar.
 */
function withGroupsOnly<P extends ProjectSimulation | undefined>(project: P): P {
  if (!project?.specs || typeof project.specs !== 'object') return project;
  const specs = migrateLegacySpecs(project.specs);
  return specs === project.specs ? project : { ...project, specs };
}
function outcomeWithGroupsOnly(outcome: SyncPushOutcome): SyncPushOutcome {
  if (outcome.status === 'conflict') return outcome.serverProject ? { ...outcome, serverProject: withGroupsOnly(outcome.serverProject) } : outcome;
  return outcome.project ? { ...outcome, project: withGroupsOnly(outcome.project) } : outcome;
}

function validatePushResults(results: unknown, ids: string[], content: 'project'): SyncPushOutcome[];
function validatePushResults(results: unknown, ids: string[], content: 'item'): EquipmentPushOutcome[];
function validatePushResults(results: unknown, ids: string[], content: 'project' | 'item'): any[] {
  const expected = new Set(ids);
  if (!Array.isArray(results) || results.length !== ids.length) throw new Error('El servidor no confirmó todos los documentos.');
  for (const result of results) {
    const source = result?.originalId || result?.id;
    if (!expected.delete(source) || !['created', 'updated', ...(content === 'project' ? ['forked'] : []), 'conflict'].includes(result?.status)) throw new Error('Confirmación de sincronización inválida. Actualiza el servidor.');
    if (result.status !== 'conflict' && (!Number.isSafeInteger(result.version) || result.version < 1 || (result[content]?.id !== result.id && !(content === 'project' && result.awaitingConfirmation === true)))) throw new Error('El servidor no devolvió el documento confirmado y su versión.');
  }
  return results;
}

export class SyncService {
  /**
   * Limpia y normaliza la URL base del servidor
   */
  static cleanUrl(url: string): string {
    return (url || 'https://solarsim.electsun.net').trim().replace(/\/+$/, '');
  }

  /**
   * Detecta y propaga tokens renovados automáticamente por el servidor
   */
  private static checkRenewedToken(res: Response, serverUrl: string, token: string) {
    try {
      const renewed = res.headers.get('x-renewed-token');
      if (renewed) {
        notifyTokenRenewed(renewed, { serverUrl: this.cleanUrl(serverUrl), token });
      }
    } catch {}
  }

  /**
   * Prueba la conectividad HTTP con el servidor y mide la latencia
   */
  static async testConnection(serverUrl: string): Promise<PingResult> {
    const base = this.cleanUrl(serverUrl);
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetchWithSessionRetry(`${base}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - start);

      if (!res.ok) {
        return {
          online: false,
          latencyMs,
          error: `Respuesta HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = await res.json();
      return {
        online: data.status === 'ok',
        latencyMs,
        service: data.service,
        version: data.version,
        database: data.database,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        online: false,
        latencyMs,
        error: err.name === 'AbortError' ? 'Tiempo de espera agotado (Timeout 4s)' : (err.message || 'No se pudo conectar al servidor'),
      };
    }
  }

  /**
   * Iniciar sesión
   */
  static async login(serverUrl: string, email: string, password: string): Promise<AuthResponse> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al iniciar sesión' };
      }

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de conexión al autenticar' };
    }
  }

  /**
   * Registro inicial de usuario
   */
  static async register(serverUrl: string, payload: { name: string; email: string; password: string; organizationName?: string }): Promise<AuthResponse> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al registrar usuario' };
      }

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de conexión al registrar' };
    }
  }

  /**
   * Obtener perfil actual y verificar validez de token (con auto-renovación)
   */
  static async getSessionIdentity(serverUrl: string, token: string): Promise<AuthResponse> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      this.checkRenewedToken(res, serverUrl, token);
      if (!res.ok) {
        const rejected = (res.status === 401 || res.status === 403) && res.headers.get('x-solarsim-session-status') !== 'unavailable';
        return { success: false, failure: rejected ? 'rejected' : 'unavailable', error: rejected ? 'La sesión expiró o fue revocada. Inicia sesión nuevamente.' : 'No se pudo verificar la sesión. Reintenta cuando haya conexión.' };
      }
      const data = await res.json();
      const user = data?.user;
      if (!data?.success || !user || typeof user.id !== 'string' || typeof user.organizationId !== 'string' || !['ADMIN', 'EDITOR', 'LECTOR', 'VIEWER'].includes(user.role)) {
        return { success: false, failure: 'unavailable', error: 'El servidor devolvió un perfil de sesión inválido.' };
      }
      return { success: true, user };
    } catch {
      return { success: false, failure: 'unavailable', error: 'No se pudo verificar la sesión. Reintenta cuando haya conexión.' };
    }
  }

  static async getMe(serverUrl: string, token: string): Promise<UserProfile | null> {
    const result = await this.getSessionIdentity(serverUrl, token);
    return result.success ? result.user ?? null : null;
  }

  /**
   * Renovar sesión y obtener token fresco
   */
  static async refreshToken(serverUrl: string, token: string): Promise<AuthResponse> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        await markTokenInvalid(base, token);
        notifySessionInvalidated({ serverUrl: base, token });
        return { success: false, failure: 'rejected', error: 'La sesión expiró o fue revocada.' };
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || typeof data.token !== 'string' || !data.token) {
        return { success: false, failure: 'unavailable', error: data?.error || 'No se pudo renovar la sesión. Reintenta cuando haya conexión.' };
      }
      this.checkRenewedToken(res, serverUrl, token);
      return { success: true, token: data.token, user: data.user };
    } catch {
      return { success: false, failure: 'unavailable', error: 'Fallo de red al renovar sesión' };
    }
  }

  /** Authenticated request with session retry; propagates a renewed token sent by the server. */
  private static async send(serverUrl: string, token: string, method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
    headers.Authorization = `Bearer ${token}`;
    const res = await fetchWithSessionRetry(`${this.cleanUrl(serverUrl)}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    this.checkRenewedToken(res, serverUrl, token);
    return res;
  }

  /** `{ data }` for an ok `{ success: true }` reply; otherwise the server error or `label (HTTP n)`. */
  private static async readSuccess(res: Response, label: string): Promise<{ data: any; error?: undefined } | { data?: undefined; error: string }> {
    const data = await res.json().catch(() => null);
    return res.ok && data?.success ? { data } : { error: data?.error || `${label} (HTTP ${res.status})` };
  }

  /** For endpoints whose only contract is the HTTP status. */
  private static async sendOk(serverUrl: string, token: string, method: string, path: string): Promise<boolean> {
    try {
      return (await this.send(serverUrl, token, method, path)).ok;
    } catch {
      return false;
    }
  }

  /**
   * Obtener listado de usuarios de la organización (Solo ADMIN)
   */
  static async getCompanyUsers(serverUrl: string, token: string): Promise<{ success: boolean; users: UserProfile[]; error?: string }> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'GET', '/api/users'), 'Error al obtener usuarios');
      if (error) return { success: false, users: [], error };
      const users: UserProfile[] = (data.users || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: u.organization_id || u.organizationId,
        canEditIdentity: u.canEditIdentity,
        isActive: u.isActive !== undefined ? u.isActive : u.is_active !== undefined ? u.is_active : true,
        createdAt: u.created_at || u.createdAt,
      }));
      return { success: true, users };
    } catch (err: any) {
      return { success: false, users: [], error: err.message || 'Error de conexión al obtener usuarios' };
    }
  }

  /**
   * Crear nuevo usuario de equipo (Solo ADMIN)
   */
  static async createCompanyUser(
    serverUrl: string,
    token: string,
    payload: { name: string; email: string; password: string; role: UserRole }
  ): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'POST', '/api/users', payload), 'Error al crear usuario');
      return error ? { success: false, error } : { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de red al crear usuario' };
    }
  }

  /**
   * Actualizar usuario de equipo (Solo ADMIN)
   */
  static async updateCompanyUser(
    serverUrl: string,
    token: string,
    userId: string,
    payload: { name?: string; role?: UserRole; isActive?: boolean; password?: string }
  ): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'PATCH', `/api/users/${userId}`, payload), 'Error al actualizar usuario');
      return error ? { success: false, error } : { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de red al actualizar usuario' };
    }
  }

  /**
   * Eliminar usuario de equipo de la organización (Solo ADMIN)
   */
  static async deleteCompanyUser(serverUrl: string, token: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.readSuccess(await this.send(serverUrl, token, 'DELETE', `/api/users/${userId}`), 'Error al eliminar usuario');
      return error ? { success: false, error } : { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de red al eliminar usuario' };
    }
  }

  /**
   * Pull: Descargar proyectos actualizados en el servidor
   */
  static async pullProjects(serverUrl: string, token: string, lastSyncTimestamp?: string | null): Promise<SyncPullResult> {
    try {
      const body = { lastSyncTimestamp: lastSyncTimestamp || '1970-01-01T00:00:00.000Z' };
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'POST', '/api/sync/pull', body), 'Error al descargar proyectos');
      if (error) return { success: false, error };
      return {
        success: true,
        projects: Array.isArray(data.projects) ? data.projects.map(withGroupsOnly) : (() => { throw new Error('Respuesta de proyectos inválida.'); })(),
        deletedIds: data.deletedIds || [],
        serverTimestamp: data.serverTimestamp,
        count: data.count || 0,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al sincronizar' };
    }
  }

  /**
   * Push: Subir proyectos locales modificados hacia el servidor
   */
  static async pushProjects(serverUrl: string, token: string, projects: ProjectSimulation[]): Promise<SyncPushResult> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'POST', '/api/sync/push', { projects: projects.map(withGroupsOnly) }), 'Error al subir proyectos');
      if (error) return { success: false, error };

      if (Array.isArray(data.results) && data.results.some((result: any) => result.awaitingConfirmation !== undefined)) throw new Error('Confirmación de sincronización inválida.');
      // Legacy servers acknowledge versions without returning the canonical document.
      // Read back once; never guess a confirmed document from the submitted payload.
      if (Array.isArray(data.results) && data.results.some((result: SyncPushOutcome) => result.status !== 'conflict' && !result.project)) {
        const expected = new Set(projects.map(project => project.id));
        if (data.results.length !== projects.length || data.results.some((result: SyncPushOutcome) => typeof result.id !== 'string' || !result.id || !expected.delete(result.originalId || result.id) || !['created', 'updated', 'forked', 'conflict'].includes(result.status) || (result.status !== 'conflict' && (!Number.isSafeInteger(result.version) || result.version < 1)))) throw new Error('Confirmación de sincronización inválida.');
        const readback = await this.pullProjects(serverUrl, token);
        const receipts = data.results.map((result: SyncPushOutcome) => result.status !== 'conflict' && !result.project ? { ...result, awaitingConfirmation: true } : result);
        if (!readback.success || !readback.projects) return { success: true, results: receipts, message: 'El servidor guardó cambios; su confirmación sigue pendiente.' };
        data.results = data.results.map((result: SyncPushOutcome) => {
          if (result.status === 'conflict' || result.project) return result;
          const confirmed = readback.projects!.find(project => project.id === result.id);
          if (!confirmed || !Number.isSafeInteger(confirmed.version) || confirmed.version! < result.version || !confirmed.client || !confirmed.specs || !confirmed.rates || !confirmed.financials) return { ...result, awaitingConfirmation: true };
          if (confirmed.version !== result.version) return { id: result.id, originalId: result.originalId, status: 'conflict', serverVersion: confirmed.version, localVersion: result.version, serverProject: confirmed };
          return { ...result, project: confirmed };
        });
      }
      return {
        success: true,
        message: data.message,
        serverTimestamp: data.serverTimestamp,
        results: validatePushResults(data.results, projects.map((item) => item.id), 'project').map(outcomeWithGroupsOnly),
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al enviar proyectos' };
    }
  }

  /**
   * Eliminar un proyecto en el servidor (Soft-Delete a papelera o eliminación definitiva física)
   */
  static async deleteProject(serverUrl: string, token: string, projectId: string, permanent: boolean = false, baseVersion?: number): Promise<boolean> {
    const versionQuery = baseVersion !== undefined ? `&baseVersion=${baseVersion}` : '';
    return this.sendOk(serverUrl, token, 'DELETE', `/api/projects/${encodeURIComponent(projectId)}?permanent=${permanent}${versionQuery}`);
  }

  /**
   * Restaurar un proyecto desde la papelera de reciclaje en el servidor
   */
  static async restoreProject(serverUrl: string, token: string, projectId: string, baseVersion?: number): Promise<boolean> {
    return this.sendOk(serverUrl, token, 'POST', `/api/projects/${encodeURIComponent(projectId)}/restore?baseVersion=${baseVersion ?? ''}`);
  }

  /**
   * Vaciar toda la papelera de reciclaje en el servidor
   */
  static async emptyTrash(serverUrl: string, token: string): Promise<boolean> {
    return this.sendOk(serverUrl, token, 'DELETE', '/api/trash');
  }

  /**
   * Pull: Descargar catálogo global de equipos desde el servidor
   */
  static async pullEquipment(serverUrl: string, token: string): Promise<{ success: boolean; items?: SolarEquipmentItem[]; deletedIds?: string[]; error?: string }> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'GET', '/api/equipment'), 'Error al descargar catálogo de equipos');
      return error ? { success: false, error } : { success: true, items: data.items || [], deletedIds: data.deletedIds || [] };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al obtener equipos' };
    }
  }

  /**
   * Push: Subir lote de equipos locales hacia el servidor
   */
  static async pushEquipmentBatch(serverUrl: string, token: string, items: SolarEquipmentItem[]): Promise<{ success: boolean; count?: number; results?: EquipmentPushOutcome[]; error?: string }> {
    try {
      const { data, error } = await this.readSuccess(await this.send(serverUrl, token, 'POST', '/api/equipment/batch', { items }), 'Error al subir equipos');
      if (error) return { success: false, error };
      return { success: true, count: data.count, results: validatePushResults(data.results, items.map((item) => item.id), 'item') };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al enviar equipos' };
    }
  }

  /**
   * Delete: Eliminar un equipo del catálogo en el servidor
   */
  static async deleteEquipment(serverUrl: string, token: string, equipmentId: string, baseVersion?: number): Promise<boolean> {
    return this.sendOk(serverUrl, token, 'DELETE', `/api/equipment/${encodeURIComponent(equipmentId)}${baseVersion !== undefined ? `?baseVersion=${baseVersion}` : ''}`);
  }

  /**
   * Helper defensivo para procesar respuestas JSON evitando SyntaxError por respuestas HTML/texto plano
   */
  private static async safeJsonParse<T = any>(res: Response, fallbackError: string): Promise<{ ok: boolean; data: T; error?: string }> {
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        data: {} as T,
        error: !res.ok
          ? `El servidor retornó error HTTP ${res.status} (${res.statusText || 'No disponible'})`
          : 'Respuesta inválida del servidor (formato no JSON)',
      };
    }

    if (!res.ok || data.success === false) {
      return {
        ok: false,
        data,
        error: data?.error || fallbackError,
      };
    }

    return { ok: true, data };
  }

  /**
   * Pull: Descargar matriz tarifaria eléctrica (SIE / CEPM) desde el servidor
   */
  static async fetchTariffMatrix(serverUrl: string, token: string): Promise<{ success: boolean; matrix?: import('../types/tariffs').GlobalTariffMatrix | null; error?: string }> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/tariffs`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const parsed = await this.safeJsonParse(res, 'Error al descargar tarifas del servidor');
      if (!parsed.ok) {
        return { success: false, error: parsed.error };
      }

      return {
        success: true,
        matrix: parsed.data.matrix || null,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al obtener tarifas' };
    }
  }

  /**
   * Push: Sincronizar matriz tarifaria eléctrica con el servidor
   */
  static async syncTariffMatrix(serverUrl: string, token: string, matrix: import('../types/tariffs').GlobalTariffMatrix): Promise<{ success: boolean; message?: string; error?: string }> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetchWithSessionRetry(`${base}/api/tariffs/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matrix }),
      });

      const parsed = await this.safeJsonParse(res, 'Error al guardar tarifas en el servidor');
      if (!parsed.ok) {
        return { success: false, error: parsed.error };
      }

      return {
        success: true,
        message: parsed.data.message || 'Tarifas sincronizadas correctamente',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al subir tarifas' };
    }
  }
}
