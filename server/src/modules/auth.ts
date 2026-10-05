import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { normalizeRole } from "../security.js";

export function registerAuthRoutes(app: Hono, deps: Dependencies): void {
  const { pool, authenticate, jwtSecret: JWT_SECRET } = deps;
  app.post("/api/auth/register", async (c) => {
    const body = await readObjectBody(c);
    const { name, email, password, organizationName, organizationRnc } = body;
    if (
      ![name, email, password].every(
        (v) => typeof v === "string" && v.trim(),
      ) ||
      password.length < 8
    )
      return c.json(
        {
          error:
            "Nombre, correo y contraseña de al menos 8 caracteres requeridos",
        },
        400,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orgId = `org-${crypto.randomUUID()}`,
        userId = `usr-${crypto.randomUUID()}`;
      // Public registration always creates a separate tenant. Joining an existing company requires ADMIN provisioning.
      await client.query(
        "INSERT INTO organizations (id, name, rnc, plan) VALUES ($1, $2, $3, $4)",
        [
          orgId,
          typeof organizationName === "string" && organizationName.trim()
            ? organizationName.trim()
            : `${name.trim()} — Organización`,
          organizationRnc || null,
          "enterprise",
        ],
      );
      await client.query(
        "INSERT INTO users (id, organization_id, name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5,$6,TRUE)",
        [
          userId,
          orgId,
          name.trim(),
          email.toLowerCase().trim(),
          await bcrypt.hash(password, 12),
          "ADMIN",
        ],
      );
      await client.query("COMMIT");
      const user = {
        id: userId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: "ADMIN",
        organizationId: orgId,
      };
      return c.json({
        success: true,
        token: jwt.sign(user, JWT_SECRET, {
          expiresIn: "7d",
          algorithm: "HS256",
        }),
        user,
      });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error.code === "23505")
        return c.json({ error: "Correo ya registrado" }, 409);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/auth/login", async (c) => {
    try {
      const body = await readObjectBody(c);
      const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body?.password === "string" ? body.password : "";
      if (!email || !password) {
        return c.json({ error: "Correo y contraseña requeridos" }, 400);
      }

      const res = await pool.query(
        `SELECT u.id, u.organization_id, u.name, u.email, u.password_hash, u.role, u.is_active, o.name as org_name
       FROM users u
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1`,
        [email],
      );

      if (res.rows.length === 0) {
        return c.json({ error: "Credenciales inválidas" }, 401);
      }

      const user = res.rows[0];
      if (!user.is_active) {
        return c.json(
          { error: "Esta cuenta ha sido desactivada por el administrador" },
          403,
        );
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return c.json({ error: "Credenciales inválidas" }, 401);
      }

      const token = jwt.sign(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: normalizeRole(user.role),
          organizationId: user.organization_id,
        },
        JWT_SECRET,
        { expiresIn: "7d", algorithm: "HS256" },
      );

      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: normalizeRole(user.role),
          organizationId: user.organization_id,
          organizationName: user.org_name,
        },
      });
    } catch (error: any) {
      throw error;
    }
  });

  app.get("/api/auth/me", async (c) => {
    const authUser = await authenticate(c);
    if (!authUser) {
      return c.json(
        { error: "No autorizado / Token inválido o expirado" },
        401,
      );
    }

    const res = await pool.query(
      `SELECT u.id, u.organization_id, u.name, u.email, u.role, u.is_active, o.name as org_name
     FROM users u
     JOIN organizations o ON u.organization_id = o.id
     WHERE u.id = $1`,
      [authUser.id],
    );

    if (res.rows.length === 0 || !res.rows[0].is_active) {
      return c.json({ error: "Usuario no encontrado o inactivo" }, 404);
    }

    const user = res.rows[0];
    const freshToken = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        organizationId: user.organization_id,
      },
      JWT_SECRET,
      { expiresIn: "7d", algorithm: "HS256" },
    );
    c.header("X-Renewed-Token", freshToken);

    return c.json({
      success: true,
      token: freshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        organizationId: user.organization_id,
        organizationName: user.org_name,
      },
    });
  });

  app.post("/api/auth/refresh", async (c) => {
    const user = await authenticate(c);
    if (!user)
      return c.json(
        { error: "Token inválido, revocado o fuera del período de renovación" },
        401,
      );
    const token = jwt.sign(user, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "7d",
    });
    c.header("X-Renewed-Token", token);
    return c.json({ success: true, token, user });
  });
  app.post("/api/auth/share-authorization", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json(
        { error: "El rol Lector no puede publicar propuestas" },
        403,
      );
    const policy = (
      await pool.query(
        "SELECT feature_policy_version, feature_settings FROM organizations WHERE id=$1",
        [user.organizationId],
      )
    ).rows[0];
    return c.json({
      success: true,
      userId: user.id,
      organizationId: user.organizationId,
      featurePolicy: {
        version: policy.feature_policy_version,
        settings: policy.feature_settings,
      },
    });
  });
}
