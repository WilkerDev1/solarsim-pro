import { registerFolderRoutes } from "./modules/folders.js";
import { registerClientRoutes } from "./modules/clients.js";
import { registerEquipmentAssetRoutes } from "./modules/equipmentAssets.js";
import {
  UnknownDocumentAssetError,
  registerDocumentAssetRoutes,
} from "./modules/documentAssets.js";
import { UNKNOWN_DOCUMENT_ASSET } from "../../shared/documentAssets.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { Pool } from "pg";
import { CLIENT_HEADER } from "../../shared/clientVersion.js";
import {
  assertJwtSecret,
  parseMinClientVersion,
  type AgentAccessConfig,
} from "./config.js";
import {
  registerAgentAccessRoutes,
  registerAgentGate,
} from "./modules/agentAccess/routes.js";
import { registerOAuthRoutes } from "./modules/agentAccess/oauth.js";
import type { ClientIpConfig } from "../../shared/clientIp.js";
import { registerClientVersionGate } from "./clientVersionGate.js";
import { createAuthenticator } from "./security.js";
import { registerAuthRoutes } from "./modules/auth.js";
import { registerUsersRoutes } from "./modules/users.js";
import { registerProjectsRoutes } from "./modules/projects.js";
import { registerEquipmentRoutes } from "./modules/equipment.js";
import { registerEquipmentPriceRoutes } from "./modules/equipmentPrices.js";
import { registerTariffsRoutes } from "./modules/tariffs.js";
import { registerNotificationsRoutes } from "./modules/notifications.js";
import { registerOrganizationRoutes } from "./modules/organization.js";
import { registerCompanyRoutes } from "./modules/companies.js";
/** Import-safe composition root: tests inject an isolated pool; only index.ts starts HTTP. */
export function createApp(options: {
  pool: Pool;
  jwtSecret: string;
  logging?: boolean;
  /** Lowest accepted client (MIN_CLIENT_VERSION); defaults to the shared 2.7.1 floor. */
  minClientVersion?: string;
  /** Remote agent access (docs/MCP_REMOTE.md); disabled by default. */
  agentAccess?: AgentAccessConfig;
  /** Client IP for rate limits; by default only the socket address counts. */
  clientIp?: ClientIpConfig;
}) {
  assertJwtSecret(options.jwtSecret);
  const minClientVersion = parseMinClientVersion(options.minClientVersion);
  const agentAccess = options.agentAccess ?? { enabled: false };
  const clientIp = options.clientIp ?? { trustedProxies: [] };
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
      allowHeaders: ["Content-Type", "Authorization", CLIENT_HEADER],
      exposeHeaders: ["X-Renewed-Token"],
      maxAge: 600,
    }),
  );
  registerClientVersionGate(app, minClientVersion);
  app.use(
    "*",
    bodyLimit({
      maxSize: 20 * 1024 * 1024,
      onError: (c) => c.json({ error: "La solicitud excede 20 MiB" }, 413),
    }),
  );
  registerAgentGate(app, options.pool, agentAccess, clientIp);
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return c.json({ error: "JSON inválido" }, 400);
    // The transaction was rolled back: nothing of the batch was written. The client retries with the images.
    if (error instanceof UnknownDocumentAssetError)
      return c.json(
        {
          error: "La propuesta usa una imagen que el servidor no tiene.",
          code: UNKNOWN_DOCUMENT_ASSET,
          missing: error.missing,
        },
        400,
      );
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
        version: "2.9.1",
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
  registerEquipmentPriceRoutes(app, deps);
  registerFolderRoutes(app, deps);
  registerClientRoutes(app, deps);
  registerEquipmentAssetRoutes(app, deps);
  registerDocumentAssetRoutes(app, deps);
  registerTariffsRoutes(app, deps);
  registerNotificationsRoutes(app, deps);
  registerOrganizationRoutes(app, deps);
  registerAgentAccessRoutes(app, deps, agentAccess);
  registerOAuthRoutes(app, deps, agentAccess, clientIp);
  return app;
}
