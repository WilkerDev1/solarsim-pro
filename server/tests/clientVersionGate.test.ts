import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
// The gate runs before any route: a pool that only answers the health probe is enough to prove what it lets through.
const pool = { query: async () => ({ rows: [{}] }) } as unknown as Pool;
const app = (minClientVersion?: string) =>
  createApp({ pool, jwtSecret: secret, logging: false, minClientVersion });
const call = (
  application: ReturnType<typeof createApp>,
  method: string,
  path: string,
  client?: string,
) =>
  application.request(path, {
    method,
    headers: {
      ...(client !== undefined ? { "X-SolarSim-Client": client } : {}),
    },
  });

test("data routes answer 426 client_outdated without a client header, with an old, malformed or pre-release version", async () => {
  const application = app();
  for (const client of [
    undefined,
    "",
    "desktop/2.7.0",
    "desktop/2.6.0",
    "desktop/2.7.1-beta.1",
    "desktop/latest",
    "2.7.1",
    "desktop/2.7.1/extra",
  ]) {
    for (const [method, path] of [
      ["POST", "/api/sync/pull"],
      ["POST", "/api/sync/push"],
      ["GET", "/api/clients"],
      ["GET", "/api/equipment"],
      ["POST", "/api/auth/register"],
      ["POST", "/api/auth/share-authorization"],
      ["GET", "/api/ruta-que-no-existe"],
    ]) {
      const response = await call(application, method, path, client);
      assert.equal(response.status, 426, `${method} ${path} [${client}]`);
      assert.deepEqual(await response.json(), {
        error: "client_outdated",
        minVersion: "2.7.1",
        message:
          "Actualiza SolarSim a la versión 2.7.1 o superior para seguir sincronizando.",
      });
    }
  }
});

test("the minimum itself and newer clients pass the gate (they reach authentication)", async () => {
  const application = app();
  for (const client of [
    "desktop/2.7.1",
    "desktop/2.7.2",
    "desktop/2.10.0",
    "share-viewer/3.0.0",
    "mcp/2.7.1+build.5",
  ])
    assert.equal(
      (await call(application, "GET", "/api/clients", client)).status,
      401,
      client,
    );
});

test("health, login, refresh, identity and CORS preflight stay open for outdated clients", async () => {
  const application = app();
  assert.equal((await call(application, "GET", "/api/health")).status, 200);
  for (const [method, path] of [
    ["POST", "/api/auth/login"],
    ["POST", "/api/auth/refresh"],
    ["GET", "/api/auth/me"],
  ])
    assert.notEqual(
      (await call(application, method, path, "desktop/2.6.0")).status,
      426,
      path,
    );
  const preflight = await application.request("/api/sync/push", {
    method: "OPTIONS",
    headers: {
      Origin: "file://",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization,content-type,x-solarsim-client",
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(
    preflight.headers.get("access-control-allow-headers") ?? "",
    /X-SolarSim-Client/i,
  );
});

test("the 426 carries CORS headers so the renderer can read it", async () => {
  const response = await application426();
  assert.equal(response.status, 426);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
const application426 = () =>
  app().request("/api/sync/pull", {
    method: "POST",
    headers: { Origin: "file://" },
  });

test("the minimum is configurable per app and defaults to 2.7.1", async () => {
  assert.equal(
    (await call(app("2.8.0"), "GET", "/api/clients", "desktop/2.7.9")).status,
    426,
  );
  const body = await (
    await call(app("2.8.0"), "GET", "/api/clients", "desktop/2.7.9")
  ).json();
  assert.equal(body.minVersion, "2.8.0");
  assert.equal(
    (await call(app("2.8.0"), "GET", "/api/clients", "desktop/2.8.0")).status,
    401,
  );
  assert.throws(() => app("no-es-semver"), /MIN_CLIENT_VERSION/);
});

test("MIN_CLIENT_VERSION is read from the environment, defaults to 2.7.1 and rejects malformed values at startup", () => {
  const base = { JWT_SECRET: secret, DB_PASSWORD: "private-test-password" };
  assert.equal(readConfig(base).minClientVersion, "2.7.1");
  assert.equal(
    readConfig({ ...base, MIN_CLIENT_VERSION: "2.8.0" }).minClientVersion,
    "2.8.0",
  );
  assert.equal(
    readConfig({ ...base, MIN_CLIENT_VERSION: "" }).minClientVersion,
    "2.7.1",
  );
  for (const bad of ["2.8", "v2.8.0", "latest", "2.8.0.1"])
    assert.throws(
      () => readConfig({ ...base, MIN_CLIENT_VERSION: bad }),
      /MIN_CLIENT_VERSION/,
      bad,
    );
});
