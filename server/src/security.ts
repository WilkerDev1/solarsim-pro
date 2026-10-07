import jwt from "jsonwebtoken";
import type { Context } from "hono";
import type { Pool } from "pg";
import type { AuthUser } from "./dependencies.js";
import { resolveMembership } from "./membership.js";
export { normalizeRole } from "./membership.js";
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
    if (
      typeof payload.id !== "string" ||
      typeof payload.organizationId !== "string"
    )
      return null;
    const user = await resolveMembership(
      pool,
      payload.id,
      payload.organizationId,
    );
    return user && (payload.authVersion ?? 0) === (user.authVersion ?? 0)
      ? user
      : null;
  };
}
