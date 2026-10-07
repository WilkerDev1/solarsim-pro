import type { Pool, PoolClient } from "pg";
import type { AuthUser } from "./dependencies.js";
export function normalizeRole(role?: string): AuthUser["role"] {
  const value = String(role ?? "")
    .trim()
    .toUpperCase();
  return value === "ADMIN" ? "ADMIN" : value === "EDITOR" ? "EDITOR" : "LECTOR";
}
/** Legacy primary roles remain authoritative; secondary access requires an active membership. */
export async function resolveMembership(
  db: Pool | PoolClient,
  id: string,
  organizationId: string,
): Promise<AuthUser | null> {
  const result = await db.query(
    `SELECT u.id,u.name,u.email,u.auth_version,
    CASE WHEN u.organization_id=o.id THEN u.role ELSE m.role END AS role,
    o.id AS organization_id,o.name AS org_name
    FROM users u JOIN organizations o ON o.id=$2
    LEFT JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=o.id
    WHERE u.id=$1 AND u.is_active=TRUE
      AND (u.organization_id=o.id OR m.user_id IS NOT NULL)
      AND COALESCE(m.is_active,TRUE)=TRUE`,
    [id, organizationId],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        role: normalizeRole(row.role),
        organizationId: row.organization_id,
        organizationName: row.org_name,
        authVersion: row.auth_version,
      }
    : null;
}
export async function lockOrganizationAdmin(
  client: PoolClient,
  user: AuthUser,
) {
  await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
    user.organizationId,
  ]);
  const actor = await resolveMembership(client, user.id, user.organizationId);
  if (!actor || (actor.authVersion ?? 0) !== (user.authVersion ?? 0))
    return 401;
  return actor.role === "ADMIN" ? null : 403;
}

/** Revalidate after queues/locks, and hold identity/membership permissions until commit. */
export async function lockCurrentMembership(
  client: PoolClient,
  user: AuthUser,
  write = true,
) {
  await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
    user.organizationId,
  ]);
  await client.query("SELECT id FROM users WHERE id=$1 FOR SHARE", [user.id]);
  const current = await resolveMembership(client, user.id, user.organizationId);
  if (!current || (current.authVersion ?? 0) !== (user.authVersion ?? 0))
    return 401;
  return write && current.role === "LECTOR" ? 403 : null;
}
