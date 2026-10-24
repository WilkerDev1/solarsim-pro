import type { PoolClient } from "pg";
import { migrateLegacySpecs } from "../../../shared/equipment/index.js";
type Specs = Parameters<typeof migrateLegacySpecs>[0];
const BATCH = 200;
/**
 * Equipment without the legacy mirror (ADR 0001): every project keeps only `specs.panels|inverters|batteries`.
 * Runs `migrateLegacySpecs`, which is invariant (no cost, price, kWp, energy or text changes) and idempotent.
 *
 * - Content-only: `version`, `updated_at` and `system_capacity_kwp` stay as they are. The document is equivalent and
 *   every reader goes through `readEquipment`, so bumping them would only create false CAS conflicts and force every
 *   client to re-download the whole workspace (the delta pull is keyed on `updated_at`).
 * - `project_version_history` is not touched: it is an immutable audit trail and its snapshots stay readable.
 * - Trashed projects are migrated too. Rows are locked in keyset batches inside the migration transaction.
 */
export async function equipmentGroups(client: PoolClient): Promise<void> {
  let last = "";
  for (;;) {
    const { rows } = await client.query<{ id: string; specs: unknown }>(
      `SELECT id, data_json->'specs' AS specs FROM projects
       WHERE id > $1 AND jsonb_typeof(data_json->'specs') = 'object'
       ORDER BY id LIMIT $2 FOR UPDATE`,
      [last, BATCH],
    );
    for (const row of rows) {
      last = row.id;
      const specs = row.specs as Specs;
      const migrated = migrateLegacySpecs(specs);
      if (migrated === specs) continue;
      await client.query(
        "UPDATE projects SET data_json = jsonb_set(data_json, '{specs}', $1::jsonb) WHERE id = $2",
        [JSON.stringify(migrated), row.id],
      );
    }
    if (rows.length < BATCH) return;
  }
}
