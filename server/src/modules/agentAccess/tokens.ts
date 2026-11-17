import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  AGENT_TOKEN_PREFIXES,
  type AgentGrantKind,
  type AgentGrantSummary,
  type AgentScope,
} from "../../../../shared/agentAccess.js";
import type { AuthUser } from "../../dependencies.js";
import { resolveMembership } from "../../membership.js";

type Db = Pool | PoolClient;
export type AgentTokenKind = keyof typeof AGENT_TOKEN_PREFIXES;
export const ACCESS_TOKEN_SECONDS = 3600;
export const REFRESH_TOKEN_DAYS = 30;

/** 256 random bits; only the SHA-256 is stored, so a database leak does not reveal usable tokens. */
export function newSecret(kind: AgentTokenKind): string {
  return `${AGENT_TOKEN_PREFIXES[kind]}${randomBytes(32).toString("base64url")}`;
}
export const hashSecret = (secret: string) =>
  createHash("sha256").update(secret, "utf8").digest("hex");

export interface GrantInput {
  user: AuthUser;
  kind: AgentGrantKind;
  name: string;
  scope: AgentScope;
  resource: string;
  clientId?: string;
  expiresAt?: Date | null;
  tokenPrefix?: string;
}

export async function createGrant(db: Db, input: GrantInput): Promise<string> {
  const id = `agr-${randomUUID()}`;
  await db.query(
    `INSERT INTO agent_grants (id,organization_id,user_id,kind,name,client_id,scope,resource,auth_version,token_prefix,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      input.user.organizationId,
      input.user.id,
      input.kind,
      input.name,
      input.clientId ?? null,
      input.scope,
      input.resource,
      input.user.authVersion ?? 0,
      input.tokenPrefix ?? null,
      input.expiresAt ?? null,
    ],
  );
  return id;
}

export async function storeToken(
  db: Db,
  grantId: string,
  kind: AgentTokenKind,
  secret: string,
  expiresAt: Date,
) {
  await db.query(
    "INSERT INTO agent_tokens (token_hash,grant_id,kind,expires_at) VALUES ($1,$2,$3,$4)",
    [hashSecret(secret), grantId, kind, expiresAt],
  );
}

/** Access + rotating refresh token for an OAuth grant. */
export async function issueOAuthTokens(db: Db, grantId: string) {
  const access = newSecret("access"),
    refresh = newSecret("refresh");
  await storeToken(
    db,
    grantId,
    "access",
    access,
    new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
  );
  await storeToken(
    db,
    grantId,
    "refresh",
    refresh,
    new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400 * 1000),
  );
  return { access, refresh };
}

export async function revokeGrant(db: Db, grantId: string) {
  await db.query(
    "UPDATE agent_grants SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1",
    [grantId],
  );
  await db.query("DELETE FROM agent_tokens WHERE grant_id=$1", [grantId]);
}

/**
 * Resolves a bearer agent token (personal or OAuth access token) to the current account.
 * Rejects revoked or expired grants, tokens issued for another resource, and grants whose account changed
 * password, role or status since (auth_version), exactly like a desktop session. A `read` grant acts as LECTOR.
 */
export async function authenticateAgentToken(
  pool: Pool,
  secret: string,
  resource: string,
): Promise<AuthUser | null> {
  if (
    !secret.startsWith(AGENT_TOKEN_PREFIXES.pat) &&
    !secret.startsWith(AGENT_TOKEN_PREFIXES.access)
  )
    return null;
  if (secret.length > 128) return null;
  const row = (
    await pool.query(
      `SELECT g.id,g.organization_id,g.user_id,g.scope,g.resource,g.auth_version,g.last_used_at
       FROM agent_tokens t JOIN agent_grants g ON g.id=t.grant_id
       WHERE t.token_hash=$1 AND t.kind IN ('pat','access') AND t.expires_at>clock_timestamp()
         AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())`,
      [hashSecret(secret)],
    )
  ).rows[0];
  if (!row || row.resource !== resource) return null;
  const user = await resolveMembership(pool, row.user_id, row.organization_id);
  if (!user || (user.authVersion ?? 0) !== row.auth_version) return null;
  // Throttled: one write per grant and minute is enough for "last used".
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60000)
    await pool.query(
      "UPDATE agent_grants SET last_used_at=clock_timestamp() WHERE id=$1",
      [row.id],
    );
  return {
    ...user,
    role: row.scope === "read" ? "LECTOR" : user.role,
    agent: { grantId: row.id, scope: row.scope },
  };
}

export function grantSummary(row: Record<string, any>): AgentGrantSummary {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    scope: row.scope,
    ...(row.token_prefix ? { tokenPrefix: row.token_prefix } : {}),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

/** Expired codes and tokens are useless; removing them keeps the tables small. Cheap, run opportunistically. */
export async function purgeExpired(db: Db) {
  await db.query(
    "DELETE FROM agent_tokens WHERE expires_at < clock_timestamp() - INTERVAL '1 day'",
  );
  await db.query(
    "DELETE FROM oauth_codes WHERE expires_at < clock_timestamp() - INTERVAL '1 day'",
  );
  await db.query(
    "DELETE FROM agent_activity WHERE created_at < clock_timestamp() - INTERVAL '180 days'",
  );
  // Dynamically registered clients that never completed a sign-in in 7 days.
  await db.query(
    `DELETE FROM oauth_clients c WHERE c.last_used_at IS NULL AND c.created_at < clock_timestamp() - INTERVAL '7 days'
     AND NOT EXISTS (SELECT 1 FROM agent_grants g WHERE g.client_id=c.client_id)`,
  );
}
