import type { Hono } from "hono";
import {
  CLIENT_HEADER,
  clientOutdatedBody,
  isClientGateOpen,
  isClientOutdated,
} from "../../shared/clientVersion.js";
/**
 * Minimum client version. Registered after CORS (so the 426 is readable by the renderer) and before body parsing
 * and routing. Open: health, login, refresh, identity and CORS preflight; everything else under /api needs
 * `X-SolarSim-Client: <name>/<version>` at or above `minClientVersion`.
 */
export function registerClientVersionGate(
  app: Hono,
  minClientVersion: string,
): void {
  app.use("/api/*", async (c, next) => {
    if (isClientGateOpen(c.req.method, c.req.path)) return next();
    if (!isClientOutdated(c.req.header(CLIENT_HEADER), minClientVersion))
      return next();
    return c.json(clientOutdatedBody(minClientVersion), 426);
  });
}
