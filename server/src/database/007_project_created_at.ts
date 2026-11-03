import type { PoolClient } from "pg";
import { canonicalProposalDate } from "../../../shared/proposalDates.js";
const BATCH = 500;
/**
 * Before 2.7.4 the INSERT stored `created_at` as the first sync time, while `data_json.createdAt` kept the date the
 * client created the proposal (possibly offline, days earlier). This restores the earlier of the two with the same
 * rule new pushes use (shared/proposalDates.ts); it never moves a date later.
 *
 * Content-only: `version` and `updated_at` stay as they are, so no false CAS conflicts and no workspace re-download.
 */
export async function projectCreatedAtBackfill(
  client: PoolClient,
): Promise<void> {
  let last = "";
  for (;;) {
    const { rows } = await client.query<{
      id: string;
      created_at: Date;
      client_created_at: unknown;
    }>(
      `SELECT id, created_at, data_json->'createdAt' AS client_created_at FROM projects
       WHERE id > $1 ORDER BY id LIMIT $2 FOR UPDATE`,
      [last, BATCH],
    );
    if (rows.length === 0) return;
    for (const row of rows) {
      const claimed = canonicalProposalDate(row.client_created_at);
      if (claimed && Date.parse(claimed) < row.created_at.getTime())
        await client.query("UPDATE projects SET created_at=$2 WHERE id=$1", [
          row.id,
          claimed,
        ]);
    }
    last = rows[rows.length - 1].id;
  }
}
