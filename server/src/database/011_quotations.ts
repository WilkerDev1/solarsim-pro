import type { PoolClient } from "pg";
/**
 * Additive: quotations are their own records (docs/adr/0007-cotizaciones-entidad-propia.md). `data_json` holds the
 * normalized QuotationContent; `client_id`, `source_project_id` and `folder_id` are indexable copies of its links.
 * The number is assigned once by the API from `quotation_counters` (per organization and issue year) and never reused.
 */
export async function quotations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE quotations (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      id VARCHAR(64) NOT NULL,
      number VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL CHECK (status IN ('draft','issued','accepted','rejected','void')),
      client_id VARCHAR(64),
      source_project_id VARCHAR(64),
      folder_id VARCHAR(64),
      data_json JSONB NOT NULL,
      created_by_id VARCHAR(64) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      deleted_at TIMESTAMPTZ,
      PRIMARY KEY (organization_id,id),
      UNIQUE (organization_id,number)
    );
    CREATE INDEX quotations_updated_at_idx ON quotations (organization_id, updated_at);
    CREATE INDEX quotations_client_id_idx ON quotations (organization_id, client_id) WHERE client_id IS NOT NULL;
    CREATE INDEX quotations_folder_id_idx ON quotations (organization_id, folder_id) WHERE folder_id IS NOT NULL;
    CREATE TABLE quotation_counters (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      last_number INTEGER NOT NULL CHECK (last_number >= 0),
      PRIMARY KEY (organization_id,year)
    );
  `);
}
