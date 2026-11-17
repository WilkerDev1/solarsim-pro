/**
 * IP del cliente para límites de tasa (API y servicio MCP remoto). TypeScript puro.
 *
 * Por defecto solo cuenta la IP del socket: las cabeceras de proxy se ignoran porque cualquiera puede escribirlas.
 * Solo si el socket pertenece a un proxy de confianza configurado (`TRUSTED_PROXIES`, IP o CIDR) se lee la
 * cabecera indicada (`CLIENT_IP_HEADER`): `cf-connecting-ip` (valor único que pone Cloudflare) o
 * `x-forwarded-for` (se recorre de derecha a izquierda saltando los proxies de confianza). Ver docs/MCP_REMOTE.md.
 */

export type ClientIpHeader = 'cf-connecting-ip' | 'x-forwarded-for';
export interface ClientIpConfig {
  trustedProxies: readonly string[];
  header?: ClientIpHeader;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Normaliza (`::ffff:1.2.3.4` → `1.2.3.4`, minúsculas, sin corchetes ni zona); `null` si no es una IP. */
export function normalizeIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let ip = value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (ip.startsWith('::ffff:') && IPV4.test(ip.slice(7))) ip = ip.slice(7);
  if (IPV4.test(ip)) return ip;
  return ipv6ToBigInt(ip) === null ? null : ip;
}

function ipv4ToBigInt(ip: string): bigint {
  return ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
}

function ipv6ToBigInt(ip: string): bigint | null {
  if (!/^[0-9a-f:.]+$/.test(ip) || !ip.includes(':') || ip.split('::').length > 2) return null;
  // Embedded IPv4 in the last 32 bits becomes two hex groups.
  const lastColon = ip.lastIndexOf(':');
  const last = ip.slice(lastColon + 1);
  if (last.includes('.')) {
    if (!IPV4.test(last)) return null;
    const v4 = ipv4ToBigInt(last);
    ip = `${ip.slice(0, lastColon + 1)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const [head, rest] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (rest !== undefined && missing < 1) return null;
  const groups = rest !== undefined ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n);
}

/** ¿Pertenece `ip` a la red `cidr` (o es esa IP)? Familias distintas nunca coinciden. */
export function ipInRange(ip: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split('/');
  const a = normalizeIp(ip);
  const b = normalizeIp(base);
  if (!a || !b) return false;
  const v4 = IPV4.test(a);
  if (v4 !== IPV4.test(b)) return false;
  const width = v4 ? 32 : 128;
  const bits = bitsText === undefined ? width : Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return false;
  const x = v4 ? ipv4ToBigInt(a) : ipv6ToBigInt(a)!;
  const y = v4 ? ipv4ToBigInt(b) : ipv6ToBigInt(b)!;
  const shift = BigInt(width - bits);
  return x >> shift === y >> shift;
}

/** Valida la lista de `TRUSTED_PROXIES` (coma); un valor inválido lanza para fallar al arrancar. */
export function parseTrustedProxies(value: unknown): string[] {
  const items = typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const item of items) {
    const [base, bits] = item.split('/');
    const ip = normalizeIp(base);
    const width = ip && IPV4.test(ip) ? 32 : 128;
    if (!ip || (bits !== undefined && !(/^\d+$/.test(bits) && Number(bits) <= width))) throw new Error(`TRUSTED_PROXIES: «${item}» no es una IP ni un CIDR.`);
  }
  return items;
}

export function parseClientIpHeader(value: unknown): ClientIpHeader | undefined {
  if (value === undefined || value === '') return undefined;
  const header = String(value).toLowerCase();
  if (header !== 'cf-connecting-ip' && header !== 'x-forwarded-for') throw new Error('CLIENT_IP_HEADER debe ser cf-connecting-ip o x-forwarded-for.');
  return header;
}

const trusted = (ip: string, config: ClientIpConfig) => config.trustedProxies.some((range) => ipInRange(ip, range));

/**
 * IP efectiva del cliente. Sin socket conocido devuelve `'unknown'` (todas esas peticiones comparten cubo, el
 * comportamiento más prudente). `headers` devuelve el valor de una cabecera por nombre en minúsculas.
 */
export function resolveClientIp(socketIp: string | undefined, headers: (name: string) => string | undefined, config: ClientIpConfig): string {
  const peer = normalizeIp(socketIp);
  if (!peer) return 'unknown';
  if (!config.header || !trusted(peer, config)) return peer;
  if (config.header === 'cf-connecting-ip') return normalizeIp(headers('cf-connecting-ip')) ?? peer;
  const chain = (headers('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    const hop = normalizeIp(chain[i]);
    if (!hop) return peer;
    if (!trusted(hop, config)) return hop;
  }
  return peer;
}

/** IP del socket en el adaptador de Node de Hono (`c.env.incoming`); `undefined` fuera de él (pruebas en memoria). */
export function socketAddress(env: unknown): string | undefined {
  const incoming = (env as { incoming?: { socket?: { remoteAddress?: unknown } } } | undefined)?.incoming;
  const address = incoming?.socket?.remoteAddress;
  return typeof address === 'string' ? address : undefined;
}
