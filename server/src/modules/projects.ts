import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import {
  canonicalProject,
  checkpoint,
  hardDelete,
  lockOrganization,
  saveProject,
  type ProjectRow,
} from "./projectRepository.js";
const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 128;
export function registerProjectsRoutes(app: Hono, deps: Dependencies): void {
  const { pool, authenticate } = deps;
  app.post("/api/sync/pull", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const body = await readObjectBody(c).catch((): Record<string, any> => ({}));
    const since = body.lastSyncTimestamp ?? "1970-01-01T00:00:00.000Z";
    if (typeof since !== "string" || !Number.isFinite(Date.parse(since)))
      return c.json({ error: "Cursor inválido" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      await hardDelete(client, user, "expired");
      const cursor = (
        await client.query(
          "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as cursor",
        )
      ).rows[0].cursor;
      const rows = await client.query<ProjectRow>(
        "SELECT * FROM projects WHERE organization_id=$1 AND updated_at >= $2::timestamptz AND updated_at <= $3::timestamptz ORDER BY updated_at, id",
        [user.organizationId, since, cursor],
      );
      // Tombstones are permanent and returned in full: a machine offline for years still cannot resurrect a purged document.
      const tombstones = await client.query(
        "SELECT id FROM project_tombstones WHERE organization_id=$1",
        [user.organizationId],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        serverTimestamp: cursor,
        projects: rows.rows.map(canonicalProject),
        deletedIds: tombstones.rows.map((r) => r.id),
        count: rows.rows.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/sync/push", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const { projects } = await readObjectBody(c);
    if (
      !Array.isArray(projects) ||
      projects.length > 200 ||
      projects.some((p) => !p || !validId(p.id) || !p.client || !p.specs)
    )
      return c.json({ error: "Lote de proyectos inválido (máximo 200)" }, 400);
    const client = await pool.connect();
    const results: Record<string, any>[] = [];
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      for (const input of [...projects].sort((a, b) =>
        a.id.localeCompare(b.id),
      )) {
        // Also serialize an unused global ID across tenants, preventing concurrent insert races.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `solarsim-project-id:${input.id}`,
        ]);
        const existing = (
          await client.query<ProjectRow>(
            "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
            [input.id],
          )
        ).rows[0];
        const deleted =
          (
            await client.query(
              "SELECT id FROM project_tombstones WHERE id=$1",
              [input.id],
            )
          ).rows.length > 0;
        const conflict = (reason: string, row?: ProjectRow) =>
          results.push({
            id: input.id,
            originalId: input.id,
            status: "conflict",
            reason,
            localVersion: input.baseVersion ?? null,
            ...(row
              ? {
                  serverVersion: row.version,
                  serverProject: canonicalProject(row),
                  lastModifiedByName: row.last_modified_by_name,
                  lastModifiedAt: row.updated_at.toISOString(),
                }
              : {}),
          });
        if (deleted) {
          conflict("deleted");
          continue;
        }
        if (
          (input.organizationId &&
            input.organizationId !== user.organizationId) ||
          (existing && existing.organization_id !== user.organizationId)
        ) {
          conflict("organization_mismatch");
          continue;
        }
        if (existing && input.forceNewVersion) {
          const id = `${input.id.slice(0, 80)}-fork-${crypto.randomUUID()}`;
          const project = await saveProject(client, user, {
            ...input,
            id,
            forceNewVersion: false,
          });
          results.push({
            id,
            originalId: input.id,
            status: "forked",
            version: 1,
            project,
          });
          continue;
        }
        if (
          existing &&
          (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 1)
        ) {
          conflict("base_version_required", existing);
          continue;
        }
        // forceOverwrite never bypasses CAS; the conflict resolver must acknowledge the current server version first.
        if (existing && input.baseVersion !== existing.version) {
          conflict("version_conflict", existing);
          continue;
        }
        const project = await saveProject(client, user, input, existing);
        results.push({
          id: input.id,
          originalId: input.id,
          status: existing ? "updated" : "created",
          version: project.version,
          project,
        });
      }
      await client.query("COMMIT");
      return c.json({
        success: true,
        results,
        syncedCount: results.filter((r) => r.status !== "conflict").length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/projects/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      const row = (
        await client.query<ProjectRow>(
          "SELECT * FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [c.req.param("id"), user.organizationId],
        )
      ).rows[0];
      if (!row) {
        const tombstoned =
          (
            await client.query(
              "SELECT id FROM project_tombstones WHERE id=$1 AND organization_id=$2",
              [c.req.param("id"), user.organizationId],
            )
          ).rows.length > 0;
        await client.query("ROLLBACK");
        return tombstoned
          ? c.json({ success: true, deletedIds: [c.req.param("id")] })
          : c.json({ error: "Proyecto no encontrado" }, 404);
      }
      const baseVersion = Number(c.req.query("baseVersion"));
      if (!Number.isSafeInteger(baseVersion) || baseVersion !== row.version) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "Actualiza antes de eliminar",
            serverVersion: row.version,
            serverProject: canonicalProject(row),
          },
          409,
        );
      }
      if (c.req.query("permanent") === "true") {
        if (!row.is_deleted) {
          await client.query("ROLLBACK");
          return c.json(
            {
              error: "Solo se elimina permanentemente desde papelera",
              serverVersion: row.version,
              serverProject: canonicalProject(row),
            },
            409,
          );
        }
        const ids = await hardDelete(client, user, "id", row.id);
        await client.query("COMMIT");
        return c.json({ success: true, deletedIds: ids });
      }
      const project = row.is_deleted
        ? canonicalProject(row)
        : await saveProject(
            client,
            user,
            { ...row.data_json, id: row.id, isDeleted: true },
            row,
          );
      await client.query("COMMIT");
      return c.json({ success: true, version: project.version, project });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/projects/:id/restore", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      const row = (
        await client.query<ProjectRow>(
          "SELECT * FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [c.req.param("id"), user.organizationId],
        )
      ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return c.json({ error: "Proyecto no encontrado" }, 404);
      }
      const baseVersion = Number(c.req.query("baseVersion"));
      if (!Number.isSafeInteger(baseVersion) || baseVersion !== row.version) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "Actualiza antes de restaurar",
            serverVersion: row.version,
            serverProject: canonicalProject(row),
          },
          409,
        );
      }
      const project = row.is_deleted
        ? await saveProject(
            client,
            user,
            { ...row.data_json, id: row.id, isDeleted: false },
            row,
          )
        : canonicalProject(row);
      await client.query("COMMIT");
      return c.json({ success: true, version: project.version, project });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/trash", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      const deletedIds = await hardDelete(client, user, "trash");
      await client.query("COMMIT");
      return c.json({
        success: true,
        deletedCount: deletedIds.length,
        deletedIds,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.get("/api/projects/:id/history", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const result = await pool.query(
      "SELECT h.* FROM project_version_history h JOIN projects p ON p.id=h.project_id WHERE h.project_id=$1 AND p.organization_id=$2 ORDER BY h.version_number DESC",
      [c.req.param("id"), user.organizationId],
    );
    return c.json({ success: true, history: result.rows });
  });
  app.post("/api/projects/:id/history/:versionId/restore", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const body = await readObjectBody(c).catch((): Record<string, any> => ({}));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockOrganization(client, user.organizationId);
      const row = (
        await client.query<ProjectRow>(
          "SELECT * FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [c.req.param("id"), user.organizationId],
        )
      ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return c.json({ error: "Proyecto no encontrado" }, 404);
      }
      if (body.baseVersion !== row.version) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "Actualiza antes de restaurar",
            serverVersion: row.version,
            serverProject: canonicalProject(row),
          },
          409,
        );
      }
      const snapshot = (
        await client.query(
          "SELECT data_json FROM project_version_history WHERE id=$1 AND project_id=$2",
          [c.req.param("versionId"), row.id],
        )
      ).rows[0];
      if (!snapshot) {
        await client.query("ROLLBACK");
        return c.json({ error: "Versión no encontrada" }, 404);
      }
      const project = await saveProject(
        client,
        user,
        { ...snapshot.data_json, id: row.id, isDeleted: row.is_deleted },
        row,
      );
      await client.query("COMMIT");
      return c.json({ success: true, project, version: project.version });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
