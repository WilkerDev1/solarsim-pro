import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../src/app.js";
import { asClient } from "./helpers/clientHeader.js";
import { migrateDatabase } from "../src/database/migrations.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";

const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let database: EphemeralPostgres;
let pool: pg.Pool;
let raw: ReturnType<typeof createApp>;
let app: ReturnType<typeof createApp>;
let admin: any, editor: any, reader: any, other: any;
let counter = 0;
/** Fresh client-generated id (`po-<uuid>`). */
const newId = () =>
  `po-00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

async function request(
  method: string,
  path: string,
  user?: any,
  body?: unknown,
  target = app,
  headers: Record<string, string> = {},
) {
  const response = await target.request(path, {
    method,
    headers: {
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
async function register(name: string, organizationName?: string) {
  const result = await request("POST", "/api/auth/register", undefined, {
    name,
    email: `${name}@example.test`,
    password: "isolated-password",
    organizationName,
  });
  assert.equal(result.status, 200);
  return { ...result.body.user, token: result.body.token };
}
async function provision(role: string, name: string) {
  const created = await request("POST", "/api/users", admin, {
    name,
    email: `${name}@example.test`,
    password: "isolated-password",
    role,
  });
  assert.equal(created.status, 200);
  const login = await request("POST", "/api/auth/login", undefined, {
    email: `${name}@example.test`,
    password: "isolated-password",
  });
  assert.equal(login.status, 200);
  return { ...login.body.user, token: login.body.token };
}
const observation = (patch: Record<string, unknown> = {}) => ({
  id: newId(),
  equipmentId: "eq-own-1",
  kind: "observation",
  priceUSD: 100,
  source: "supplier_offer",
  supplierName: "Proveedor A",
  supplierOfferId: "offer-a",
  originalCurrency: "USD",
  originalPrice: 100,
  observedAt: "2026-03-10T12:00:00.000Z",
  ...patch,
});
const batch = (
  user: any,
  observations: unknown[] = [],
  voids: unknown[] = [],
) =>
  request("POST", "/api/equipment-prices/batch", user, {
    observations,
    voids,
  });
const generic = async (user: any) =>
  (await request("GET", "/api/equipment-prices/generic", user)).body.prices;
const history = (user: any, query: string) =>
  request("GET", `/api/equipment-prices?${query}`, user);
const equipment = (id: string) => ({
  id,
  type: "panel",
  brand: "Marca",
  modelSeries: "Serie",
  displayName: `Panel ${id}`,
  powerW: 600,
  supplierPrices: [],
});

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-equipment-prices");
    pool = database.pool;
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    raw = createApp({ pool, jwtSecret: secret, logging: false });
    app = asClient(raw);
    admin = await register("prices-admin");
    other = await register("prices-other", "Otra empresa");
    editor = await provision("EDITOR", "prices-editor");
    reader = await provision("LECTOR", "prices-reader");
    for (const [user, id] of [
      [admin, "eq-own-1"],
      [admin, "eq-own-2"],
      [other, "eq-foreign-1"],
    ] as const) {
      const saved = await request("POST", "/api/equipment/batch", user, {
        items: [equipment(id)],
      });
      assert.equal(saved.body.results[0].status, "created");
    }
    // A shared reference model lives in the default organization.
    await pool.query(
      `INSERT INTO equipment_catalog (id,organization_id,type,brand,model_series,display_name,power_w,supplier_prices,details,version)
       VALUES ('eq-mod-cs-590','org-electsun-default','panel','Canadian Solar','TOPBiHiKu','Panel 590',590,'[]','{}',1)
       ON CONFLICT (id) DO NOTHING`,
    );
  },
  { timeout: 60000 },
);
after(async () => {
  await database?.stop();
});

test("migration 010 records the table, its constraints and indexes", async () => {
  const migration = (
    await pool.query("SELECT name FROM schema_migrations WHERE version=10")
  ).rows[0];
  assert.equal(migration?.name, "equipment_price_observations");
  const indexes = (
    await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename='equipment_price_observations'",
    )
  ).rows.map((r) => r.indexdef as string);
  assert.ok(
    indexes.some((d) => /\(organization_id, equipment_id, seq DESC\)/.test(d)),
    indexes.join("\n"),
  );
  assert.ok(
    indexes.some((d) =>
      /\(organization_id, kind, equipment_id, seq DESC\)/.test(d),
    ),
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO equipment_price_observations (organization_id,id,equipment_id,kind,price_usd,source,observed_at)
       VALUES ($1,$2,'eq-own-1','generic',0,'manual',clock_timestamp())`,
      [admin.organizationId, newId()],
    ),
    /check/i,
    "a generic price of 0 is refused by the database too",
  );
});

test("a batch creates records idempotently; same id with other content is a conflict", async () => {
  const first = observation();
  const created = await batch(editor, [first]);
  assert.equal(created.status, 200);
  assert.equal(created.body.observations[0].status, "created");
  const saved = created.body.observations[0].observation;
  assert.ok(Number.isSafeInteger(saved.seq));
  assert.equal(saved.createdById, editor.id);
  assert.equal(saved.voidedAt, null);
  const replay = await batch(editor, [first]);
  assert.equal(replay.body.observations[0].status, "duplicate");
  assert.equal(replay.body.observations[0].observation.seq, saved.seq);
  const changed = await batch(editor, [{ ...first, priceUSD: 101 }]);
  assert.equal(changed.body.observations[0].status, "conflict");
  const rows = await pool.query(
    "SELECT price_usd FROM equipment_price_observations WHERE id=$1",
    [first.id],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(Number(rows.rows[0].price_usd), 100);
});

test("organizations are isolated: same id in two orgs, and org B never sees org A", async () => {
  const shared = observation({
    kind: "generic",
    source: "manual",
    priceUSD: 77,
  });
  assert.equal(
    (await batch(admin, [shared])).body.observations[0].status,
    "created",
  );
  const foreignCopy = { ...shared, equipmentId: "eq-foreign-1" };
  assert.equal(
    (await batch(other, [foreignCopy])).body.observations[0].status,
    "created",
    "the same client id in another organization is a different record",
  );
  const otherHistory = await history(other, "equipmentId=eq-own-1");
  assert.equal(otherHistory.status, 200);
  assert.deepEqual(otherHistory.body.observations, []);
  assert.equal((await generic(other))["eq-own-1"], undefined);
  assert.equal((await generic(admin))["eq-own-1"].priceUSD, 77);
  const voidAcross = await batch(other, [], [{ id: newId() }]);
  assert.equal(voidAcross.body.voids[0].status, "not_found");
  const tryVoid = await batch(other, [], [{ id: shared.id }]);
  assert.equal(tryVoid.body.voids[0].status, "voided", "voids its own copy");
  assert.equal(
    (await generic(admin))["eq-own-1"].priceUSD,
    77,
    "org A keeps its own record",
  );
});

test("equipment ownership: foreign rejected, reference and missing accepted", async () => {
  const result = await batch(editor, [
    observation({ equipmentId: "eq-foreign-1" }),
    observation({ equipmentId: "eq-mod-cs-590" }),
    observation({ equipmentId: "eq-created-offline" }),
    observation({ kind: "generic", priceUSD: 0 }),
    observation({ observedAt: "2019-06-01T00:00:00.000Z" }),
    { id: "bad", equipmentId: "eq-own-1" },
    null,
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.observations.map((r: any) => r.status),
    [
      "rejected",
      "created",
      "created",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
    ],
  );
  assert.equal(result.body.observations[0].reason, "foreign_equipment");
});

test("readers and invalid batches are refused", async () => {
  assert.equal((await batch(reader, [observation()])).status, 403);
  assert.equal((await generic(reader)) !== undefined, true, "readers can read");
  assert.equal(
    (await request("POST", "/api/equipment-prices/batch", undefined, {}))
      .status,
    401,
  );
  const tooMany = Array.from({ length: 201 }, () => observation());
  assert.equal((await batch(editor, tooMany)).status, 400);
  assert.equal(
    (
      await batch(
        editor,
        [],
        Array.from({ length: 201 }, () => ({ id: newId() })),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request("POST", "/api/equipment-prices/batch", editor, {
        observations: "x",
      })
    ).status,
    400,
  );
  assert.equal((await history(editor, "")).status, 400);
  assert.equal(
    (await history(editor, "equipmentId=eq-own-1&limit=0")).status,
    400,
  );
  assert.equal(
    (await history(editor, "equipmentId=eq-own-1&limit=501")).status,
    400,
  );
  assert.equal(
    (await history(editor, "equipmentId=eq-own-1&before=x")).status,
    400,
  );
});

test("observedAt in the future is clamped to the server clock", async () => {
  const future = observation({ observedAt: "2099-01-01T00:00:00.000Z" });
  const before = Date.now();
  const created = await batch(editor, [future]);
  assert.equal(created.body.observations[0].status, "created");
  const stored = Date.parse(
    created.body.observations[0].observation.observedAt,
  );
  assert.ok(
    stored <= Date.now() + 1000 && stored >= before - 5000,
    String(stored),
  );
  assert.equal(
    (await batch(editor, [future])).body.observations[0].status,
    "duplicate",
    "a replay of a clamped record is still a duplicate",
  );
});

test("current generic is the highest seq not voided; voids run after records and revert", async () => {
  const a = observation({
    equipmentId: "eq-own-2",
    kind: "generic",
    source: "manual",
    priceUSD: 200,
  });
  const b = observation({
    equipmentId: "eq-own-2",
    kind: "generic",
    source: "manual",
    priceUSD: 250,
    // An older client clock never wins over the server order.
    observedAt: "2021-01-01T00:00:00.000Z",
  });
  assert.equal(
    (await batch(editor, [a])).body.observations[0].status,
    "created",
  );
  assert.equal(
    (await batch(editor, [b])).body.observations[0].status,
    "created",
  );
  let current = (await generic(editor))["eq-own-2"];
  assert.equal(current.priceUSD, 250);
  assert.equal(current.observationId, b.id);
  // Record and its void in the same batch: the record is created first, then voided.
  const c = observation({
    equipmentId: "eq-own-2",
    kind: "generic",
    source: "manual",
    priceUSD: 300,
  });
  const both = await batch(editor, [c], [{ id: c.id }]);
  assert.equal(both.body.observations[0].status, "created");
  assert.equal(both.body.voids[0].status, "voided");
  assert.equal((await generic(editor))["eq-own-2"].priceUSD, 250);
  const undo = await batch(
    editor,
    [],
    [{ id: b.id }, { id: b.id }, { id: newId() }, { id: "bad" }],
  );
  assert.deepEqual(
    undo.body.voids.map((v: any) => v.status),
    ["voided", "already_voided", "not_found", "rejected"],
  );
  current = (await generic(editor))["eq-own-2"];
  assert.equal(
    current.priceUSD,
    200,
    "voiding the current one reverts to the previous",
  );
  const row = (
    await pool.query(
      "SELECT voided_at, voided_by_id FROM equipment_price_observations WHERE organization_id=$1 AND id=$2",
      [admin.organizationId, b.id],
    )
  ).rows[0];
  assert.ok(row.voided_at instanceof Date);
  assert.equal(row.voided_by_id, editor.id);
  assert.equal((await batch(reader, [], [{ id: a.id }])).status, 403);
});

test("/generic hides equipment tombstoned by the organization", async () => {
  const ref = observation({
    equipmentId: "eq-mod-cs-590",
    kind: "generic",
    source: "manual",
    priceUSD: 90,
  });
  assert.equal(
    (await batch(admin, [ref])).body.observations[0].status,
    "created",
  );
  assert.equal((await generic(admin))["eq-mod-cs-590"].priceUSD, 90);
  const hidden = await request("DELETE", "/api/equipment/eq-mod-cs-590", admin);
  assert.equal(hidden.status, 200);
  assert.equal((await generic(admin))["eq-mod-cs-590"], undefined);
});

test("history is newest first, paginated by seq, with the proposal name until it is purged", async () => {
  const pushed = await request("POST", "/api/sync/push", editor, {
    projects: [
      {
        id: "prices-project-1",
        client: { name: "Ferretería Solar", projectId: "SP-777" },
        specs: {},
      },
    ],
  });
  assert.equal(pushed.status, 200);
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const entry = observation({
      equipmentId: "eq-history",
      priceUSD: 10 + i,
      ...(i === 4
        ? {
            source: "proposal",
            projectId: "prices-project-1",
            supplierName: undefined,
            supplierOfferId: undefined,
          }
        : {}),
    });
    ids.push(entry.id);
    assert.equal(
      (await batch(editor, [entry])).body.observations[0].status,
      "created",
    );
  }
  const page = await history(editor, "equipmentId=eq-history&limit=2");
  assert.equal(page.status, 200);
  assert.deepEqual(
    page.body.observations.map((o: any) => o.id),
    [ids[4], ids[3]],
  );
  assert.equal(page.body.observations[0].projectName, "Ferretería Solar");
  assert.equal(page.body.observations[0].projectCode, "SP-777");
  assert.equal(page.body.observations[0].createdByName, "prices-editor");
  assert.equal(page.body.observations[1].projectName, null);
  const next = await history(
    editor,
    `equipmentId=eq-history&limit=2&before=${page.body.nextBefore}`,
  );
  assert.deepEqual(
    next.body.observations.map((o: any) => o.id),
    [ids[2], ids[1]],
  );
  const last = await history(
    editor,
    `equipmentId=eq-history&limit=2&before=${next.body.nextBefore}`,
  );
  assert.deepEqual(
    last.body.observations.map((o: any) => o.id),
    [ids[0]],
  );
  assert.equal(last.body.nextBefore, null);
  // Trash keeps the name; purging the proposal leaves the record without it.
  const trashed = await request(
    "DELETE",
    `/api/projects/prices-project-1?baseVersion=1`,
    editor,
  );
  assert.equal(trashed.status, 200);
  assert.equal(
    (await history(editor, "equipmentId=eq-history&limit=1")).body
      .observations[0].projectName,
    "Ferretería Solar",
  );
  assert.equal((await request("DELETE", "/api/trash", editor)).status, 200);
  const purged = (await history(editor, "equipmentId=eq-history&limit=1")).body
    .observations[0];
  assert.equal(purged.projectId, "prices-project-1");
  assert.equal(purged.projectName, null);
  // Another organization's project with the same id is never used to name the record.
  assert.equal(
    (await history(other, "equipmentId=eq-history")).body.observations.length,
    0,
  );
});

test("a NUL character rejects only that record and is a 400 in history", async () => {
  const good = observation({ equipmentId: "eq-nul-ok" });
  const result = await batch(editor, [
    observation({ supplierName: "Prov\u0000eedor" }),
    good,
    observation({ equipmentId: "eq\u0000x" }),
    observation({ supplierOfferId: "offer\u0000" }),
    observation({
      source: "proposal",
      projectId: "proj\u00001",
      supplierName: undefined,
      supplierOfferId: undefined,
    }),
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.observations.map((r: any) => r.status),
    ["rejected", "created", "rejected", "rejected", "rejected"],
  );
  const stored = await pool.query(
    "SELECT id FROM equipment_price_observations WHERE id=$1",
    [good.id],
  );
  assert.equal(stored.rows.length, 1);
  assert.equal((await history(editor, "equipmentId=eq%00x")).status, 400);
});

test("the client version gate applies to every route", async () => {
  for (const [method, path] of [
    ["GET", "/api/equipment-prices/generic"],
    ["GET", "/api/equipment-prices?equipmentId=eq-own-1"],
    ["POST", "/api/equipment-prices/batch"],
  ]) {
    const response = await request(
      method,
      path,
      editor,
      method === "POST" ? { observations: [] } : undefined,
      raw,
      { "X-SolarSim-Client": "desktop/2.0.0" },
    );
    assert.equal(response.status, 426, `${method} ${path}`);
  }
});
