import type { PoolClient } from "pg";
/**
 * Additive: reusable quotation templates and signatures/stamps per organization (docs/QUOTATIONS.md). Same shape as
 * `quotations`: `data_json` holds the normalized content, `version` drives CAS writes, `deleted_at` is a soft delete
 * that the delta read (`?since=`) reports as `deletedIds`. Images and attachments travel as `asset:sha256:`
 * references stored in `document_assets` (migration 009).
 */
export async function quotationLibrary(client: PoolClient): Promise<void> {
  for (const table of ["quotation_templates", "quotation_signatures"]) {
    await client.query(`
      CREATE TABLE ${table} (
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        id VARCHAR(64) NOT NULL,
        data_json JSONB NOT NULL,
        created_by_id VARCHAR(64) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        deleted_at TIMESTAMPTZ,
        PRIMARY KEY (organization_id,id)
      );
      CREATE INDEX ${table}_updated_at_idx ON ${table} (organization_id, updated_at);
    `);
  }
}
