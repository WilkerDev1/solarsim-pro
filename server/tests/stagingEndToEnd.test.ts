import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrateDatabase } from "../src/database/migrations.js";
import { createShareViewer } from "../../workers/share-viewer/src/index.js";
import { BENCHMARK_PROJECT } from "../../src/engine/referenceCase.js";
import { calculateProjectFinancialSummary } from "../../src/engine/financeEngine.js";
import { ShareProposalService } from "../../src/services/shareProposalService.js";
import { useSimulationStore } from "../../src/store/useSimulationStore.js";

const exec = promisify(execFile);
const container = `solarsim-staging-e2e-${crypto.randomUUID()}`;
const jwtSecret = "staging-e2e-secret-key-32-chars-long-0123456789";

let pool: pg.Pool;
let apiApp: ReturnType<typeof createApp>;
let workerApp: ReturnType<typeof createShareViewer>;
const kvStore = new Map<string, string>();

let anaToken: string;
let anaUser: any;
let veraToken: string;
let veraUser: any;

before(async () => {
  // 1. Launch ephemeral PostgreSQL container
  await exec("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=solarsim_qa",
    "--env",
    "POSTGRES_PASSWORD=isolated-qa-password",
    "--env",
    "POSTGRES_DB=solarsim_qa",
    "postgres:16-alpine",
  ]);

  const portOutput = await exec("docker", ["port", container, "5432/tcp"]);
  const port = Number(portOutput.stdout.trim().split(":").at(-1));

  pool = new pg.Pool({
    host: "127.0.0.1",
    port,
    user: "solarsim_qa",
    password: "isolated-qa-password",
    database: "solarsim_qa",
    connectionTimeoutMillis: 1000,
  });

  for (let i = 0; i < 30; i++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch {
      await delay(200);
    }
  }

  // 2. Apply all database migrations (001, 002, 003)
  await migrateDatabase(pool);

  // 3. Create API application instance
  apiApp = createApp({ pool, jwtSecret, logging: false });

  // 4. Create Worker instance with fetch routed to the synthetic API instance
  const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const response = await apiApp.request(url.pathname + url.search, init);
    return response;
  };
  workerApp = createShareViewer(apiFetch as typeof fetch);

  // 5. Register Admin user (Ana)
  const anaReg = await apiApp.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Ana Staging",
      email: "ana@staging.example.invalid",
      password: "password1234",
      organizationName: "QA SolarSim Dominicana",
    }),
  });
  assert.equal(anaReg.status, 200);
  const anaData = (await anaReg.json()) as any;
  anaToken = anaData.token;
  anaUser = anaData.user;

  // 6. Provision and register Reader user (Vera) in the same organization
  const veraProvision = await apiApp.request("/api/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anaToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Vera Reader",
      email: "vera@staging.example.invalid",
      password: "password1234",
      role: "LECTOR",
    }),
  });
  assert.equal(veraProvision.status, 200);

  const veraLogin = await apiApp.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "vera@staging.example.invalid",
      password: "password1234",
    }),
  });
  assert.equal(veraLogin.status, 200);
  const veraData = (await veraLogin.json()) as any;
  veraToken = veraData.token;
  veraUser = veraData.user;
});

after(async () => {
  if (pool) await pool.end();
  await exec("docker", ["rm", "-f", container]).catch(() => {});
});

test("Staging E2E: completo ciclo de confirmación de política, publicación web, snapshot y permisos", async () => {
  const localStore = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) =>
        localStore.set(key, String(value)),
      removeItem: (key: string) => localStore.delete(key),
      clear: () => localStore.clear(),
      get length() {
        return localStore.size;
      },
      key: (i: number) => Array.from(localStore.keys())[i] ?? null,
    },
    configurable: true,
  });

  const env = {
    AUTH_API_URL: "https://solarsim.electsun.net",
    PROPOSALS_KV: {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    },
  };

  // Mock global fetch to route to synthetic apps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    if (url.origin === "https://solarsim.electsun.net") {
      return apiApp.request(url.pathname + url.search, init);
    }
    if (
      url.origin === "https://propuesta.electsun.net" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    ) {
      return workerApp.request(
        "https://propuesta.electsun.net" + url.pathname + url.search,
        init,
        env as never,
      );
    }
    return originalFetch(input, init);
  };

  try {
    // A. Verify Vera (LECTOR) is rejected from publishing
    useSimulationStore.setState({
      syncSettings: {
        serverUrl: "https://solarsim.electsun.net",
        authToken: veraToken,
        currentUser: veraUser,
        autoSyncEnabled: false,
        lastSyncTimestamp: null,
      },
    });

    const testProject = structuredClone(BENCHMARK_PROJECT);
    testProject.client.name = "Cliente Sintético Staging";

    const readerResult = await ShareProposalService.shareProposal(
      testProject,
      calculateProjectFinancialSummary(testProject, "legacy"),
      7,
      "https://propuesta.electsun.net",
    );

    assert.equal(readerResult.success, false);
    assert.match(
      readerResult.error || "",
      /no tiene permiso para publicar propuestas/i,
    );

    // B. Switch to Ana (ADMIN) and publish with legacy snapshot
    useSimulationStore.setState({
      syncSettings: {
        serverUrl: "https://solarsim.electsun.net",
        authToken: anaToken,
        currentUser: anaUser,
        autoSyncEnabled: false,
        lastSyncTimestamp: null,
      },
      organizationFeaturePolicies: {},
    });

    // Share proposal as Admin
    const legacyResult = await ShareProposalService.shareProposal(
      testProject,
      calculateProjectFinancialSummary(testProject, "legacy"),
      7,
      "https://propuesta.electsun.net",
    );

    assert.equal(
      legacyResult.success,
      true,
      `Publication should succeed: ${legacyResult.error}`,
    );
    assert.ok(legacyResult.shareUrl);
    assert.ok(legacyResult.id);

    // C. Read the published proposal from the Worker
    const viewResponse = await fetch(legacyResult.shareUrl!);
    assert.equal(viewResponse.status, 200);
    const html = await viewResponse.text();
    assert.match(html, /Cliente Sintético Staging/);
    assert.match(html, /Propuesta/i);

    // Check JSON metadata endpoint
    const metaResponse = await fetch(
      `https://propuesta.electsun.net/api/share/${legacyResult.id}`,
    );
    assert.equal(metaResponse.status, 200);
    const metaJson = (await metaResponse.json()) as any;
    assert.equal(metaJson.success, true);
    assert.equal(metaJson.calculationSnapshot.mode, "legacy");
    assert.equal(
      metaJson.calculationSnapshot.organizationId,
      anaUser.organizationId,
    );

    // D. Update organization feature policy to physical projection (with CAS baseVersion)
    const policyGet = await apiApp.request("/api/organization/features", {
      headers: { Authorization: `Bearer ${anaToken}` },
    });
    const currentPolicy = (await policyGet.json()) as any;
    assert.equal(currentPolicy.version, 1);

    const policyPatch = await apiApp.request("/api/organization/features", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${anaToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: currentPolicy.version,
        settings: { selfConsumptionProjection: true },
      }),
    });
    assert.equal(policyPatch.status, 200);
    const updatedPolicy = (await policyPatch.json()) as any;
    assert.equal(updatedPolicy.version, 2);
    assert.equal(updatedPolicy.settings.selfConsumptionProjection, true);

    // E. Share second proposal with physical projection mode
    const physicalResult = await ShareProposalService.shareProposal(
      testProject,
      calculateProjectFinancialSummary(testProject, "self_consumption"),
      15,
      "https://propuesta.electsun.net",
    );

    assert.equal(physicalResult.success, true);
    assert.ok(physicalResult.shareUrl);

    // Read the second proposal metadata
    const physicalMeta = await fetch(
      `https://propuesta.electsun.net/api/share/${physicalResult.id}`,
    );
    assert.equal(physicalMeta.status, 200);
    const physicalJson = (await physicalMeta.json()) as any;
    assert.equal(physicalJson.calculationSnapshot.mode, "self_consumption");
    assert.equal(physicalJson.calculationSnapshot.policyVersion, 2);

    // F. Verify the legacy proposal remains intact in KV (immutable publication)
    const legacyMetaRecheck = await fetch(
      `https://propuesta.electsun.net/api/share/${legacyResult.id}`,
    );
    const legacyJsonRecheck = (await legacyMetaRecheck.json()) as any;
    assert.equal(legacyJsonRecheck.calculationSnapshot.mode, "legacy");
    assert.equal(legacyJsonRecheck.calculationSnapshot.policyVersion, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
