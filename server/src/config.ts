import {
  parseClientIpHeader,
  parseTrustedProxies,
  type ClientIpConfig,
} from "../../shared/clientIp.js";
import {
  DEFAULT_MIN_CLIENT_VERSION,
  isStableSemver,
} from "../../shared/clientVersion.js";
/** Remote agent access (docs/MCP_REMOTE.md). Disabled unless MCP_REMOTE_ENABLED=true. */
export interface AgentAccessConfig {
  enabled: boolean;
  /** Canonical URL of the remote MCP endpoint (RFC 8707 resource): the audience of every agent token. */
  mcpUrl?: string;
  /** OAuth 2.1 authorization server on this API (MCP_OAUTH_ENABLED=true); `issuer` is API_PUBLIC_URL. */
  oauth?: { issuer: string };
}
const isLoopback = (host: string) =>
  host === "127.0.0.1" || host === "localhost" || host === "[::1]";
function publicUrl(name: string, value: unknown, originOnly: boolean): string {
  let url: URL;
  try {
    url = new URL(String(value ?? ""));
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && isLoopback(url.hostname))
    ) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (originOnly && url.pathname !== "/")
  )
    throw new Error(
      `${name} must be an https URL${originOnly ? " without a path" : ""}, query or fragment (http only on loopback).`,
    );
  return originOnly
    ? url.origin
    : `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
const flag = (value: unknown) => value === "true" || value === "1";
/** A misconfiguration fails at startup; disabled means no agent route, token or OAuth endpoint exists at all. */
export function parseAgentAccessConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentAccessConfig {
  if (!flag(env.MCP_REMOTE_ENABLED)) {
    if (flag(env.MCP_OAUTH_ENABLED))
      throw new Error("MCP_OAUTH_ENABLED requires MCP_REMOTE_ENABLED=true.");
    return { enabled: false };
  }
  const mcpUrl = publicUrl("MCP_REMOTE_URL", env.MCP_REMOTE_URL, false);
  return {
    enabled: true,
    mcpUrl,
    ...(flag(env.MCP_OAUTH_ENABLED)
      ? {
          oauth: {
            issuer: publicUrl("API_PUBLIC_URL", env.API_PUBLIC_URL, true),
          },
        }
      : {}),
  };
}
export interface ServerConfig {
  jwtSecret: string;
  minClientVersion: string;
  agentAccess: AgentAccessConfig;
  /** Client IP for rate limits: socket only unless TRUSTED_PROXIES and CLIENT_IP_HEADER are set. */
  clientIp: ClientIpConfig;
  port: number;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
}
export function assertJwtSecret(secret: unknown): asserts secret is string {
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    secret === "solarsim_enterprise_jwt_secret_key_2026"
  )
    throw new Error(
      "JWT_SECRET must be a private random secret of at least 32 characters; public defaults are rejected.",
    );
}
/** `MIN_CLIENT_VERSION` must be a stable semver (major.minor.patch); an empty value means the default. A typo fails at startup, never at runtime. */
export function parseMinClientVersion(value: unknown): string {
  if (value === undefined || value === "") return DEFAULT_MIN_CLIENT_VERSION;
  if (typeof value !== "string" || !isStableSemver(value))
    throw new Error(
      "MIN_CLIENT_VERSION must be a semver such as 2.7.1 (major.minor.patch).",
    );
  return value;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  assertJwtSecret(env.JWT_SECRET);
  if (!env.DB_PASSWORD || env.DB_PASSWORD === "solarsim_secret_2026")
    throw new Error("DB_PASSWORD is required; public defaults are rejected.");
  const port = Number(env.PORT ?? 3000),
    dbPort = Number(env.DB_PORT ?? 5432);
  if (![port, dbPort].every((p) => Number.isInteger(p) && p > 0 && p <= 65535))
    throw new Error("Invalid server or database port.");
  return {
    jwtSecret: env.JWT_SECRET,
    minClientVersion: parseMinClientVersion(env.MIN_CLIENT_VERSION),
    agentAccess: parseAgentAccessConfig(env),
    clientIp: {
      trustedProxies: parseTrustedProxies(env.TRUSTED_PROXIES),
      header: parseClientIpHeader(env.CLIENT_IP_HEADER),
    },
    port,
    database: {
      host: env.DB_HOST ?? "solarsim-db",
      port: dbPort,
      user: env.DB_USER ?? "solarsim_user",
      password: env.DB_PASSWORD,
      database: env.DB_NAME ?? "solarsim_prod",
    },
  };
}
