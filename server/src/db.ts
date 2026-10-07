import pg from "pg";
import type { ServerConfig } from "./config.js";
export { migrateDatabase as initDatabase } from "./database/migrations.js";
export function createDatabase(config: ServerConfig["database"]): pg.Pool {
  return new pg.Pool({
    ...config,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}
