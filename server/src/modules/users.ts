import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import bcrypt from "bcryptjs";
import { normalizeRole, lockOrganizationAdmin } from "../membership.js";
const knownRole = (role: unknown) =>
  typeof role === "string" &&
  ["ADMIN", "EDITOR", "LECTOR", "VIEWER"].includes(role.toUpperCase());
const roster = `SELECT u.id,u.name,u.email,u.password_hash,u.organization_id,u.created_at,
  CASE WHEN u.organization_id=$1 THEN u.role ELSE m.role END AS role,
  (u.is_active AND COALESCE(m.is_active,TRUE)) AS is_active,
  (u.organization_id=$1 AND NOT EXISTS(SELECT 1 FROM organization_memberships x WHERE x.user_id=u.id AND x.organization_id<>u.organization_id)) AS can_edit_identity
  FROM users u LEFT JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=$1
  WHERE (u.organization_id=$1 OR m.user_id IS NOT NULL)`;
const publicMember = (row: any, org: string) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: normalizeRole(row.role),
  isActive: row.is_active,
  organizationId: org,
  createdAt: row.created_at,
  canEditIdentity: row.can_edit_identity,
});
export function registerUsersRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/users", async (c) => {
    const actor = await authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede consultar los miembros" }, 403);
    const result = await pool.query(roster + " ORDER BY u.created_at", [
      actor.organizationId,
    ]);
    // Preserve the legacy snake-case fields while exposing contextual membership restrictions.
    return c.json({
      success: true,
      users: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: normalizeRole(r.role),
        is_active: r.is_active,
        created_at: r.created_at,
        canEditIdentity: r.can_edit_identity,
        organizationId: actor.organizationId,
      })),
    });
  });
  app.post("/api/users", async (c) => {
    const actor = await authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede crear usuarios" }, 403);
    const { name, email, password, role } = await readObjectBody(c);
    if (
      ![name, email, password].every(
        (v) => typeof v === "string" && v.trim(),
      ) ||
      name.length > 255 ||
      email.length > 255 ||
      !/^\S+@\S+\.\S+$/.test(email.trim()) ||
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
    const passwordHash = await bcrypt.hash(password, 12),
      id = "usr-" + crypto.randomUUID(),
      resolvedRole = normalizeRole(role ?? "EDITOR");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La cuenta ya no tiene permisos ADMIN" },
          denied,
        );
      }
      await client.query(
        "INSERT INTO users(id,organization_id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,$4,$5,$6,TRUE)",
        [
          id,
          actor.organizationId,
          name.trim(),
          email.trim().toLowerCase(),
          passwordHash,
          resolvedRole,
        ],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        user: {
          id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: resolvedRole,
          isActive: true,
          canEditIdentity: true,
        },
      });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error.code === "23505")
        return c.json(
          {
            error:
              "Correo ya registrado. Usa una invitación para incorporar una cuenta existente.",
          },
          409,
        );
      throw error;
    } finally {
      client.release();
    }
  });
  app.patch("/api/users/:id", async (c) => {
    const actor = await authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede editar miembros" }, 403);
    const body = await readObjectBody(c);
    if (
      (body.role !== undefined && !knownRole(body.role)) ||
      (body.password !== undefined &&
        (typeof body.password !== "string" || body.password.length < 8)) ||
      (body.name !== undefined &&
        (typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 255)) ||
      (body.isActive !== undefined && typeof body.isActive !== "boolean")
    )
      return c.json(
        { error: "Nombre, rol, estado o contraseña inválidos" },
        400,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La cuenta ya no tiene permisos ADMIN" },
          denied,
        );
      }
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        c.req.param("id"),
      ]);
      const current = (
        await client.query(roster + " AND u.id=$2", [
          actor.organizationId,
          c.req.param("id"),
        ])
      ).rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return c.json({ error: "Miembro no encontrado" }, 404);
      }
      if (
        !current.can_edit_identity &&
        (body.password !== undefined ||
          (body.name !== undefined && body.name.trim() !== current.name))
      ) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error:
              "Esta cuenta pertenece a otras empresas. Aquí solo puedes editar sus permisos y acceso a esta organización.",
          },
          403,
        );
      }
      const nextRole =
          body.role === undefined
            ? normalizeRole(current.role)
            : normalizeRole(body.role),
        nextActive = body.isActive ?? current.is_active;
      if (
        current.is_active &&
        normalizeRole(current.role) === "ADMIN" &&
        (!nextActive || nextRole !== "ADMIN")
      ) {
        const others = (
          await client.query(roster + " AND u.id<>$2", [
            actor.organizationId,
            current.id,
          ])
        ).rows.filter((r) => r.is_active && normalizeRole(r.role) === "ADMIN");
        if (!others.length) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La organización debe conservar un administrador activo" },
            409,
          );
        }
      }
      if (current.organization_id === actor.organizationId) {
        await client.query(
          "UPDATE users SET name=$1,role=$2,is_active=$3,password_hash=$4,auth_version=auth_version+$5,updated_at=clock_timestamp() WHERE id=$6",
          [
            current.can_edit_identity && body.name
              ? body.name.trim()
              : current.name,
            nextRole,
            current.can_edit_identity ? nextActive : true,
            body.password
              ? await bcrypt.hash(body.password, 12)
              : current.password_hash,
            body.password ? 1 : 0,
            current.id,
          ],
        );
      }
      await client.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role,is_active) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=EXCLUDED.is_active",
        [actor.organizationId, current.id, nextRole, nextActive],
      );
      if (!nextActive || nextRole !== normalizeRole(current.role))
        await client.query(
          "UPDATE organization_invitations SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
          [actor.organizationId, current.email.toLowerCase()],
        );
      await client.query("COMMIT");
      return c.json({
        success: true,
        user: publicMember(
          {
            ...current,
            name:
              current.can_edit_identity && body.name
                ? body.name.trim()
                : current.name,
            role: nextRole,
            is_active: nextActive,
          },
          actor.organizationId,
        ),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/users/:id", async (c) => {
    const actor = await authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede retirar miembros" }, 403);
    if (c.req.param("id") === actor.id)
      return c.json({ error: "No puedes retirar tu propio acceso" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "La cuenta ya no tiene permisos ADMIN" },
          denied,
        );
      }
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        c.req.param("id"),
      ]);
      const current = (
        await client.query(roster + " AND u.id=$2", [
          actor.organizationId,
          c.req.param("id"),
        ])
      ).rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return c.json({ error: "Miembro no encontrado" }, 404);
      }
      if (current.is_active && normalizeRole(current.role) === "ADMIN") {
        const others = (
          await client.query(roster + " AND u.id<>$2", [
            actor.organizationId,
            current.id,
          ])
        ).rows.filter((r) => r.is_active && normalizeRole(r.role) === "ADMIN");
        if (!others.length) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La organización debe conservar un administrador activo" },
            409,
          );
        }
      }
      await client.query(
        "UPDATE organization_invitations SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
        [actor.organizationId, current.email.toLowerCase()],
      );
      if (current.can_edit_identity)
        await client.query(
          "UPDATE users SET is_active=FALSE,updated_at=clock_timestamp() WHERE id=$1",
          [current.id],
        );
      else if (current.organization_id === actor.organizationId)
        await client.query(
          "INSERT INTO organization_memberships(organization_id,user_id,role,is_active) VALUES($1,$2,$3,FALSE) ON CONFLICT(organization_id,user_id) DO UPDATE SET is_active=FALSE",
          [actor.organizationId, current.id, normalizeRole(current.role)],
        );
      else
        await client.query(
          "DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
          [actor.organizationId, current.id],
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
