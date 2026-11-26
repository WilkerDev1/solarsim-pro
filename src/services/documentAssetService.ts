import { fetchWithSessionRetry } from './syncService';
import { assetRef, assetRefHash, isAssetRef } from '../../shared/documentAssets';

/**
 * Activos sueltos de la API (`/api/document-assets`, migración 009 ampliada): logo del emisor, firmas, sellos y
 * adjuntos de cotizaciones. La referencia `asset:sha256:<hex>` es el sha256 del texto exacto del data URL, la misma
 * regla del servidor, así el cliente la calcula sin preguntar. Transporte inyectable: las pruebas no tocan la red.
 */
export type DocumentAssetTransport = (path: string, init?: RequestInit) => Promise<Response>;
export type DocumentAssetTransportFactory = (serverUrl: string, token: () => string) => DocumentAssetTransport;

const defaultFactory: DocumentAssetTransportFactory = (serverUrl, token) => (path, init = {}) =>
  fetchWithSessionRetry(`${serverUrl.replace(/\/+$/, '')}/api/document-assets${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    // Un PDF de 8 MB tarda más que una lista: el límite general de 12 s es corto para subirlo.
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
let factory: DocumentAssetTransportFactory = defaultFactory;

/** Contenido ya conocido en este equipo (hash → data URL) y hashes subidos por espacio de trabajo. */
const contents = new Map<string, string>();
const uploaded = new Map<string, Set<string>>();
const MAX_CACHED = 200;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Referencia del servidor de un data URL (sin subirlo). */
export async function assetRefFor(dataUrl: string): Promise<string> {
  return assetRef(await sha256Hex(dataUrl));
}

/** Solo imágenes pequeñas (logos, firmas, sellos): los adjuntos grandes viven en `PDFAttachmentStorage`. */
const MAX_CACHED_LENGTH = 1_000_000;

export function rememberAssetContent(ref: string, content: string): void {
  if (!isAssetRef(ref) || content.length > MAX_CACHED_LENGTH) return;
  if (contents.size >= MAX_CACHED) contents.delete(contents.keys().next().value!);
  contents.set(assetRefHash(ref), content);
}

export function cachedAssetContent(ref: string): string | undefined {
  return isAssetRef(ref) ? contents.get(assetRefHash(ref)) : undefined;
}

export class DocumentAssetUploadError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export const DocumentAssetService = {
  setTransportFactory(next: DocumentAssetTransportFactory | null) {
    factory = next ?? defaultFactory;
    uploaded.clear();
  },
  transport(serverUrl: string, token: () => string): DocumentAssetTransport {
    return factory(serverUrl, token);
  },
  /**
   * Sube `dataUrl` (una vez por espacio de trabajo y sesión de la app) y devuelve su referencia. Un 4xx lanza
   * `DocumentAssetUploadError` (tipo no admitido, demasiado grande…); un fallo de red lanza el error del transporte.
   */
  async ensureUploaded(transport: DocumentAssetTransport, scope: string, dataUrl: string): Promise<string> {
    const ref = await assetRefFor(dataUrl);
    const hash = assetRefHash(ref);
    const done = uploaded.get(scope) ?? new Set<string>();
    if (done.has(hash)) return ref;
    const response = await transport('', { method: 'POST', body: JSON.stringify({ content: dataUrl }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.sha256 !== hash)
      throw new DocumentAssetUploadError(data?.error || `No se pudo subir el archivo (HTTP ${response.status}).`, response.status, data?.code);
    done.add(hash);
    uploaded.set(scope, done);
    rememberAssetContent(ref, dataUrl);
    return ref;
  },
  /** Contenido (data URL) de una referencia: de este equipo o del servidor; `null` si no se puede obtener. */
  async content(transport: DocumentAssetTransport | null, ref: string): Promise<string | null> {
    const cached = cachedAssetContent(ref);
    if (cached) return cached;
    if (!transport || !isAssetRef(ref)) return null;
    try {
      const response = await transport(`/${assetRefHash(ref)}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (typeof data?.content !== 'string' || (await assetRefFor(data.content)) !== ref) return null;
      rememberAssetContent(ref, data.content);
      return data.content;
    } catch {
      return null;
    }
  },
};
