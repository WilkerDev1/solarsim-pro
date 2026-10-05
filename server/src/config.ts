export interface ServerConfig {
  jwtSecret: string;
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
