import {
  DEFAULT_MIN_CLIENT_VERSION,
  isStableSemver,
} from "../../shared/clientVersion.js";
export interface ServerConfig {
  jwtSecret: string;
  minClientVersion: string;
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
