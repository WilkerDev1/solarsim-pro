import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createDatabase, initDatabase } from "./db.js";
const config = readConfig();
const pool = createDatabase(config.database);
try {
  await initDatabase(pool);
  const server = serve({
    fetch: createApp({ pool, jwtSecret: config.jwtSecret }).fetch,
    port: config.port,
    hostname: "0.0.0.0",
  });
  const shutdown = () =>
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch (error) {
  console.error(
    "Sync API startup failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  await pool.end();
  process.exitCode = 1;
}
