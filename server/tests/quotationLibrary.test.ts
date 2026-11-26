import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const dataUrl = (type: string, bytes: Buffer) =>
  `data:${type};base64,${bytes.toString("base64")}`;
const PNG = dataUrl("image/png", PNG_BYTES);
const PDF = dataUrl(
  "application/pdf",
  Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"),
);
const sha = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

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
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    headers: response.headers,
    body: type.includes("json")
      ? ((await response.json()) as any)
      : Buffer.from(await response.arrayBuffer()),
  };
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
  assert.equal(
    (
      await request("POST", "/api/users", admin, {
        name,
        email: `${name}@example.test`,
        password: "isolated-password",
        role,
      })
    ).status,
    200,
  );
  const login = await request("POST", "/api/auth/login", undefined, {
    email: `${name}@example.test`,
    password: "isolated-password",
  });
  return { ...login.body.user, token: login.body.token };
}
const template = (overrides: Record<string, unknown> = {}) => ({
  name: "Electsun clásica",
  description: "Barra verde",
  design: {
    layout: "clasica",
    accent: "#087b58",
    typography: "sans",
    showSignature: true,
    showStamp: true,
  },
  notes: "Precios sujetos a cambio.",
  paymentTerms: "50% de avance",
  validityDays: 15,
  isDefault: false,
  ...overrides,
});
const putTemplate = (
  user: any,
  id: string,
  baseVersion: unknown,
  content: unknown = template(),
) =>
  request("PUT", `/api/quotation-templates/${id}`, user, {
    baseVersion,
    content,
  });
const putSignature = (
  user: any,
  id: string,
  baseVersion: unknown,
  content: unknown,
) =>
  request("PUT", `/api/quotation-signatures/${id}`, user, {
    baseVersion,
    content,
  });
const upload = (user: any, content: unknown) =>
  request("POST", "/api/document-assets", user, { content });

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-quotation-library");
    pool = database.pool;
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    app = asClient(createApp({ pool, jwtSecret: secret, logging: false }));
    admin = await register("library-admin");
    other = await register("library-other", "Otra empresa");
    editor = await provision("EDITOR", "library-editor");
    reader = await provision("LECTOR", "library-reader");
  },
  { timeout: 120000 },
);
after(async () => {
  await database?.stop();
});

test("migration 012 records the template and signature tables", async () => {
  const migration = (
    await pool.query("SELECT name FROM schema_migrations WHERE version=12")
  ).rows[0];
  assert.equal(migration?.name, "quotation_library");
  const indexes = (
    await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename IN ('quotation_templates','quotation_signatures')",
    )
  ).rows.map((r) => r.indexname);
  for (const name of [
    "quotation_templates_updated_at_idx",
    "quotation_signatures_updated_at_idx",
  ])
    assert.ok(indexes.includes(name), name);
});

test("templates: create, validate, CAS 409, delta and soft delete", async () => {
  const created = await putTemplate(editor, "tpl-1", 0);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const saved = created.body.template;
  assert.equal(saved.id, "tpl-1");
  assert.equal(saved.version, 1);
  assert.equal(saved.baseVersion, 1);
  assert.equal(saved.organizationId, admin.organizationId);
  assert.equal(saved.createdBy, editor.name);
  assert.equal(saved.validityDays, 15);

  // Validation errors (shared validator) and malformed requests.
  assert.equal(
    (await putTemplate(editor, "tpl-bad", 0, { name: "" })).status,
    400,
  );
  assert.equal(
    (await putTemplate(editor, "tpl-bad", 0, template({ validityDays: 400 })))
      .status,
    400,
  );
  assert.equal((await putTemplate(editor, "tpl-bad", -1)).status, 400);
  assert.equal((await putTemplate(editor, "x".repeat(65), 0)).status, 400);
  // Permissions: reader and anonymous never write.
  assert.equal((await putTemplate(reader, "tpl-reader", 0)).status, 403);
  assert.equal((await putTemplate(undefined, "tpl-anon", 0)).status, 401);

  // CAS: a stale base returns the server record; creating over an existing id too.
  const stale = await putTemplate(editor, "tpl-1", 0, template({ name: "B" }));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.template.version, 1);
  const updated = await putTemplate(
    admin,
    "tpl-1",
    1,
    template({ name: "Nueva" }),
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.template.version, 2);
  assert.equal(updated.body.template.name, "Nueva");
  assert.equal(
    (await putTemplate(editor, "tpl-1", 1, template({ name: "C" }))).status,
    409,
  );

  // Delta read.
  const full = await request("GET", "/api/quotation-templates", reader);
  assert.equal(full.status, 200);
  assert.ok(full.body.templates.some((t: any) => t.id === "tpl-1"));
  const cursor = full.body.serverTimestamp;
  assert.equal(
    (
      await request(
        "GET",
        `/api/quotation-templates?since=${encodeURIComponent(cursor)}`,
        reader,
      )
    ).body.templates.length,
    0,
  );
  assert.equal(
    (await request("GET", "/api/quotation-templates?since=ayer", reader))
      .status,
    400,
  );

  // Soft delete with CAS; the id is never revived and the delta reports it.
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-templates/tpl-1?baseVersion=1",
        editor,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-templates/tpl-1?baseVersion=2",
        reader,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-templates/tpl-1?baseVersion=2",
        editor,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-templates/missing?baseVersion=1",
        editor,
      )
    ).status,
    404,
  );
  const delta = await request(
    "GET",
    `/api/quotation-templates?since=${encodeURIComponent(cursor)}`,
    reader,
  );
  assert.deepEqual(delta.body.deletedIds, ["tpl-1"]);
  assert.equal(delta.body.templates.length, 0);
  const revived = await putTemplate(editor, "tpl-1", 3);
  assert.equal(revived.status, 409);
  assert.equal(revived.body.template, null);
  assert.equal((await putTemplate(editor, "tpl-1", 0)).status, 409);
});

test("templates: marking a default clears the previous one and bumps its version", async () => {
  const a = (
    await putTemplate(editor, "tpl-def-a", 0, template({ isDefault: true }))
  ).body.template;
  const b = await putTemplate(
    editor,
    "tpl-def-b",
    0,
    template({ isDefault: true }),
  );
  assert.equal(b.status, 200);
  const listed = (await request("GET", "/api/quotation-templates", editor)).body
    .templates;
  const first = listed.find((t: any) => t.id === "tpl-def-a");
  assert.equal(first.isDefault, false);
  assert.equal(first.version, a.version + 1);
  assert.equal(listed.find((t: any) => t.id === "tpl-def-b").isDefault, true);
  assert.equal(listed.filter((t: any) => t.isDefault).length, 1);
  // A stale write of the old default (its version moved) is a conflict, not a silent overwrite.
  assert.equal(
    (
      await putTemplate(
        editor,
        "tpl-def-a",
        a.version,
        template({ isDefault: true }),
      )
    ).status,
    409,
  );
});

test("organizations never see each other's templates, signatures or assets", async () => {
  await putTemplate(admin, "tpl-iso", 0, template({ isDefault: true }));
  const foreign = await putTemplate(
    other,
    "tpl-iso",
    0,
    template({ name: "Ajena", isDefault: true }),
  );
  assert.equal(
    foreign.status,
    200,
    "same id in another organization is another record",
  );
  const mine = (await request("GET", "/api/quotation-templates", admin)).body
    .templates;
  assert.equal(
    mine.find((t: any) => t.id === "tpl-iso").name,
    "Electsun clásica",
  );
  assert.ok(
    mine.find((t: any) => t.id === "tpl-iso").isDefault,
    "another org's default never clears ours",
  );
  const theirs = (await request("GET", "/api/quotation-templates", other)).body
    .templates;
  assert.deepEqual(
    theirs.map((t: any) => t.id),
    ["tpl-iso"],
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-templates/tpl-def-b?baseVersion=1",
        other,
      )
    ).status,
    404,
  );

  const asset = await upload(admin, PNG);
  assert.equal(asset.status, 200);
  assert.equal(
    (await request("GET", `/api/document-assets/${asset.body.sha256}`, other))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        "GET",
        `/api/document-assets/${asset.body.sha256}/file`,
        other,
      )
    ).status,
    404,
  );
  // A reference to another organization's asset is unknown here.
  const sig = await putSignature(other, "sig-foreign", 0, {
    kind: "signature",
    name: "X",
    image: asset.body.ref,
  });
  assert.equal(sig.status, 400);
  assert.equal(sig.body.code, "unknown_document_asset");
});

test("document assets: content-addressed upload with real type checks and safe download", async () => {
  const uploaded = await upload(editor, PNG);
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.sha256, sha(PNG));
  assert.equal(uploaded.body.ref, `asset:sha256:${sha(PNG)}`);
  assert.equal(uploaded.body.mimeType, "image/png");
  assert.equal(uploaded.body.sizeBytes, PNG_BYTES.length);
  // Idempotent: the same content is the same asset.
  assert.equal((await upload(admin, PNG)).body.sha256, uploaded.body.sha256);
  // The JSON content route of migration 009 still serves the text.
  assert.equal(
    (
      await request(
        "GET",
        `/api/document-assets/${uploaded.body.sha256}`,
        reader,
      )
    ).body.content,
    PNG,
  );

  const pdf = await upload(editor, PDF);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.mimeType, "application/pdf");
  const file = await request(
    "GET",
    `/api/document-assets/${pdf.body.sha256}/file?name=${encodeURIComponent('Ficha "técnica"/../x.pdf')}`,
    reader,
  );
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.match(file.headers.get("content-security-policy") ?? "", /sandbox/);
  const disposition = file.headers.get("content-disposition") ?? "";
  assert.match(disposition, /^attachment;/);
  assert.ok(!disposition.includes("/"), disposition);
  assert.ok(
    !/"[^"]*"[^;]*"/.test(disposition.split(";")[1]),
    "quotes are sanitized",
  );
  assert.match(disposition, /\.pdf/);
  assert.deepEqual(file.body, Buffer.from(PDF.split(",")[1], "base64"));

  // Disguised and unsupported types are rejected by their real signature.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  for (const disguised of [
    dataUrl("image/png", svg),
    dataUrl("image/svg+xml", svg),
    dataUrl("text/html", Buffer.from("<!doctype html><p>hola</p>")),
    dataUrl("image/jpeg", Buffer.from("<!doctype html><p>hola</p>")),
    dataUrl("application/pdf", PNG_BYTES),
    dataUrl("image/png", Buffer.from("%PDF-1.4 disfrazado")),
  ]) {
    const result = await upload(editor, disguised);
    assert.equal(result.status, 415, disguised.slice(0, 40));
    assert.equal(result.body.code, "unsupported_asset_type");
  }
  assert.equal((await upload(editor, "no es un data url")).status, 415);
  assert.equal((await upload(editor, 42)).status, 415);
  // Size limit (8 MiB of decoded bytes).
  const huge = dataUrl(
    "application/pdf",
    Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(8 * 1024 * 1024)]),
  );
  const tooLarge = await upload(editor, huge);
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.body.code, "asset_too_large");
  // Permissions.
  assert.equal((await upload(reader, PNG)).status, 403);
  assert.equal((await upload(undefined, PNG)).status, 401);
  assert.equal(
    (await request("GET", "/api/document-assets/zz/file", admin)).status,
    400,
  );

  // A stored image that is not an allowed type (e.g. an old SVG logo of a proposal) is never served as a file.
  const legacy = dataUrl("image/svg+xml", svg);
  await pool.query(
    "INSERT INTO document_assets (organization_id,sha256,content,size_bytes) VALUES ($1,$2,$3,$4)",
    [admin.organizationId, sha(legacy), legacy, legacy.length],
  );
  assert.equal(
    (await request("GET", `/api/document-assets/${sha(legacy)}/file`, admin))
      .status,
    415,
  );
});

test("signatures: references only, one default per kind", async () => {
  const image = (await upload(editor, PNG)).body.ref;
  const inline = await putSignature(editor, "sig-inline", 0, {
    kind: "signature",
    name: "Idali Candelario",
    image: PNG,
  });
  assert.equal(inline.status, 400);
  assert.equal(inline.body.code, "inline_image_not_allowed");
  const unknown = await putSignature(editor, "sig-unknown", 0, {
    kind: "signature",
    name: "Idali Candelario",
    image: `asset:sha256:${"f".repeat(64)}`,
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, "unknown_document_asset");
  assert.equal(
    (
      await putSignature(editor, "sig-bad", 0, {
        kind: "firma",
        name: "A",
        image,
      })
    ).status,
    400,
  );

  const first = await putSignature(editor, "sig-a", 0, {
    kind: "signature",
    name: "Idali Candelario",
    role: "Ventas",
    image,
    isDefault: true,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.signature.role, "Ventas");
  const stamp = await putSignature(editor, "stamp-a", 0, {
    kind: "stamp",
    name: "Sello Electsun",
    image,
    isDefault: true,
  });
  assert.equal(stamp.status, 200);
  await putSignature(editor, "sig-b", 0, {
    kind: "signature",
    name: "Mayler Capellán",
    image,
    isDefault: true,
  });
  const listed = (await request("GET", "/api/quotation-signatures", reader))
    .body.signatures;
  const byId = new Map(listed.map((s: any) => [s.id, s]));
  assert.equal(
    (byId.get("sig-a") as any).isDefault,
    false,
    "previous default signature cleared",
  );
  assert.equal((byId.get("sig-b") as any).isDefault, true);
  assert.equal(
    (byId.get("stamp-a") as any).isDefault,
    true,
    "the stamp default is independent",
  );
  assert.equal(
    (
      await putSignature(reader, "sig-r", 0, {
        kind: "stamp",
        name: "R",
        image,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/quotation-signatures/sig-a?baseVersion=2",
        editor,
      )
    ).status,
    200,
  );
});
