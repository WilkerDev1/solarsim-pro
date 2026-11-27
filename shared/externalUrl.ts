/**
 * Enlaces que la aplicación puede pasar al sistema (navegador o aplicación de correo). Lista blanca estricta que
 * aplica el proceso principal de Electron (IPC `open-external-url`, la frontera que cuenta) y también el renderer:
 *
 * - `http://` y `https://` con host, sin credenciales, sin barras invertidas ni espacios o caracteres de control.
 * - `mailto:` con la ruta vacía o UNA sola dirección válida (`isValidEmailAddress`, tras decodificar) y en la query
 *   solo `subject` y `body`, una vez cada una. El asunto no puede llevar caracteres de control (ni `%0D`/`%0A`
 *   codificados); el cuerpo solo admite saltos de línea CR/LF y tabuladores, que RFC 6068 exige codificar así.
 *   Cualquier otra clave (`cc`, `bcc`, `to`, `attach`, `attachment`…) o un fragmento se rechazan.
 *
 * Todo lo demás (`file:`, `javascript:`, `smb:`, `ms-msdt:`, `vscode:`…) se rechaza.
 */

/**
 * Dirección simple y segura: una sola, ASCII, sin espacios, comas, `;`, `?`, `&` ni `<>` (así no puede añadir
 * destinatarios ni cabeceras), con dominio de al menos dos partes y hasta 254 caracteres.
 */
export function isValidEmailAddress(text: string): boolean {
  return text.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(text) && !/\.\.|^\.|\.@|@-|-\./.test(text);
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAILTO_KEYS = new Set(['subject', 'body']);

const decode = (text: string): string | null => {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
};

function isOpenableMailto(url: string): boolean {
  if (url.includes('#')) return false;
  const rest = url.slice('mailto:'.length);
  const at = rest.indexOf('?');
  const address = decode(at < 0 ? rest : rest.slice(0, at));
  if (address === null || (address !== '' && !isValidEmailAddress(address))) return false;
  if (at < 0) return true;
  const seen = new Set<string>();
  for (const pair of rest.slice(at + 1).split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (!MAILTO_KEYS.has(key) || seen.has(key)) return false;
    seen.add(key);
    const value = decode(eq < 0 ? '' : pair.slice(eq + 1));
    if (value === null) return false;
    if ((key === 'subject' ? CONTROL : CONTROL_EXCEPT_LINES).test(value)) return false;
  }
  return true;
}

function isOpenableHttp(url: string): boolean {
  if (url.includes('\\') || !/^https?:\/\/[^/\\]/i.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host !== '' && !parsed.username && !parsed.password;
}

export function isOpenableExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url || url.length > 8192) return false;
  if (CONTROL.test(url) || /\s/.test(url)) return false;
  if (/^mailto:/i.test(url)) return url.startsWith('mailto:') && isOpenableMailto(url);
  return isOpenableHttp(url);
}
