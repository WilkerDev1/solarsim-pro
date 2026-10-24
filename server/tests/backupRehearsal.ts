/** Run only against an explicitly isolated socket, never a TCP database. */
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { migrateDatabase } from "../src/database/migrations.js";
import {
  LEGACY_MIRROR_FIELDS,
  equipmentTotals,
  readEquipment,
} from "../../shared/equipment/index.js";
const socket = process.argv[2];
if (
  !socket ||
  !path.isAbsolute(socket) ||
  !socket.includes("solarsim-logical-qa-") ||
  !socket.endsWith("/socket")
)
  throw new Error(
    "Provide the private socket of the isolated restore rehearsal. TCP databases are forbidden.",
  );
const pool = new pg.Pool({
  host: socket,
  user: "solarsim_qa",
  database: "solarsim_qa",
  connectionTimeoutMillis: 2000,
});
const tables = [
  "organizations",
  "users",
  "projects",
  "equipment_catalog",
  "project_version_history",
  "team_notifications",
  "sync_audit_logs",
  "utility_tariffs",
];
try {
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          Number(
            (await pool.query(`SELECT count(*) AS count FROM ${table}`)).rows[0]
              .count,
          ),
        ]),
      ),
    );
  const fingerprint = async () =>
    (
      await pool.query(
        "SELECT md5(coalesce(string_agg((data_json - 'specs')::text, '' ORDER BY id), '')) AS fingerprint FROM projects",
      )
    ).rows[0].fingerprint;
  // Migration 006 rewrites only `specs`: the equipment totals of every restored project must be the same afterwards.
  const equipment = async () =>
    Object.fromEntries(
      (
        await pool.query(
          "SELECT id, data_json->'specs' AS specs FROM projects ORDER BY id",
        )
      ).rows.map((row) => [
        row.id,
        row.specs && typeof row.specs === "object"
          ? {
              totals: equipmentTotals(readEquipment(row.specs)),
              mirror: [...LEGACY_MIRROR_FIELDS, "selectedSupplierInfo"].filter(
                (field) => field in row.specs,
              ),
            }
          : null,
      ]),
    );
  const before = await counts(),
    beforeContent = await fingerprint(),
    beforeEquipment = await equipment();
  await migrateDatabase(pool);
  assert.deepEqual(
    await counts(),
    before,
    "Migrations preserve restored business rows",
  );
  assert.equal(
    await fingerprint(),
    beforeContent,
    "Project document content (outside specs) is preserved",
  );
  const afterEquipment = await equipment();
  assert.deepEqual(
    Object.entries(afterEquipment).map(([id, item]) => [id, item?.totals]),
    Object.entries(beforeEquipment).map(([id, item]) => [id, item?.totals]),
    "Equipment totals are unchanged by migration 006",
  );
  assert.ok(
    Object.values(afterEquipment).every((item) => !item?.mirror.length),
    "No project keeps the legacy equipment mirror",
  );
  await migrateDatabase(pool);
  assert.deepEqual(await counts(), before, "Migration replay is idempotent");
  assert.equal(await fingerprint(), beforeContent);
  assert.deepEqual(await equipment(), afterEquipment);
  assert.deepEqual(
    (
      await pool.query("SELECT version FROM schema_migrations ORDER BY version")
    ).rows.map((row) => row.version),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM projects p LEFT JOIN organizations o ON p.organization_id=o.id WHERE o.id IS NULL",
        )
      ).rows[0].count,
    ),
    0,
  );
  assert.equal(
    (await pool.query("SELECT pg_is_in_recovery() AS recovering")).rows[0]
      .recovering,
    false,
  );
  console.log(
    JSON.stringify({
      result: "pass",
      counts: before,
      projectContentPreserved: true,
      equipmentTotalsPreserved: true,
      migrationReplay: "pass",
      migrations: [1, 2, 3, 4, 5, 6],
      orphanProjects: 0,
      recovering: false,
    }),
  );
} finally {
  await pool.end();
}
