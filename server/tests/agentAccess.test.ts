import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { createApp } from "../src/app.js";
import { parseAgentAccessConfig } from "../src/config.js";
import { migrateDatabase } from "../src/database/migrations.js";
import {
  redirectMatches,
  sameResource,
  validRedirectUri,
} from "../src/modules/agentAccess/oauth.js";
import { asClient } from "./helpers/clientHeader.js";
import {
  startEphemeralPostgres,
  type EphemeralPostgres,
} from "./helpers/ephemeralPostgres.js";

const secret =
  "test-only-private-secret-never-used-outside-local-tests-0123456789";
const MCP_URL = "https://mcp.example.test/mcp";
const ISSUER = "https://api.example.test";
const AGENT = "mcp-remote/2.7.4";
let database: EphemeralPostgres;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;
let disabled: ReturnType<typeof createApp>;
let admin: any, editor: any, reader: any, other: any;

async function call(
  target: ReturnType<typeof createApp>,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await target.request(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json, headers: response.headers };
}
const request = (
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers?: Record<string, string>,
) => call(app, method, path, token, body, headers);
const asAgent = (
  method: string,
  path: string,
  token: string,
  body?: unknown,
  tool?: string,
) =>
  request(method, path, token, body, {
    "X-SolarSim-Client": AGENT,
    ...(tool ? { "X-SolarSim-Agent-Tool": tool } : {}),
    "X-SolarSim-Agent-Client": "claude-ai",
  });

async function register(name: string) {
  const r = await request("POST", "/api/auth/register", undefined, {
    name,
    email: `${name}@example.test`,
    password: "isolated-password",
  });
  assert.equal(r.status, 200);
  return { ...r.body.user, token: r.body.token };
}
async function provision(role: string, name: string) {
  const created = await request("POST", "/api/users", admin.token, {
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
  return { ...login.body.user, token: login.body.token };
}
const createToken = (user: any, scope: string, name = "Prueba") =>
  request("POST", "/api/agent-access/grants", user.token, {
    name,
    scope,
    expiresInDays: 30,
  });

before(
  async () => {
    database = await startEphemeralPostgres("solarsim-agent-access");
    pool = database.pool;
    await migrateDatabase(pool);
    app = asClient(
      createApp({
        pool,
        jwtSecret: secret,
        logging: false,
        agentAccess: {
          enabled: true,
          mcpUrl: MCP_URL,
          oauth: { issuer: ISSUER },
        },
      }),
    );
    disabled = asClient(createApp({ pool, jwtSecret: secret, logging: false }));
    admin = await register("agent-admin");
    other = await register("agent-other");
    editor = await provision("EDITOR", "agent-editor");
    reader = await provision("LECTOR", "agent-reader");
    const pushed = await request("POST", "/api/sync/push", editor.token, {
      projects: [
        {
          id: "agent-p1",
          client: {
            name: "Ferretería Solar",
            projectId: "SP-001",
            province: "Santiago",
          },
          specs: {},
          status: "Draft",
        },
        {
          id: "agent-p2",
          client: {
            name: "Colmado Luz",
            projectId: "SP-002",
            province: "La Vega",
          },
          specs: {},
        },
      ],
    });
    assert.equal(pushed.status, 200);
    await request("POST", "/api/sync/push", other.token, {
      projects: [{ id: "agent-foreign", client: { name: "Ajeno" }, specs: {} }],
    });
  },
  { timeout: 120000 },
);
after(async () => {
  await database?.stop();
});

test("configuración: desactivado por defecto y URLs públicas validadas", () => {
  assert.deepEqual(parseAgentAccessConfig({}), { enabled: false });
  assert.throws(() => parseAgentAccessConfig({ MCP_OAUTH_ENABLED: "true" }));
  assert.throws(() =>
    parseAgentAccessConfig({
      MCP_REMOTE_ENABLED: "true",
      MCP_REMOTE_URL: "http://mcp.example.test/mcp",
    }),
  );
  assert.deepEqual(
    parseAgentAccessConfig({
      MCP_REMOTE_ENABLED: "true",
      MCP_REMOTE_URL: "https://mcp.example.test/mcp/",
    }),
    { enabled: true, mcpUrl: "https://mcp.example.test/mcp" },
  );
  assert.throws(() =>
    parseAgentAccessConfig({
      MCP_REMOTE_ENABLED: "true",
      MCP_REMOTE_URL: MCP_URL,
      MCP_OAUTH_ENABLED: "true",
      API_PUBLIC_URL: "https://api.example.test/base",
    }),
  );
  assert.equal(
    parseAgentAccessConfig({
      MCP_REMOTE_ENABLED: "true",
      MCP_REMOTE_URL: "http://127.0.0.1:8787/mcp",
      MCP_OAUTH_ENABLED: "1",
      API_PUBLIC_URL: "http://localhost:3000",
    }).oauth?.issuer,
    "http://localhost:3000",
  );
});

test("desactivado: ni tokens de agente ni rutas de gestión ni OAuth", async () => {
  const status = await call(
    disabled,
    "GET",
    "/api/agent-access/status",
    admin.token,
  );
  assert.equal(status.body.enabled, false);
  assert.equal(status.body.mcpUrl, undefined);
  assert.equal(
    (await call(disabled, "GET", "/api/agent-access/grants", admin.token))
      .status,
    404,
  );
  assert.equal(
    (
      await call(disabled, "POST", "/api/agent-access/grants", admin.token, {
        name: "x",
        scope: "read",
        expiresInDays: 30,
      })
    ).status,
    404,
  );
  assert.equal(
    (await call(disabled, "GET", "/.well-known/oauth-authorization-server"))
      .status,
    404,
  );
  assert.equal(
    (await call(disabled, "GET", "/api/clients", "ssm_pat_whatever")).status,
    401,
  );
});

test("tokens personales: alcance, rol y una sola vez el secreto", async () => {
  assert.equal((await createToken(reader, "write")).status, 403);
  const bad = await request("POST", "/api/agent-access/grants", editor.token, {
    name: "x",
    scope: "read",
    expiresInDays: 7,
  });
  assert.equal(bad.status, 400);
  const created = await createToken(reader, "read", "Claude lector");
  assert.equal(created.status, 201);
  assert.match(created.body.token, /^ssm_pat_[A-Za-z0-9_-]{43}$/);
  assert.equal(created.body.grant.tokenPrefix, created.body.token.slice(0, 14));
  const listed = await request("GET", "/api/agent-access/grants", reader.token);
  assert.equal(listed.body.grants.length, 1);
  assert.equal(JSON.stringify(listed.body).includes(created.body.token), false);
  const stored = await pool.query("SELECT token_hash FROM agent_tokens");
  assert.ok(stored.rows.every((r) => !r.token_hash.startsWith("ssm_")));
  // An agent token cannot manage agent access or reach session endpoints.
  assert.equal(
    (await asAgent("GET", "/api/agent-access/grants", created.body.token))
      .status,
    403,
  );
  assert.equal(
    (
      await asAgent("POST", "/api/agent-access/grants", created.body.token, {
        name: "x",
        scope: "read",
        expiresInDays: 30,
      })
    ).status,
    403,
  );
});

test("token de lectura: consulta y nunca escribe ni obtiene sesión", async () => {
  const { token } = (await createToken(editor, "read")).body;
  const projects = await asAgent(
    "GET",
    "/api/projects?query=santiago",
    token,
    undefined,
    "search_projects",
  );
  assert.equal(projects.status, 200);
  assert.deepEqual(
    projects.body.projects.map((p: any) => p.id),
    ["agent-p1"],
  );
  assert.equal(projects.body.projects[0].code, "SP-001");
  assert.equal(
    (await asAgent("GET", "/api/projects/agent-p1", token)).body.project.client
      .name,
    "Ferretería Solar",
  );
  assert.equal(
    (await asAgent("GET", "/api/projects/agent-foreign", token)).status,
    404,
  );
  assert.equal((await asAgent("GET", "/api/clients", token)).status, 200);
  assert.equal((await asAgent("GET", "/api/equipment", token)).status, 200);
  assert.equal((await asAgent("GET", "/api/tariffs", token)).status, 200);
  const me = await asAgent("GET", "/api/agent-access/whoami", token);
  assert.equal(me.body.scope, "read");
  assert.equal(me.body.role, "LECTOR", "a read grant acts as LECTOR");
  const write = await asAgent("PUT", "/api/clients/client-x", token, {
    name: "X",
    baseVersion: 0,
  });
  assert.equal(write.status, 403);
  assert.equal(write.body.code, "insufficient_scope");
  for (const [method, path] of [
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/refresh"],
    ["POST", "/api/sync/pull"],
    ["POST", "/api/sync/push"],
    ["GET", "/api/users"],
    ["DELETE", "/api/projects/agent-p1"],
    ["GET", "/api/projects/agent-p1/history"],
  ]) {
    const r = await asAgent(
      method,
      path,
      token,
      method === "GET" ? undefined : {},
    );
    assert.equal(r.status, 403, `${method} ${path}`);
    assert.equal(r.body.code, "agent_route_forbidden");
  }
  // Same version gate as every client: no X-SolarSim-Client, no data.
  const outdated = await call(app, "GET", "/api/projects", token, undefined, {
    "X-SolarSim-Client": "",
  });
  assert.equal(outdated.status, 426);
});

test("token de escritura: clientes y enlaces con CAS; papelera de solo lectura; actividad", async () => {
  const { token } = (await createToken(editor, "write", "ChatGPT")).body;
  const created = await asAgent(
    "PUT",
    "/api/clients/client-agent-1",
    token,
    { name: "Cliente Agente", kind: "empresa", baseVersion: 0 },
    "create_client",
  );
  assert.equal(created.status, 200);
  assert.equal(created.body.client.createdBy, "agent-editor");
  const stale = await asAgent("PUT", "/api/clients/client-agent-1", token, {
    name: "Otro",
    baseVersion: 0,
  });
  assert.equal(stale.status, 409);
  const project = (await asAgent("GET", "/api/projects/agent-p1", token)).body
    .project;
  const link = await asAgent(
    "PUT",
    "/api/projects/agent-p1/client-link",
    token,
    { clientId: "client-agent-1", baseVersion: project.version },
    "link_proposal_to_client",
  );
  assert.equal(link.status, 200);
  assert.equal(link.body.project.clientId, "client-agent-1");
  const byClient = await asAgent(
    "GET",
    "/api/projects?clientId=client-agent-1",
    token,
  );
  assert.deepEqual(
    byClient.body.projects.map((p: any) => p.id),
    ["agent-p1"],
  );
  const who = await asAgent("GET", "/api/agent-access/whoami", token);
  assert.equal(who.body.scope, "write");
  assert.equal(who.body.role, "EDITOR");
  assert.equal(
    (await request("GET", "/api/agent-access/whoami", editor.token)).status,
    401,
    "whoami is for agent tokens only",
  );
  assert.equal(link.body.project.client.name, "Ferretería Solar");
  const again = await asAgent(
    "PUT",
    "/api/projects/agent-p1/client-link",
    token,
    { clientId: null, baseVersion: project.version },
  );
  assert.equal(again.status, 409);
  assert.equal(
    (
      await asAgent("PUT", "/api/projects/agent-p1/client-link", token, {
        clientId: "missing",
        baseVersion: link.body.version,
      })
    ).status,
    404,
  );
  const unlink = await asAgent(
    "PUT",
    "/api/projects/agent-p1/client-link",
    token,
    { clientId: null, baseVersion: link.body.version },
  );
  assert.equal(unlink.status, 200);
  assert.equal(unlink.body.project.clientId, undefined);
  const before = (await request("GET", "/api/projects/agent-p2", editor.token))
    .body.project;
  const trashed = await request(
    "DELETE",
    `/api/projects/agent-p2?baseVersion=${before.version}`,
    editor.token,
  );
  assert.equal(trashed.status, 200);
  const p2 = (await asAgent("GET", "/api/projects/agent-p2", token)).body
    .project;
  assert.equal(
    (
      await asAgent("PUT", "/api/projects/agent-p2/client-link", token, {
        clientId: "client-agent-1",
        baseVersion: p2.version,
      })
    ).status,
    409,
  );
  const activity = await request(
    "GET",
    "/api/agent-access/activity",
    editor.token,
  );
  const tools = activity.body.activity.map((a: any) => a.tool);
  assert.ok(
    tools.includes("create_client") &&
      tools.includes("link_proposal_to_client"),
  );
  const entry = activity.body.activity.find(
    (a: any) => a.tool === "create_client",
  );
  assert.equal(entry.route, "/api/clients/:id");
  assert.equal(entry.clientLabel, "claude-ai");
  assert.equal(entry.grantName, "ChatGPT");
  // Members only see their own agents; the administrator can audit the organization.
  assert.equal(
    (
      await request("GET", "/api/agent-access/activity", reader.token)
    ).body.activity.some((a: any) => a.tool === "create_client"),
    false,
  );
  assert.ok(
    (
      await request(
        "GET",
        "/api/agent-access/activity?scope=organization",
        admin.token,
      )
    ).body.activity.some((a: any) => a.tool === "create_client"),
  );
});

test("revocar, cambiar la cuenta o el recurso invalidan el token", async () => {
  const first = (await createToken(editor, "read")).body;
  assert.equal((await asAgent("GET", "/api/clients", first.token)).status, 200);
  assert.equal(
    (
      await request(
        "DELETE",
        `/api/agent-access/grants/${first.grant.id}`,
        reader.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        `/api/agent-access/grants/${first.grant.id}`,
        editor.token,
      )
    ).status,
    200,
  );
  assert.equal((await asAgent("GET", "/api/clients", first.token)).status, 401);
  const foreignApp = asClient(
    createApp({
      pool,
      jwtSecret: secret,
      logging: false,
      agentAccess: { enabled: true, mcpUrl: "https://otro.example.test/mcp" },
    }),
  );
  const second = (await createToken(editor, "read")).body;
  assert.equal(
    (
      await call(foreignApp, "GET", "/api/clients", second.token, undefined, {
        "X-SolarSim-Client": AGENT,
      })
    ).status,
    401,
  );
  // The current role is read on every request: a demoted writer's token keeps reading but stops writing.
  const users = await request("GET", "/api/users", admin.token);
  const target = users.body.users.find(
    (u: any) => u.email === "agent-editor@example.test",
  );
  assert.ok(target, "editor listed");
  const writer = (await createToken(editor, "write")).body;
  const demoted = await request(
    "PATCH",
    `/api/users/${target.id}`,
    admin.token,
    {
      role: "LECTOR",
    },
  );
  assert.equal(demoted.status, 200);
  assert.equal(
    (await asAgent("GET", "/api/clients", writer.token)).status,
    200,
  );
  assert.equal(
    (
      await asAgent("PUT", "/api/clients/client-demoted", writer.token, {
        name: "No",
        baseVersion: 0,
      })
    ).status,
    403,
  );
  await request("PATCH", `/api/users/${target.id}`, admin.token, {
    role: "EDITOR",
  });
  // A password change bumps auth_version: every agent token of the account dies, like a session.
  const changed = await request(
    "PATCH",
    `/api/users/${target.id}`,
    admin.token,
    {
      password: "isolated-password-2",
    },
  );
  assert.equal(changed.status, 200);
  assert.equal(
    (await asAgent("GET", "/api/clients", second.token)).status,
    401,
  );
  assert.equal(
    (await asAgent("GET", "/api/clients", writer.token)).status,
    401,
  );
  await request("PATCH", `/api/users/${target.id}`, admin.token, {
    password: "isolated-password",
  });
  const login = await request("POST", "/api/auth/login", undefined, {
    email: "agent-editor@example.test",
    password: "isolated-password",
  });
  editor = { ...login.body.user, token: login.body.token };
  // Deactivating the member ends their agents too.
  const third = (await createToken(reader, "read")).body;
  const readerId = users.body.users.find(
    (u: any) => u.email === "agent-reader@example.test",
  ).id;
  await request("PATCH", `/api/users/${readerId}`, admin.token, {
    isActive: false,
  });
  assert.equal((await asAgent("GET", "/api/clients", third.token)).status, 401);
  await request("PATCH", `/api/users/${readerId}`, admin.token, {
    isActive: true,
  });
});

test("límite de tokens activos por usuario", async () => {
  const user = await provision("EDITOR", "agent-many");
  for (let i = 0; i < 20; i++)
    assert.equal((await createToken(user, "read", `t${i}`)).status, 201);
  assert.equal((await createToken(user, "read", "t20")).status, 409);
});

test("OAuth: utilidades de redirección y recurso", () => {
  assert.equal(
    validRedirectUri("https://claude.ai/api/mcp/auth_callback"),
    "https://claude.ai/api/mcp/auth_callback",
  );
  assert.equal(validRedirectUri("http://evil.example/cb"), null);
  assert.equal(validRedirectUri("myapp://cb"), null);
  assert.equal(validRedirectUri("https://x.test/cb#frag"), null);
  assert.ok(
    redirectMatches(
      ["http://localhost/callback"],
      "http://localhost:51234/callback",
    ),
  );
  assert.ok(
    !redirectMatches(
      ["http://localhost/callback"],
      "http://localhost:51234/other",
    ),
  );
  assert.ok(
    !redirectMatches(
      ["https://claude.ai/api/mcp/auth_callback"],
      "https://claude.ai/api/mcp/auth_callback/x",
    ),
  );
  assert.ok(sameResource("HTTPS://MCP.example.test/mcp/", MCP_URL));
  assert.ok(!sameResource("https://mcp.example.test/other", MCP_URL));
});

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
};
const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});
async function authorize(
  clientId: string,
  redirect: string,
  challenge: string,
  fields: Record<string, string>,
  scope = "solarsim:read solarsim:write",
) {
  return app.request(
    "/oauth/authorize",
    form({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st-1",
      scope,
      resource: MCP_URL,
      ...fields,
    }),
  );
}
const token = (fields: Record<string, string>) =>
  app.request("/oauth/token", form(fields));

test("OAuth: metadatos, registro, consentimiento, PKCE, rotación y reutilización", async () => {
  const meta = await request("GET", "/.well-known/oauth-authorization-server");
  assert.equal(meta.body.issuer, ISSUER);
  assert.deepEqual(meta.body.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(meta.body.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(meta.body.authorization_response_iss_parameter_supported, true);
  assert.equal(
    (
      await request("POST", "/oauth/register", undefined, {
        redirect_uris: ["http://evil.example/cb"],
      })
    ).status,
    400,
  );
  const reg = await request("POST", "/oauth/register", undefined, {
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    client_name: "Claude <script>",
    token_endpoint_auth_method: "client_secret_post",
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.token_endpoint_auth_method, "none");
  const clientId = reg.body.client_id;
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  const { verifier, challenge } = pkce();

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-1",
    scope: "solarsim:read solarsim:write",
    resource: MCP_URL,
  });
  const consent = await app.request(`/oauth/authorize?${query}`);
  assert.equal(consent.status, 200);
  const html = await consent.text();
  assert.ok(html.includes("claude.ai"));
  assert.ok(!html.includes("<script>"));
  assert.match(
    consent.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  const unknown = await app.request(
    `/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(query), redirect_uri: "https://evil.example/cb" })}`,
  );
  assert.equal(
    unknown.status,
    400,
    "an unregistered redirect is shown, never followed",
  );
  const noPkce = await app.request(
    `/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(query), code_challenge_method: "plain" })}`,
  );
  assert.equal(noPkce.status, 302);
  assert.match(noPkce.headers.get("location")!, /error=invalid_request/);
  const badResource = await app.request(
    `/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(query), resource: "https://other.example/mcp" })}`,
  );
  assert.match(badResource.headers.get("location")!, /error=invalid_target/);

  const denied = await authorize(clientId, redirect, challenge, {
    decision: "deny",
  });
  assert.match(
    denied.headers.get("location")!,
    /error=access_denied.*state=st-1/,
  );
  const wrong = await authorize(clientId, redirect, challenge, {
    decision: "allow",
    email: "agent-editor@example.test",
    password: "nope",
  });
  assert.equal(wrong.status, 401);
  const ok = await authorize(clientId, redirect, challenge, {
    decision: "allow",
    email: "agent-editor@example.test",
    password: "isolated-password",
    grant_scope: "write",
  });
  assert.equal(ok.status, 302);
  const location = new URL(ok.headers.get("location")!);
  assert.equal(location.origin + location.pathname, redirect);
  assert.equal(location.searchParams.get("state"), "st-1");
  assert.equal(location.searchParams.get("iss"), ISSUER);
  const code = location.searchParams.get("code")!;

  const badVerifier = await token({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirect,
    code_verifier: pkce().verifier,
    resource: MCP_URL,
  });
  assert.equal(badVerifier.status, 400);
  const issued = await token({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirect,
    code_verifier: verifier,
    resource: MCP_URL,
  });
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get("cache-control"), "no-store");
  const tokens: any = await issued.json();
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.scope, "solarsim:read solarsim:write");
  assert.match(tokens.access_token, /^ssm_at_/);
  assert.equal(
    (
      await asAgent("PUT", "/api/clients/client-oauth-1", tokens.access_token, {
        name: "Vía OAuth",
        baseVersion: 0,
      })
    ).status,
    200,
  );

  const replay = await token({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  assert.equal(replay.status, 400, "a used code is rejected");
  assert.equal(
    (await asAgent("GET", "/api/clients", tokens.access_token)).status,
    401,
    "and revokes what it issued",
  );

  // Fresh connection to exercise refresh rotation and reuse detection.
  const second = pkce();
  const ok2 = await authorize(clientId, redirect, second.challenge, {
    decision: "allow",
    email: "agent-editor@example.test",
    password: "isolated-password",
  });
  const code2 = new URL(ok2.headers.get("location")!).searchParams.get("code")!;
  const t2: any = await (
    await token({
      grant_type: "authorization_code",
      code: code2,
      client_id: clientId,
      redirect_uri: redirect,
      code_verifier: second.verifier,
    })
  ).json();
  assert.equal(t2.scope, "solarsim:read", "write must be ticked explicitly");
  const rotated = await token({
    grant_type: "refresh_token",
    refresh_token: t2.refresh_token,
    client_id: clientId,
  });
  assert.equal(rotated.status, 200);
  const t3: any = await rotated.json();
  assert.notEqual(t3.refresh_token, t2.refresh_token);
  assert.equal(
    (await asAgent("GET", "/api/clients", t3.access_token)).status,
    200,
  );
  const reuse = await token({
    grant_type: "refresh_token",
    refresh_token: t2.refresh_token,
    client_id: clientId,
  });
  assert.equal(reuse.status, 400);
  assert.equal(
    (await asAgent("GET", "/api/clients", t3.access_token)).status,
    401,
    "reuse revokes the connection",
  );
  const grants = await request("GET", "/api/agent-access/grants", editor.token);
  assert.ok(
    !grants.body.grants.some((g: any) => g.kind === "oauth"),
    "revoked connections are not listed",
  );

  // A reader can never authorize writes, whatever the client asks.
  const third = pkce();
  const ok3 = await authorize(clientId, redirect, third.challenge, {
    decision: "allow",
    email: "agent-reader@example.test",
    password: "isolated-password",
    grant_scope: "write",
  });
  const code3 = new URL(ok3.headers.get("location")!).searchParams.get("code")!;
  const t4: any = await (
    await token({
      grant_type: "authorization_code",
      code: code3,
      client_id: clientId,
      redirect_uri: redirect,
      code_verifier: third.verifier,
    })
  ).json();
  assert.equal(t4.scope, "solarsim:read");
  const listed = await request("GET", "/api/agent-access/grants", reader.token);
  const connection = listed.body.grants.find((g: any) => g.kind === "oauth");
  assert.equal(connection.name, "Claude script");
  // RFC 7009 revocation ends the connection.
  assert.equal(
    (
      await app.request(
        "/oauth/revoke",
        form({ token: t4.refresh_token, client_id: clientId }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await asAgent("GET", "/api/clients", t4.access_token)).status,
    401,
  );
});

test("OAuth: loopback con puerto variable (Claude Code) y organización a elegir", async () => {
  const reg = await request("POST", "/oauth/register", undefined, {
    redirect_uris: ["http://localhost/callback"],
    client_name: "claude-code",
  });
  const { verifier, challenge } = pkce();
  const redirect = "http://localhost:43123/callback";
  // A member of two organizations picks one; the password is not sent again (signed short-lived ticket).
  const second = await request("POST", "/api/organizations", admin.token, {
    name: "Segunda empresa",
  });
  assert.equal(second.status, 200);
  const pick = await authorize(reg.body.client_id, redirect, challenge, {
    decision: "allow",
    email: "agent-admin@example.test",
    password: "isolated-password",
  });
  assert.equal(pick.status, 200);
  const html = await pick.text();
  assert.ok(html.includes("Segunda empresa"));
  assert.ok(!html.includes("isolated-password"));
  const ticket = /name="ticket" value="([^"]+)"/.exec(html)![1];
  const forged = await authorize(reg.body.client_id, redirect, challenge, {
    decision: "allow",
    ticket: ticket.slice(0, -2) + "xx",
    organization_id: admin.organizationId,
  });
  assert.equal(forged.status, 400);
  const ok = await authorize(reg.body.client_id, redirect, challenge, {
    decision: "allow",
    ticket,
    organization_id: admin.organizationId,
  });
  assert.equal(ok.status, 302);
  const location = new URL(ok.headers.get("location")!);
  assert.equal(location.port, "43123");
  const issued = await token({
    grant_type: "authorization_code",
    code: location.searchParams.get("code")!,
    client_id: reg.body.client_id,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  assert.equal(issued.status, 200);
});
