import { fetchWithSessionRetry } from './syncService';
import type { LibraryKind } from '../types/quotationLibrary';

/**
 * HTTP de plantillas (`/api/quotation-templates`) y firmas (`/api/quotation-signatures`). Mismo contrato que las
 * cotizaciones: `PUT {baseVersion, content}`, 409 con el registro del servidor, `DELETE ?baseVersion=`, `GET ?since=`.
 */
export type LibraryTransport = (kind: LibraryKind, path: string, init?: RequestInit) => Promise<Response>;
export type LibraryTransportFactory = (serverUrl: string, token: () => string) => LibraryTransport;

const PATHS: Record<LibraryKind, string> = { templates: '/api/quotation-templates', signatures: '/api/quotation-signatures' };
const ITEM: Record<LibraryKind, 'template' | 'signature'> = { templates: 'template', signatures: 'signature' };

const defaultFactory: LibraryTransportFactory = (serverUrl, token) => (kind, path, init = {}) =>
  fetchWithSessionRetry(`${serverUrl.replace(/\/+$/, '')}${PATHS[kind]}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  });
let factory: LibraryTransportFactory = defaultFactory;

const body = async (response: Response): Promise<Record<string, any>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const record = <T>(raw: unknown): T | null => {
  if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string') return null;
  const value = raw as T & { version?: number };
  const version = Number.isSafeInteger(value.version) ? value.version! : 0;
  return { ...value, version, baseVersion: version };
};

export type LibraryListResult<T> =
  | { supported: true; items: T[]; deletedIds: string[]; serverTimestamp: string | null }
  /** La API es anterior a la biblioteca (404). */
  | { supported: false };

export type LibraryWriteResult<T> =
  /** `cleared`: filas que el servidor desmarcó como predeterminadas en la misma escritura, con su versión nueva. */
  | { ok: true; record: T; cleared: { id: string; version: number }[] }
  | { ok: false; status: number; error: string; code?: string; record: T | null };

export const QuotationLibrarySyncService = {
  setTransportFactory(next: LibraryTransportFactory | null) {
    factory = next ?? defaultFactory;
  },
  transport(serverUrl: string, token: () => string): LibraryTransport {
    return factory(serverUrl, token);
  },
  async list<T>(transport: LibraryTransport, kind: LibraryKind, since?: string | null): Promise<LibraryListResult<T>> {
    const response = await transport(kind, since ? `?since=${encodeURIComponent(since)}` : '');
    if (response.status === 404) return { supported: false };
    const data = await body(response);
    if (!response.ok || !data.success || !Array.isArray(data[kind])) throw new Error(data.error || 'El servidor no admite plantillas de cotización.');
    return {
      supported: true,
      items: data[kind].map((raw: unknown) => record<T>(raw)).filter((item: T | null): item is T => !!item),
      deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds.filter((id: unknown): id is string => typeof id === 'string') : [],
      serverTimestamp: typeof data.serverTimestamp === 'string' && Number.isFinite(Date.parse(data.serverTimestamp)) ? data.serverTimestamp : null,
    };
  },
  async put<T>(transport: LibraryTransport, kind: LibraryKind, id: string, content: unknown, baseVersion: number): Promise<LibraryWriteResult<T>> {
    const response = await transport(kind, `/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ baseVersion, content }) });
    const data = await body(response);
    const saved = record<T>(data[ITEM[kind]]);
    const cleared = Array.isArray(data.cleared)
      ? data.cleared.filter((c: any) => c && typeof c.id === 'string' && Number.isSafeInteger(c.version)).map((c: any) => ({ id: c.id, version: c.version }))
      : [];
    if (response.ok && saved) return { ok: true, record: saved, cleared };
    return { ok: false, status: response.status, error: data.error || 'No se pudo guardar.', ...(typeof data.code === 'string' ? { code: data.code } : {}), record: saved };
  },
  async remove<T>(transport: LibraryTransport, kind: LibraryKind, id: string, baseVersion: number): Promise<{ ok: boolean; status: number; error: string; record: T | null }> {
    const response = await transport(kind, `/${encodeURIComponent(id)}?baseVersion=${baseVersion}`, { method: 'DELETE' });
    if (response.ok) return { ok: true, status: response.status, error: '', record: null };
    const data = await body(response);
    return { ok: false, status: response.status, error: data.error || 'No se pudo eliminar.', record: record<T>(data[ITEM[kind]]) };
  },
};
