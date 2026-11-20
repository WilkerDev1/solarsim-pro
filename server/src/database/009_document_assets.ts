import type { PoolClient } from "pg";
import { storeDocumentAssets } from "../modules/documentAssets.js";
const BATCH = 100;
/**
 * Images of the proposal document stored once per organization (shared/documentAssets.ts).
 *
 * - `document_assets`: content-addressed (sha256 of the exact text), immutable, never garbage-collected (a
 *   reference in any project or history snapshot must stay readable).
 * - Backfill moves the inline logos and attachment thumbnails of every project into assets. Content-only, like
 *   006: `version` and `updated_at` stay as they are. Every reader gets the same document (references are inlined
 *   for clients that do not announce them), so bumping them would only create false CAS conflicts and force every
 *   client to re-download the workspace.
 * - `project_version_history` is not rewritten: it is an immutable audit trail; responses inline it as well, and
 *   new checkpoints already store references.
 */
export async function documentAssets(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS document_assets (
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      sha256 CHAR(64) NOT NULL,
      content TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (organization_id, sha256)
    )
  `);
  let last = "";
  for (;;) {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      customization: unknown;
    }>(
      `SELECT id, organization_id, data_json->'customization' AS customization FROM projects
       WHERE id > $1 AND organization_id IS NOT NULL AND jsonb_typeof(data_json->'customization') = 'object'
       ORDER BY id LIMIT $2 FOR UPDATE`,
      [last, BATCH],
    );
    for (const row of rows) {
      last = row.id;
      const before = { customization: row.customization };
      const after = await storeDocumentAssets(
        client,
        row.organization_id,
        before,
        // A stored reference without its asset is left as it is: the migration never blocks the API from starting.
        { requireKnown: false },
      );
      if (after === before) continue;
      await client.query(
        "UPDATE projects SET data_json = jsonb_set(data_json, '{customization}', $1::jsonb) WHERE id = $2",
        [JSON.stringify(after.customization), row.id],
      );
    }
    if (rows.length < BATCH) return;
  }
}
