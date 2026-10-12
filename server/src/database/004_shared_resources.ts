import type { PoolClient } from "pg";
/** Additive only: existing equipment/projects and identities are preserved. */
export async function sharedResources(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE project_folders (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(32), description TEXT NOT NULL DEFAULT '',
      hide_from_general BOOLEAN NOT NULL DEFAULT FALSE,
      visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
      created_by_id VARCHAR(64) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      deleted_at TIMESTAMPTZ,
      PRIMARY KEY (organization_id,id)
    );
    CREATE TABLE equipment_assets (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      kind VARCHAR(16) NOT NULL CHECK (kind IN ('datasheet','image')),
      sha256 VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(64) NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
      content BYTEA NOT NULL, created_by_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (organization_id,kind,sha256)
    );
  `);
}
