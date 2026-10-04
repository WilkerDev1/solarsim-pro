import jwt from "jsonwebtoken";
import type { Context } from "hono";
import type { Pool } from "pg";
import type { AuthUser } from "./dependencies.js";
export function normalizeRole(role?: string): AuthUser["role"] {
  const value = String(role ?? "")
    .trim()
    .toUpperCase();
  return value === "ADMIN" ? "ADMIN" : value === "EDITOR" ? "EDITOR" : "LECTOR";
}
export function createAuthenticator(pool: Pool, secret: string) {
  return async function authenticate(c: Context): Promise<AuthUser | null> {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) return null;
    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(header.slice(7), secret, {
        algorithms: ["HS256"],
      });
      if (typeof verified === "string") return null;
      payload = verified;
    } catch (error) {
      // Refresh is an explicit operation, bounded by signed issue time. Expired access never authorizes writes.
      if (
        c.req.path !== "/api/auth/refresh" ||
        !(error instanceof jwt.TokenExpiredError)
      )
        return null;
      try {
        const verified = jwt.verify(header.slice(7), secret, {
          algorithms: ["HS256"],
          ignoreExpiration: true,
        });
        if (
          typeof verified === "string" ||
          !verified.iat ||
          Date.now() / 1000 - verified.iat > 30 * 86400
        )
          return null;
        payload = verified;
      } catch {
        return null;
      }
    }
    if (typeof payload.id !== "string") return null;
    const result = await pool.query(
      "SELECT u.id,u.organization_id,u.name,u.email,u.role,u.is_active,o.name AS org_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1",
      [payload.id],
    );
    const row = result.rows[0];
    if (!row?.is_active || payload.organizationId !== row.organization_id)
      return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: normalizeRole(row.role),
      organizationId: row.organization_id,
      organizationName: row.org_name,
    };
  };
}
