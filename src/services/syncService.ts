import { ProjectSimulation, UserProfile, UserRole } from '../types';

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
}

export interface SyncPullResult {
  success: boolean;
  projects?: ProjectSimulation[];
  serverTimestamp?: string;
  count?: number;
  error?: string;
}

export interface SyncPushResult {
  success: boolean;
  message?: string;
  serverTimestamp?: string;
  results?: Array<{ id: string; originalId?: string; status: string; version: number }>;
  error?: string;
}

export class SyncService {
  /**
   * Limpia y normaliza la URL base del servidor
   */
  private static cleanUrl(url: string): string {
    return (url || 'https://solarsim.electsun.net').trim().replace(/\/+$/, '');
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

      const res = await fetch(`${base}/api/health`, {
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
      const res = await fetch(`${base}/api/auth/login`, {
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
      const res = await fetch(`${base}/api/auth/register`, {
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
   * Obtener perfil actual y verificar validez de token
   */
  static async getMe(serverUrl: string, token: string): Promise<UserProfile | null> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  }

  /**
   * Obtener listado de usuarios de la organización (Solo ADMIN)
   */
  static async getCompanyUsers(serverUrl: string, token: string): Promise<UserProfile[]> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.users || [];
    } catch {
      return [];
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
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al crear usuario' };
      }
      return { success: true, user: data.user };
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
    payload: { role?: UserRole; isActive?: boolean; password?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al actualizar usuario' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fallo de red al actualizar usuario' };
    }
  }

  /**
   * Pull: Descargar proyectos actualizados en el servidor
   */
  static async pullProjects(serverUrl: string, token: string, lastSyncTimestamp?: string | null): Promise<SyncPullResult> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lastSyncTimestamp: lastSyncTimestamp || '1970-01-01T00:00:00.000Z' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al descargar proyectos' };
      }

      return {
        success: true,
        projects: data.projects || [],
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
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projects }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al subir proyectos' };
      }

      return {
        success: true,
        message: data.message,
        serverTimestamp: data.serverTimestamp,
        results: data.results,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al enviar proyectos' };
    }
  }

  /**
   * Eliminar un proyecto en el servidor
   */
  static async deleteProject(serverUrl: string, token: string, projectId: string): Promise<boolean> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Pull: Descargar catálogo global de equipos desde el servidor
   */
  static async pullEquipment(serverUrl: string, token: string): Promise<{ success: boolean; items?: import('../types/equipment').SolarEquipmentItem[]; error?: string }> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/equipment`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al descargar catálogo de equipos' };
      }

      return {
        success: true,
        items: data.items || [],
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al obtener equipos' };
    }
  }

  /**
   * Push: Subir lote de equipos locales hacia el servidor
   */
  static async pushEquipmentBatch(serverUrl: string, token: string, items: import('../types/equipment').SolarEquipmentItem[]): Promise<{ success: boolean; count?: number; error?: string }> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/api/equipment/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al subir equipos' };
      }

      return {
        success: true,
        count: data.count,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión al enviar equipos' };
    }
  }
}
