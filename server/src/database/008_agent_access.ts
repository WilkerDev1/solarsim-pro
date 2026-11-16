import type { PoolClient } from "pg";
/**
 * Remote agent access (MCP remoto, docs/MCP_REMOTE.md). Additive only.
 * - agent_grants: one authorization per row (a personal token or an OAuth connection), scoped to user+organization.
 * - agent_tokens: SHA-256 of every bearer issued for a grant; the secret itself is never stored.
 * - oauth_clients / oauth_codes: public OAuth 2.1 clients (dynamic registration) and single-use PKCE codes.
 * - agent_activity: audit trail of every API request made with an agent token.
 */
export async function agentAccess(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE agent_grants (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind VARCHAR(16) NOT NULL CHECK (kind IN ('token','oauth')),
      name VARCHAR(120) NOT NULL,
      client_id VARCHAR(64),
      scope VARCHAR(16) NOT NULL CHECK (scope IN ('read','write')),
      resource TEXT NOT NULL,
      auth_version INTEGER NOT NULL DEFAULT 0,
      token_prefix VARCHAR(24),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX agent_grants_owner_idx ON agent_grants (organization_id, user_id);
    CREATE TABLE agent_tokens (
      token_hash CHAR(64) PRIMARY KEY,
      grant_id VARCHAR(64) NOT NULL REFERENCES agent_grants(id) ON DELETE CASCADE,
      kind VARCHAR(16) NOT NULL CHECK (kind IN ('pat','access','refresh')),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX agent_tokens_grant_idx ON agent_tokens (grant_id);
    CREATE TABLE oauth_clients (
      client_id VARCHAR(64) PRIMARY KEY,
      client_name VARCHAR(120) NOT NULL,
      redirect_uris JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      last_used_at TIMESTAMPTZ
    );
    CREATE TABLE oauth_codes (
      code_hash CHAR(64) PRIMARY KEY,
      client_id VARCHAR(64) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      grant_id VARCHAR(64) NOT NULL REFERENCES agent_grants(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      code_challenge VARCHAR(128) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE TABLE agent_activity (
      id BIGSERIAL PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL,
      grant_id VARCHAR(64),
      tool VARCHAR(64),
      client_label VARCHAR(64),
      method VARCHAR(8) NOT NULL,
      route VARCHAR(128) NOT NULL,
      status INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX agent_activity_org_idx ON agent_activity (organization_id, created_at DESC);
  `);
}
