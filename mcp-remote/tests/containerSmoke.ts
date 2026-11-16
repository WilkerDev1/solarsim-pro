import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Explicit smoke test of the packaged service, isolated from production and cleaned in finally.
 * Needs both images: `docker build -f server/Dockerfile -t solarsim-api:qa-modular .` and
 * `docker build -f mcp-remote/Dockerfile -t solarsim-mcp-remote:qa .` (names overridable by env).
 * Run: npx tsx mcp-remote/tests/containerSmoke.ts
 */
const API_IMAGE = process.env.API_IMAGE ?? "solarsim-api:qa-modular";
const MCP_IMAGE = process.env.MCP_IMAGE ?? "solarsim-mcp-remote:qa";
const suffix = randomUUID();
const network = `solarsim-mcpqa-${suffix}`;
const database = `solarsim-mcpqa-pg-${suffix}`;
const api = `solarsim-mcpqa-api-${suffix}`;
const mcp = `solarsim-mcpqa-mcp-${suffix}`;
const MCP_URL = "https://mcp.example.invalid/mcp";
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
const client = {
  "X-SolarSim-Client": "desktop/2.7.4",
  "Content-Type": "application/json",
};
async function waitFor(url: string, name: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup wait */
    }
    await pause();
  }
  console.error(docker("logs", "--tail", "20", name));
  assert.fail(`${name} did not become healthy`);
}
const rpc = (base: string, token: string | null, body: unknown) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

try {
  // A bad configuration fails at startup with a non-zero exit, before listening.
  let failed = false;
  try {
    docker(
      "run",
      "--rm",
      "-e",
      "MCP_PUBLIC_URL=http://insecure.example/mcp",
      "-e",
      "API_INTERNAL_URL=http://x:3000",
      MCP_IMAGE,
    );
  } catch {
    failed = true;
  }
  assert.ok(failed, "invalid MCP_PUBLIC_URL must stop the service");

  const password = randomUUID();
  docker("network", "create", network);
  docker(
    "run",
    "-d",
    "--name",
    database,
    "--network",
    network,
    "-e",
    "POSTGRES_USER=qa_user",
    "-e",
    "POSTGRES_DB=qa_db",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:16-alpine",
  );
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    try {
      docker(
        "exec",
        database,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "qa_user",
        "-d",
        "qa_db",
      );
      ready = true;
    } catch {
      await pause();
    }
  }
  assert.ok(ready, "isolated PostgreSQL must become ready");
  docker(
    "run",
    "-d",
    "--name",
    api,
    "--network",
    network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    `DB_HOST=${database}`,
    "-e",
    "DB_USER=qa_user",
    "-e",
    "DB_NAME=qa_db",
    "-e",
    `DB_PASSWORD=${password}`,
    "-e",
    `JWT_SECRET=${randomUUID()}${randomUUID()}`,
    "-e",
    "MCP_REMOTE_ENABLED=true",
    "-e",
    `MCP_REMOTE_URL=${MCP_URL}`,
    API_IMAGE,
  );
  const apiBase = `http://${docker("port", api, "3000").split("\n")[0]}`;
  await waitFor(`${apiBase}/api/health`, api);
  // The MCP container only knows the API's internal address: no database credentials, no JWT secret.
  docker(
    "run",
    "-d",
    "--name",
    mcp,
    "--network",
    network,
    "-p",
    "127.0.0.1::8787",
    "-e",
    `MCP_PUBLIC_URL=${MCP_URL}`,
    "-e",
    `API_INTERNAL_URL=http://${api}:3000`,
    MCP_IMAGE,
  );
  const mcpBase = `http://${docker("port", mcp, "8787").split("\n")[0]}`;
  await waitFor(`${mcpBase}/health`, mcp);
  assert.notEqual(docker("exec", mcp, "id", "-u"), "0", "runs as non-root");
  const env = docker("exec", mcp, "env");
  assert.ok(
    !/DB_PASSWORD|JWT_SECRET/.test(env),
    "no secrets in the MCP container",
  );
  assert.equal(
    (await fetch(`${mcpBase}/health?deep=1`)).status,
    200,
    "reaches the API on the internal network",
  );

  const anonymous = await rpc(mcpBase, null, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  assert.equal(anonymous.status, 401);
  assert.equal((await fetch(`${mcpBase}/mcp`)).status, 405);

  const registration = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: client,
    body: JSON.stringify({
      name: "Synthetic QA",
      email: `${suffix}@example.invalid`,
      password: randomUUID(),
      organizationName: "Isolated QA",
    }),
  });
  const session = (await registration.json()) as { token: string };
  const grant = await fetch(`${apiBase}/api/agent-access/grants`, {
    method: "POST",
    headers: { ...client, Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name: "smoke", scope: "write", expiresInDays: 30 }),
  });
  assert.equal(grant.status, 201);
  const { token } = (await grant.json()) as { token: string };
  const init = await rpc(mcpBase, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "smoke", version: "1" },
    },
  });
  assert.equal(init.status, 200);
  assert.equal(
    ((await init.json()) as any).result.serverInfo.name,
    "solarsim-remote",
  );
  const created = await rpc(mcpBase, token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "create_client", arguments: { name: "Cliente QA" } },
  });
  assert.equal(
    ((await created.json()) as any).result.structuredContent.status,
    "applied",
  );
  const clients = await fetch(`${apiBase}/api/clients`, {
    headers: { ...client, Authorization: `Bearer ${session.token}` },
  });
  assert.ok(
    ((await clients.json()) as any).clients.some(
      (c: any) => c.name === "Cliente QA",
    ),
  );

  // Clean shutdown: SIGTERM ends the stateless process promptly with exit code 0.
  const started = Date.now();
  docker("stop", "--time", "15", mcp);
  assert.ok(Date.now() - started < 12000, "stops before the kill timeout");
  assert.equal(docker("inspect", mcp, "--format", "{{.State.ExitCode}}"), "0");
  console.log("mcp-remote container smoke: ok");
} finally {
  for (const name of [mcp, api, database]) {
    try {
      docker("rm", "-f", name);
    } catch {
      /* already gone */
    }
  }
  try {
    docker("network", "rm", network);
  } catch {
    /* already gone */
  }
}
