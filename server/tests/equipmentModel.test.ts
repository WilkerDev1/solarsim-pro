import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrateDatabase } from "../src/database/migrations.js";
import {
  LEGACY_MIRROR_FIELDS,
  equipmentTotals,
  readEquipment,
} from "../../shared/equipment/index.js";
import { asClient } from "./helpers/clientHeader.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";

const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let database: EphemeralPostgres;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;

const group = (id: string, extra: Record<string, unknown>) => ({
  id,
  brandModel: `Modelo ${id}`,
  unitPriceUSD: 100,
  ...extra,
});
const base = {
  annualDegradation: 0.5,
  systemLifeYears: 25,
  pricingMode: "components",
};
// What a 2.7.0 client persisted: groups plus the mirror of the first one, or only the mirror (2.6.0 and older).
const fixtures: Record<string, Record<string, unknown> | null> = {
  "legacy-only": {
    ...base,
    panelBrandModel: "Canadian Solar 620W",
    panelPowerW: 620,
    panelCount: 20,
    panelUnitPriceUSD: 95,
    inverterBrandModel: "Huawei 10kW",
    inverterPowerKW: 10,
    inverterCount: 1,
    hasBattery: false,
  },
  mixed: {
    ...base,
    hasBattery: true,
    panels: [group("p1", { powerW: 600, count: 10 })],
    inverters: [group("i1", { powerKW: 5, count: 2 })],
    batteries: [group("b1", { capacityKWh: 5, count: 3, dodPct: 90 })],
    panelBrandModel: "Modelo p1",
    panelPowerW: 600,
    panelCount: 10,
    inverterBrandModel: "Modelo i1",
    inverterPowerKW: 5,
    inverterCount: 2,
    batteryBrandModel: "Modelo b1",
    batteryCapacityKWh: 5,
    batteryCount: 3,
    batteryDOD: 90,
    selectedSupplierInfo: {
      panel: { supplierName: "Mayorista", priceUSD: 90 },
    },
  },
  "multi-group": {
    ...base,
    hasBattery: true,
    panels: [
      group("p1", { powerW: 600, count: 10 }),
      group("p2", { powerW: 550, count: 4 }),
    ],
    inverters: [
      group("i1", { powerKW: 5, count: 1 }),
      group("i2", { powerKW: 8, count: 2 }),
    ],
    batteries: [
      group("b1", { capacityKWh: 5, count: 2 }),
      group("b2", { capacityKWh: 10, count: 1 }),
    ],
    panelPowerW: 600,
    panelCount: 10,
    inverterPowerKW: 5,
    inverterCount: 1,
    batteryCapacityKWh: 5,
    batteryCount: 2,
  },
  "no-battery": {
    ...base,
    hasBattery: false,
    panels: [group("p1", { powerW: 550, count: 8 })],
    inverters: [group("i1", { powerKW: 4, count: 1 })],
    panelPowerW: 550,
    panelCount: 8,
    inverterPowerKW: 4,
    inverterCount: 1,
  },
  "battery-off-with-data": {
    ...base,
    hasBattery: false,
    panelPowerW: 500,
    panelCount: 4,
    batteryBrandModel: "Banco apagado",
    batteryCapacityKWh: 10,
    batteryCount: 2,
  },
  "already-clean": {
    ...base,
    hasBattery: false,
    panels: [group("p1", { powerW: 600, count: 6 })],
    inverters: [group("i1", { powerKW: 3, count: 1 })],
  },
  "specs-null": null,
};
const stored = (specs: Record<string, unknown> | null, id: string) => ({
  id,
  client: { name: `Cliente ${id}`, projectId: `SP-${id}` },
  monthlyConsumption: [1200, 1300],
  financials: { discount: 0 },
  ...(specs === null ? { specs: null } : { specs }),
});
const mirrorKeys = [
  ...LEGACY_MIRROR_FIELDS,
  "selectedSupplierInfo",
] as string[];
const specsOf = async (id: string) =>
  (
    await pool.query(
      "SELECT data_json->'specs' AS specs FROM projects WHERE id=$1",
      [id],
    )
  ).rows[0].specs;
const rowOf = async (id: string) =>
  (
    await pool.query(
      "SELECT version, updated_at, system_capacity_kwp, data_json - 'specs' AS rest, is_deleted FROM projects WHERE id=$1",
      [id],
    )
  ).rows[0];
const fingerprint = async (table: string) =>
  (
    await pool.query(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS fp FROM ${table} t`,
    )
  ).rows[0].fp;
const reapply006 = async () => {
  await pool.query("DELETE FROM schema_migrations WHERE version=6");
  await migrateDatabase(pool);
};

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-equipment-model");
    pool = database.pool;
    await migrateDatabase(pool);
    app = asClient(createApp({ pool, jwtSecret: secret, logging: false }));
  },
  { timeout: 30000 },
);
after(async () => {
  await database?.stop();
});

test("migration 006 turns every stored project into groups-only, without changing a result, version or timestamp", async () => {
  await pool.query(
    "INSERT INTO organizations (id,name) VALUES ('org-a','A'),('org-b','B')",
  );
  await pool.query(
    "INSERT INTO users (id,organization_id,name,email,password_hash,role) VALUES ('usr-a','org-a','Ana','ana@e.test','h','ADMIN')",
  );
  const ids = Object.keys(fixtures);
  for (const [index, id] of ids.entries())
    await pool.query(
      `INSERT INTO projects (id,organization_id,created_by_id,created_by_name,last_modified_by_name,client_name,system_capacity_kwp,version,data_json,is_deleted)
       VALUES ($1,$2,'usr-a','Ana','Ana','C',7.5,$3,$4,$5)`,
      [
        id,
        index % 2 ? "org-b" : "org-a",
        index + 2,
        JSON.stringify(stored(fixtures[id], id)),
        id === "mixed",
      ],
    );
  // More than one 200-row batch, all legacy-only, so the keyset loop crosses its boundary.
  await pool.query(
    `INSERT INTO projects (id,organization_id,created_by_name,last_modified_by_name,client_name,version,data_json)
     SELECT 'bulk-'||lpad(n::text,4,'0'),'org-a','Ana','Ana','C',1,
       jsonb_build_object('client',jsonb_build_object('name','C'),'specs',jsonb_build_object('panelPowerW',600,'panelCount',n,'inverterPowerKW',5,'inverterCount',1,'hasBattery',false))
     FROM generate_series(1,450) n`,
  );
  await pool.query(
    "INSERT INTO project_version_history (id,project_id,version_number,label,author_name,data_json) VALUES ('h1','legacy-only',1,'v1','Ana',$1)",
    [JSON.stringify(stored(fixtures["legacy-only"], "legacy-only"))],
  );
  const all = [...ids, "bulk-0001", "bulk-0200", "bulk-0201", "bulk-0450"];
  const before = new Map<string, any>();
  for (const id of all) {
    const specs = await specsOf(id);
    before.set(id, {
      specs,
      row: await rowOf(id),
      totals: specs ? equipmentTotals(readEquipment(specs)) : null,
    });
  }
  const historyBefore = await fingerprint("project_version_history");
  const catalogBefore = await fingerprint("equipment_catalog");

  await reapply006();

  assert.deepEqual(
    (
      await pool.query(
        "SELECT version,name FROM schema_migrations WHERE version=6",
      )
    ).rows,
    [{ version: 6, name: "equipment_groups" }],
  );
  for (const id of all) {
    const after = await specsOf(id);
    const prior = before.get(id);
    assert.deepEqual(
      await rowOf(id),
      prior.row,
      `${id}: version, timestamps, capacity and the rest of the document are untouched`,
    );
    if (prior.specs === null) {
      assert.equal(after, null, `${id}: nothing to migrate`);
      continue;
    }
    for (const key of mirrorKeys)
      assert.ok(!(key in after), `${id}: ${key} removed`);
    assert.ok(
      after.panels.length >= 1 && after.inverters.length >= 1,
      `${id}: groups present`,
    );
    assert.deepEqual(
      equipmentTotals(readEquipment(after)),
      prior.totals,
      `${id}: equipmentTotals unchanged`,
    );
    for (const key of [
      "annualDegradation",
      "systemLifeYears",
      "pricingMode",
      "hasBattery",
    ].filter((k) => k in prior.specs))
      assert.deepEqual(
        after[key],
        prior.specs[key],
        `${id}: system parameter ${key} kept`,
      );
  }
  // Pre-existing groups are never rewritten; the multi-group project keeps every group in order.
  const multi = await specsOf("multi-group");
  assert.deepEqual(
    multi.panels.map((g: any) => g.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    multi.batteries.map((g: any) => g.id),
    ["b1", "b2"],
  );
  assert.equal(multi.panels[0].unitPriceUSD, 100);
  // Legacy-only builds its groups; a switched-off battery with its own data keeps a group that readEquipment hides.
  assert.equal((await specsOf("legacy-only")).panels[0].unitPriceUSD, 95);
  const offBattery = await specsOf("battery-off-with-data");
  assert.equal(offBattery.batteries[0].capacityKWh, 10);
  assert.deepEqual(readEquipment(offBattery).batteries, []);
  assert.equal((await specsOf("no-battery")).batteries, undefined);
  // The trashed project is migrated too, and the immutable history and catalog are not touched.
  assert.equal((await rowOf("mixed")).is_deleted, true);
  assert.equal(await fingerprint("project_version_history"), historyBefore);
  assert.equal(await fingerprint("equipment_catalog"), catalogBefore);

  // Idempotent: replaying 006 changes no byte.
  const once = await fingerprint("projects");
  await reapply006();
  assert.equal(await fingerprint("projects"), once);
  await migrateDatabase(pool);
  assert.equal(await fingerprint("projects"), once);
});

test("project capacity comes from the groups the client saves, not from the legacy mirror", async () => {
  const admin = (await (
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Capacidad",
        email: "capacidad@example.test",
        password: "isolated-password",
      }),
    })
  ).json()) as any;
  const push = async (
    id: string,
    specs: Record<string, unknown>,
    baseVersion?: number,
  ) => {
    const response = await app.request("/api/sync/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projects: [
          {
            id,
            client: { name: "Cliente", projectId: "SP-CAP" },
            monthlyConsumption: Array(12).fill(500),
            specs,
            ...(baseVersion ? { baseVersion } : {}),
          },
        ],
      }),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as any).results[0];
  };
  const capacity = async (id: string) =>
    Number(
      (
        await pool.query(
          "SELECT system_capacity_kwp FROM projects WHERE id=$1",
          [id],
        )
      ).rows[0].system_capacity_kwp,
    );
  // Groups only (what 2.7.1 clients save): 10 x 600 W + 4 x 550 W = 8.2 kWp.
  const groups = {
    hasBattery: false,
    panels: [
      group("p1", { powerW: 600, count: 10 }),
      group("p2", { powerW: 550, count: 4 }),
    ],
    inverters: [group("i1", { powerKW: 5, count: 1 })],
  };
  const created = await push("cap-groups", groups);
  assert.equal(await capacity("cap-groups"), 8.2);
  // Groups win over a stale mirror.
  await push("cap-stale", { ...groups, panelPowerW: 100, panelCount: 1 });
  assert.equal(await capacity("cap-stale"), 8.2);
  // Legacy data from an old client still derives its capacity.
  await push("cap-legacy", {
    panelPowerW: 620,
    panelCount: 10,
    inverterPowerKW: 5,
    inverterCount: 1,
  });
  assert.equal(await capacity("cap-legacy"), 6.2);
  // Editing the groups updates it.
  await push(
    "cap-groups",
    { ...groups, panels: [group("p1", { powerW: 600, count: 20 })] },
    created.version,
  );
  assert.equal(await capacity("cap-groups"), 12);
});

test("restoring a pre-2.7.1 history snapshot saves groups only and leaves the immutable history untouched", async () => {
  const admin = (await (
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Historial",
        email: "historial@example.test",
        password: "isolated-password",
      }),
    })
  ).json()) as any;
  const headers = {
    Authorization: `Bearer ${admin.token}`,
    "Content-Type": "application/json",
  };
  const pushed = await app.request("/api/sync/push", {
    method: "POST",
    headers,
    body: JSON.stringify({
      projects: [
        {
          id: "hist-restore",
          client: { name: "Cliente", projectId: "SP-HIST" },
          monthlyConsumption: Array(12).fill(500),
          specs: {
            ...base,
            hasBattery: false,
            panels: [group("p1", { powerW: 600, count: 20 })],
            inverters: [group("i1", { powerKW: 5, count: 1 })],
          },
        },
      ],
    }),
  });
  assert.equal(pushed.status, 200);
  const version = ((await pushed.json()) as any).results[0].version;
  // What 2.7.0 stored in the history: groups plus the mirror of the first one.
  await pool.query(
    "INSERT INTO project_version_history (id,project_id,version_number,label,author_name,data_json) VALUES ('h-legacy','hist-restore',99,'v99','Ana',$1)",
    [JSON.stringify(stored(fixtures["mixed"], "hist-restore"))],
  );
  const snapshotOf = async () =>
    (
      await pool.query(
        "SELECT data_json FROM project_version_history WHERE id='h-legacy'",
      )
    ).rows[0].data_json;
  const snapshotBefore = await snapshotOf();

  const restored = await app.request(
    "/api/projects/hist-restore/history/h-legacy/restore",
    { method: "POST", headers, body: JSON.stringify({ baseVersion: version }) },
  );
  assert.equal(restored.status, 200);
  const specs = await specsOf("hist-restore");
  for (const key of mirrorKeys)
    assert.ok(!(key in specs), `${key} is not reintroduced by the restore`);
  assert.deepEqual(
    equipmentTotals(readEquipment(specs)),
    equipmentTotals(readEquipment(fixtures["mixed"]!)),
    "the restored equipment is the snapshot's",
  );
  const response = (await restored.json()) as any;
  for (const key of mirrorKeys)
    assert.ok(
      !(key in response.project.specs),
      `${key} is not returned either`,
    );
  assert.deepEqual(
    await snapshotOf(),
    snapshotBefore,
    "the snapshot itself is not rewritten",
  );
});
