import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { migrateDatabase } from "../src/database/migrations.js";
import { readConfig } from "../src/config.js";
const exec = promisify(execFile);
const container = `solarsim-integration-${crypto.randomUUID()}`;
const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;
let admin: any, other: any, editor: any, reader: any;
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
  const result = await request("POST", "/api/users", owner, {
    name,
    email: `${name}@example.test`,
    password: "isolated-password",
    role,
  });
  assert.equal(result.status, 200);
  const login = await request("POST", "/api/auth/login", undefined, {
    email: `${name}@example.test`,
    password: "isolated-password",
  });
  assert.equal(login.status, 200);
  return { ...login.body.user, token: login.body.token };
}
const project = (id: string) => ({
  id,
  client: { name: "Prueba", projectId: "SP-TEST" },
  specs: { panelPowerW: 620, panelCount: 10 },
  monthlyConsumptionKWh: Array(12).fill(500),
});
const equipment = (id: string) => ({
  id,
  type: "panel",
  brand: "Canadian Solar",
  modelSeries: "TEST",
  displayName: "Panel prueba",
  powerW: 620,
  supplierPrices: [{ id: "offer", priceUSD: 100 }],
});
before(
  async () => {
    await exec("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_USER=solarsim_test",
      "--env",
      "POSTGRES_PASSWORD=isolated-test-only",
      "--env",
      "POSTGRES_DB=solarsim_test",
      "postgres:16-alpine",
    ]);
    const mapped = (
      await exec("docker", ["port", container, "5432/tcp"])
    ).stdout.trim();
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: Number(mapped.split(":").at(-1)),
      user: "solarsim_test",
      password: "isolated-test-only",
      database: "solarsim_test",
      connectionTimeoutMillis: 1000,
    });
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch {
        if (attempt === 49)
          throw new Error("Isolated PostgreSQL did not start");
        await delay(100);
      }
    }
    await migrateDatabase(pool);
    await migrateDatabase(pool); // idempotent upgrades preserve records
    app = createApp({ pool, jwtSecret: secret, logging: false });
    admin = await register("admin");
    other = await register("other", "Otra empresa");
    editor = await provision("EDITOR", "editor");
    reader = await provision("VIEWER", "reader");
  },
  { timeout: 30000 },
);
after(async () => {
  await pool?.end();
  await exec("docker", ["stop", container]).catch(() => {});
});
test("startup rejects missing secrets and publicly exposed defaults", () => {
  assert.throws(() => readConfig({}), /JWT_SECRET/);
  assert.throws(
    () =>
      createApp({ pool, jwtSecret: "solarsim_enterprise_jwt_secret_key_2026" }),
    /public defaults/,
  );
  assert.throws(
    () =>
      readConfig({ JWT_SECRET: secret, DB_PASSWORD: "solarsim_secret_2026" }),
    /DB_PASSWORD/,
  );
});
test("registration creates an isolated organization; duplicate registration rolls back its organization", async () => {
  assert.notEqual(admin.organizationId, "org-electsun-default");
  assert.notEqual(admin.organizationId, other.organizationId);
  assert.equal(admin.role, "ADMIN");
  const before = (await pool.query("SELECT COUNT(*) FROM organizations"))
    .rows[0].count;
  assert.equal(
    (
      await request("POST", "/api/auth/register", undefined, {
        name: "duplicate",
        email: "admin@example.test",
        password: "isolated-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM organizations")).rows[0].count,
    before,
  );
});
test("signed stale role and disabled user cannot keep privileged access", async () => {
  await pool.query("UPDATE users SET role=$1 WHERE id=$2", [
    "LECTOR",
    editor.id,
  ]);
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", editor, {
        settings: { selfConsumptionProjection: true },
        baseVersion: 1,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("POST", "/api/sync/push", editor, {
        projects: [project("reader-blocked")],
      })
    ).status,
    403,
  );
  await pool.query("UPDATE users SET role=$1,is_active=FALSE WHERE id=$2", [
    "EDITOR",
    editor.id,
  ]);
  assert.equal((await request("GET", "/api/auth/me", editor)).status, 401);
  await pool.query("UPDATE users SET is_active=TRUE WHERE id=$1", [editor.id]);
});
test("expired access never authorizes mutation; explicit refresh has a bounded 30-day lifetime", async () => {
  const fields = {
    id: admin.id,
    organizationId: admin.organizationId,
    role: "ADMIN",
    iat: Math.floor(Date.now() / 1000) - 8 * 86400,
  };
  const expired = { token: jwt.sign(fields, secret, { expiresIn: "7d" }) };
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", expired, {
        settings: { selfConsumptionProjection: true },
        baseVersion: 1,
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("POST", "/api/auth/refresh", expired)).status,
    200,
  );
  const ancient = {
    token: jwt.sign(
      { ...fields, iat: Math.floor(Date.now() / 1000) - 31 * 86400 },
      secret,
      { expiresIn: "7d" },
    ),
  };
  assert.equal(
    (await request("POST", "/api/auth/refresh", ancient)).status,
    401,
  );
});
test("feature policy defaults legacy, readers can view, ADMIN saves with CAS and tenant isolation", async () => {
  const initial = await request("GET", "/api/organization/features", reader);
  assert.deepEqual(initial.body.settings, { selfConsumptionProjection: false });
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", editor, {
        settings: { selfConsumptionProjection: true },
        baseVersion: 1,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", admin, {
        settings: { selfConsumptionProjection: "yes" },
        baseVersion: 1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", admin, {
        settings: { selfConsumptionProjection: true },
        baseVersion: 1,
      })
    ).body.version,
    2,
  );
  assert.equal(
    (
      await request("PATCH", "/api/organization/features", admin, {
        settings: { selfConsumptionProjection: false },
        baseVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("GET", "/api/organization/features", other)).body.settings
      .selfConsumptionProjection,
    false,
  );
  const share = await request("POST", "/api/auth/share-authorization", admin);
  assert.deepEqual(share.body.featurePolicy, {
    version: 2,
    settings: { selfConsumptionProjection: true },
  });
  assert.equal(
    (await request("POST", "/api/auth/share-authorization", reader)).status,
    403,
  );
});
test("project updates require baseVersion; simultaneous edits cannot both commit", async () => {
  const created = (
    await request("POST", "/api/sync/push", editor, {
      projects: [project("occ-project")],
    })
  ).body.results[0];
  assert.equal(created.version, 1);
  const missing = (
    await request("POST", "/api/sync/push", editor, {
      projects: [project("occ-project")],
    })
  ).body.results[0];
  assert.equal(missing.reason, "base_version_required");
  const simultaneous = await Promise.all(
    ["A", "B"].map((name) =>
      request("POST", "/api/sync/push", editor, {
        projects: [
          {
            ...project("occ-project"),
            baseVersion: 1,
            client: { name, projectId: "SP-TEST" },
          },
        ],
      }),
    ),
  );
  assert.deepEqual(simultaneous.map((r) => r.body.results[0].status).sort(), [
    "conflict",
    "updated",
  ]);
  const row = (
    await pool.query("SELECT version FROM projects WHERE id=$1", [
      "occ-project",
    ])
  ).rows[0];
  assert.equal(row.version, 2);
  const history = await request(
    "GET",
    "/api/projects/occ-project/history",
    admin,
  );
  assert.equal(history.body.history.length, 1);
  assert.equal(history.body.history[0].version_number, 1);
  const stale = await request("POST", "/api/sync/push", editor, {
    projects: [
      { ...project("occ-project"), baseVersion: 1, forceOverwrite: true },
    ],
  });
  assert.equal(stale.body.results[0].status, "conflict");
});
test("foreign organization project claims and guessed identifiers never disclose or fork existing documents", async () => {
  const collision = (
    await request("POST", "/api/sync/push", other, {
      projects: [project("occ-project")],
    })
  ).body.results[0];
  assert.equal(collision.reason, "organization_mismatch");
  assert.equal(collision.serverProject, undefined);
  const foreign = (
    await request("POST", "/api/sync/push", other, {
      projects: [
        { ...project("foreign-upload"), organizationId: admin.organizationId },
      ],
    })
  ).body.results[0];
  assert.equal(foreign.reason, "organization_mismatch");
});
test("soft delete and restore increment versions; hard delete CAS and persistent tombstones prevent resurrection", async () => {
  await request("POST", "/api/sync/push", editor, {
    projects: [project("trash-project")],
  });
  const deleted = await request(
    "DELETE",
    "/api/projects/trash-project?baseVersion=1",
    editor,
  );
  assert.equal(deleted.body.version, 2);
  const restore = await request(
    "POST",
    "/api/projects/trash-project/restore?baseVersion=2",
    editor,
  );
  assert.equal(restore.body.version, 3);
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/projects/trash-project?permanent=true&baseVersion=2",
        editor,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/projects/trash-project?permanent=true&baseVersion=3",
        editor,
      )
    ).status,
    409,
  );
  const again = await request(
    "DELETE",
    "/api/projects/trash-project?baseVersion=3",
    editor,
  );
  assert.equal(again.body.version, 4);
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/projects/trash-project?permanent=true&baseVersion=4",
        editor,
      )
    ).status,
    200,
  );
  const resurrection = (
    await request("POST", "/api/sync/push", editor, {
      projects: [{ ...project("trash-project"), baseVersion: 4 }],
    })
  ).body.results[0];
  assert.equal(resurrection.reason, "deleted");
  assert.ok(
    (
      await request("POST", "/api/sync/pull", editor, {
        lastSyncTimestamp: "1970-01-01T00:00:00.000Z",
      })
    ).body.deletedIds.includes("trash-project"),
  );
});
test("soft delete and trash restore cannot bypass CAS by omitting the version", async () => {
  await request("POST", "/api/sync/push", editor, {
    projects: [project("required-cas")],
  });
  for (const suffix of [
    "",
    "?baseVersion=0",
    "?baseVersion=1.5",
    "?baseVersion=invalid",
  ]) {
    const rejected = await request(
      "DELETE",
      `/api/projects/required-cas${suffix}`,
      editor,
    );
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.serverVersion, 1);
  }
  const deleted = await request(
    "DELETE",
    "/api/projects/required-cas?baseVersion=1",
    editor,
  );
  assert.equal(deleted.body.version, 2);
  for (const suffix of ["", "?baseVersion=1", "?baseVersion=invalid"]) {
    const rejected = await request(
      "POST",
      `/api/projects/required-cas/restore${suffix}`,
      editor,
    );
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.serverProject.isDeleted, true);
    assert.equal(rejected.body.serverVersion, 2);
  }
  const restored = await request(
    "POST",
    "/api/projects/required-cas/restore?baseVersion=2",
    editor,
  );
  assert.equal(restored.body.version, 3);
  assert.equal(restored.body.project.isDeleted, false);
});
test("snapshot restoration uses current CAS and creates a new immutable version", async () => {
  const history = (
    await request("GET", "/api/projects/occ-project/history", admin)
  ).body.history;
  assert.equal(
    (
      await request(
        "POST",
        `/api/projects/occ-project/history/${history[0].id}/restore`,
        editor,
        { baseVersion: 1 },
      )
    ).status,
    409,
  );
  const restored = await request(
    "POST",
    `/api/projects/occ-project/history/${history[0].id}/restore`,
    editor,
    { baseVersion: 2 },
  );
  assert.equal(restored.body.version, 3);
  assert.equal(restored.body.project.client.name, "Prueba");
  assert.equal(
    (await request("GET", "/api/projects/occ-project/history", admin)).body
      .history.length,
    2,
  );
});
test("pull cursor preserves concurrent writes and zero consumption; purge emits tombstones", async () => {
  const start = (await request("POST", "/api/sync/pull", editor, {})).body
    .serverTimestamp;
  const p = {
    ...project("cursor-project"),
    monthlyConsumptionKWh: Array(12).fill(0),
  };
  const [pull] = await Promise.all([
    request("POST", "/api/sync/pull", editor, { lastSyncTimestamp: start }),
    request("POST", "/api/sync/push", editor, { projects: [p] }),
  ]);
  const later = await request("POST", "/api/sync/pull", editor, {
    lastSyncTimestamp: pull.body.serverTimestamp,
  });
  assert.ok(
    [...pull.body.projects, ...later.body.projects].some(
      (p) => p.id === "cursor-project" && p.monthlyConsumptionKWh[0] === 0,
    ),
  );
  await pool.query(
    "UPDATE projects SET is_deleted=TRUE,deleted_at=NOW()-INTERVAL '31 days' WHERE id='cursor-project'",
  );
  assert.ok(
    (
      await request("POST", "/api/sync/pull", editor, {})
    ).body.deletedIds.includes("cursor-project"),
  );
});
test("catalog ownership, CAS, supplier offers and tombstones survive races and foreign identifiers", async () => {
  const created = (
    await request("POST", "/api/equipment/batch", editor, {
      items: [equipment("occ-equipment")],
    })
  ).body.results[0];
  assert.equal(created.version, 1);
  const foreign = (
    await request("POST", "/api/equipment/batch", other, {
      items: [equipment("occ-equipment")],
    })
  ).body.results[0];
  assert.equal(foreign.reason, "organization_mismatch");
  const missing = (
    await request("POST", "/api/equipment/batch", editor, {
      items: [equipment("occ-equipment")],
    })
  ).body.results[0];
  assert.equal(missing.reason, "base_version_required");
  const parallel = await Promise.all(
    [110, 120].map((priceUSD) =>
      request("POST", "/api/equipment/batch", editor, {
        items: [
          {
            ...equipment("occ-equipment"),
            baseVersion: 1,
            supplierPrices: [{ id: "offer", priceUSD }],
          },
        ],
      }),
    ),
  );
  assert.deepEqual(parallel.map((r) => r.body.results[0].status).sort(), [
    "conflict",
    "updated",
  ]);
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/equipment/occ-equipment?baseVersion=1",
        editor,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/equipment/occ-equipment?baseVersion=2",
        editor,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request("POST", "/api/equipment/batch", editor, {
        items: [equipment("occ-equipment")],
      })
    ).body.results[0].reason,
    "deleted",
  );
  assert.ok(
    (await request("GET", "/api/equipment", editor)).body.deletedIds.includes(
      "occ-equipment",
    ),
  );
});
test("shared reference catalog prices stay private; hiding a shared model affects only requesting tenant", async () => {
  await pool.query(
    `INSERT INTO equipment_catalog(id,organization_id,type,brand,model_series,display_name,supplier_prices,details) VALUES('eq-mod-cs-620','org-electsun-default','panel','Canadian Solar','TEST','Shared','[{"priceUSD":123}]','{"supplierPrices":[{"priceUSD":123}],"preferredSupplierId":"private"}')`,
  );
  const item = (await request("GET", "/api/equipment", other)).body.items.find(
    (i) => i.id === "eq-mod-cs-620",
  );
  assert.deepEqual(item.supplierPrices, []);
  assert.equal(item.preferredSupplierId, undefined);
  assert.equal(
    (await request("DELETE", "/api/equipment/eq-mod-cs-620", other)).status,
    200,
  );
  assert.equal(
    (await request("GET", "/api/equipment", other)).body.items.some(
      (i) => i.id === "eq-mod-cs-620",
    ),
    false,
  );
  assert.equal(
    (await request("GET", "/api/equipment", admin)).body.items.some(
      (i) => i.id === "eq-mod-cs-620",
    ),
    true,
  );
});

test("organization cannot lose its last active administrator", async () => {
  assert.equal(
    (
      await request("PATCH", `/api/users/${admin.id}`, admin, {
        isActive: false,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("PATCH", `/api/users/${admin.id}`, admin, {
        role: "EDITOR",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("POST", "/api/users", admin, {
        name: "bad",
        email: "bad@example.test",
        password: "123",
        role: "ROOT",
      })
    ).status,
    400,
  );
});

async function waitForMembershipLocks(count: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await pool.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM organizations WHERE id=%FOR UPDATE'",
    );
    if (waiting.rows[0].count >= count) return;
    await delay(10);
  }
  assert.fail(
    "Membership requests did not wait on the shared organization lock",
  );
}

test("simultaneous ADMIN deletions retain one active administrator", async () => {
  const first = await register("delete-race-first");
  const second = await provision("ADMIN", "delete-race-second", first);
  const blocker = await pool.connect();
  let pending: ReturnType<typeof request>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      first.organizationId,
    ]);
    pending = [
      request("DELETE", `/api/users/${second.id}`, first),
      request("DELETE", `/api/users/${first.id}`, second),
    ];
    // Both actors authenticate before either can mutate membership.
    await waitForMembershipLocks(2);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  const results = await Promise.all(pending);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM users WHERE organization_id=$1 AND is_active=TRUE AND role='ADMIN'",
        [first.organizationId],
      )
    ).rows[0].count,
    1,
  );
});

test("queued PATCH and DELETE revalidate a revoked ADMIN after the organization lock", async () => {
  for (const [method, change, expectedStatus] of [
    ["PATCH", "role='LECTOR'", 403],
    ["DELETE", "is_active=FALSE", 401],
  ] as const) {
    const owner = await register(`revoked-${method.toLowerCase()}`);
    const actor = await provision(
      "ADMIN",
      `actor-${method.toLowerCase()}`,
      owner,
    );
    const target = await provision(
      "EDITOR",
      `target-${method.toLowerCase()}`,
      owner,
    );
    const blocker = await pool.connect();
    let pending: ReturnType<typeof request> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
        [owner.organizationId],
      );
      pending = request(
        method,
        `/api/users/${target.id}`,
        actor,
        method === "PATCH" ? { name: "Unauthorized mutation" } : undefined,
      );
      await waitForMembershipLocks(1);
      // Emulate a preceding membership change while the request waits.
      await blocker.query(`UPDATE users SET ${change} WHERE id=$1`, [actor.id]);
      await blocker.query("COMMIT");
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    assert.equal((await pending!).status, expectedStatus);
    assert.equal(
      (await pool.query("SELECT name FROM users WHERE id=$1", [target.id]))
        .rows[0].name,
      target.name,
    );
  }
});

test("malformed JSON object bodies are rejected before touching data", async () => {
  const rejected = await request(
    "PATCH",
    "/api/organization/features",
    admin,
    null,
  );
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error, "Se requiere un objeto JSON");
  assert.equal(
    (await request("POST", "/api/equipment/batch", editor, [])).status,
    400,
  );
  assert.equal(
    (await request("POST", "/api/auth/register", undefined, 42)).status,
    400,
  );
});

test("independent organizations use contextual roles and isolated project data", async () => {
  const owner = await register("multi-owner", "Empresa inicial");
  const foreign = await register("multi-foreign", "Otra empresa");
  const created = await request("POST", "/api/organizations", owner, {
    name: "Empresa independiente",
  });
  assert.equal(created.status, 200);
  const target = created.body.organization.id;
  const switched = await request(
    "POST",
    "/api/auth/switch-organization",
    owner,
    { organizationId: target },
  );
  assert.equal(switched.status, 200);
  const context = { ...switched.body.user, token: switched.body.token };
  assert.equal(context.organizationId, target);
  assert.equal(
    (await request("GET", "/api/auth/me", context)).body.user.organizationId,
    target,
  );
  assert.equal(
    (
      await request("POST", "/api/auth/switch-organization", foreign, {
        organizationId: target,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("POST", "/api/sync/push", context, {
        projects: [project("multi-private-project")],
      })
    ).status,
    200,
  );
  const sourceProjects = (await request("POST", "/api/sync/pull", owner, {}))
    .body.projects;
  assert.ok(!sourceProjects.some((p: any) => p.id === "multi-private-project"));
  const list = (await request("GET", "/api/organizations", owner)).body
    .organizations;
  assert.equal(list.length, 2);
  assert.ok(!list.some((o: any) => o.id === foreign.organizationId));
});

test("company profile uses CAS, preserves omitted RNC, and rejects foreign/editor writes", async () => {
  const owner = await register("profile-owner");
  const member = await provision("EDITOR", "profile-editor", owner);
  const profile = (await request("GET", "/api/organization/profile", owner))
    .body;
  const saved = await request("PATCH", "/api/organization/profile", owner, {
    baseVersion: profile.version,
    profile: {
      name: "Empresa fiscal",
      rncOrId: "TEST-123",
      phone: "8091234567",
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (
      await request("PATCH", "/api/organization/profile", owner, {
        baseVersion: profile.version,
        profile: { name: "Vieja" },
      })
    ).status,
    409,
  );
  const renamed = await request("PATCH", "/api/organization/profile", owner, {
    baseVersion: saved.body.version,
    profile: { name: "Nueva razón social" },
  });
  assert.equal(renamed.body.profile.rncOrId, "TEST-123");
  assert.equal(
    (
      await request("PATCH", "/api/organization/profile", member, {
        baseVersion: renamed.body.version,
        profile: { name: "Editor" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("PATCH", "/api/organization/profile", owner, {
        baseVersion: renamed.body.version,
        profile: { name: "Mal color", primaryColor: ["#123456"] },
      })
    ).status,
    400,
  );
  assert.notEqual(
    (await request("GET", "/api/organization/profile", other)).body.profile
      .name,
    "Nueva razón social",
  );
});

test("invitations bind email and role; revocation cannot be bypassed with a pending code", async () => {
  const owner = await register("invite-owner");
  const invited = await register("invite-member");
  const stranger = await register("invite-stranger");
  const issue = async () => {
    const r = await request("POST", "/api/organization/invitations", owner, {
      email: invited.email,
      role: "EDITOR",
    });
    assert.equal(r.status, 200);
    return r.body;
  };
  const first = await issue();
  const spare = await issue();
  assert.equal(
    (
      await request("POST", "/api/auth/accept-invitation", stranger, {
        code: first.code,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("POST", "/api/auth/accept-invitation", invited, {
        code: first.code,
      })
    ).status,
    200,
  );
  const session = (
    await request("POST", "/api/auth/switch-organization", invited, {
      organizationId: owner.organizationId,
    })
  ).body;
  const contextual = { ...session.user, token: session.token };
  assert.equal(contextual.role, "EDITOR");
  assert.equal((await request("GET", "/api/users", contextual)).status, 403);
  const members = (await request("GET", "/api/users", owner)).body.users;
  assert.equal(
    members.find((u: any) => u.id === invited.id).canEditIdentity,
    false,
  );
  assert.equal(
    (
      await request("PATCH", "/api/users/" + invited.id, owner, {
        name: "Nombre ajeno",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("PATCH", "/api/users/" + invited.id, owner, {
        password: "foreign-password",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("DELETE", "/api/users/" + invited.id, owner)).status,
    200,
  );
  assert.equal((await request("GET", "/api/auth/me", contextual)).status, 401);
  assert.equal(
    (
      await request("POST", "/api/auth/accept-invitation", invited, {
        code: spare.code,
      })
    ).status,
    403,
  );
  assert.equal((await request("GET", "/api/auth/me", invited)).status, 200);
  const stored = (
    await pool.query(
      "SELECT token_hash FROM organization_invitations WHERE id=$1",
      [first.invitation.id],
    )
  ).rows[0].token_hash;
  assert.notEqual(stored, first.code);
});

test("password reset invalidates previously issued access and refresh tokens", async () => {
  const owner = await register("reset-owner");
  const member = await provision("EDITOR", "reset-member", owner);
  assert.equal(
    (
      await request("PATCH", "/api/users/" + member.id, owner, {
        password: "replacement-password",
      })
    ).status,
    200,
  );
  assert.equal((await request("GET", "/api/auth/me", member)).status, 401);
  assert.equal(
    (await request("POST", "/api/auth/refresh", member, {})).status,
    401,
  );
  assert.equal(
    (
      await request("POST", "/api/auth/login", undefined, {
        email: member.email,
        password: "isolated-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("POST", "/api/auth/login", undefined, {
        email: member.email,
        password: "replacement-password",
      })
    ).status,
    200,
  );
});

test("queued project push rechecks secondary membership after removal", async () => {
  const owner = await register("queued-owner");
  const invited = await register("queued-invited");
  const invite = (
    await request("POST", "/api/organization/invitations", owner, {
      email: invited.email,
      role: "EDITOR",
    })
  ).body;
  assert.equal(
    (
      await request("POST", "/api/auth/accept-invitation", invited, {
        code: invite.code,
      })
    ).status,
    200,
  );
  const session = (
    await request("POST", "/api/auth/switch-organization", invited, {
      organizationId: owner.organizationId,
    })
  ).body;
  const context = { token: session.token };
  const blocker = await pool.connect();
  let pending: Promise<any> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `solarsim-projects:${owner.organizationId}`,
    ]);
    pending = request("POST", "/api/sync/push", context, {
      projects: [project("queued-revoked-project")],
    });
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const result = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%' AND pid<>pg_backend_pid()",
      );
      if (result.rows.length) {
        waiting = true;
        break;
      }
      await delay(10);
    }
    assert.ok(waiting, "Push reached its lock before membership removal");
    assert.equal(
      (await request("DELETE", "/api/users/" + invited.id, owner)).status,
      200,
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.equal((await pending!).status, 401);
  assert.equal(
    (
      await pool.query("SELECT id FROM projects WHERE id=$1", [
        "queued-revoked-project",
      ])
    ).rows.length,
    0,
  );
});

test("private custom Electsun equipment does not become a public reference", async () => {
  await pool.query(
    "INSERT INTO equipment_catalog(id,organization_id,type,brand,model_series,display_name) VALUES('private-electsun-model','org-electsun-default','panel','Private','Private','Private company model')",
  );
  const catalog = (await request("GET", "/api/equipment", other)).body.items;
  assert.ok(!catalog.some((item: any) => item.id === "private-electsun-model"));
});

test("retiring primary access preserves identity and attribution from past secondary work", async () => {
  const owner = await register("retirement-owner");
  const member = await provision("EDITOR", "retirement-member", owner);
  const foreign = await register("retirement-foreign");
  const invite = (
    await request("POST", "/api/organization/invitations", foreign, {
      email: member.email,
      role: "EDITOR",
    })
  ).body;
  await request("POST", "/api/auth/accept-invitation", member, {
    code: invite.code,
  });
  const switched = (
    await request("POST", "/api/auth/switch-organization", member, {
      organizationId: foreign.organizationId,
    })
  ).body;
  const contextual = { token: switched.token };
  await request("POST", "/api/sync/push", contextual, {
    projects: [project("retirement-attribution")],
  });
  assert.equal(
    (await request("DELETE", "/api/users/" + member.id, foreign)).status,
    200,
  );
  assert.equal(
    (await request("DELETE", "/api/users/" + member.id, owner)).status,
    200,
  );
  const account = (
    await pool.query("SELECT id,is_active FROM users WHERE id=$1", [member.id])
  ).rows[0];
  assert.equal(account.id, member.id);
  assert.equal(account.is_active, false);
  assert.equal((await request("GET", "/api/auth/me", member)).status, 401);
  const row = (
    await pool.query("SELECT created_by_id FROM projects WHERE id=$1", [
      "retirement-attribution",
    ])
  ).rows[0];
  assert.equal(row.created_by_id, member.id);
});
