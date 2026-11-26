import { fetchWithSessionRetry } from './syncService';
import type { QuotationContent } from '../../shared/quotations';
import type { QuotationRecord } from '../types/quotation';

/** Relative request under `/api/quotations` (e.g. `""`, `?since=…`, `/id`, `/id?baseVersion=2`). */
export type QuotationTransport = (path: string, init?: RequestInit) => Promise<Response>;
export type QuotationTransportFactory = (serverUrl: string, token: () => string) => QuotationTransport;

const defaultFactory: QuotationTransportFactory = (serverUrl, token) => (path, init = {}) =>
  fetchWithSessionRetry(`${serverUrl.replace(/\/+$/, '')}/api/quotations${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  });
let factory: QuotationTransportFactory = defaultFactory;

export type QuotationListResult =
  | { supported: true; quotations: QuotationRecord[]; deletedIds: string[]; serverTimestamp: string | null }
  /** The API predates quotations (404). */
  | { supported: false };

export type QuotationWriteResult =
  | { ok: true; quotation: QuotationRecord }
  | { ok: false; status: number; error: string; code?: string; quotation: QuotationRecord | null };

const body = async (response: Response): Promise<Record<string, any>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

/** Server record with the receipt fields the store relies on (`number` null until assigned, `baseVersion` = `version`). */
const record = (raw: unknown): QuotationRecord | null => {
  if (!raw || typeof raw !== 'object' || typeof (raw as QuotationRecord).id !== 'string') return null;
  const value = raw as QuotationRecord;
  const version = Number.isSafeInteger(value.version) ? value.version : 0;
  return { ...value, number: typeof value.number === 'string' && value.number ? value.number : null, version, baseVersion: version };
};

/** HTTP adapter for quotations; tests and agents inject a synthetic transport. */
export const QuotationSyncService = {
  setTransportFactory(next: QuotationTransportFactory | null) {
    factory = next ?? defaultFactory;
  },
  transport(serverUrl: string, token: () => string): QuotationTransport {
    return factory(serverUrl, token);
  },
  async list(transport: QuotationTransport, since?: string | null): Promise<QuotationListResult> {
    const response = await transport(since ? `?since=${encodeURIComponent(since)}` : '');
    if (response.status === 404) return { supported: false };
    const data = await body(response);
    if (!response.ok || !data.success || !Array.isArray(data.quotations))
      throw new Error(data.error || 'El servidor no admite sincronización de cotizaciones.');
    return {
      supported: true,
      quotations: data.quotations.map(record).filter((q: QuotationRecord | null): q is QuotationRecord => !!q),
      deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds.filter((id: unknown): id is string => typeof id === 'string') : [],
      serverTimestamp: typeof data.serverTimestamp === 'string' && Number.isFinite(Date.parse(data.serverTimestamp)) ? data.serverTimestamp : null,
    };
  },
  /** `content` must already be publishable (no inline images). */
  async put(transport: QuotationTransport, id: string, content: QuotationContent, baseVersion: number): Promise<QuotationWriteResult> {
    const response = await transport(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ baseVersion, content }) });
    const data = await body(response);
    const quotation = record(data.quotation);
    if (response.ok && quotation) return { ok: true, quotation };
    return {
      ok: false,
      status: response.status,
      error: data.error || 'No se pudo guardar la cotización.',
      ...(typeof data.code === 'string' ? { code: data.code } : {}),
      quotation,
    };
  },
  /** 409 with `quotation: null` means the id is already deleted (with another version); 404, that it never existed. */
  async remove(
    transport: QuotationTransport,
    id: string,
    baseVersion: number,
  ): Promise<{ ok: boolean; status: number; error: string; quotation: QuotationRecord | null }> {
    const response = await transport(`/${encodeURIComponent(id)}?baseVersion=${baseVersion}`, { method: 'DELETE' });
    if (response.ok) return { ok: true, status: response.status, error: '', quotation: null };
    const data = await body(response);
    return { ok: false, status: response.status, error: data.error || 'No se pudo eliminar la cotización.', quotation: record(data.quotation) };
  },
};
