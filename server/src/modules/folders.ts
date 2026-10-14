import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";
import { lockOrganization } from "./projectRepository.js";
const folder = (r: Record<string, any>) => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  color: r.color,
  description: r.description,
  hideFromGeneral: r.hide_from_general,
  visibility: r.visibility,
  createdById: r.created_by_id,
  createdBy: r.created_by_name,
  version: r.version,
  baseVersion: r.version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
export function registerFolderRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/folders", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const rows = await pool.query(
      "SELECT * FROM project_folders WHERE organization_id=$1 AND (visibility='public' OR created_by_id=$2)",
      [user.organizationId, user.id],
    );
    return c.json({
      success: true,
      folders: rows.rows.filter((r) => !r.deleted_at).map(folder),
      deletedIds: rows.rows.filter((r) => r.deleted_at).map((r) => r.id),
    });
  });
  app.put("/api/folders/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const data = await readObjectBody(c),
      id = c.req.param("id");
    if (
      !id ||
      id.length > 64 ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 255 ||
      !["public", "private"].includes(data.visibility ?? "public") ||
      !Number.isSafeInteger(data.baseVersion) ||
      data.baseVersion < 0 ||
      (data.description != null &&
        (typeof data.description !== "string" ||
          data.description.length > 4000)) ||
      (data.color != null &&
        (typeof data.color !== "string" ||
          !/^#[a-fA-F0-9]{6}$/.test(data.color))) ||
      (data.hideFromGeneral != null &&
        typeof data.hideFromGeneral !== "boolean")
    )
      return c.json({ error: "Carpeta inválida" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const existing = (
        await client.query(
          "SELECT * FROM project_folders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, id],
        )
      ).rows[0];
      if (
        existing?.visibility === "private" &&
        existing.created_by_id !== user.id
      ) {
        await client.query("ROLLBACK");
        return c.json({ error: "Carpeta no encontrada" }, 404);
      }
      // Only the creator can make a shared folder private: ownership is not transferred by edits.
      if (
        existing &&
        data.visibility === "private" &&
        existing.created_by_id !== user.id
      ) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "Solo el creador puede hacer privada esta carpeta" },
          403,
        );
      }
      if (
        existing?.deleted_at ||
        (existing
          ? data.baseVersion !== existing.version
          : data.baseVersion !== 0)
      ) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "La carpeta cambió. Sincroniza antes de editar.",
            folder: existing && !existing.deleted_at ? folder(existing) : null,
          },
          409,
        );
      }
      const result = await client.query(
        `INSERT INTO project_folders (organization_id,id,name,color,description,hide_from_general,visibility,created_by_id,created_by_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,id) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color,description=EXCLUDED.description,hide_from_general=EXCLUDED.hide_from_general,visibility=EXCLUDED.visibility,version=project_folders.version+1,updated_at=clock_timestamp() RETURNING *`,
        [
          user.organizationId,
          id,
          data.name.trim(),
          data.color || "#10b981",
          data.description || "",
          data.hideFromGeneral ?? false,
          data.visibility ?? "public",
          user.id,
          user.name,
        ],
      );
      await client.query("COMMIT");
      return c.json({ success: true, folder: folder(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/folders/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Project mutations acquire this lock first; preserve ordering and delta cursor consistency.
      await lockOrganization(client, user.organizationId);
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const row = (
        await client.query(
          "SELECT * FROM project_folders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, c.req.param("id")],
        )
      ).rows[0];
      if (
        !row ||
        (row.visibility === "private" && row.created_by_id !== user.id)
      ) {
        await client.query("ROLLBACK");
        return c.json({ error: "Carpeta no encontrada" }, 404);
      }
      const baseVersion = Number(c.req.query("baseVersion"));
      if (
        !Number.isSafeInteger(baseVersion) ||
        baseVersion < 1 ||
        baseVersion !== row.version
      ) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "La carpeta cambió. Sincroniza antes de eliminar.",
            folder: folder(row),
          },
          409,
        );
      }
      if (!row.deleted_at) {
        await client.query(
          "UPDATE project_folders SET deleted_at=clock_timestamp(),version=version+1 WHERE organization_id=$1 AND id=$2",
          [user.organizationId, row.id],
        );
        await client.query(
          "UPDATE projects SET data_json=data_json-'folderId',version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND data_json->>'folderId'=$2",
          [user.organizationId, row.id],
        );
      }
      await client.query("COMMIT");
      return c.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
