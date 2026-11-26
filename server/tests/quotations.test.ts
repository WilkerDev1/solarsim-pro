import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../src/app.js";
import { asClient } from "./helpers/clientHeader.js";
import { migrateDatabase } from "../src/database/migrations.js";
import { emptyQuotationContent } from "../../shared/quotations/types.js";
import type { QuotationContent } from "../../shared/quotations/types.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";
const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
const ASSET = `asset:sha256:${"a".repeat(64)}`;
const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";
let database: EphemeralPostgres;
let pool: pg.Pool;
let rawApp: ReturnType<typeof createApp>;
let app: ReturnType<typeof createApp>;
let admin: any, editor: any, reader: any, other: any;
async function request(
  method: string,
  path: string,
  user?: any,
  body?: unknown,
  target = app,
) {
  const response = await target.request(path, {
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
const content = (
  overrides: Partial<QuotationContent> = {},
  issueDate = "2026-11-26",
): QuotationContent =>
  emptyQuotationContent(issueDate, {
    exchangeRate: 60,
    client: {
      name: "Hotel Las Palmas",
      attention: "",
      taxId: "",
      phone: "",
      email: "",
      address: "",
    },
    items: [
      {
        id: "line-1",
        kind: "item",
        description: "Panel 620 W",
        quantity: 10,
        unit: "UD",
        unitPriceCents: 1_500_000,
        discountPct: 0,
        taxable: false,
      },
    ],
    ...overrides,
  });
const put = (
  user: any,
  id: string,
  baseVersion: unknown,
  body: unknown = content(),
) =>
  request("PUT", `/api/quotations/${id}`, user, {
    baseVersion,
    content: body,
  });
const create = async (
  user: any,
  id: string,
  body: QuotationContent = content(),
) => {
  const result = await put(user, id, 0, body);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.quotation;
};
const list = async (user: any, since?: string) =>
  request(
    "GET",
    since
      ? `/api/quotations?since=${encodeURIComponent(since)}`
      : "/api/quotations",
    user,
  );
before(
  async () => {
    database = await startEphemeralPostgres("solarsim-quotations");
    pool = database.pool;
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    rawApp = createApp({
      pool,
      jwtSecret: secret,
      logging: false,
      agentAccess: { enabled: true, mcpUrl: "https://mcp.example.test/mcp" },
    });
    app = asClient(rawApp);
    admin = await register("quotations-admin");
    other = await register("quotations-other", "Otra empresa");
    editor = await provision("EDITOR", "quotations-editor");
    reader = await provision("LECTOR", "quotations-reader");
  },
  { timeout: 120000 },
);
after(async () => {
  await database?.stop();
});

test("migration 011 records the quotation tables and their indexes", async () => {
  const migration = (
    await pool.query("SELECT name FROM schema_migrations WHERE version=11")
  ).rows[0];
  assert.equal(migration?.name, "quotations");
  const indexes = (
    await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename IN ('quotations','quotation_counters')",
    )
  ).rows.map((r) => r.indexname);
  for (const name of [
    "quotations_updated_at_idx",
    "quotations_client_id_idx",
    "quotations_folder_id_idx",
  ])
    assert.ok(indexes.includes(name), name);
});

test("a writer creates a quotation and the API assigns its number", async () => {
  const created = await put(editor, "q-create", 0);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const q = created.body.quotation;
  assert.match(q.number, /^COT-2026-\d{4}$/);
  assert.equal(q.id, "q-create");
  assert.equal(q.organizationId, admin.organizationId);
  assert.equal(q.version, 1);
  assert.equal(q.baseVersion, 1);
  assert.equal(q.status, "draft");
  assert.equal(q.createdById, editor.id);
  assert.equal(q.createdBy, editor.name);
  assert.equal(q.client.name, "Hotel Las Palmas");
  assert.equal(q.items[0].unitPriceCents, 1_500_000);
  assert.ok(Number.isFinite(Date.parse(q.createdAt)));
  assert.ok(Number.isFinite(Date.parse(q.updatedAt)));
  const listed = await list(reader);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.success, true);
  assert.ok(typeof listed.body.serverTimestamp === "string");
  assert.deepEqual(
    listed.body.quotations.find((x: any) => x.id === "q-create"),
    q,
  );
  assert.equal((await list(undefined)).status, 401);
});

test("numbers follow a per-organization, per-year sequence", async () => {
  assert.equal(
    (await create(admin, "q-num-1", content({}, "2041-03-01"))).number,
    "COT-2041-0001",
  );
  assert.equal(
    (await create(editor, "q-num-2", content({}, "2041-12-31"))).number,
    "COT-2041-0002",
  );
  assert.equal(
    (await create(admin, "q-num-3", content({}, "2042-01-01"))).number,
    "COT-2042-0001",
  );
  // Uniqueness is per organization: another tenant starts its own sequence.
  assert.equal(
    (await create(other, "q-num-other", content({}, "2041-05-05"))).number,
    "COT-2041-0001",
  );
  assert.equal(
    (await create(admin, "q-num-4", content({}, "2041-06-01"))).number,
    "COT-2041-0003",
  );
});

test("concurrent creations get distinct consecutive numbers", async () => {
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      put(editor, `q-concurrent-${i}`, 0, content({}, "2043-02-02")),
    ),
  );
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
  const numbers = results.map((r) => r.body.quotation.number).sort();
  assert.deepEqual(
    numbers,
    Array.from(
      { length: 25 },
      (_, i) => `COT-2043-${String(i + 1).padStart(4, "0")}`,
    ),
  );
});

test("the number never changes on edit and is never reused after a delete", async () => {
  const first = await create(admin, "q-keep-1", content({}, "2044-01-10"));
  assert.equal(first.number, "COT-2044-0001");
  const moved = await put(admin, "q-keep-1", 1, content({}, "2045-07-07"));
  assert.equal(moved.status, 200);
  assert.equal(moved.body.quotation.number, "COT-2044-0001");
  assert.equal(moved.body.quotation.issueDate, "2045-07-07");
  assert.equal(moved.body.quotation.version, 2);
  assert.ok(moved.body.quotation.updatedAt > first.updatedAt);
  const second = await create(admin, "q-keep-2", content({}, "2044-02-01"));
  assert.equal(second.number, "COT-2044-0002");
  const removed = await request(
    "DELETE",
    "/api/quotations/q-keep-2?baseVersion=1",
    admin,
  );
  assert.equal(removed.status, 200);
  assert.equal(
    (await create(admin, "q-keep-3", content({}, "2044-03-01"))).number,
    "COT-2044-0003",
  );
});

test("CAS: stale versions get 409 with the current record and deleted ids are never revived", async () => {
  const created = await create(editor, "q-cas");
  const replay = await put(admin, "q-cas", 0);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.quotation.id, "q-cas");
  assert.equal(replay.body.quotation.version, 1);
  const updated = await put(
    admin,
    "q-cas",
    1,
    content({ notes: "Primera edición" }),
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.quotation.version, 2);
  // Ownership is not transferred by edits.
  assert.equal(updated.body.quotation.createdById, editor.id);
  assert.equal(updated.body.quotation.number, created.number);
  const stale = await put(editor, "q-cas", 1, content({ notes: "Vieja" }));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.quotation.notes, "Primera edición");
  assert.equal(stale.body.quotation.version, 2);
  const unknown = await put(editor, "q-cas-missing", 3);
  assert.equal(unknown.status, 409);
  assert.equal(unknown.body.quotation, null);
  const staleDelete = await request(
    "DELETE",
    "/api/quotations/q-cas?baseVersion=1",
    editor,
  );
  assert.equal(staleDelete.status, 409);
  assert.equal(staleDelete.body.quotation.version, 2);
  assert.equal(
    (await request("DELETE", "/api/quotations/q-cas?baseVersion=2", editor))
      .status,
    200,
  );
  // Deleting again with the deleted version is idempotent, like clients.
  assert.equal(
    (await request("DELETE", "/api/quotations/q-cas?baseVersion=3", editor))
      .status,
    200,
  );
  const deletedStale = await request(
    "DELETE",
    "/api/quotations/q-cas?baseVersion=2",
    editor,
  );
  assert.equal(deletedStale.status, 409);
  assert.equal(deletedStale.body.quotation, null);
  assert.equal(
    (await request("DELETE", "/api/quotations/q-nope?baseVersion=1", editor))
      .status,
    404,
  );
  for (const baseVersion of [0, 3, 4]) {
    const revived = await put(admin, "q-cas", baseVersion);
    assert.equal(revived.status, 409);
    assert.equal(revived.body.quotation, null);
  }
  const listed = await list(admin);
  assert.ok(listed.body.deletedIds.includes("q-cas"));
  assert.ok(!listed.body.quotations.some((q: any) => q.id === "q-cas"));
});

test("readers can list but not write; permissions are rechecked in the database", async () => {
  await create(editor, "q-reader");
  assert.equal((await list(reader)).status, 200);
  assert.equal((await put(reader, "q-reader-new", 0)).status, 403);
  assert.equal((await put(reader, "q-reader", 1)).status, 403);
  assert.equal(
    (await request("DELETE", "/api/quotations/q-reader?baseVersion=1", reader))
      .status,
    403,
  );
  const demoted = await provision("EDITOR", "quotations-demoted");
  await pool.query("UPDATE users SET role='LECTOR' WHERE id=$1", [demoted.id]);
  assert.equal((await put(demoted, "q-demoted", 0)).status, 403);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM quotations WHERE id='q-demoted'",
      )
    ).rows[0].n,
    0,
  );
});

test("organizations are isolated for reads and writes", async () => {
  const mine = await create(admin, "q-isolated");
  const foreignList = await list(other);
  assert.ok(
    !foreignList.body.quotations.some((q: any) => q.id === "q-isolated"),
  );
  assert.ok(!foreignList.body.deletedIds.includes("q-isolated"));
  const foreignUpdate = await put(other, "q-isolated", 1);
  assert.equal(foreignUpdate.status, 409);
  assert.equal(foreignUpdate.body.quotation, null);
  assert.equal(
    (await request("DELETE", "/api/quotations/q-isolated?baseVersion=1", other))
      .status,
    404,
  );
  // The same id in another organization is an independent record.
  const twin = await create(other, "q-isolated", content({ notes: "Ajena" }));
  assert.equal(twin.organizationId, other.organizationId);
  const after = (await list(admin)).body.quotations.find(
    (q: any) => q.id === "q-isolated",
  );
  assert.deepEqual(after, mine);
});

test("invalid content and bodies are rejected with 400", async () => {
  for (const body of [
    { baseVersion: 0, content: { ...content(), status: "paid" } },
    { baseVersion: 0, content: { ...content(), issueDate: "2026-02-30" } },
    { baseVersion: 0, content: { ...content(), currency: "EUR" } },
    { baseVersion: 0, content: "texto" },
    { baseVersion: 0 },
    { content: content() },
    { baseVersion: -1, content: content() },
    { baseVersion: 1.5, content: content() },
  ]) {
    const result = await request(
      "PUT",
      "/api/quotations/q-invalid",
      editor,
      body,
    );
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(typeof result.body.error, "string");
  }
  assert.equal(
    (
      await request("PUT", `/api/quotations/${"x".repeat(65)}`, editor, {
        baseVersion: 0,
        content: content(),
      })
    ).status,
    400,
  );
  // An issued quotation needs a printed client name.
  const issuedEmpty = await put(
    editor,
    "q-invalid",
    0,
    content({
      status: "issued",
      client: {
        name: "",
        attention: "",
        taxId: "",
        phone: "",
        email: "",
        address: "",
      },
    }),
  );
  assert.equal(issuedEmpty.status, 400);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM quotations WHERE id='q-invalid'",
      )
    ).rows[0].n,
    0,
  );
});

test("inline images are not stored: logo and thumbnails must be asset references", async () => {
  const attachment = (thumbnailDataUrl?: string) => ({
    id: "att-1",
    fileName: "ficha.pdf",
    fileSize: 1000,
    pageCount: 2,
    title: "Ficha",
    uploadedAt: "2026-11-26T10:00:00.000Z",
    mode: "related" as const,
    origin: "manual" as const,
    ...(thumbnailDataUrl !== undefined ? { thumbnailDataUrl } : {}),
  });
  const issuer = (logo: string) => ({
    ...content().issuer,
    name: "Electsun",
    logo,
  });
  for (const body of [
    content({ issuer: issuer(DATA_URL) }),
    content({ attachments: [attachment(DATA_URL)] }),
  ]) {
    const result = await put(editor, "q-inline", 0, body);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "inline_image_not_allowed");
  }
  const created = await put(
    editor,
    "q-inline",
    0,
    content({
      issuer: issuer(ASSET),
      attachments: [attachment(ASSET), { ...attachment(""), id: "att-2" }],
    }),
  );
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.quotation.issuer.logo, ASSET);
  assert.equal(created.body.quotation.attachments[0].thumbnailDataUrl, ASSET);
  const edited = await put(
    editor,
    "q-inline",
    1,
    content({ issuer: issuer(DATA_URL) }),
  );
  assert.equal(edited.status, 400);
  assert.equal(edited.body.code, "inline_image_not_allowed");
});

test("status changes follow the allowed transitions", async () => {
  await create(editor, "q-transition");
  const skip = await put(
    editor,
    "q-transition",
    1,
    content({ status: "accepted" }),
  );
  assert.equal(skip.status, 400);
  assert.equal(skip.body.code, "invalid_transition");
  const voided = await put(
    editor,
    "q-transition",
    1,
    content({ status: "void" }),
  );
  assert.equal(voided.status, 200);
  const back = await put(
    editor,
    "q-transition",
    2,
    content({ status: "draft" }),
  );
  assert.equal(back.status, 400);
  assert.equal(back.body.code, "invalid_transition");
});

test("a quotation is created only as draft or issued, without spending a number otherwise", async () => {
  for (const status of ["draft", "issued"] as const) {
    const created = await put(
      editor,
      `q-initial-${status}`,
      0,
      content({ status }, "2046-01-01"),
    );
    assert.equal(created.status, 200, status);
    assert.equal(created.body.quotation.status, status);
  }
  for (const status of ["accepted", "rejected", "void"] as const) {
    const result = await put(
      editor,
      `q-initial-${status}`,
      0,
      content({ status }, "2046-01-01"),
    );
    assert.equal(result.status, 400, status);
    assert.equal(result.body.code, "invalid_transition");
  }
  assert.equal(
    (await create(editor, "q-initial-next", content({}, "2046-02-02"))).number,
    "COT-2046-0003",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM quotations WHERE id IN ('q-initial-accepted','q-initial-rejected','q-initial-void')",
      )
    ).rows[0].n,
    0,
  );
});

test("NUL characters and lone surrogates are rejected with 400, not 500", async () => {
  for (const notes of ["a\u0000b", "a\ud800b", "a\udc00b"]) {
    const result = await put(editor, "q-bad-text", 0, content({ notes }));
    assert.equal(result.status, 400, JSON.stringify(notes));
    assert.match(result.body.error, /caracteres no válidos/i);
  }
  const description = await put(
    editor,
    "q-bad-text",
    0,
    content({
      items: [{ ...content().items[0], description: "Panel\u0000" }],
    }),
  );
  assert.equal(description.status, 400);
});

test("a locked quotation compares against its stored content normalized by the current validator", async () => {
  const issued = await create(
    editor,
    "q-legacy-row",
    content({ status: "issued" }),
  );
  // Simulate a row written by an older validator: an extra key and an untrimmed text.
  await pool.query(
    `UPDATE quotations SET data_json=data_json || '{"legacyField": 1, "notes": "  Nota antigua  "}'::jsonb WHERE organization_id=$1 AND id='q-legacy-row'`,
    [admin.organizationId],
  );
  const accepted = await put(
    editor,
    "q-legacy-row",
    issued.version,
    content({ status: "accepted", notes: "Nota antigua" }),
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.quotation.status, "accepted");
  const edited = await put(
    editor,
    "q-legacy-row",
    issued.version + 1,
    content({ status: "void", notes: "Otra" }),
  );
  assert.equal(edited.status, 400);
  assert.equal(edited.body.code, "quotation_locked");
});

test("non-draft quotations are locked: only status changes, reopen to edit", async () => {
  await create(editor, "q-lock");
  // From draft, editing and issuing in the same PUT is allowed.
  const issued = await put(
    editor,
    "q-lock",
    1,
    content({ status: "issued", notes: "Emitida con nota" }),
  );
  assert.equal(issued.status, 200);
  assert.equal(issued.body.quotation.notes, "Emitida con nota");
  const issuedContent = content({
    status: "issued",
    notes: "Emitida con nota",
  });
  const edit = await put(editor, "q-lock", 2, {
    ...issuedContent,
    notes: "Otra",
  });
  assert.equal(edit.status, 400);
  assert.equal(edit.body.code, "quotation_locked");
  // Reopening and editing in the same PUT is also locked.
  const reopenAndEdit = await put(editor, "q-lock", 2, {
    ...issuedContent,
    status: "draft",
    notes: "Otra",
  });
  assert.equal(reopenAndEdit.status, 400);
  assert.equal(reopenAndEdit.body.code, "quotation_locked");
  // Unnormalized but equivalent content counts as unchanged.
  const reopened = await put(editor, "q-lock", 2, {
    ...issuedContent,
    status: "draft",
    notes: "  Emitida con nota  ",
  });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(reopened.body.quotation.status, "draft");
  const edited = await put(
    editor,
    "q-lock",
    3,
    content({ notes: "Corregida" }),
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.body.quotation.notes, "Corregida");
  assert.equal(edited.body.quotation.version, 4);
  const accepted = await put(
    editor,
    "q-lock",
    4,
    content({ status: "issued", notes: "Corregida" }),
  );
  assert.equal(accepted.status, 200);
  const done = await put(
    editor,
    "q-lock",
    5,
    content({ status: "accepted", notes: "Corregida" }),
  );
  assert.equal(done.status, 200);
  assert.equal(done.body.quotation.status, "accepted");
});

test("client links follow the proposal push rules", async () => {
  await request("PUT", "/api/clients/qc-live", admin, {
    name: "Cliente vivo",
    baseVersion: 0,
  });
  await request("PUT", "/api/clients/qc-deleted", admin, {
    name: "Cliente borrado",
    baseVersion: 0,
  });
  assert.equal(
    (await request("DELETE", "/api/clients/qc-deleted?baseVersion=1", admin))
      .status,
    200,
  );
  await request("PUT", "/api/clients/qc-foreign", other, {
    name: "Cliente ajeno",
    baseVersion: 0,
  });
  const own = await put(
    editor,
    "q-client-own",
    0,
    content({ clientId: "qc-live" }),
  );
  assert.equal(own.status, 200);
  assert.equal(own.body.quotation.clientId, "qc-live");
  const unknown = await put(
    editor,
    "q-client-unknown",
    0,
    content({ clientId: "qc-offline-draft" }),
  );
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.quotation.clientId, "qc-offline-draft");
  for (const clientId of ["qc-deleted", "qc-foreign", 42, "x".repeat(65)]) {
    const result = await put(
      editor,
      "q-client-bad",
      0,
      content({ clientId: clientId as any }),
    );
    assert.equal(result.status, 409, String(clientId));
    assert.equal(result.body.code, "invalid_client");
    assert.equal(result.body.reason, "invalid_client");
    assert.equal(result.body.quotation, null);
  }
  const relink = await put(
    editor,
    "q-client-own",
    1,
    content({ clientId: "qc-deleted" }),
  );
  assert.equal(relink.status, 409);
  assert.equal(relink.body.code, "invalid_client");
  assert.equal(relink.body.quotation.clientId, "qc-live");
  // Folder and source proposal ids are accepted as long as they are well formed.
  const linked = await put(
    editor,
    "q-folder-unknown",
    0,
    content({ folderId: "folder-unknown", sourceProjectId: "project-unknown" }),
  );
  assert.equal(linked.status, 200);
  assert.equal(linked.body.quotation.folderId, "folder-unknown");
  assert.equal(linked.body.quotation.sourceProjectId, "project-unknown");
  const row = (
    await pool.query(
      "SELECT client_id,folder_id,source_project_id FROM quotations WHERE organization_id=$1 AND id IN ('q-client-own','q-folder-unknown') ORDER BY id",
      [admin.organizationId],
    )
  ).rows;
  assert.deepEqual(row, [
    { client_id: "qc-live", folder_id: null, source_project_id: null },
    {
      client_id: null,
      folder_id: "folder-unknown",
      source_project_id: "project-unknown",
    },
  ]);
});

test("GET ?since returns only what changed plus deletions; an invalid cursor is 400", async () => {
  await create(editor, "q-since-same");
  await create(editor, "q-since-edit");
  await create(editor, "q-since-gone");
  const cursor = (await list(reader)).body.serverTimestamp;
  assert.match(cursor, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  assert.equal(
    (await put(editor, "q-since-edit", 1, content({ notes: "Cambio" }))).status,
    200,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotations/q-since-gone?baseVersion=1",
        editor,
      )
    ).status,
    200,
  );
  await create(editor, "q-since-new");
  const delta = await list(reader, cursor);
  assert.equal(delta.status, 200);
  assert.deepEqual(delta.body.quotations.map((q: any) => q.id).sort(), [
    "q-since-edit",
    "q-since-new",
  ]);
  assert.deepEqual(delta.body.deletedIds, ["q-since-gone"]);
  assert.ok(delta.body.serverTimestamp >= cursor);
  const empty = await list(reader, delta.body.serverTimestamp);
  assert.deepEqual(empty.body.quotations, []);
  assert.deepEqual(empty.body.deletedIds, []);
  const full = await list(reader);
  assert.ok(full.body.quotations.some((q: any) => q.id === "q-since-same"));
  assert.ok(full.body.deletedIds.includes("q-since-gone"));
  for (const since of ["ayer", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z"])
    assert.equal((await list(reader, since)).status, 400, since);
  // Offsets PostgreSQL cannot parse are normalized before the query: an accepted cursor never becomes a 500.
  for (const since of [
    "2026-01-01T00:00:00-23:59",
    "2026-01-01T00:00:00+23:59",
    "2000-01-01T00:00:00.123456+14:00",
  ]) {
    const result = await list(reader, since);
    assert.equal(result.status, 200, since);
  }
  for (const since of [
    "2026-01-01T00:00:00-99:99",
    "2026-01-01T00:00:00+24:00",
    "0000-01-01T00:00:00Z",
    "9999-12-31T23:59:59-23:59",
  ])
    assert.notEqual((await list(reader, since)).status, 500, since);
});

test("folder links follow the proposal push rules", async () => {
  const privateFolder = await request(
    "PUT",
    "/api/folders/qf-private",
    editor,
    {
      name: "Privada del editor",
      visibility: "private",
      baseVersion: 0,
    },
  );
  assert.equal(privateFolder.status, 200);
  await request("PUT", "/api/folders/qf-gone", admin, {
    name: "Borrada",
    baseVersion: 0,
  });
  assert.equal(
    (await request("DELETE", "/api/folders/qf-gone?baseVersion=1", admin))
      .status,
    200,
  );
  await request("PUT", "/api/folders/qf-foreign", other, {
    name: "Ajena",
    baseVersion: 0,
  });
  await request("PUT", "/api/folders/qf-public", admin, {
    name: "Pública",
    baseVersion: 0,
  });
  assert.equal(
    (await put(admin, "q-folder-public", 0, content({ folderId: "qf-public" })))
      .status,
    200,
  );
  assert.equal(
    (
      await put(
        admin,
        "q-folder-offline",
        0,
        content({ folderId: "qf-offline" }),
      )
    ).status,
    200,
  );
  for (const folderId of ["qf-gone", "qf-foreign", "qf-private"]) {
    const result = await put(admin, "q-folder-bad", 0, content({ folderId }));
    assert.equal(result.status, 409, folderId);
    assert.equal(result.body.code, "invalid_folder");
    assert.equal(result.body.reason, "invalid_folder");
    assert.equal(result.body.quotation, null);
  }
  // invalid_client is checked first.
  const both = await put(
    admin,
    "q-folder-bad",
    0,
    content({ folderId: "qf-gone", clientId: "qc-foreign" }),
  );
  assert.equal(both.body.code, "invalid_client");
  const moved = await put(
    admin,
    "q-folder-public",
    1,
    content({ folderId: "qf-gone" }),
  );
  assert.equal(moved.status, 409);
  assert.equal(moved.body.quotation.folderId, "qf-public");
  // The creator files a quotation in their private folder; another writer may edit it while it stays there.
  const mine = await create(
    editor,
    "q-folder-private",
    content({ folderId: "qf-private" }),
  );
  const kept = await put(
    admin,
    "q-folder-private",
    mine.version,
    content({ folderId: "qf-private", notes: "Editada" }),
  );
  assert.equal(kept.status, 200, JSON.stringify(kept.body));
  assert.equal(kept.body.quotation.folderId, "qf-private");
});

test("deleting a client or a folder unlinks its quotations and bumps their version", async () => {
  await request("PUT", "/api/clients/qc-cascade", admin, {
    name: "Cliente a borrar",
    baseVersion: 0,
  });
  const folder = await request("PUT", "/api/folders/qf-cascade", admin, {
    name: "Carpeta a borrar",
    baseVersion: 0,
  });
  assert.equal(folder.status, 200);
  const linked = await create(
    editor,
    "q-cascade",
    content({ clientId: "qc-cascade", folderId: "qf-cascade" }),
  );
  const issued = await put(
    editor,
    "q-cascade-issued",
    0,
    content({ status: "issued", clientId: "qc-cascade" }),
  );
  assert.equal(issued.status, 200);
  const cursor = (await list(reader)).body.serverTimestamp;
  assert.equal(
    (await request("DELETE", "/api/clients/qc-cascade?baseVersion=1", admin))
      .status,
    200,
  );
  let delta = await list(reader, cursor);
  const unlinked = delta.body.quotations.find((q: any) => q.id === "q-cascade");
  assert.ok(unlinked, "the unlinked quotation is part of the delta");
  assert.equal("clientId" in unlinked, false);
  assert.equal(unlinked.folderId, "qf-cascade");
  assert.equal(unlinked.version, linked.version + 1);
  assert.deepEqual(unlinked.client, linked.client);
  const issuedAfter = delta.body.quotations.find(
    (q: any) => q.id === "q-cascade-issued",
  );
  assert.equal("clientId" in issuedAfter, false);
  assert.equal(issuedAfter.version, 2);
  assert.equal(issuedAfter.status, "issued");
  const folderCursor = delta.body.serverTimestamp;
  assert.equal(
    (await request("DELETE", "/api/folders/qf-cascade?baseVersion=1", admin))
      .status,
    200,
  );
  delta = await list(reader, folderCursor);
  const unfiled = delta.body.quotations.find((q: any) => q.id === "q-cascade");
  assert.equal("folderId" in unfiled, false);
  assert.equal(unfiled.version, linked.version + 2);
  const row = (
    await pool.query(
      "SELECT client_id,folder_id FROM quotations WHERE organization_id=$1 AND id='q-cascade'",
      [admin.organizationId],
    )
  ).rows[0];
  assert.deepEqual(row, { client_id: null, folder_id: null });
  // The cascade only bumps versions: the next edit uses the new baseVersion.
  assert.equal(
    (await put(editor, "q-cascade", linked.version + 2, content())).status,
    200,
  );
});

test("a client cascade only touches the deleting organization", async () => {
  for (const user of [admin, other])
    assert.equal(
      (
        await request("PUT", "/api/clients/qc-shared-id", user, {
          name: "Mismo id",
          baseVersion: 0,
        })
      ).status,
      200,
    );
  const mine = await create(
    admin,
    "q-shared-client",
    content({ clientId: "qc-shared-id" }),
  );
  const theirs = await create(
    other,
    "q-shared-client",
    content({ clientId: "qc-shared-id" }),
  );
  assert.equal(
    (await request("DELETE", "/api/clients/qc-shared-id?baseVersion=1", admin))
      .status,
    200,
  );
  const own = (await list(admin)).body.quotations.find(
    (q: any) => q.id === "q-shared-client",
  );
  assert.equal("clientId" in own, false);
  assert.equal(own.version, mine.version + 1);
  const foreign = (await list(other)).body.quotations.find(
    (q: any) => q.id === "q-shared-client",
  );
  assert.deepEqual(foreign, theirs);
});

test("a quotation write racing the deletion of its client never keeps a link to a deleted client", async () => {
  for (let round = 0; round < 6; round++) {
    const clientId = `qc-race-${round}`;
    const id = `q-race-${round}`;
    await request("PUT", `/api/clients/${clientId}`, admin, {
      name: "Cliente en carrera",
      baseVersion: 0,
    });
    await create(editor, id, content({ clientId }));
    const [write, removal] = await Promise.all([
      put(editor, id, 1, content({ clientId, notes: `Edición ${round}` })),
      request("DELETE", `/api/clients/${clientId}?baseVersion=1`, admin),
    ]);
    assert.equal(removal.status, 200);
    assert.ok([200, 409].includes(write.status), JSON.stringify(write.body));
    const row = (
      await pool.query(
        "SELECT client_id,version,data_json FROM quotations WHERE organization_id=$1 AND id=$2",
        [admin.organizationId, id],
      )
    ).rows[0];
    assert.equal(row.client_id, null);
    assert.equal("clientId" in row.data_json, false);
    if (write.status === 200) {
      // Write first (v2, linked), then the cascade (v3).
      assert.equal(write.body.quotation.version, 2);
      assert.equal(row.version, 3);
      assert.equal(row.data_json.notes, `Edición ${round}`);
    } else {
      // Cascade first (v2): the write is a stale CAS or an invalid client and keeps nothing.
      assert.equal(row.version, 2);
      assert.equal(row.data_json.notes, "");
    }
  }
});

test("quotation routes require the client header and reject agent tokens", async () => {
  const noHeader = await request(
    "GET",
    "/api/quotations",
    admin,
    undefined,
    rawApp,
  );
  assert.equal(noHeader.status, 426);
  assert.equal(noHeader.body.error, "client_outdated");
  const putNoHeader = await request(
    "PUT",
    "/api/quotations/q-header",
    admin,
    { baseVersion: 0, content: content() },
    rawApp,
  );
  assert.equal(putNoHeader.status, 426);
  const agent = { token: `ssm_pat_${"A".repeat(43)}` };
  for (const [method, path, body] of [
    ["GET", "/api/quotations", undefined],
    ["PUT", "/api/quotations/q-agent", { baseVersion: 0, content: content() }],
    ["DELETE", "/api/quotations/q-agent?baseVersion=1", undefined],
  ] as const) {
    const result = await request(method, path, agent, body);
    assert.equal(result.status, 403, `${method} ${path}`);
    assert.equal(result.body.code, "agent_route_forbidden");
  }
});
