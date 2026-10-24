/**
 * Versión mínima de cliente: contrato común del cliente de escritorio, el visor (Worker) y la API.
 * TypeScript puro. Ver docs/MAINTENANCE_AND_UPDATES.md#versión-mínima-de-cliente.
 *
 * Cada cliente envía `X-SolarSim-Client: <nombre>/<versión>` (`desktop/2.7.1`, `share-viewer/2.7.1`). La API
 * responde 426 `client_outdated` a las rutas de datos si falta el encabezado o la versión es menor que
 * `MIN_CLIENT_VERSION`.
 */

export const CLIENT_HEADER = 'X-SolarSim-Client';
export const CLIENT_OUTDATED = 'client_outdated';
/** Mínimo por defecto cuando `MIN_CLIENT_VERSION` no está definida: la primera versión sin espejo heredado. */
export const DEFAULT_MIN_CLIENT_VERSION = '2.7.1';

export interface ClientIdentity {
  name: string;
  version: string;
}

export interface ClientOutdatedBody {
  error: typeof CLIENT_OUTDATED;
  minVersion: string;
  message: string;
}

const MAX_HEADER_LENGTH = 128;
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
// SemVer 2.0.0: sin ceros a la izquierda en los números ni en los identificadores numéricos del prelanzamiento.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

interface ParsedSemver {
  numbers: [string, string, string];
  prerelease: string[];
}

function parseSemver(value: string): ParsedSemver | null {
  if (value.length > MAX_HEADER_LENGTH) return null;
  const match = SEMVER.exec(value);
  if (!match) return null;
  return { numbers: [match[1], match[2], match[3]], prerelease: match[4] ? match[4].split('.') : [] };
}

/** Enteros sin signo como texto: más dígitos es mayor; con los mismos dígitos decide el orden léxico. Sin desbordes. */
const compareNumeric = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);
const isNumeric = (identifier: string) => /^\d+$/.test(identifier);

/**
 * Precedencia de SemVer 2.0.0 (negativo si `a < b`, 0 si iguales, positivo si `a > b`); `null` si alguna no es
 * una versión válida. Los metadatos de compilación (`+...`) no cuentan.
 */
export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    const difference = compareNumeric(left.numbers[i], right.numbers[i]);
    if (difference) return difference;
  }
  if (!left.prerelease.length || !right.prerelease.length) return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1;
  for (let i = 0; i < Math.min(left.prerelease.length, right.prerelease.length); i++) {
    const x = left.prerelease[i];
    const y = right.prerelease[i];
    if (x === y) continue;
    if (isNumeric(x) && isNumeric(y)) return compareNumeric(x, y);
    if (isNumeric(x) !== isNumeric(y)) return isNumeric(x) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return left.prerelease.length - right.prerelease.length;
}

export const isSemver = (value: string): boolean => parseSemver(value) !== null;

/** `major.minor.patch` sin prelanzamiento ni metadatos: el único formato válido para el mínimo configurado. */
export const isStableSemver = (value: string): boolean => parseSemver(value)?.prerelease.length === 0 && !value.includes('+');

export const formatClientHeader = (name: string, version: string): string => `${name}/${version}`;

/** `nombre/versión` estricto; cualquier otra forma es `null`. */
export function parseClientHeader(value: string | null | undefined): ClientIdentity | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_HEADER_LENGTH) return null;
  const parts = text.split('/');
  if (parts.length !== 2 || !NAME.test(parts[0]) || !parseSemver(parts[1])) return null;
  return { name: parts[0], version: parts[1] };
}

/**
 * ¿Debe rechazarse al cliente? Sin encabezado, malformado o por debajo del mínimo. Un mínimo inválido rechaza a
 * todos (falla cerrado): la configuración se valida al arrancar para que no ocurra.
 */
export function isClientOutdated(header: string | null | undefined, minVersion: string): boolean {
  const client = parseClientHeader(header);
  if (!client) return true;
  const comparison = compareSemver(client.version, minVersion);
  return comparison === null || comparison < 0;
}

export const clientOutdatedMessage = (minVersion: string): string => `Actualiza SolarSim a la versión ${minVersion} o superior para seguir sincronizando.`;

export const clientOutdatedBody = (minVersion: string): ClientOutdatedBody => ({ error: CLIENT_OUTDATED, minVersion, message: clientOutdatedMessage(minVersion) });

/** Rutas que no exigen versión: salud, sesión (inicio, renovación, identidad) y el preflight de CORS. */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/api/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/me']);

export const isClientGateOpen = (method: string, pathname: string): boolean => method.toUpperCase() === 'OPTIONS' || OPEN_PATHS.has(pathname);
