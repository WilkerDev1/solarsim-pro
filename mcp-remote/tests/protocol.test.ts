import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpApp } from "../src/app.js";
import { readConfig, type McpRemoteConfig } from "../src/config.js";
import { REMOTE_TOOL_NAMES } from "../src/tools.js";
import { AGENT_TOOL_DEFINITIONS } from "../../shared/agentTools/definitions.js";

const PAT = "ssm_pat_" + "a".repeat(43);
const config: McpRemoteConfig = {
  port: 0,
  host: "127.0.0.1",
  publicUrl: "https://mcp.example.test/mcp",
  apiUrl: "http://api.internal:3000",
  authorizationServer: "https://api.example.test",
  allowedOrigins: [],
  allowedHosts: ["mcp.example.test"],
  clientIp: { trustedProxies: [] },
  maxBodyBytes: 4096,
};

interface Seen {
  method: string;
  url: string;
  headers: Headers;
  body?: any;
}
/** Synthetic API: no network. `routes` answer by "METHOD path". */
function fakeApi(
  routes: Record<string, (body: any) => [number, unknown]>,
  identity = { scope: "write", role: "EDITOR", userName: "Ana" },
) {
  const seen: Seen[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({
      method: init?.method ?? "GET",
      url: url.pathname + url.search,
      headers,
      body,
    });
    const auth = headers.get("Authorization");
    if (auth !== `Bearer ${PAT}`)
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
      });
    if (url.pathname === "/api/agent-access/whoami")
      return Response.json(identity);
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const route = routes[key];
    if (!route)
      return new Response(JSON.stringify({ error: "no route " + key }), {
        status: 404,
      });
    const [status, payload] = route(body);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

async function rpc(
  app: ReturnType<typeof createMcpApp>,
  body: unknown,
  headers: Record<string, string> = {},
  token = PAT,
) {
  const response = await app.request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}
const call = (id: number, name: string, args: unknown = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

test("configuración: URLs públicas https, API interna y ruta del endpoint", () => {
  assert.throws(() =>
    readConfig({
      MCP_PUBLIC_URL: "http://mcp.example.test/mcp",
      API_INTERNAL_URL: "http://api:3000",
    }),
  );
  assert.throws(() =>
    readConfig({
      MCP_PUBLIC_URL: "https://mcp.example.test",
      API_INTERNAL_URL: "http://api:3000",
    }),
  );
  assert.throws(() =>
    readConfig({ MCP_PUBLIC_URL: "https://mcp.example.test/mcp" }),
  );
  assert.throws(() =>
    readConfig({
      MCP_PUBLIC_URL: "https://mcp.example.test/mcp",
      API_INTERNAL_URL: "http://api:3000",
      OAUTH_ISSUER_URL: "https://api.example.test/x",
    }),
  );
  const parsed = readConfig({
    MCP_PUBLIC_URL: "https://mcp.example.test/mcp/",
    API_INTERNAL_URL: "http://10.0.0.5:3000",
    OAUTH_ISSUER_URL: "https://api.example.test",
    MCP_ALLOWED_ORIGINS: "https://inspector.example.test",
  });
  assert.equal(parsed.publicUrl, "https://mcp.example.test/mcp");
  assert.equal(parsed.port, 8787);
  assert.deepEqual(parsed.allowedOrigins, ["https://inspector.example.test"]);
});

test("sin token: 401 con metadatos de recurso protegido y sin llamar a la API", async () => {
  const { fetchImpl, seen } = fakeApi({});
  const app = createMcpApp({ config, fetch: fetchImpl });
  const anonymous = await rpc(
    app,
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    {},
    "",
  );
  assert.equal(anonymous.status, 401);
  const challenge = anonymous.headers.get("WWW-Authenticate")!;
  assert.match(
    challenge,
    /resource_metadata="https:\/\/mcp\.example\.test\/\.well-known\/oauth-protected-resource\/mcp"/,
  );
  assert.match(challenge, /scope="solarsim:read solarsim:write"/);
  // A desktop JWT or another provider's token is never forwarded.
  assert.equal(
    (
      await rpc(
        app,
        { jsonrpc: "2.0", id: 1, method: "ping" },
        {},
        "eyJhbGciOiJIUzI1NiJ9.x.y",
      )
    ).status,
    401,
  );
  assert.equal(seen.length, 0);
  const prm = await (
    await app.request(
      "https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
    )
  ).json();
  assert.deepEqual(prm, {
    resource: "https://mcp.example.test/mcp",
    authorization_servers: ["https://api.example.test"],
    scopes_supported: ["solarsim:read", "solarsim:write"],
    bearer_methods_supported: ["header"],
    resource_name: "SolarSim Pro",
  });
  const tokensOnly = createMcpApp({
    config: { ...config, authorizationServer: undefined },
    fetch: fetchImpl,
  });
  assert.equal(
    (
      await tokensOnly.request(
        "https://mcp.example.test/.well-known/oauth-protected-resource",
      )
    ).status,
    404,
  );
  const plain = await rpc(
    tokensOnly,
    { jsonrpc: "2.0", id: 1, method: "ping" },
    {},
    "",
  );
  assert.doesNotMatch(
    plain.headers.get("WWW-Authenticate")!,
    /resource_metadata/,
  );
});

test("token revocado: 401 para que el cliente renueve o vuelva a iniciar sesión", async () => {
  const { fetchImpl } = fakeApi({});
  const app = createMcpApp({ config, fetch: fetchImpl });
  const response = await rpc(
    app,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    {},
    "ssm_at_revoked",
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get("WWW-Authenticate")!, /invalid_token/);
});

test("transporte: Origin, métodos, tamaño, JSON, lotes, notificaciones y versión", async () => {
  const { fetchImpl } = fakeApi({});
  const app = createMcpApp({ config, fetch: fetchImpl });
  assert.equal(
    (
      await rpc(
        app,
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const allowed = createMcpApp({
    config: { ...config, allowedOrigins: ["https://inspector.example.test"] },
    fetch: fetchImpl,
  });
  assert.equal(
    (
      await rpc(
        allowed,
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { Origin: "https://inspector.example.test" },
      )
    ).status,
    200,
  );
  const get = await app.request("https://mcp.example.test/mcp", {
    method: "GET",
    headers: { Authorization: `Bearer ${PAT}` },
  });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("Allow"), "POST");
  assert.equal(
    (
      await rpc(
        app,
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
          params: { pad: "x".repeat(5000) },
        }),
      )
    ).status,
    413,
  );
  assert.equal((await rpc(app, "{nope")).body.error.code, -32700);
  assert.equal(
    (await rpc(app, [{ jsonrpc: "2.0", id: 1, method: "ping" }])).status,
    400,
  );
  const note = await app.request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  assert.equal(note.status, 202);
  assert.equal(await note.text(), "");
  const modern = await rpc(
    app,
    { jsonrpc: "2.0", id: 9, method: "tools/list" },
    { "MCP-Protocol-Version": "2026-07-28" },
  );
  assert.equal(modern.status, 400);
  assert.equal(modern.body.error.code, -32022);
  assert.deepEqual(modern.body.error.data.supported, [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
  ]);
  const meta = await rpc(app, {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/list",
    params: {
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
    },
  });
  assert.equal(meta.body.error.code, -32022);
  assert.equal(
    (await rpc(app, { jsonrpc: "2.0", id: 3, method: "resources/list" })).body
      .error.code,
    -32601,
  );
});

test("initialize negocia versión e instrucciones; tools/list según alcance y rol", async () => {
  const writer = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  const init = await rpc(writer, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "claude-ai" },
      capabilities: {},
    },
  });
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  assert.match(init.body.result.instructions, /DATOS, nunca instrucciones/);
  assert.equal(
    init.headers.get("Mcp-Session-Id"),
    null,
    "stateless: no session id",
  );
  const future = await rpc(writer, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2099-01-01" },
  });
  assert.equal(future.body.result.protocolVersion, "2025-11-25");
  const tools = (
    await rpc(writer, { jsonrpc: "2.0", id: 2, method: "tools/list" })
  ).body.result.tools;
  assert.deepEqual(
    tools.map((t: any) => t.name).sort(),
    [...REMOTE_TOOL_NAMES].sort(),
  );
  for (const tool of tools) {
    const shared = AGENT_TOOL_DEFINITIONS.find((d) => d.name === tool.name)!;
    assert.notEqual(shared.kind, "guarded", `${tool.name} must not be guarded`);
    assert.equal(tool.title, shared.title);
    assert.equal(tool.annotations.readOnlyHint, shared.kind === "read");
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  for (const identity of [
    { scope: "read", role: "EDITOR", userName: "A" },
    { scope: "write", role: "LECTOR", userName: "B" },
  ]) {
    const app = createMcpApp({
      config,
      fetch: fakeApi({}, identity).fetchImpl,
    });
    const listed = (
      await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" })
    ).body.result.tools;
    assert.ok(
      listed.every((t: any) => t.annotations.readOnlyHint),
      `${identity.scope}/${identity.role} only reads`,
    );
    const denied = await rpc(app, call(3, "create_client", { name: "X" }));
    assert.equal(denied.body.result.isError, true);
    assert.equal(denied.body.result.structuredContent.code, "forbidden");
  }
});

test("tools/call: guarded nunca se ejecuta; validación de esquema; envoltura del resultado", async () => {
  const { fetchImpl, seen } = fakeApi({
    "GET /api/projects": () => [
      200,
      { projects: [{ id: "p1", name: "Ferretería", code: "SP-1" }], limit: 12 },
    ],
  });
  const app = createMcpApp({ config, fetch: fetchImpl });
  for (const name of [
    "move_proposal_to_trash",
    "update_supplier_price",
    "delete_client",
    "set_proposal_status",
  ]) {
    const r = await rpc(app, call(1, name, { id: "p1" }));
    assert.equal(r.body.result.isError, true);
    assert.equal(r.body.result.structuredContent.code, "confirmation_required");
  }
  assert.equal(
    (await rpc(app, call(1, "get_simulation", { id: "p1" }))).body.result
      .structuredContent.code,
    "unknown_tool",
  );
  const invalid = await rpc(
    app,
    call(2, "search_projects", { query: 5, extra: true }),
  );
  assert.equal(invalid.body.result.structuredContent.code, "invalid_input");
  const found = await rpc(
    app,
    call(3, "search_projects", { query: "ferre" }),
    {},
    PAT,
  );
  assert.equal(found.body.result.isError, false);
  assert.equal(found.body.result.structuredContent.status, "ok");
  assert.equal(found.body.result.structuredContent.data.projects[0].id, "p1");
  assert.match(found.body.result.content[0].text, /Ferretería/);
  const apiCall = seen.find((s) => s.url.startsWith("/api/projects"))!;
  assert.equal(apiCall.url, "/api/projects?limit=12&query=ferre");
  assert.match(
    apiCall.headers.get("X-SolarSim-Client") ?? "",
    /^mcp-remote\/\d+\.\d+\.\d+$/,
  );
  assert.equal(apiCall.headers.get("X-SolarSim-Agent-Tool"), "search_projects");
  assert.equal(apiCall.headers.get("Authorization"), `Bearer ${PAT}`);
});

test("escrituras con CAS: conflicto, servicio desactualizado y token revocado a mitad", async () => {
  let version = 3;
  const { fetchImpl, seen } = fakeApi({
    "GET /api/clients": () => [
      200,
      {
        clients: [
          {
            id: "c1",
            kind: "empresa",
            name: "Solar SRL",
            taxId: "",
            phone: "",
            email: "",
            address: "",
            province: "",
            notes: "",
            version,
          },
        ],
      },
    ],
    "PUT /api/clients/c1": (body) =>
      body.baseVersion === version
        ? [200, { client: { ...body, id: "c1" } }]
        : [409, { error: "El cliente cambió." }],
    "GET /api/projects/p1": () => [200, { project: { id: "p1", version: 7 } }],
    "PUT /api/projects/p1/client-link": () => [
      426,
      { error: "client_outdated" },
    ],
  });
  const app = createMcpApp({ config, fetch: fetchImpl });
  const updated = await rpc(
    app,
    call(1, "update_client", { id: "c1", phone: "809-555-0000" }),
  );
  assert.equal(updated.body.result.structuredContent.status, "applied");
  const put = seen.find((s) => s.method === "PUT")!;
  assert.equal(put.body.baseVersion, 3);
  assert.equal(
    put.body.name,
    "Solar SRL",
    "unchanged fields are sent back as read",
  );
  assert.match(updated.body.result.content[0].text, /actividad remota/);
  const original = fetchImpl;
  const racing = (async (input: any, init?: RequestInit) => {
    if (init?.method === "PUT") version = 4;
    return original(input, init);
  }) as typeof fetch;
  const raced = createMcpApp({ config, fetch: racing });
  const conflict = await rpc(
    raced,
    call(2, "update_client", { id: "c1", phone: "1" }),
  );
  assert.equal(conflict.body.result.structuredContent.code, "conflict");
  const outdated = await rpc(
    app,
    call(3, "link_proposal_to_client", { proposalId: "p1", clientId: "c1" }),
  );
  assert.equal(outdated.body.result.structuredContent.code, "service_outdated");
  // Identity is cached briefly, but a 401 from the API during a call is surfaced as HTTP 401.
  const revoking = createMcpApp({
    config,
    fetch: (async (input: any, init?: RequestInit) =>
      String(input).includes("whoami")
        ? fetchImpl(input, init)
        : new Response("{}", { status: 401 })) as typeof fetch,
  });
  assert.equal(
    (await rpc(revoking, call(4, "search_clients", {}))).status,
    401,
  );
});

test("límite de tasa por token", async () => {
  const app = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  let last = 0;
  for (let i = 0; i < 125; i++)
    last = (await rpc(app, { jsonrpc: "2.0", id: i, method: "ping" })).status;
  assert.equal(last, 429);
});

test("salud: superficial sin API y profunda con API", async () => {
  const app = createMcpApp({
    config,
    fetch: (async () => {
      throw new Error("down");
    }) as typeof fetch,
  });
  assert.equal((await app.request("http://x/health")).status, 200);
  assert.equal((await app.request("http://x/health?deep=1")).status, 503);
});

test("Host: solo el host público (DNS rebinding); la salud responde a cualquiera", async () => {
  const app = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  const rebound = await rpc(
    app,
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { Host: "evil.example:8787" },
  );
  assert.equal(rebound.status, 403);
  const internal = await rpc(
    app,
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { Host: "127.0.0.1:8787" },
  );
  assert.equal(
    internal.status,
    403,
    "the internal address is not an MCP host unless listed",
  );
  assert.equal(
    (
      await rpc(
        app,
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { Host: "MCP.example.test" },
      )
    ).status,
    200,
  );
  assert.equal((await app.request("http://127.0.0.1:8787/health")).status, 200);
  assert.equal(
    (
      await app.request(
        "https://evil.example/.well-known/oauth-protected-resource/mcp",
      )
    ).status,
    403,
  );
  const listed = createMcpApp({
    config: {
      ...config,
      allowedHosts: [...config.allowedHosts, "127.0.0.1:8787"],
    },
    fetch: fakeApi({}).fetchImpl,
  });
  assert.equal(
    (
      await rpc(
        listed,
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { Host: "127.0.0.1:8787" },
      )
    ).status,
    200,
  );
});

test("cuerpo por trozos: se corta al superar el límite sin leerlo entero", async () => {
  const app = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      if (pulled > 1000) return controller.close();
      controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
    },
  });
  const response = await app.request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PAT}`,
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal(response.status, 413);
  assert.ok(pulled < 20, `stopped early (${pulled} chunks)`);
});

test("identificadores: '..', '.', '/' y '\\' nunca llegan a la API", async () => {
  const { fetchImpl, seen } = fakeApi({});
  const app = createMcpApp({ config, fetch: fetchImpl });
  for (const [name, args] of [
    ["get_project", { id: ".." }],
    ["get_project", { id: "." }],
    ["get_project", { id: "a/b" }],
    ["link_proposal_to_client", { proposalId: "..\\x", clientId: "c1" }],
  ] as const) {
    const result = await rpc(app, call(1, name, args));
    assert.equal(
      result.body.result.structuredContent.code,
      "invalid_input",
      `${name} ${JSON.stringify(args)}`,
    );
  }
  assert.ok(
    seen.every((s) => s.url === "/api/agent-access/whoami"),
    "only identity lookups reached the API",
  );
});

test("roles: VIEWER, vacío o desconocido nunca escriben; arguments no objeto es invalid_input", async () => {
  for (const role of ["VIEWER", "", "SUPERUSER"]) {
    const app = createMcpApp({
      config,
      fetch: fakeApi({}, { scope: "write", role, userName: "X" }).fetchImpl,
    });
    const tools = (
      await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" })
    ).body.result.tools;
    assert.ok(
      tools.every((t: any) => t.annotations.readOnlyHint),
      `role "${role}" only reads`,
    );
  }
  const app = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  for (const args of ["texto", [1], 5, true]) {
    const r = await rpc(app, call(1, "search_projects", args));
    assert.equal(
      r.body.result.structuredContent.code,
      "invalid_input",
      JSON.stringify(args),
    );
  }
});

test("esquemas estrictos: propiedades no declaradas, enum y longitudes", async () => {
  const app = createMcpApp({ config, fetch: fakeApi({}).fetchImpl });
  const cases: [string, Record<string, unknown>][] = [
    ["search_clients", { query: "a", sql: "drop" }],
    ["search_clients", { kind: "proveedor" }],
    ["search_projects", { query: "x".repeat(201) }],
    ["create_client", { name: "" }],
    ["create_client", { name: "x".repeat(256) }],
    ["update_client", { id: "c1", kind: "otro" }],
    ["get_project", {}],
  ];
  for (const [name, args] of cases) {
    const r = await rpc(app, call(1, name, args));
    assert.equal(
      r.body.result.structuredContent.code,
      "invalid_input",
      `${name} ${JSON.stringify(args).slice(0, 40)}`,
    );
  }
});

test("IP: tokens no válidos por IP antes de la API; cabeceras de proxy solo desde proxies de confianza", async () => {
  const { fetchImpl, seen } = fakeApi({});
  const app = createMcpApp({ config, fetch: fetchImpl });
  const env = (remoteAddress: string) => ({
    incoming: { socket: { remoteAddress } },
  });
  const send = (
    token: string,
    address: string,
    headers: Record<string, string> = {},
  ) =>
    app.request(
      "https://mcp.example.test/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      },
      env(address) as any,
    );
  for (let i = 0; i < 30; i++)
    assert.equal(
      (
        await send(`ssm_pat_bad${i}`, "203.0.113.5", {
          "CF-Connecting-IP": `198.51.100.${i}`,
        })
      ).status,
      401,
    );
  const blocked = await send(PAT, "203.0.113.5");
  assert.equal(
    blocked.status,
    429,
    "spoofed headers from an untrusted peer do not help",
  );
  assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
  assert.equal((await send(PAT, "203.0.113.6")).status, 200);
  assert.equal(
    seen.filter((s) => s.url === "/api/agent-access/whoami").length,
    1,
    "malformed tokens never reached the API",
  );
  assert.equal(
    seen[0].headers.get("X-Forwarded-For"),
    "203.0.113.6",
    "the end client's IP is forwarded",
  );
  const proxied = createMcpApp({
    config: {
      ...config,
      clientIp: {
        trustedProxies: ["172.20.0.0/16"],
        header: "cf-connecting-ip",
      },
    },
    fetch: fakeApi({}).fetchImpl,
  });
  for (let i = 0; i < 35; i++) {
    const r = await proxied.request(
      "https://mcp.example.test/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ssm_pat_bad${i}`,
          "CF-Connecting-IP": `198.51.100.${i}`,
        },
        body: "{}",
      },
      env("172.20.0.2") as any,
    );
    assert.equal(
      r.status,
      401,
      "behind a trusted proxy each real client has its own bucket",
    );
  }
});
