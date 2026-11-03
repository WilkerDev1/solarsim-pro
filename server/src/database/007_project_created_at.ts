import type { PoolClient } from "pg";
import { canonicalProposalDate } from "../../../shared/proposalDates.js";
const BATCH = 500;
/**
 * Before 2.7.4 the INSERT stored `created_at` as the first sync time, while `data_json.createdAt` kept the date the
 * client created the proposal (possibly offline, days earlier). This restores the earlier of the two with the same
 * rule new pushes use (shared/proposalDates.ts); it never moves a date later.
 *
 * Only rows whose date actually moves get `updated_at` bumped, so they re-enter the pull delta and synced clients
 * receive the corrected date; `version` stays, so there are no CAS conflicts, and local pending edits are kept.
 *
 * Limit: a project edited after its first sync already had `data_json.createdAt` overwritten with the sync time
 * (the server echoed `created_at` and the client sent it back), so its original date no longer exists anywhere.
 * Those keep the first-sync date. Since 2.7.4 an update stores the saved `created_at` in the document.
 */
export async function projectCreatedAtBackfill(
  client: PoolClient,
): Promise<void> {
  let last = "";
  for (;;) {
    const { rows } = await client.query<{
      id: string;
      created_at: Date | null;
      client_created_at: unknown;
    }>(
      `SELECT id, created_at, data_json->'createdAt' AS client_created_at FROM projects
       WHERE id > $1 ORDER BY id LIMIT $2 FOR UPDATE`,
      [last, BATCH],
    );
    if (rows.length === 0) return;
    for (const row of rows) {
      const claimed = canonicalProposalDate(row.client_created_at);
      if (
        claimed &&
        row.created_at &&
        Date.parse(claimed) < row.created_at.getTime()
      )
        await client.query(
          "UPDATE projects SET created_at=$2, updated_at=clock_timestamp() WHERE id=$1",
          [row.id, claimed],
        );
    }
    last = rows[rows.length - 1].id;
  }
}
