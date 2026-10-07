import type { PoolClient } from "pg";
/** Secondary memberships leave legacy primary identities and project ownership untouched. */
export async function companyManagement(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS profile_version INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS organization_memberships (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN','EDITOR','LECTOR')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (organization_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id,organization_id);
    CREATE TABLE IF NOT EXISTS organization_invitations (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN','EDITOR','LECTOR')),
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_org ON organization_invitations(organization_id,created_at);
  `);
}
