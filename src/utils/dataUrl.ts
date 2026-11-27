/** Conversión entre bytes y data URL base64 sin Node (renderer); `btoa`/`atob` existen en Chromium y en Node ≥ 16. */
export function bytesToDataUrl(bytes: Uint8Array | ArrayBuffer, type: string): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  return `data:${type};base64,${btoa(binary)}`;
}

/** Bytes de un data URL base64; `null` si no lo es. */
export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0 || !dataUrl.slice(0, comma).endsWith(';base64')) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
