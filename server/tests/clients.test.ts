import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrateDatabase } from "../src/database/migrations.js";
import { normalizeTaxId, validateClientInput } from "../../shared/clients.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";
const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let database: EphemeralPostgres;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;
let admin: any, editor: any, reader: any, other: any;
async function request(
  method: string,
  path: string,
  user?: any,
  body?: unknown,
) {
  const response = await app.request(path, {
    method,
    headers: {
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
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
async function provision(role: string, name: string, owner = admin) {
  const created = await request("POST", "/api/users", owner, {
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
const project = (id: string, clientId?: unknown, baseVersion?: number) => ({
  id,
  client: { name: "Nombre impreso", projectId: "SP-CLIENT" },
  specs: { panelPowerW: 620, panelCount: 10 },
  monthlyConsumptionKWh: Array(12).fill(500),
  ...(clientId !== undefined ? { clientId } : {}),
  ...(baseVersion !== undefined ? { baseVersion } : {}),
});
const push = (user: any, ...projects: unknown[]) =>
  request("POST", "/api/sync/push", user, { projects });
before(
  async () => {
    database = await startEphemeralPostgres("solarsim-clients");
    pool = database.pool;
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    app = createApp({ pool, jwtSecret: secret, logging: false });
    admin = await register("clients-admin");
    other = await register("clients-other", "Otra empresa");
    editor = await provision("EDITOR", "clients-editor");
    reader = await provision("LECTOR", "clients-reader");
  },
  { timeout: 30000 },
);
after(async () => {
  await database?.stop();
});

test("shared validation normalizes optional fields and the tax id", () => {
  assert.equal(normalizeTaxId(" 1-31-12345-6 "), "131123456");
  assert.equal(normalizeTaxId("001.1234567.8"), "00112345678");
  assert.equal(normalizeTaxId("ab 12"), "AB12");
  assert.equal(normalizeTaxId(undefined), "");
  const ok = validateClientInput({ name: "  Ana Pérez " });
  assert.deepEqual(ok, {
    ok: true,
    value: {
      kind: "persona",
      name: "Ana Pérez",
      taxId: "",
      phone: "",
      email: "",
      address: "",
      province: "",
      notes: "",
    },
  });
  for (const invalid of [
    null,
    [],
    {},
    { name: "   " },
    { name: "x".repeat(256) },
    { name: "Ana", kind: "gobierno" },
    { name: "Ana", email: "sin-arroba" },
    { name: "Ana", taxId: "RNC#1" },
    { name: "Ana", phone: 809 },
    { name: "Ana", notes: "x".repeat(4001) },
  ])
    assert.equal(
      validateClientInput(invalid).ok,
      false,
      JSON.stringify(invalid),
    );
});

test("migration 005 records the clients table and the proposal link index", async () => {
  const migration = (
    await pool.query("SELECT name FROM schema_migrations WHERE version=5")
  ).rows[0];
  assert.equal(migration?.name, "clients");
  const indexes = (
    await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename IN ('clients','projects')",
    )
  ).rows.map((r) => r.indexname);
  assert.ok(indexes.includes("projects_client_id_idx"));
});

test("clients are organization records written with CAS; readers and other tenants cannot write", async () => {
  const created = await request("PUT", "/api/clients/client-cas", editor, {
    kind: "empresa",
    name: " Hotel Las Palmas ",
    taxId: "1-31-12345-6",
    email: "compras@laspalmas.test",
    baseVersion: 0,
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.client.name, "Hotel Las Palmas");
  assert.equal(created.body.client.taxId, "131123456");
  assert.equal(created.body.client.kind, "empresa");
  assert.equal(created.body.client.version, 1);
  assert.equal(created.body.client.createdById, editor.id);
  const listed = await request("GET", "/api/clients", reader);
  assert.equal(listed.status, 200);
  assert.ok(listed.body.clients.some((c: any) => c.id === "client-cas"));
  assert.equal(
    (await request("GET", "/api/clients", other)).body.clients.length,
    0,
  );
  assert.equal((await request("GET", "/api/clients")).status, 401);
  const replay = await request("PUT", "/api/clients/client-cas", admin, {
    name: "Otro",
    baseVersion: 0,
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.client.version, 1);
  const updated = await request("PUT", "/api/clients/client-cas", admin, {
    kind: "empresa",
    name: "Hotel Las Palmas SRL",
    phone: "809-555-0101",
    baseVersion: 1,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.client.version, 2);
  assert.equal(updated.body.client.phone, "809-555-0101");
  // Ownership is not transferred by edits.
  assert.equal(updated.body.client.createdById, editor.id);
  const stale = await request("PUT", "/api/clients/client-cas", editor, {
    name: "Viejo",
    baseVersion: 1,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.client.name, "Hotel Las Palmas SRL");
  assert.equal(
    (
      await request("PUT", "/api/clients/client-reader", reader, {
        name: "Lector",
        baseVersion: 0,
      })
    ).status,
    403,
  );
  // Same id in another organization is an independent record.
  assert.equal(
    (
      await request("PUT", "/api/clients/client-cas", other, {
        name: "Homónimo",
        baseVersion: 0,
      })
    ).status,
    200,
  );
  for (const body of [
    { name: "", baseVersion: 0 },
    { name: "Sin versión" },
    { name: "Negativa", baseVersion: -1 },
    { name: "Correo", email: "x", baseVersion: 0 },
  ])
    assert.equal(
      (await request("PUT", "/api/clients/client-invalid", editor, body))
        .status,
      400,
    );
  assert.equal(
    (
      await request("PUT", `/api/clients/${"x".repeat(65)}`, editor, {
        name: "Id largo",
        baseVersion: 0,
      })
    ).status,
    400,
  );
});

test("revoked permissions are rechecked in the database before client writes", async () => {
  const demoted = await provision("EDITOR", "clients-demoted");
  await pool.query("UPDATE users SET role='LECTOR' WHERE id=$1", [demoted.id]);
  assert.equal(
    (
      await request("PUT", "/api/clients/client-demoted", demoted, {
        name: "No permitido",
        baseVersion: 0,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await pool.query("SELECT count(*)::int AS n FROM clients WHERE id=$1", [
        "client-demoted",
      ])
    ).rows[0].n,
    0,
  );
});

test("proposal push accepts own and unknown clients, rejects foreign, deleted and malformed links", async () => {
  await request("PUT", "/api/clients/client-link", admin, {
    name: "Cliente enlazado",
    baseVersion: 0,
  });
  await request("PUT", "/api/clients/client-foreign", other, {
    name: "Ajeno",
    baseVersion: 0,
  });
  assert.equal(
    (await push(editor, project("client-own-project", "client-link"))).body
      .results[0].status,
    "created",
  );
  assert.equal(
    (await push(editor, project("client-unknown-project", "offline-client")))
      .body.results[0].status,
    "created",
  );
  assert.equal(
    (await push(editor, project("client-plain-project"))).body.results[0]
      .status,
    "created",
  );
  for (const [id, clientId] of [
    ["client-foreign-project", "client-foreign"],
    ["client-number-project", 42],
    ["client-empty-project", ""],
    ["client-long-project", "x".repeat(65)],
  ] as const)
    assert.equal(
      (await push(editor, project(id, clientId))).body.results[0].reason,
      "invalid_client",
      id,
    );
  assert.equal(
    (await push(editor, project("client-null-project", null))).body.results[0]
      .status,
    "created",
  );
});

test("client deletion is logical, unlinks proposals with a version bump and cannot be revived", async () => {
  await request("PUT", "/api/clients/client-gone", admin, {
    name: "Cliente eliminado",
    baseVersion: 0,
  });
  await push(editor, project("client-gone-a", "client-gone"));
  await push(editor, project("client-gone-b", "client-gone"));
  await push(editor, project("client-kept", "client-link"));
  assert.equal(
    (await request("DELETE", "/api/clients/client-gone?baseVersion=1", reader))
      .status,
    403,
  );
  assert.equal(
    (await request("DELETE", "/api/clients/client-gone?baseVersion=1", other))
      .status,
    404,
  );
  const stale = await request(
    "DELETE",
    "/api/clients/client-gone?baseVersion=7",
    editor,
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body.client.version, 1);
  assert.equal(
    (await request("DELETE", "/api/clients/client-gone", editor)).status,
    409,
  );
  assert.equal(
    (await request("DELETE", "/api/clients/client-gone?baseVersion=1", editor))
      .status,
    200,
  );
  const rows = (
    await pool.query(
      "SELECT id,version,data_json FROM projects WHERE id = ANY($1) ORDER BY id",
      [["client-gone-a", "client-gone-b", "client-kept"]],
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => [r.id, r.version, r.data_json.clientId]),
    [
      ["client-gone-a", 2, undefined],
      ["client-gone-b", 2, undefined],
      ["client-kept", 1, "client-link"],
    ],
  );
  // The printed client name is independent of the linked record.
  assert.equal(rows[0].data_json.client.name, "Nombre impreso");
  const listed = (await request("GET", "/api/clients", editor)).body;
  assert.ok(!listed.clients.some((c: any) => c.id === "client-gone"));
  assert.ok(listed.deletedIds.includes("client-gone"));
  assert.equal(
    (
      await request("PUT", "/api/clients/client-gone", admin, {
        name: "Revivir",
        baseVersion: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (await push(editor, project("client-gone-a", "client-gone", 2))).body
      .results[0].reason,
    "invalid_client",
  );
  assert.equal(
    (await push(editor, project("client-revive", "client-gone"))).body
      .results[0].reason,
    "invalid_client",
  );
  assert.equal(
    (await request("DELETE", "/api/clients/missing?baseVersion=1", editor))
      .status,
    404,
  );
});
