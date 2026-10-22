import { fetchWithSessionRetry } from './syncService';
import type { ClientRecord } from '../types/client';

/** Relative request under `/api/clients` (e.g. `""`, `/id`, `/id?baseVersion=2`). */
export type ClientTransport = (path: string, init?: RequestInit) => Promise<Response>;
export type ClientTransportFactory = (serverUrl: string, token: () => string) => ClientTransport;

const defaultFactory: ClientTransportFactory = (serverUrl, token) => (path, init = {}) =>
  fetchWithSessionRetry(`${serverUrl.replace(/\/+$/, '')}/api/clients${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  });
let factory: ClientTransportFactory = defaultFactory;

export type ClientWriteResult =
  | { ok: true; client: ClientRecord }
  | { ok: false; status: number; error: string; client: ClientRecord | null };

const body = async (response: Response): Promise<Record<string, any>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

/** HTTP adapter for the clients directory; tests and agents inject a synthetic transport. */
export const ClientSyncService = {
  setTransportFactory(next: ClientTransportFactory | null) {
    factory = next ?? defaultFactory;
  },
  transport(serverUrl: string, token: () => string): ClientTransport {
    return factory(serverUrl, token);
  },
  async list(transport: ClientTransport): Promise<{ clients: ClientRecord[]; deletedIds: string[] }> {
    const response = await transport('');
    const data = await body(response);
    if (!response.ok || !data.success || !Array.isArray(data.clients))
      throw new Error(data.error || 'El servidor no admite sincronización de clientes.');
    return { clients: data.clients, deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [] };
  },
  async put(transport: ClientTransport, client: ClientRecord, baseVersion: number): Promise<ClientWriteResult> {
    const response = await transport(`/${encodeURIComponent(client.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        kind: client.kind, name: client.name, taxId: client.taxId, phone: client.phone, email: client.email,
        address: client.address, province: client.province, notes: client.notes, baseVersion,
      }),
    });
    const data = await body(response);
    if (response.ok && data.client) return { ok: true, client: data.client };
    return { ok: false, status: response.status, error: data.error || 'No se pudo guardar el cliente.', client: data.client ?? null };
  },
  async remove(transport: ClientTransport, id: string, baseVersion: number): Promise<{ ok: boolean; status: number; client: ClientRecord | null }> {
    const response = await transport(`/${encodeURIComponent(id)}?baseVersion=${baseVersion}`, { method: 'DELETE' });
    if (response.ok) return { ok: true, status: response.status, client: null };
    const data = await body(response);
    return { ok: false, status: response.status, client: data.client ?? null };
  },
};
