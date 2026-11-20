import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrateDatabase } from "../src/database/migrations.js";
import { asClient } from "./helpers/clientHeader.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";
import { assetRef, withAssetRefs } from "../../shared/documentAssets.js";

// Logos y miniaturas de anexos se guardan una vez por organización (`document_assets`, sha256 del texto) y las
// propuestas los referencian. Los clientes que no piden `?assetRefs=1` siguen recibiendo el contenido.

const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let database: EphemeralPostgres;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;
let admin: any, other: any;

const logo = (seed: string) =>
  `data:image/png;base64,${Buffer.from(seed.repeat(400)).toString("base64")}`;
const shared = logo("empresa-");
const own = logo("logo-distinto-");
const thumb = logo("miniatura-ficha-");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Marker: the request announces references (`?assetRefs=1`, what the 2.8.2 desktop sends). */
const REFS: Record<string, string> = {};
async function request(
  method: string,
  path: string,
  user?: any,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await app.request(
    headers === REFS ? withAssetRefs(path) : path,
    {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: JSON.parse(text) as any,
    bytes: text.length,
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
const proposal = (
  id: string,
  cover = shared,
  extra: Record<string, unknown> = {},
) => ({
  id,
  baseVersion: 0,
  client: { name: `Cliente ${id}`, projectId: `SP-${id}` },
  specs: { panels: [{ id: "p", powerW: 600, count: 10 }] },
  customization: {
    companyName: "Empresa",
    coverLogoBase64: cover,
    headerLogoBase64: shared,
    webHeaderLogoBase64: shared,
    watermarkLogoBase64: "",
    attachedPdfs: [
      {
        id: "att-1",
        fileName: "ficha.pdf",
        thumbnailDataUrl: thumb,
        enabled: true,
      },
    ],
  },
  ...extra,
});
const stored = async (id: string) =>
  (
    await pool.query(
      "SELECT data_json, version, updated_at FROM projects WHERE id=$1",
      [id],
    )
  ).rows[0];

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-document-assets");
    pool = database.pool;
    await migrateDatabase(pool);
    app = asClient(createApp({ pool, jwtSecret: secret, logging: false }));
    admin = await register("assets-admin");
    other = await register("assets-other", "Otra empresa");
  },
  { timeout: 30000 },
);
after(async () => {
  await database?.stop();
});

test("a push stores each distinct logo once and the proposal keeps only references", async () => {
  // An older client (no capability header) still sends and receives inline images.
  const pushed = await request("POST", "/api/sync/push", admin, {
    projects: [proposal("a"), proposal("b"), proposal("c", own)],
  });
  assert.equal(pushed.status, 200);
  for (const result of pushed.body.results) {
    assert.equal(
      result.project.customization.headerLogoBase64,
      shared,
      "Old clients get the content back",
    );
    assert.equal(
      result.project.customization.attachedPdfs[0].thumbnailDataUrl,
      thumb,
    );
  }
  assert.equal(
    pushed.body.results[2].project.customization.coverLogoBase64,
    own,
    "A different logo is kept for its proposal",
  );
  const assets = await pool.query(
    "SELECT sha256 FROM document_assets WHERE organization_id=$1 ORDER BY sha256",
    [admin.organizationId],
  );
  assert.deepEqual(
    assets.rows.map((r) => r.sha256).sort(),
    [sha(shared), sha(own), sha(thumb)].sort(),
    "Stored once each",
  );
  const a = (await stored("a")).data_json;
  assert.equal(a.customization.coverLogoBase64, assetRef(sha(shared)));
  assert.equal(a.customization.headerLogoBase64, assetRef(sha(shared)));
  assert.equal(
    a.customization.watermarkLogoBase64,
    "",
    "Empty values stay as they are",
  );
  assert.equal(
    a.customization.attachedPdfs[0].thumbnailDataUrl,
    assetRef(sha(thumb)),
  );
  assert.equal(a.customization.companyName, "Empresa");
  assert.equal(
    (await stored("c")).data_json.customization.coverLogoBase64,
    assetRef(sha(own)),
  );
});

test("pull, GET and conflicts inline the content unless the client announces references", async () => {
  const full = await request("POST", "/api/sync/pull", admin, {});
  const compact = await request(
    "POST",
    withAssetRefs("/api/sync/pull"),
    admin,
    {},
  );
  assert.equal(full.status, 200);
  assert.equal(compact.status, 200);
  const fullA = full.body.projects.find((p: any) => p.id === "a");
  const compactA = compact.body.projects.find((p: any) => p.id === "a");
  assert.equal(fullA.customization.coverLogoBase64, shared);
  assert.equal(compactA.customization.coverLogoBase64, assetRef(sha(shared)));
  assert.ok(
    compact.bytes * 5 < full.bytes,
    `The pull with references is much smaller (${compact.bytes} vs ${full.bytes})`,
  );

  const one = await request("GET", "/api/projects/c", admin);
  assert.equal(one.body.project.customization.coverLogoBase64, own);
  const oneRefs = await request(
    "GET",
    "/api/projects/c",
    admin,
    undefined,
    REFS,
  );
  assert.equal(
    oneRefs.body.project.customization.coverLogoBase64,
    assetRef(sha(own)),
  );

  const conflict = await request("POST", "/api/sync/push", admin, {
    projects: [{ ...proposal("a"), baseVersion: 99 }],
  });
  assert.equal(conflict.body.results[0].status, "conflict");
  assert.equal(
    conflict.body.results[0].serverProject.customization.coverLogoBase64,
    shared,
  );

  const history = await request("GET", "/api/projects/a/history", admin);
  assert.equal(history.status, 200);
  assert.ok(
    JSON.stringify(history.body).indexOf("asset:sha256:") < 0,
    "History is inlined for clients without references",
  );
});

test("assets are readable only inside their organization", async () => {
  const read = await request(
    "GET",
    `/api/document-assets/${sha(shared)}`,
    admin,
  );
  assert.equal(read.status, 200);
  assert.equal(read.body.content, shared);
  assert.equal(read.body.sha256, sha(shared));
  assert.equal(
    (await request("GET", `/api/document-assets/${sha(shared)}`, other)).status,
    404,
  );
  assert.equal(
    (await request("GET", "/api/document-assets/not-a-hash", admin)).status,
    400,
  );
});

test("a client with references pushes refs; unknown refs reject the batch without writing", async () => {
  const before = await stored("a");
  const updated = await request(
    "POST",
    "/api/sync/push",
    admin,
    {
      projects: [
        {
          ...proposal("a"),
          baseVersion: before.version,
          customization: {
            ...proposal("a").customization,
            coverLogoBase64: assetRef(sha(shared)),
            headerLogoBase64: assetRef(sha(shared)),
            webHeaderLogoBase64: assetRef(sha(shared)),
            attachedPdfs: [
              {
                id: "att-1",
                fileName: "ficha.pdf",
                thumbnailDataUrl: assetRef(sha(thumb)),
                enabled: true,
              },
            ],
          },
        },
      ],
    },
    REFS,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.results[0].status, "updated");
  assert.equal(
    updated.body.results[0].project.customization.coverLogoBase64,
    assetRef(sha(shared)),
  );

  // Another organization cannot reference (or probe) this organization's asset.
  const foreign = await request(
    "POST",
    "/api/sync/push",
    other,
    {
      projects: [
        {
          ...proposal("foreign"),
          customization: { coverLogoBase64: assetRef(sha(shared)) },
        },
      ],
    },
    REFS,
  );
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.code, "unknown_document_asset");
  assert.equal(
    (await pool.query("SELECT 1 FROM projects WHERE id='foreign'")).rows.length,
    0,
  );
});

test("migration 009 moves inline images into assets without changing version or timestamp", async () => {
  const legacy = proposal("legacy", logo("antiguo-"));
  await pool.query(
    `INSERT INTO projects (id,organization_id,created_by_id,created_by_name,last_modified_by_name,client_name,system_capacity_kwp,version,data_json)
     VALUES ('legacy',$1,$2,'Ana','Ana','C',6,4,$3)`,
    [admin.organizationId, admin.id, JSON.stringify(legacy)],
  );
  const before = await stored("legacy");
  await pool.query("DELETE FROM schema_migrations WHERE version=9");
  await migrateDatabase(pool);
  const after = await stored("legacy");
  assert.equal(
    after.data_json.customization.coverLogoBase64,
    assetRef(sha(logo("antiguo-"))),
  );
  assert.equal(
    after.data_json.customization.headerLogoBase64,
    assetRef(sha(shared)),
  );
  assert.equal(after.version, before.version);
  assert.equal(after.updated_at.toISOString(), before.updated_at.toISOString());
  const inlined = await request("GET", "/api/projects/legacy", admin);
  assert.deepEqual(
    inlined.body.project.customization,
    legacy.customization,
    "Readers see the same document",
  );
  // Idempotent replay.
  await pool.query("DELETE FROM schema_migrations WHERE version=9");
  await migrateDatabase(pool);
  assert.deepEqual((await stored("legacy")).data_json, after.data_json);
});
