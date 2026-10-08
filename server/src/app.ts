import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { Pool } from "pg";
import { assertJwtSecret } from "./config.js";
import { createAuthenticator } from "./security.js";
import { registerAuthRoutes } from "./modules/auth.js";
import { registerUsersRoutes } from "./modules/users.js";
import { registerProjectsRoutes } from "./modules/projects.js";
import { registerEquipmentRoutes } from "./modules/equipment.js";
import { registerTariffsRoutes } from "./modules/tariffs.js";
import { registerNotificationsRoutes } from "./modules/notifications.js";
import { registerOrganizationRoutes } from "./modules/organization.js";
import { registerCompanyRoutes } from "./modules/companies.js";
/** Import-safe composition root: tests inject an isolated pool; only index.ts starts HTTP. */
export function createApp(options: {
  pool: Pool;
  jwtSecret: string;
  logging?: boolean;
}) {
  assertJwtSecret(options.jwtSecret);
  const app = new Hono();
  const deps = {
    ...options,
    authenticate: createAuthenticator(options.pool, options.jwtSecret),
  };
  if (options.logging !== false) app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Renewed-Token"],
      maxAge: 600,
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 20 * 1024 * 1024,
      onError: (c) => c.json({ error: "La solicitud excede 20 MiB" }, 413),
    }),
  );
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return c.json({ error: "JSON inválido" }, 400);
    console.error(
      "API request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return c.json({ error: "Error interno del servidor" }, 500);
  });
  app.get("/api/health", async (c) => {
    try {
      await options.pool.query("SELECT 1");
      return c.json({
        status: "ok",
        service: "SolarSim Pro Sync API",
        version: "2.3.2",
        database: "connected",
      });
    } catch {
      return c.json({ status: "error", database: "disconnected" }, 503);
    }
  });
  registerAuthRoutes(app, deps);
  registerCompanyRoutes(app, deps);
  registerUsersRoutes(app, deps);
  registerProjectsRoutes(app, deps);
  registerEquipmentRoutes(app, deps);
  registerTariffsRoutes(app, deps);
  registerNotificationsRoutes(app, deps);
  registerOrganizationRoutes(app, deps);
  return app;
}
