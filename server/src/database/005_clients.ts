import type { PoolClient } from "pg";
/** Additive only: proposals keep their printed client data; clientId is an optional link inside data_json. */
export async function clients(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE clients (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      id VARCHAR(64) NOT NULL,
      kind VARCHAR(16) NOT NULL DEFAULT 'persona' CHECK (kind IN ('persona','empresa')),
      name VARCHAR(255) NOT NULL,
      tax_id VARCHAR(32) NOT NULL DEFAULT '',
      phone VARCHAR(64) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      province VARCHAR(100) NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by_id VARCHAR(64) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      deleted_at TIMESTAMPTZ,
      PRIMARY KEY (organization_id,id)
    );
    CREATE INDEX clients_id_idx ON clients (id);
    CREATE INDEX clients_tax_id_idx ON clients (organization_id, tax_id) WHERE tax_id <> '';
    CREATE INDEX projects_client_id_idx ON projects (organization_id, (data_json->>'clientId')) WHERE data_json ? 'clientId';
  `);
}
