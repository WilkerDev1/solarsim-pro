/**
 * Tipo real de un archivo por su firma (magic bytes), no por su extensión ni por el tipo que declara. Lo usan la API
 * (subida de activos), el cliente (antes de subir) y la validación de firmas y sellos. Lista blanca: PDF, PNG, JPEG y
 * WebP; SVG, HTML y cualquier otro formato quedan fuera.
 */
export type DocumentFileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
export type DocumentImageType = Exclude<DocumentFileType, 'application/pdf'>;

export const DOCUMENT_FILE_TYPES: readonly DocumentFileType[] = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const DOCUMENT_IMAGE_TYPES: readonly DocumentImageType[] = ['image/png', 'image/jpeg', 'image/webp'];

const startsWith = (bytes: ArrayLike<number>, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** Tipo por la firma de los primeros bytes; `null` si no es uno de la lista blanca. */
export function sniffDocumentFileType(bytes: ArrayLike<number>): DocumentFileType | null {
  if (startsWith(bytes, PDF)) return 'application/pdf';
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return null;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decodifica los primeros `max` bytes de un texto base64 (sin Buffer ni atob: `shared/` es TypeScript puro). */
export function decodeBase64Head(base64: string, max = 16): number[] {
  const out: number[] = [];
  let buffer = 0, bits = 0;
  for (const char of base64) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) return [];
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Bytes que representa un cuerpo base64 bien formado (sin decodificarlo). */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export interface ParsedDataUrl {
  /** Tipo declarado en el data URL. */
  declared: string;
  /** Tipo real por la firma de los bytes (`null` si no es de la lista blanca). */
  actual: DocumentFileType | null;
  base64: string;
  byteLength: number;
}

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,(.*)$/is;

/** Data URL base64 → tipo declarado, tipo real y tamaño; `null` si no es un data URL base64 bien formado. */
export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = DATA_URL.exec(value);
  if (!match) return null;
  const base64 = match[2];
  if (!base64 || base64.length % 4 !== 0 || !BASE64_BODY.test(base64)) return null;
  return { declared: match[1].toLowerCase(), actual: sniffDocumentFileType(decodeBase64Head(base64)), base64, byteLength: base64ByteLength(base64) };
}

/**
 * Data URL de un archivo admitido cuyo tipo declarado coincide con el real (un SVG o un HTML disfrazado de PNG no
 * pasa). `allowed` limita los tipos (p. ej. solo imágenes) y `maxBytes` el tamaño decodificado.
 */
export function checkDocumentDataUrl(
  value: string,
  { allowed = DOCUMENT_FILE_TYPES, maxBytes }: { allowed?: readonly DocumentFileType[]; maxBytes: number },
): { ok: true; type: DocumentFileType; byteLength: number } | { ok: false; reason: 'format' | 'type' | 'size' } {
  const parsed = parseDataUrl(value);
  if (!parsed) return { ok: false, reason: 'format' };
  if (!parsed.actual || parsed.actual !== parsed.declared || !allowed.includes(parsed.actual)) return { ok: false, reason: 'type' };
  if (parsed.byteLength < 1 || parsed.byteLength > maxBytes) return { ok: false, reason: 'size' };
  return { ok: true, type: parsed.actual, byteLength: parsed.byteLength };
}
