import { lockOrganizationAdmin } from "../membership.js";
import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import {
  isFeatureSettings,
  normalizeFeatureSettings,
} from "../../../shared/applicationFeatures.js";
export function registerOrganizationRoutes(
  app: Hono,
  deps: Dependencies,
): void {
  app.get("/api/organization/features", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const result = await deps.pool.query(
      "SELECT feature_settings, feature_policy_version FROM organizations WHERE id = $1",
      [user.organizationId],
    );
    const row = result.rows[0];
    return c.json({
      organizationId: user.organizationId,
      version: row.feature_policy_version,
      settings: normalizeFeatureSettings(row.feature_settings),
    });
  });
  app.patch("/api/organization/features", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role !== "ADMIN")
      return c.json(
        { error: "Solo ADMIN puede configurar las funciones" },
        403,
      );
    const body = await readObjectBody(c);
    if (
      !isFeatureSettings(body.settings) ||
      !Number.isSafeInteger(body.baseVersion) ||
      body.baseVersion < 1
    )
      return c.json({ error: "Configuración o versión inválida" }, 400);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "Permisos cambiaron" }, denied);
      }
      const result = await client.query(
        `UPDATE organizations SET feature_settings = $1, feature_policy_version = feature_policy_version + 1 WHERE id = $2 AND feature_policy_version = $3 RETURNING feature_settings, feature_policy_version`,
        [JSON.stringify(body.settings), user.organizationId, body.baseVersion],
      );
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La configuración cambió; actualiza antes de guardar" },
          409,
        );
      }
      await client.query("COMMIT");
      return c.json({
        organizationId: user.organizationId,
        version: result.rows[0].feature_policy_version,
        settings: result.rows[0].feature_settings,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
