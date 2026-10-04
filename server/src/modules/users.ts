import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { AuthUser, Dependencies } from "../dependencies.js";
import type { PoolClient } from "pg";
import bcrypt from "bcryptjs";
import { normalizeRole } from "../security.js";
const knownRole = (role: unknown) =>
  typeof role === "string" &&
  ["ADMIN", "EDITOR", "LECTOR", "VIEWER"].includes(role.toUpperCase());
/** Serialize membership changes, then recheck the actor after any queued change. */
async function lockAdministrator(client: PoolClient, user: AuthUser) {
  await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
    user.organizationId,
  ]);
  const actor = (
    await client.query(
      "SELECT role,is_active FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [user.id, user.organizationId],
    )
  ).rows[0];
  if (!actor?.is_active) return 401;
  if (normalizeRole(actor.role) !== "ADMIN") return 403;
  return null;
}
export function registerUsersRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/users", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede consultar los miembros" }, 403);
    const result = await pool.query(
      "SELECT id,name,email,role,is_active,created_at FROM users WHERE organization_id=$1 ORDER BY created_at",
      [user.organizationId],
    );
    return c.json({ success: true, users: result.rows });
  });
  app.post("/api/users", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede crear usuarios" }, 403);
    const { name, email, password, role } = await readObjectBody(c);
    if (
      ![name, email, password].every(
        (v) => typeof v === "string" && v.trim(),
      ) ||
      password.length < 8 ||
      (role !== undefined && !knownRole(role))
    )
      return c.json(
        {
          error:
            "Nombre, correo, contraseña de 8 caracteres y rol válido requeridos",
        },
        400,
      );
    const id = `usr-${crypto.randomUUID()}`,
      resolvedRole = normalizeRole(role ?? "EDITOR");
    try {
      await pool.query(
        "INSERT INTO users(id,organization_id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,$4,$5,$6,TRUE)",
        [
          id,
          user.organizationId,
          name.trim(),
          email.trim().toLowerCase(),
          await bcrypt.hash(password, 12),
          resolvedRole,
        ],
      );
      return c.json({
        success: true,
        user: {
          id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: resolvedRole,
          isActive: true,
        },
      });
    } catch (error: any) {
      if (error.code === "23505")
        return c.json({ error: "Correo ya registrado" }, 409);
      throw error;
    }
  });
  app.patch("/api/users/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede editar usuarios" }, 403);
    const body = await readObjectBody(c);
    if (
      (body.role !== undefined && !knownRole(body.role)) ||
      (body.password !== undefined &&
        (typeof body.password !== "string" || body.password.length < 8))
    )
      return c.json({ error: "Rol o contraseña inválidos" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockAdministrator(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La cuenta ya no tiene permisos ADMIN" },
          denied,
        );
      }
      const current = (
        await client.query(
          "SELECT * FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [c.req.param("id"), user.organizationId],
        )
      ).rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return c.json({ error: "Usuario no encontrado" }, 404);
      }
      const nextRole =
          body.role === undefined
            ? normalizeRole(current.role)
            : normalizeRole(body.role),
        nextActive =
          typeof body.isActive === "boolean"
            ? body.isActive
            : current.is_active;
      if (
        current.is_active &&
        normalizeRole(current.role) === "ADMIN" &&
        (!nextActive || nextRole !== "ADMIN")
      ) {
        const others = await client.query(
          "SELECT id FROM users WHERE organization_id=$1 AND id<>$2 AND is_active=TRUE AND UPPER(TRIM(role))='ADMIN'",
          [user.organizationId, current.id],
        );
        if (!others.rows.length) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La organización debe conservar un administrador activo" },
            409,
          );
        }
      }
      const passwordHash =
        body.password === undefined
          ? current.password_hash
          : await bcrypt.hash(body.password, 12);
      const result = await client.query(
        "UPDATE users SET name=$1,role=$2,is_active=$3,password_hash=$4,updated_at=clock_timestamp() WHERE id=$5 AND organization_id=$6 RETURNING id,name,email,role,is_active,organization_id,created_at",
        [
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : current.name,
          nextRole,
          nextActive,
          passwordHash,
          current.id,
          user.organizationId,
        ],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return c.json({
        success: true,
        user: {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
          organizationId: row.organization_id,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/users/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede eliminar usuarios" }, 403);
    if (c.req.param("id") === user.id)
      return c.json({ error: "No puedes eliminar tu propia cuenta" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockAdministrator(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La cuenta ya no tiene permisos ADMIN" },
          denied,
        );
      }
      const current = (
        await client.query(
          "SELECT id,role,is_active FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [c.req.param("id"), user.organizationId],
        )
      ).rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return c.json({ error: "Usuario no encontrado" }, 404);
      }
      if (current.is_active && normalizeRole(current.role) === "ADMIN") {
        const others = await client.query(
          "SELECT id FROM users WHERE organization_id=$1 AND id<>$2 AND is_active=TRUE AND UPPER(TRIM(role))='ADMIN'",
          [user.organizationId, current.id],
        );
        if (!others.rows.length) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La organización debe conservar un administrador activo" },
            409,
          );
        }
      }
      await client.query(
        "DELETE FROM users WHERE id=$1 AND organization_id=$2",
        [current.id, user.organizationId],
      );
      await client.query("COMMIT");
      return c.json({ success: true, deletedId: current.id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
