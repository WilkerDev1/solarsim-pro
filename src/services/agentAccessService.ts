import { fetchWithSessionRetry } from './syncService';
import type { AgentAccessStatus, AgentActivityEntry, AgentGrantSummary, AgentScope } from '../../shared/agentAccess';

/** Relative request under `/api/agent-access` (e.g. `/status`, `/grants/<id>`). */
export type AgentAccessTransport = (path: string, init?: RequestInit) => Promise<Response>;
export type AgentAccessTransportFactory = (serverUrl: string, token: () => string) => AgentAccessTransport;

const defaultFactory: AgentAccessTransportFactory = (serverUrl, token) => (path, init = {}) =>
  fetchWithSessionRetry(`${serverUrl.replace(/\/+$/, '')}/api/agent-access${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  });
let factory: AgentAccessTransportFactory = defaultFactory;

const read = async (response: Response): Promise<Record<string, any>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};
const fail = (data: Record<string, any>, fallback: string) => new Error(typeof data.error === 'string' ? data.error : fallback);

/** Remote MCP access of the signed-in account (docs/MCP_REMOTE.md). Tests inject a synthetic transport. */
export const AgentAccessService = {
  setTransportFactory(next: AgentAccessTransportFactory | null) {
    factory = next ?? defaultFactory;
  },
  transport(serverUrl: string, token: () => string): AgentAccessTransport {
    return factory(serverUrl, token);
  },
  async status(transport: AgentAccessTransport): Promise<AgentAccessStatus> {
    const response = await transport('/status');
    const data = await read(response);
    // An API older than this feature answers 404: same as disabled.
    if (response.status === 404) return { enabled: false, oauthEnabled: false };
    if (!response.ok) throw fail(data, 'No se pudo consultar el acceso remoto.');
    return { enabled: data.enabled === true, oauthEnabled: data.oauthEnabled === true, ...(typeof data.mcpUrl === 'string' ? { mcpUrl: data.mcpUrl } : {}) };
  },
  async grants(transport: AgentAccessTransport): Promise<AgentGrantSummary[]> {
    const response = await transport('/grants');
    const data = await read(response);
    if (!response.ok || !Array.isArray(data.grants)) throw fail(data, 'No se pudieron cargar los accesos.');
    return data.grants;
  },
  /** The token is returned once: the server keeps only its hash. */
  async create(transport: AgentAccessTransport, input: { name: string; scope: AgentScope; expiresInDays: number }): Promise<{ grant: AgentGrantSummary; token: string }> {
    const response = await transport('/grants', { method: 'POST', body: JSON.stringify(input) });
    const data = await read(response);
    if (!response.ok || typeof data.token !== 'string') throw fail(data, 'No se pudo crear el token.');
    return { grant: data.grant, token: data.token };
  },
  async revoke(transport: AgentAccessTransport, id: string): Promise<void> {
    const response = await transport(`/grants/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw fail(await read(response), 'No se pudo revocar el acceso.');
  },
  async activity(transport: AgentAccessTransport, organization = false): Promise<AgentActivityEntry[]> {
    const response = await transport(`/activity${organization ? '?scope=organization' : ''}`);
    const data = await read(response);
    if (!response.ok || !Array.isArray(data.activity)) throw fail(data, 'No se pudo cargar la actividad.');
    return data.activity;
  },
};
