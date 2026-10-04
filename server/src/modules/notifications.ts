import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";

export function registerNotificationsRoutes(
  app: Hono,
  deps: Dependencies,
): void {
  const { pool, authenticate } = deps;
  app.get("/api/notifications", async (c) => {
    const authUser = await authenticate(c);
    if (!authUser) {
      return c.json({ error: "No autorizado" }, 401);
    }

    const res = await pool.query(
      `SELECT id, organization_id, user_id, project_id, project_code, client_name,
            author_name, action, message, read, created_at
     FROM team_notifications
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
      [authUser.organizationId],
    );

    return c.json({ success: true, notifications: res.rows });
  });

  app.patch("/api/notifications/mark-read", async (c) => {
    const authUser = await authenticate(c);
    if (!authUser) {
      return c.json({ error: "No autorizado" }, 401);
    }

    await pool.query(
      `UPDATE team_notifications SET read = TRUE WHERE organization_id = $1`,
      [authUser.organizationId],
    );

    return c.json({
      success: true,
      message: "Notificaciones marcadas como leídas",
    });
  });
}
