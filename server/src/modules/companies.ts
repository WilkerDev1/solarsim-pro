import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import { readObjectBody } from "../request.js";
import {
  lockOrganizationAdmin,
  resolveMembership,
  normalizeRole,
} from "../membership.js";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
const stringFields = [
  "name",
  "commercialName",
  "rncOrId",
  "phone",
  "email",
  "address",
  "website",
  "defaultPaymentTerms",
  "defaultWarrantyNotes",
];
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function registerCompanyRoutes(app: Hono, deps: Dependencies) {
  const sign = (user: unknown) =>
    jwt.sign(user as object, deps.jwtSecret, {
      algorithm: "HS256",
      expiresIn: "7d",
    });
  app.get("/api/organizations", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    const result = await deps.pool.query(
      `SELECT o.id,o.name,o.rnc,o.profile_version AS version,
      CASE WHEN u.organization_id=o.id THEN u.role ELSE m.role END AS role
      FROM users u JOIN organizations o ON (o.id=u.organization_id OR EXISTS(SELECT 1 FROM organization_memberships x WHERE x.user_id=u.id AND x.organization_id=o.id))
      LEFT JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=o.id
      WHERE u.id=$1 AND u.is_active=TRUE AND COALESCE(m.is_active,TRUE)=TRUE ORDER BY o.name`,
      [actor.id],
    );
    return c.json({
      success: true,
      organizations: result.rows.map((r) => ({
        ...r,
        role: normalizeRole(r.role),
      })),
    });
  });
  app.post("/api/organizations", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede crear organizaciones" }, 403);
    const body = await readObjectBody(c);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 255 ||
      (body.rnc !== undefined &&
        (typeof body.rnc !== "string" || body.rnc.length > 32))
    )
      return c.json(
        { error: "Nombre requerido y RNC de hasta 32 caracteres" },
        400,
      );
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "Permisos cambiaron; vuelve a verificar la sesión" },
          denied,
        );
      }
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        actor.id,
      ]);
      const id = "org-" + crypto.randomUUID();
      await client.query(
        "INSERT INTO organizations(id,name,rnc) VALUES($1,$2,$3)",
        [id, body.name.trim(), body.rnc?.trim() || null],
      );
      await client.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
        [id, actor.id],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        organization: {
          id,
          name: body.name.trim(),
          rnc: body.rnc || "",
          role: "ADMIN",
          version: 1,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/auth/switch-organization", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    const body = await readObjectBody(c);
    if (typeof body.organizationId !== "string")
      return c.json({ error: "Organización requerida" }, 400);
    const user = await resolveMembership(
      deps.pool,
      actor.id,
      body.organizationId,
    );
    if (!user || (user.authVersion ?? 0) !== (actor.authVersion ?? 0))
      return c.json(
        { error: "No tienes acceso activo a esa organización" },
        403,
      );
    return c.json({ success: true, user, token: sign(user) });
  });
  app.get("/api/organization/profile", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    const row = (
      await deps.pool.query(
        "SELECT name,rnc,company_profile,profile_version FROM organizations WHERE id=$1",
        [actor.organizationId],
      )
    ).rows[0];
    return c.json({
      success: true,
      organizationId: actor.organizationId,
      version: row.profile_version,
      profile: {
        ...row.company_profile,
        name: row.name,
        rncOrId: row.rnc || "",
      },
    });
  });
  app.patch("/api/organization/profile", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede editar la empresa" }, 403);
    const body = await readObjectBody(c),
      profile = body.profile;
    if (
      !Number.isSafeInteger(body.baseVersion) ||
      body.baseVersion < 1 ||
      !profile ||
      typeof profile !== "object" ||
      Array.isArray(profile)
    )
      return c.json({ error: "Perfil y baseVersion requeridos" }, 400);
    if (
      typeof profile.name !== "string" ||
      !profile.name.trim() ||
      profile.name.length > 255
    )
      return c.json(
        { error: "Razón social requerida (hasta 255 caracteres)" },
        400,
      );
    const clean: Record<string, string> = {};
    for (const key of stringFields) {
      if (profile[key] !== undefined) {
        if (
          typeof profile[key] !== "string" ||
          profile[key].length >
            (key === "name" ? 255 : key === "rncOrId" ? 32 : 3000)
        )
          return c.json({ error: "Campo inválido: " + key }, 400);
        clean[key] = profile[key].trim();
      }
    }
    for (const key of ["primaryColor", "accentColor"])
      if (profile[key] !== undefined) {
        if (
          typeof profile[key] !== "string" ||
          !/^#[0-9a-f]{6}$/i.test(profile[key])
        )
          return c.json({ error: "Color inválido" }, 400);
        clean[key] = profile[key];
      }
    for (const key of ["logoBase64", "signatureSealBase64"])
      if (profile[key] !== undefined) {
        if (
          typeof profile[key] !== "string" ||
          profile[key].length > 2800000 ||
          (profile[key] &&
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
              profile[key],
            ))
        )
          return c.json(
            { error: "Imagen inválida; usa PNG, JPEG o WebP hasta 2 MB" },
            400,
          );
        clean[key] = profile[key];
      }
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "Permisos cambiaron" }, denied);
      }
      const result = await client.query(
        `UPDATE organizations SET name=$1,rnc=CASE WHEN $6 THEN $2 ELSE rnc END,company_profile=company_profile||$3::jsonb,profile_version=profile_version+1 WHERE id=$4 AND profile_version=$5 RETURNING name,rnc,company_profile,profile_version`,
        [
          clean.name,
          clean.rncOrId || null,
          JSON.stringify(clean),
          actor.organizationId,
          body.baseVersion,
          clean.rncOrId !== undefined,
        ],
      );
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error:
              "Otra persona modificó la empresa. Recarga y revisa antes de guardar.",
          },
          409,
        );
      }
      await client.query("COMMIT");
      const row = result.rows[0];
      return c.json({
        success: true,
        organizationId: actor.organizationId,
        version: row.profile_version,
        profile: {
          ...row.company_profile,
          name: row.name,
          rncOrId: row.rnc || "",
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.get("/api/organization/invitations", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede consultar invitaciones" }, 403);
    const result = await deps.pool.query(
      'SELECT id,email,role,expires_at AS "expiresAt",accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM organization_invitations WHERE organization_id=$1 ORDER BY created_at DESC',
      [actor.organizationId],
    );
    return c.json({ success: true, invitations: result.rows });
  });
  app.post("/api/organization/invitations", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede invitar miembros" }, 403);
    const body = await readObjectBody(c);
    if (
      typeof body.email !== "string" ||
      body.email.length > 255 ||
      !/^\S+@\S+\.\S+$/.test(body.email.trim()) ||
      !["ADMIN", "EDITOR", "LECTOR"].includes(body.role)
    )
      return c.json({ error: "Correo y rol válidos requeridos" }, 400);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "Permisos cambiaron" }, denied);
      }
      const token = randomBytes(32).toString("hex"),
        id = "inv-" + crypto.randomUUID();
      await client.query(
        "INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '7 days')",
        [
          id,
          actor.organizationId,
          body.email.trim().toLowerCase(),
          body.role,
          hash(token),
          actor.id,
        ],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        invitation: {
          id,
          email: body.email.trim().toLowerCase(),
          role: body.role,
        },
        code: token,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/organization/invitations/:id", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor) return c.json({ error: "No autorizado" }, 401);
    if (actor.role !== "ADMIN")
      return c.json({ error: "Solo ADMIN puede revocar invitaciones" }, 403);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockOrganizationAdmin(client, actor);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "Permisos cambiaron" }, denied);
      }
      const r = await client.query(
        "UPDATE organization_invitations SET revoked_at=clock_timestamp() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
        [c.req.param("id"), actor.organizationId],
      );
      await client.query("COMMIT");
      return r.rows.length
        ? c.json({ success: true })
        : c.json({ error: "Invitación no disponible" }, 404);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/auth/accept-invitation", async (c) => {
    const actor = await deps.authenticate(c);
    if (!actor)
      return c.json({ error: "Inicia sesión con el correo invitado" }, 401);
    const body = await readObjectBody(c);
    if (
      typeof body.code !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.code.trim())
    )
      return c.json({ error: "Código inválido" }, 400);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const target = (
        await client.query(
          "SELECT organization_id FROM organization_invitations WHERE token_hash=$1",
          [hash(body.code.trim())],
        )
      ).rows[0];
      if (!target) {
        await client.query("ROLLBACK");
        return c.json({ error: "Invitación inválida" }, 403);
      }
      await client.query(
        "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
        [target.organization_id],
      );
      const invitation = (
        await client.query(
          "SELECT * FROM organization_invitations WHERE token_hash=$1 FOR UPDATE",
          [hash(body.code.trim())],
        )
      ).rows[0];
      if (
        !invitation ||
        invitation.email !== actor.email.toLowerCase() ||
        invitation.accepted_at ||
        invitation.revoked_at ||
        new Date(invitation.expires_at).getTime() <= Date.now()
      ) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "Invitación inválida, caducada o destinada a otro correo" },
          403,
        );
      }
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        actor.id,
      ]);
      const fresh = await resolveMembership(
        client,
        actor.id,
        actor.organizationId,
      );
      if (!fresh || (fresh.authVersion ?? 0) !== (actor.authVersion ?? 0)) {
        await client.query("ROLLBACK");
        return c.json({ error: "Sesión revocada" }, 401);
      }
      const existing = await resolveMembership(
        client,
        actor.id,
        invitation.organization_id,
      );
      if (existing) {
        await client.query("ROLLBACK");
        return c.json({ error: "Ya perteneces a esta organización" }, 409);
      }
      await client.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=TRUE",
        [invitation.organization_id, actor.id, invitation.role],
      );
      await client.query(
        "UPDATE users SET role=$1 WHERE id=$2 AND organization_id=$3",
        [invitation.role, actor.id, invitation.organization_id],
      );
      await client.query(
        "UPDATE organization_invitations SET accepted_at=clock_timestamp() WHERE id=$1",
        [invitation.id],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        organizationId: invitation.organization_id,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
