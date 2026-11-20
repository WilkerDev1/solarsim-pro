/**
 * Imágenes del documento guardadas una sola vez por organización.
 *
 * Los logos de la propuesta (`customization.*LogoBase64`) y las miniaturas de anexos
 * (`customization.attachedPdfs[].thumbnailDataUrl`) se copiaban en cada propuesta: ~11 MB de los ~12 MB de una
 * descarga completa. En la API cada valor se guarda una vez en `document_assets` (clave: sha256 del texto UTF-8
 * exacto) y la propuesta guarda la referencia inmutable `asset:sha256:<hex>`. Una propuesta con un logo distinto
 * apunta a su propio activo; editar el logo de la empresa crea otro activo y nunca cambia propuestas existentes
 * (contrato de `companyDocumentSnapshot`).
 *
 * Solo viajan referencias a quien pide `?assetRefs=1`; el resto (clientes anteriores, agentes) recibe
 * el contenido. El escritorio convierte las referencias en contenido antes de guardarlas: el store, el PDF y el
 * visor web solo ven imágenes.
 */
/**
 * Query parameter that announces references (`?assetRefs=1`). Not a header: a new header would change the CORS
 * preflight and an older API (which does not allow it) would block every project request from the desktop.
 */
export const ASSET_REFS_QUERY = 'assetRefs';
/** `path` with the capability announced. */
export const withAssetRefs = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}${ASSET_REFS_QUERY}=1`;
export const UNKNOWN_DOCUMENT_ASSET = 'unknown_document_asset';
const PREFIX = 'asset:sha256:';
const REF = /^asset:sha256:[0-9a-f]{64}$/;
export const SHA256_HEX = /^[0-9a-f]{64}$/;
/** Valores más cortos se quedan en la propuesta: no pesan y evitan activos triviales. */
export const MIN_ASSET_LENGTH = 512;
/** Tope por imagen (texto base64/data URL), por debajo del límite de 20 MiB por solicitud. */
export const MAX_ASSET_LENGTH = 12 * 1024 * 1024;
export const DOCUMENT_LOGO_FIELDS = ['coverLogoBase64', 'watermarkLogoBase64', 'webHeaderLogoBase64', 'headerLogoBase64'] as const;

export const isAssetRef = (value: unknown): value is string => typeof value === 'string' && REF.test(value);
export const assetRef = (sha256: string): string => PREFIX + sha256;
export const assetRefHash = (ref: string): string => ref.slice(PREFIX.length);
/** Un valor que se guarda como activo: texto largo que aún no es una referencia. */
export const isAssetCandidate = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= MIN_ASSET_LENGTH && !isAssetRef(value);

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Copia de `project` con cada imagen del documento (no vacía) pasada por `map`. Sin cambios devuelve el mismo
 * objeto. Solo toca los campos declarados; no muta la entrada.
 */
export function mapDocumentAssetFields<T>(project: T, map: (value: string) => string): T {
  if (!isRecord(project) || !isRecord(project.customization)) return project;
  const customization = project.customization;
  let changed: Record<string, any> | null = null;
  for (const field of DOCUMENT_LOGO_FIELDS) {
    const value = customization[field];
    if (typeof value !== 'string' || !value) continue;
    const next = map(value);
    if (next !== value) (changed ??= { ...customization })[field] = next;
  }
  if (Array.isArray(customization.attachedPdfs)) {
    let pdfsChanged = false;
    const pdfs = customization.attachedPdfs.map((pdf: unknown) => {
      if (!isRecord(pdf) || typeof pdf.thumbnailDataUrl !== 'string' || !pdf.thumbnailDataUrl) return pdf;
      const next = map(pdf.thumbnailDataUrl);
      if (next === pdf.thumbnailDataUrl) return pdf;
      pdfsChanged = true;
      return { ...pdf, thumbnailDataUrl: next };
    });
    if (pdfsChanged) (changed ??= { ...customization }).attachedPdfs = pdfs;
  }
  return changed ? ({ ...project, customization: changed } as T) : project;
}

/** Hashes de toda referencia que aparezca en `value` (respuestas de la API, historial…). */
export function collectAssetRefs(value: unknown, found = new Set<string>()): Set<string> {
  if (isAssetRef(value)) found.add(assetRefHash(value));
  else if (Array.isArray(value)) for (const item of value) collectAssetRefs(item, found);
  else if (isRecord(value)) for (const item of Object.values(value)) collectAssetRefs(item, found);
  return found;
}

/** Reemplaza cada referencia conocida en `value` (profundo). Lo desconocido queda igual; sin cambios, misma identidad. */
export function replaceAssetRefs<T>(value: T, resolve: (sha256: string) => string | undefined): T {
  if (isAssetRef(value)) return (resolve(assetRefHash(value)) ?? value) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const replaced = replaceAssetRefs(item, resolve);
      if (replaced !== item) changed = true;
      return replaced;
    });
    return (changed ? next : value) as T;
  }
  if (isRecord(value)) {
    let next: Record<string, any> | null = null;
    for (const [key, item] of Object.entries(value)) {
      const replaced = replaceAssetRefs(item, resolve);
      if (replaced !== item) (next ??= { ...value })[key] = replaced;
    }
    return (next ?? value) as T;
  }
  return value;
}
