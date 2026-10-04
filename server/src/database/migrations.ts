import type { Pool } from "pg";
import { baselineSchema } from "./001_baseline.js";
import { featurePolicyAndTombstones } from "./002_feature_policy_and_tombstones.js";
/** Additive, recorded migrations, guarded by a cross-process transaction lock. */
export async function migrateDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('solarsim-schema-migrations'))",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())",
    );
    const applied = new Set(
      (
        await client.query<{ version: number }>(
          "SELECT version FROM schema_migrations",
        )
      ).rows.map((r) => r.version),
    );
    for (const migration of [
      { version: 1, name: "baseline", run: baselineSchema },
      {
        version: 2,
        name: "feature_policy_and_tombstones",
        run: featurePolicyAndTombstones,
      },
    ]) {
      if (applied.has(migration.version)) continue;
      await migration.run(client);
      await client.query(
        "INSERT INTO schema_migrations(version,name) VALUES ($1,$2)",
        [migration.version, migration.name],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
