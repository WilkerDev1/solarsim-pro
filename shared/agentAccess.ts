/**
 * Acceso remoto de agentes (MCP remoto): contrato común de la API, el servicio MCP remoto y la app de escritorio.
 * TypeScript puro. Ver docs/MCP_REMOTE.md.
 *
 * Un agente remoto nunca recibe un JWT de sesión: usa un token de agente (`ssm_…`) ligado a un usuario, una
 * organización y un alcance. La API solo lo acepta en las rutas de `AGENT_ROUTES`; un alcance `read` actúa como
 * LECTOR aunque la cuenta sea EDITOR o ADMIN, y los permisos actuales de la cuenta se revalidan en cada petición.
 */

export type AgentScope = 'read' | 'write';
export type AgentGrantKind = 'token' | 'oauth';

/** Ámbitos OAuth publicados en los metadatos; `write` implica `read`. */
export const OAUTH_SCOPES: Record<AgentScope, string> = { read: 'solarsim:read', write: 'solarsim:write' };

export const AGENT_TOKEN_PREFIX = 'ssm_';
export const AGENT_TOKEN_PREFIXES = { pat: 'ssm_pat_', access: 'ssm_at_', refresh: 'ssm_rt_' } as const;

/** Herramienta MCP que originó la petición, para el registro de actividad (la ruta real se registra siempre). */
export const AGENT_TOOL_HEADER = 'X-SolarSim-Agent-Tool';
/** Nombre del cliente MCP (`clientInfo.name`), saneado; solo etiqueta la actividad. */
export const AGENT_CLIENT_HEADER = 'X-SolarSim-Agent-Client';

export const AGENT_GRANT_LIMITS = { name: 120, perUser: 20, expiresInDays: [30, 90, 365] as const } as const;

export interface AgentGrantSummary {
  id: string;
  kind: AgentGrantKind;
  name: string;
  scope: AgentScope;
  /** Primeros caracteres del token personal, para reconocerlo; nunca el secreto. */
  tokenPrefix?: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface AgentAccessStatus {
  enabled: boolean;
  oauthEnabled: boolean;
  /** URL canónica del endpoint MCP remoto (lo que se pega en el proveedor de IA). */
  mcpUrl?: string;
}

/** Identidad de un token de agente (`GET /api/agent-access/whoami`): valida el token y fija las herramientas visibles. */
export interface AgentIdentity {
  scope: AgentScope;
  /** Rol efectivo: LECTOR si el alcance es `read`. */
  role: 'ADMIN' | 'EDITOR' | 'LECTOR';
  userName: string;
  organizationName?: string;
}

export interface AgentActivityEntry {
  id: string;
  userName: string;
  grantName: string | null;
  tool: string | null;
  clientLabel: string | null;
  method: string;
  route: string;
  status: number;
  createdAt: string;
}

export interface AgentRoute {
  method: 'GET' | 'PUT';
  /** Plantilla con `:param`; se compara segmento a segmento. */
  path: string;
  scope: AgentScope;
}

/**
 * Únicas rutas que admite un token de agente. Nada que emita sesiones (`/api/auth/*`), toque usuarios o la
 * organización, publique, borre o envíe a papelera. Las escrituras son las de las herramientas `draft` remotas.
 */
export const AGENT_ROUTES: readonly AgentRoute[] = [
  { method: 'GET', path: '/api/agent-access/whoami', scope: 'read' },
  { method: 'GET', path: '/api/projects', scope: 'read' },
  { method: 'GET', path: '/api/projects/:id', scope: 'read' },
  { method: 'GET', path: '/api/clients', scope: 'read' },
  { method: 'GET', path: '/api/equipment', scope: 'read' },
  { method: 'GET', path: '/api/tariffs', scope: 'read' },
  { method: 'PUT', path: '/api/clients/:id', scope: 'write' },
  { method: 'PUT', path: '/api/projects/:id/client-link', scope: 'write' },
];

/** Ruta permitida para el método y la ruta concreta, o `undefined`. */
export function matchAgentRoute(method: string, pathname: string): AgentRoute | undefined {
  const parts = pathname.split('/');
  return AGENT_ROUTES.find((route) => {
    if (route.method !== method.toUpperCase()) return false;
    const template = route.path.split('/');
    return template.length === parts.length && template.every((segment, i) => (segment.startsWith(':') ? parts[i].length > 0 : segment === parts[i]));
  });
}

export const scopeAllows = (granted: AgentScope, required: AgentScope): boolean => granted === 'write' || required === 'read';

/** Convierte `scope` OAuth (separado por espacios) en el alcance efectivo; ámbitos desconocidos se ignoran. */
export function parseOAuthScope(value: unknown): AgentScope | null {
  const items = typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
  if (items.includes(OAUTH_SCOPES.write)) return 'write';
  if (items.includes(OAUTH_SCOPES.read)) return 'read';
  return null;
}

export const formatOAuthScope = (scope: AgentScope): string => (scope === 'write' ? `${OAUTH_SCOPES.read} ${OAUTH_SCOPES.write}` : OAUTH_SCOPES.read);

/** Etiqueta segura para registros: letras, números y `._-/@ `, máximo 64. */
export function safeAgentLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[^\p{L}\p{N} ._@/-]/gu, '').trim().slice(0, 64);
  return clean || null;
}
