import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../server/src/app.js";
import { migrateDatabase } from "../../server/src/database/migrations.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "../../server/tests/helpers/ephemeralPostgres.js";
import { createMcpApp } from "../src/app.js";
import type { McpRemoteConfig } from "../src/config.js";

/**
 * Real API (throwaway PostgreSQL in Docker) + real MCP service + the official MCP SDK client.
 * No network: both apps are wired through in-memory fetch.
 */
const MCP_URL = "https://mcp.example.test/mcp";
const ISSUER = "https://api.example.test";
const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
let database: EphemeralPostgres;
let api: ReturnType<typeof createApp>;
let mcp: ReturnType<typeof createMcpApp>;
let editor: any;
let reader: any;

const apiFetch = ((input: any, init?: RequestInit) =>
  api.request(String(input), init)) as typeof fetch;
const mcpFetch = ((input: any, init?: RequestInit) =>
  mcp.request(String(input), init)) as typeof fetch;
const desktop = {
  "X-SolarSim-Client": "desktop/2.7.4",
  "Content-Type": "application/json",
};
async function apiCall(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
) {
  const response = await api.request(path, {
    method,
    headers: {
      ...desktop,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
async function connect(token: string) {
  const client = new Client({ name: "e2e-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: mcpFetch,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}
const structured = (result: any) => result.structuredContent as any;

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-mcp-e2e");
    await migrateDatabase(database.pool);
    api = createApp({
      pool: database.pool,
      jwtSecret: secret,
      logging: false,
      agentAccess: {
        enabled: true,
        mcpUrl: MCP_URL,
        oauth: { issuer: ISSUER },
      },
    });
    const config: McpRemoteConfig = {
      port: 0,
      host: "127.0.0.1",
      publicUrl: MCP_URL,
      apiUrl: "http://api.internal:3000",
      authorizationServer: ISSUER,
      allowedOrigins: [],
      allowedHosts: ["mcp.example.test"],
      clientIp: { trustedProxies: [] },
      maxBodyBytes: 256 * 1024,
    };
    mcp = createMcpApp({ config, fetch: apiFetch, identityTtlMs: 0 });
    const reg = await apiCall("POST", "/api/auth/register", undefined, {
      name: "e2e-admin",
      email: "e2e-admin@example.test",
      password: "isolated-password",
    });
    const admin = { ...reg.body.user, token: reg.body.token };
    for (const [role, name] of [
      ["EDITOR", "e2e-editor"],
      ["LECTOR", "e2e-reader"],
    ]) {
      await apiCall("POST", "/api/users", admin.token, {
        name,
        email: `${name}@example.test`,
        password: "isolated-password",
        role,
      });
      const login = await apiCall("POST", "/api/auth/login", undefined, {
        email: `${name}@example.test`,
        password: "isolated-password",
      });
      if (role === "EDITOR")
        editor = { ...login.body.user, token: login.body.token };
      else reader = { ...login.body.user, token: login.body.token };
    }
    const pushed = await apiCall("POST", "/api/sync/push", editor.token, {
      projects: [
        {
          id: "e2e-p1",
          client: {
            name: "Hotel Brisa",
            projectId: "SP-77",
            province: "Puerto Plata",
          },
          specs: { panels: [] },
          status: "Draft",
        },
      ],
    });
    assert.equal(pushed.status, 200);
  },
  { timeout: 120000 },
);
after(async () => {
  await database?.stop();
});

test("SDK oficial: token personal de escritura, herramientas y efectos en la API", async () => {
  const created = await apiCall(
    "POST",
    "/api/agent-access/grants",
    editor.token,
    { name: "e2e", scope: "write", expiresInDays: 30 },
  );
  const client = await connect(created.body.token);
  assert.equal(client.getServerVersion()?.name, "solarsim-remote");
  assert.match(client.getInstructions() ?? "", /MCP remoto/);
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "create_client"));
  assert.ok(!tools.some((t) => t.name === "move_proposal_to_trash"));

  const search = await client.callTool({
    name: "search_projects",
    arguments: { query: "brisa" },
  });
  assert.equal(structured(search).data.projects[0].id, "e2e-p1");
  const project = structured(
    await client.callTool({ name: "get_project", arguments: { id: "e2e-p1" } }),
  ).data;
  assert.equal(project.client.name, "Hotel Brisa");
  assert.ok(project.equipment.panels);

  const made = await client.callTool({
    name: "create_client",
    arguments: { name: "Hotel Brisa SRL", taxId: "1-31-12345-6" },
  });
  assert.equal(structured(made).status, "applied");
  const clientId = structured(made).data.clientId;
  const linked = await client.callTool({
    name: "link_proposal_to_client",
    arguments: { proposalId: "e2e-p1", clientId },
  });
  assert.equal(structured(linked).status, "applied");
  const detail = structured(
    await client.callTool({ name: "get_client", arguments: { id: clientId } }),
  ).data;
  assert.equal(detail.summary.total, 1);
  assert.equal(detail.proposals[0].printedName, "Hotel Brisa");
  const found = structured(
    await client.callTool({
      name: "search_clients",
      arguments: { query: "131123456" },
    }),
  ).data;
  assert.equal(found.clients[0].id, clientId);
  const updated = await client.callTool({
    name: "update_client",
    arguments: { id: clientId, phone: "809-555-0101" },
  });
  assert.equal(structured(updated).data.client.phone, "809-555-0101");

  // The desktop sees the same data through its normal pull, with the version bumped by the API.
  const pull = await apiCall("POST", "/api/sync/pull", editor.token, {});
  assert.equal(
    pull.body.projects.find((p: any) => p.id === "e2e-p1").clientId,
    clientId,
  );
  const guarded = await client.callTool({
    name: "delete_client",
    arguments: { id: clientId },
  });
  assert.equal(structured(guarded).code, "confirmation_required");
  const activity = await apiCall(
    "GET",
    "/api/agent-access/activity",
    editor.token,
  );
  const tools_ = activity.body.activity.map((a: any) => a.tool);
  for (const tool of [
    "create_client",
    "link_proposal_to_client",
    "update_client",
    "search_projects",
  ])
    assert.ok(tools_.includes(tool), tool);
  assert.equal(activity.body.activity[0].clientLabel, "e2e-agent");
  await client.close();
});

test("SDK oficial: un lector solo consulta aunque pida escribir", async () => {
  const created = await apiCall(
    "POST",
    "/api/agent-access/grants",
    reader.token,
    { name: "e2e-r", scope: "read", expiresInDays: 30 },
  );
  const client = await connect(created.body.token);
  const { tools } = await client.listTools();
  assert.ok(
    tools.length > 0 &&
      tools.every((t) => t.annotations?.readOnlyHint === true),
  );
  const denied = await client.callTool({
    name: "create_client",
    arguments: { name: "No" },
  });
  assert.equal(denied.isError, true);
  await client.close();
  await apiCall(
    "DELETE",
    `/api/agent-access/grants/${created.body.grant.id}`,
    reader.token,
  );
  await assert.rejects(
    connect(created.body.token),
    "a revoked token cannot even initialize",
  );
});

test("OAuth de extremo a extremo: descubrimiento, registro, consentimiento y uso del token", async () => {
  // 1. Unauthenticated request → 401 pointing at the protected resource metadata.
  const first = await mcp.request(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "chatgpt", version: "1" },
      },
    }),
  });
  assert.equal(first.status, 401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(
    first.headers.get("WWW-Authenticate")!,
  )![1];
  const prm: any = await (await mcp.request(metadataUrl)).json();
  assert.equal(prm.resource, MCP_URL);
  // 2. Authorization server metadata on the API.
  const as: any = await (
    await api.request(
      `${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`,
    )
  ).json();
  // 3. Dynamic registration, consent, code, token.
  const reg: any = await (
    await api.request(as.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "ChatGPT",
        redirect_uris: [
          "https://chatgpt.com/connector_platform_oauth_redirect",
        ],
      }),
    })
  ).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = {
    client_id: reg.client_id,
    redirect_uri: reg.redirect_uris[0],
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "solarsim:read solarsim:write",
    resource: MCP_URL,
  };
  // The browser loads the consent page (anti-CSRF cookie + hidden field), then submits it.
  const page = await api.request(
    `${as.authorization_endpoint}?${new URLSearchParams(query)}`,
  );
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1];
  const cookie = page.headers.get("set-cookie")!.split(";")[0];
  const form = new URLSearchParams({
    ...query,
    csrf,
    decision: "allow",
    email: "e2e-editor@example.test",
    password: "isolated-password",
    grant_scope: "write",
  });
  const consent = await api.request(as.authorization_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: form.toString(),
  });
  const code = new URL(consent.headers.get("location")!).searchParams.get(
    "code",
  )!;
  const tokens: any = await (
    await api.request(as.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: reg.client_id,
        redirect_uri: reg.redirect_uris[0],
        code_verifier: verifier,
        resource: MCP_URL,
      }).toString(),
    })
  ).json();
  // 4. The access token works through the MCP service.
  const client = await connect(tokens.access_token);
  const result = await client.callTool({
    name: "search_projects",
    arguments: { query: "" },
  });
  assert.equal(structured(result).status, "ok");
  await client.close();
});
