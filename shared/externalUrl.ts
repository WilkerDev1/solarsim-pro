/**
 * Enlaces que la aplicación puede pasar al sistema (navegador o aplicación de correo): `http(s)://` y `mailto:`, sin
 * caracteres de control (un salto de línea crudo en un `mailto:` podría colar cabeceras). Lo usan el proceso
 * principal de Electron (`open-external-url`) y el renderer antes de abrir nada.
 */
export function isOpenableExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url || url.length > 8192) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(url)) return false;
  return /^(https?:\/\/[^/]|mailto:)/i.test(url);
}
