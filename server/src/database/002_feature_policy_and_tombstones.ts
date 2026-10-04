import type { PoolClient } from "pg";
export async function featurePolicyAndTombstones(
  client: PoolClient,
): Promise<void> {
  await client.query(`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS feature_settings JSONB NOT NULL DEFAULT '{"selfConsumptionProjection":false}'::jsonb;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS feature_policy_version INTEGER NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS project_tombstones (
        id VARCHAR(128) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tombstone_org_deleted ON project_tombstones(organization_id, deleted_at);
      ALTER TABLE equipment_catalog ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS equipment_tombstones (
        id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(organization_id,id)
      );
    `);
}
