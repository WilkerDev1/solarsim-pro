import type { Hono } from "hono";
import { CLIENT_LIMITS, validateClientInput } from "../../../shared/clients.js";
import { isWriterRole } from "../../../shared/permissions.js";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";
import { lockOrganization } from "./projectRepository.js";
const clientRecord = (r: Record<string, any>) => ({
  id: r.id,
  organizationId: r.organization_id,
  kind: r.kind,
  name: r.name,
  taxId: r.tax_id,
  phone: r.phone,
  email: r.email,
  address: r.address,
  province: r.province,
  notes: r.notes,
  createdById: r.created_by_id,
  createdBy: r.created_by_name,
  version: r.version,
  baseVersion: r.version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
/** Organization-wide client records; proposals link to them through data_json.clientId. */
export function registerClientRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/clients", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const rows = await pool.query(
      "SELECT * FROM clients WHERE organization_id=$1 ORDER BY name, id",
      [user.organizationId],
    );
    return c.json({
      success: true,
      clients: rows.rows.filter((r) => !r.deleted_at).map(clientRecord),
      deletedIds: rows.rows.filter((r) => r.deleted_at).map((r) => r.id),
    });
  });
  app.put("/api/clients/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
      return c.json({ error: "Permisos insuficientes" }, 403);
    const data = await readObjectBody(c),
      id = c.req.param("id");
    const input = validateClientInput(data);
    if (!input.ok) return c.json({ error: input.error }, 400);
    if (
      !id ||
      id.length > CLIENT_LIMITS.id ||
      !Number.isSafeInteger(data.baseVersion) ||
      data.baseVersion < 0
    )
      return c.json({ error: "Cliente inválido" }, 400);
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
          "SELECT * FROM clients WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, id],
        )
      ).rows[0];
      // Deleted ids are never revived: proposals were already unlinked from them.
      if (
        existing?.deleted_at ||
        (existing
          ? data.baseVersion !== existing.version
          : data.baseVersion !== 0)
      ) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "El cliente cambió. Sincroniza antes de editar.",
            client:
              existing && !existing.deleted_at ? clientRecord(existing) : null,
          },
          409,
        );
      }
      const value = input.value;
      const result = await client.query(
        `INSERT INTO clients (organization_id,id,kind,name,tax_id,phone,email,address,province,notes,created_by_id,created_by_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(organization_id,id) DO UPDATE SET kind=EXCLUDED.kind,name=EXCLUDED.name,tax_id=EXCLUDED.tax_id,phone=EXCLUDED.phone,email=EXCLUDED.email,address=EXCLUDED.address,province=EXCLUDED.province,notes=EXCLUDED.notes,version=clients.version+1,updated_at=clock_timestamp() WHERE clients.version=$13 AND clients.deleted_at IS NULL RETURNING *`,
        [
          user.organizationId,
          id,
          value.kind,
          value.name,
          value.taxId,
          value.phone,
          value.email,
          value.address,
          value.province,
          value.notes,
          user.id,
          user.name,
          data.baseVersion,
        ],
      );
      // Defense in depth: the organization lock already serializes writers, but the
      // upsert itself must never overwrite a row that is not at the expected version.
      if (!result.rows[0]) {
        const current = (
          await client.query(
            "SELECT * FROM clients WHERE organization_id=$1 AND id=$2",
            [user.organizationId, id],
          )
        ).rows[0];
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "El cliente cambió. Sincroniza antes de editar.",
            client:
              current && !current.deleted_at ? clientRecord(current) : null,
          },
          409,
        );
      }
      await client.query("COMMIT");
      return c.json({ success: true, client: clientRecord(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/clients/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
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
          "SELECT * FROM clients WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, c.req.param("id")],
        )
      ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return c.json({ error: "Cliente no encontrado" }, 404);
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
            error: "El cliente cambió. Sincroniza antes de eliminar.",
            client: row.deleted_at ? null : clientRecord(row),
          },
          409,
        );
      }
      if (!row.deleted_at) {
        await client.query(
          "UPDATE clients SET deleted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2",
          [user.organizationId, row.id],
        );
        // Only the link is removed: the client data printed in each proposal is kept.
        await client.query(
          "UPDATE projects SET data_json=data_json-'clientId',version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND data_json ? 'clientId' AND data_json->>'clientId'=$2",
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
