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
  // Agents do not see the trash; the desktop session still does.
  assert.equal(
    (await asAgent("GET", "/api/projects/agent-p2", token)).status,
    404,
  );
  const p2 = (await request("GET", "/api/projects/agent-p2", editor.token)).body
    .project;
  assert.equal(p2.isDeleted, true);
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
const form = (
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    ...headers,
  },
  body: new URLSearchParams(fields).toString(),
});
/** Loads the consent page like a browser: returns its anti-CSRF hidden field and cookie. */
async function consentPage(query: Record<string, string>) {
  const page = await app.request(
    `/oauth/authorize?${new URLSearchParams(query)}`,
  );
  const html = await page.text();
  const cookie = page.headers.get("set-cookie") ?? "";
  return {
    page,
    html,
    cookie: cookie.split(";")[0],
    csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "",
  };
}
async function authorize(
  clientId: string,
  redirect: string,
  challenge: string,
  fields: Record<string, string>,
  scope = "solarsim:read solarsim:write",
  options: { browser?: boolean; headers?: Record<string, string> } = {},
) {
  const query = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-1",
    scope,
    resource: MCP_URL,
  };
  const session =
    options.browser === false
      ? { csrf: "", cookie: "" }
      : await consentPage(query);
  return app.request(
    "/oauth/authorize",
    form(
      { ...query, csrf: session.csrf, ...fields },
      {
        ...(session.cookie ? { Cookie: session.cookie } : {}),
        ...options.headers,
      },
    ),
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
    grant_scope: "write",
  });
  assert.equal(pick.status, 200);
  const html = await pick.text();
  assert.ok(html.includes("Segunda empresa"));
  assert.ok(!html.includes("isolated-password"));
  assert.ok(
    html.includes('value="write" checked'),
    "the scope chosen in step 1 is kept",
  );
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
    grant_scope: "write",
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
  assert.equal(
    ((await issued.json()) as any).scope,
    "solarsim:read solarsim:write",
  );
});

/** Fresh app (fresh in-memory limiters) on the same database. */
const freshApp = (clientIp?: {
  trustedProxies: string[];
  header?: "cf-connecting-ip" | "x-forwarded-for";
}) =>
  createApp({
    pool,
    jwtSecret: secret,
    logging: false,
    agentAccess: { enabled: true, mcpUrl: MCP_URL, oauth: { issuer: ISSUER } },
    ...(clientIp ? { clientIp } : {}),
  });
const socket = (remoteAddress: string) => ({
  incoming: { socket: { remoteAddress } },
});
async function registerClient(
  target: { request: typeof app.request } = app,
  redirect = "https://claude.ai/api/mcp/auth_callback",
) {
  const response = await target.request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirect], client_name: "csrf" }),
  });
  return ((await response.json()) as any).client_id as string;
}

test("OAuth: CSRF de inicio de sesión y cabeceras de la página", async () => {
  const clientId = await registerClient();
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  const { challenge } = pkce();
  const query = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "solarsim:read",
  };
  const first = await consentPage(query);
  const cookie = first.page.headers.get("set-cookie")!;
  for (const attribute of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/oauth/authorize",
  ])
    assert.ok(cookie.includes(attribute), attribute);
  assert.match(
    first.page.headers.get("content-security-policy")!,
    /frame-ancestors 'none'/,
  );
  assert.match(
    first.page.headers.get("content-security-policy")!,
    /default-src 'none'/,
  );
  assert.equal(first.page.headers.get("x-frame-options"), "DENY");
  assert.equal(first.page.headers.get("x-content-type-options"), "nosniff");
  const creds = {
    decision: "allow",
    email: "agent-editor@example.test",
    password: "isolated-password",
  };
  // Cross-site auto-submit: no cookie (SameSite=Lax) and/or no field.
  const forgedNoCookie = await authorize(
    clientId,
    redirect,
    challenge,
    creds,
    "solarsim:read",
    { browser: false },
  );
  assert.equal(forgedNoCookie.status, 403);
  assert.equal(forgedNoCookie.headers.get("location"), null);
  const second = await consentPage(query);
  const mixed = await app.request(
    "/oauth/authorize",
    form({ ...query, ...creds, csrf: second.csrf }, { Cookie: first.cookie }),
  );
  assert.equal(mixed.status, 403, "field and cookie from different pages");
  const empty = await app.request(
    "/oauth/authorize",
    form(
      { ...query, ...creds, csrf: "" },
      { Cookie: `${first.cookie.split("=")[0]}=` },
    ),
  );
  assert.equal(empty.status, 403);
  const ok = await app.request(
    "/oauth/authorize",
    form({ ...query, ...creds, csrf: first.csrf }, { Cookie: first.cookie }),
  );
  assert.equal(ok.status, 302);
});

test("OAuth: cuerpos raros, tamaño, nosniff, redirecciones y sin versión de cliente", async () => {
  const boundary = "----x";
  const multipart = await app.request("/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: `--${boundary}\r\nContent-Disposition: form-data; name="client_id"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nx\r\n--${boundary}--\r\n`,
  });
  assert.equal(multipart.status, 400, "a file field is ignored, never a 500");
  const repeated = await app.request("/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "client_id=a&client_id=b",
  });
  assert.equal(repeated.status, 400);
  const tokenRepeated = await app.request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&grant_type=authorization_code&client_id=x",
  });
  assert.equal(tokenRepeated.status, 400);
  const huge = await app.request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&pad=${"x".repeat(20000)}`,
  });
  assert.equal(huge.status, 413);
  for (const response of [
    huge,
    tokenRepeated,
    await app.request("/.well-known/oauth-authorization-server"),
  ])
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(
    !redirectMatches(
      ["http://localhost/callback"],
      "http://localhost:4000/callback#frag",
    ),
  );
  assert.ok(
    !redirectMatches(
      ["http://localhost/callback"],
      "http://user:pw@localhost:4000/callback",
    ),
  );
  assert.ok(
    !redirectMatches(["https://claude.ai/cb"], "https://claude.ai/cb#x"),
  );
  // OAuth pages sit outside /api: no X-SolarSim-Client needed (browsers and connectors never send it).
  const raw = freshApp();
  assert.equal(
    (await raw.request("/.well-known/oauth-authorization-server")).status,
    200,
  );
  const reg = await raw.request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    }),
  });
  assert.equal(reg.status, 201);
  const page = await raw.request(
    `/oauth/authorize?${new URLSearchParams({ client_id: ((await reg.json()) as any).client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256" })}`,
  );
  assert.equal(page.status, 200);
  // …while data routes do require it, also with an agent token (see «token de lectura»).
});

test("IP del cliente: cabeceras falsas no eluden los límites; proxies de confianza sí cuentan", async () => {
  const target = freshApp();
  const clientId = await registerClient(target);
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  const { challenge } = pkce();
  const query = {
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  const attempt = async (
    on: ReturnType<typeof createApp>,
    q: Record<string, string>,
    i: number,
    env: unknown,
    headers: Record<string, string> = {},
  ) => {
    const page = await on.request(
      `/oauth/authorize?${new URLSearchParams(q)}`,
      {},
      env as any,
    );
    const html = await page.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const cookie = page.headers.get("set-cookie")!.split(";")[0];
    return on.request(
      "/oauth/authorize",
      form(
        {
          ...q,
          csrf,
          decision: "allow",
          email: `nobody-${i}-${Math.random()}@example.test`,
          password: "wrong",
        },
        { Cookie: cookie, ...headers },
      ),
      env as any,
    );
  };
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++)
    statuses.push(
      (
        await attempt(target, query, i, socket("203.0.113.9"), {
          "CF-Connecting-IP": `198.51.100.${i}`,
          "X-Forwarded-For": `192.0.2.${i}`,
        })
      ).status,
    );
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(401));
  assert.equal(
    statuses[20],
    429,
    "rotating proxy headers from an untrusted peer share the socket's bucket",
  );
  const limited = await attempt(target, query, 99, socket("203.0.113.9"));
  const retry = Number(limited.headers.get("retry-after"));
  assert.ok(
    retry > 0 && retry <= 600,
    "Retry-After comes from the limiter that rejected",
  );
  const proxied = freshApp({
    trustedProxies: ["172.18.0.0/16"],
    header: "cf-connecting-ip",
  });
  const proxiedQuery = { ...query, client_id: await registerClient(proxied) };
  for (let i = 0; i < 25; i++)
    assert.equal(
      (
        await attempt(proxied, proxiedQuery, i, socket("172.18.0.3"), {
          "CF-Connecting-IP": `198.51.100.${i}`,
        })
      ).status,
      401,
      "each real client has its own bucket behind the trusted proxy",
    );
});

test("puerta de agentes: formato antes de la base, fallos por IP y límite por acceso", async () => {
  const target = asClient(freshApp());
  const ask = (bearer: string, env?: unknown) =>
    target.request(
      "/api/agent-access/whoami",
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-SolarSim-Client": AGENT,
        },
      },
      env as any,
    );
  // Count token lookups by spying on the shared pool.
  const original = pool.query.bind(pool);
  let lookups = 0;
  (pool as any).query = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("agent_tokens"))
      lookups++;
    return (original as any)(...args);
  };
  try {
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await ask(`ssm_pat_bad${i}`, socket("203.0.113.20"))).status,
        401,
      );
    assert.equal(lookups, 0, "malformed tokens never query agent_tokens");
    assert.equal(
      (await ask(`ssm_pat_${"A".repeat(43)}`, socket("203.0.113.20"))).status,
      429,
    );
    assert.equal(lookups, 0, "after 30 failures, 429 before any lookup");
    await ask(`ssm_pat_${"C".repeat(43)}`, socket("203.0.113.24"));
    assert.ok(lookups > 0, "the spy does see real lookups");
  } finally {
    (pool as any).query = original;
  }
  assert.equal(
    (await ask(`ssm_pat_${"B".repeat(43)}`, socket("203.0.113.23"))).status,
    401,
    "a well-formed unknown token is looked up and fails",
  );
  const valid = (await createToken(editor, "read")).body.token;
  assert.equal(
    (await ask(valid, socket("203.0.113.20"))).status,
    429,
    "the IP stays blocked during its window",
  );
  assert.equal(
    (await ask(valid, socket("203.0.113.21"))).status,
    200,
    "other IPs are unaffected",
  );
  const statuses: number[] = [];
  for (let i = 0; i < 240; i++)
    statuses.push((await ask(valid, socket("203.0.113.22"))).status);
  assert.equal(
    statuses.filter((s) => s === 200).length,
    239,
    "240 per grant and minute, counted after authentication",
  );
  assert.equal(statuses[239], 429);
  const other = (await createToken(editor, "read")).body.token;
  assert.equal(
    (await ask(other, socket("203.0.113.22"))).status,
    200,
    "another grant has its own quota",
  );
});

test("crear token: la membresía y el rol se revalidan dentro de la transacción", async () => {
  const racer = await provision("EDITOR", "agent-racer");
  const lock = await pool.connect();
  try {
    await lock.query("BEGIN");
    await lock.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      racer.organizationId,
    ]);
    const pending = createToken(racer, "write", "carrera");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await lock.query("UPDATE users SET role='LECTOR' WHERE id=$1", [racer.id]);
    await lock.query(
      "UPDATE organization_memberships SET role='LECTOR' WHERE user_id=$1",
      [racer.id],
    );
    await lock.query("COMMIT");
    const result = await pending;
    assert.equal(result.status, 403, "demoted while waiting: no write token");
  } finally {
    lock.release();
  }
  const grants = await pool.query(
    "SELECT count(*)::int AS n FROM agent_grants WHERE user_id=$1",
    [racer.id],
  );
  assert.equal(grants.rows[0].n, 0);
  assert.equal(
    (await createToken(racer, "read")).status,
    201,
    "a read token is still allowed",
  );
});

test("aislamiento: un agente no enlaza ni pisa clientes de otra organización", async () => {
  const foreign = await request(
    "PUT",
    "/api/clients/client-foreign",
    other.token,
    { name: "Cliente ajeno", baseVersion: 0 },
  );
  assert.equal(foreign.status, 200);
  const { token } = (await createToken(editor, "write")).body;
  const project = (await asAgent("GET", "/api/projects/agent-p1", token)).body
    .project;
  const link = await asAgent(
    "PUT",
    "/api/projects/agent-p1/client-link",
    token,
    { clientId: "client-foreign", baseVersion: project.version },
  );
  assert.equal(link.status, 404);
  const same = await asAgent("PUT", "/api/clients/client-foreign", token, {
    name: "Mío",
    baseVersion: 0,
  });
  assert.equal(same.status, 200, "same id, own organization: a separate row");
  const theirs = await request("GET", "/api/clients", other.token);
  assert.equal(
    theirs.body.clients.find((c: any) => c.id === "client-foreign").name,
    "Cliente ajeno",
  );
  const stale = await asAgent("PUT", "/api/clients/client-foreign", token, {
    name: "Otra vez",
    baseVersion: 0,
  });
  assert.equal(stale.status, 409, "CAS");
});
