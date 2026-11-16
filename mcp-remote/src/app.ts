import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import {
  isAgentBearerToken,
  OAUTH_SCOPES,
  safeAgentLabel,
  type AgentIdentity,
} from "../../shared/agentAccess.js";
import { resolveClientIp, socketAddress } from "../../shared/clientIp.js";
import { FixedWindowLimiter } from "../../shared/fixedWindowLimiter.js";
import { ApiClient, ApiError } from "./apiClient.js";
import { SERVICE_VERSION, type McpRemoteConfig } from "./config.js";
import {
  handleMessage,
  protocolVersionError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "./protocol.js";

export interface McpAppOptions {
  config: McpRemoteConfig;
  /** Injected in tests; production uses the global fetch towards API_INTERNAL_URL. */
  fetch?: typeof fetch;
  /** How long a validated token's identity is reused for initialize/tools/list (tool calls always hit the API). */
  identityTtlMs?: number;
}

/** Body larger than the limit (declared or streamed). */
class TooLarge extends Error {}

/** Reads the body in chunks and stops as soon as the limit is crossed (chunked requests included). */
async function readLimited(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) throw new TooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const json = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

/**
 * Remote MCP resource server. It stores nothing and holds no secret: each request's bearer token is forwarded
 * to the API, which authenticates it, enforces route allowlist, scope, role and CAS, and records the activity.
 */
export function createMcpApp(options: McpAppOptions) {
  const { config } = options;
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = new URL(config.publicUrl).pathname;
  const metadataUrl = `${new URL(config.publicUrl).origin}/.well-known/oauth-protected-resource${endpoint}`;
  const byIp = new FixedWindowLimiter(300, 60000);
  const byToken = new FixedWindowLimiter(120, 60000);
  // Rejected bearers per client IP, before anything reaches the API.
  const failures = new FixedWindowLimiter(30, 600000);
  const allowedHosts = new Set(config.allowedHosts.map((h) => h.toLowerCase()));
  const identities = new Map<
    string,
    { identity: AgentIdentity; expires: number }
  >();
  const ttl = options.identityTtlMs ?? 10000;
  const labels = new Map<string, string>();
  const app = new Hono();

  const challenge = (description: string) => {
    const parts = [`Bearer realm="solarsim"`];
    if (config.authorizationServer)
      parts.push(
        `resource_metadata="${metadataUrl}"`,
        `scope="${OAUTH_SCOPES.read} ${OAUTH_SCOPES.write}"`,
      );
    parts.push(`error="invalid_token"`, `error_description="${description}"`);
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: description },
      },
      401,
      { "WWW-Authenticate": parts.join(", ") },
    );
  };
  const ip = (c: Context) =>
    resolveClientIp(
      socketAddress(c.env),
      (name) => c.req.header(name),
      config.clientIp,
    );
  const rpcFailure = (
    status: number,
    message: string,
    headers?: Record<string, string>,
  ) =>
    json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message } },
      status,
      headers,
    );

  // DNS rebinding: everything except the health probe answers only to the public host (and listed extras).
  // Behind Cloudflare Tunnel the original Host is preserved, so the public name arrives here.
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const host = (
      c.req.header("Host") ?? new URL(c.req.url).host
    ).toLowerCase();
    if (!allowedHosts.has(host)) return rpcFailure(403, "Host no permitido.");
    return next();
  });

  app.get("/health", async (c) => {
    if (c.req.query("deep") !== "1")
      return c.json({
        status: "ok",
        service: "solarsim-mcp-remote",
        version: SERVICE_VERSION,
      });
    try {
      const response = await fetchImpl(`${config.apiUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return c.json(
        {
          status: response.ok ? "ok" : "degraded",
          version: SERVICE_VERSION,
          api: response.ok ? "reachable" : `http ${response.status}`,
        },
        response.ok ? 200 : 503,
      );
    } catch {
      return c.json(
        { status: "degraded", version: SERVICE_VERSION, api: "unreachable" },
        503,
      );
    }
  });

  // RFC 9728 protected resource metadata, at the path-specific and the root location.
  const metadata = (c: Context) =>
    config.authorizationServer
      ? c.json({
          resource: config.publicUrl,
          authorization_servers: [config.authorizationServer],
          scopes_supported: [OAUTH_SCOPES.read, OAUTH_SCOPES.write],
          bearer_methods_supported: ["header"],
          resource_name: "SolarSim Pro",
        })
      : c.json(
          { error: "OAuth no está habilitado; usa un token personal" },
          404,
        );
  app.get(`/.well-known/oauth-protected-resource${endpoint}`, metadata);
  app.get("/.well-known/oauth-protected-resource", metadata);

  app.on(["GET", "DELETE", "PUT", "PATCH"], endpoint, () =>
    json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            "Método no permitido: este servidor es sin estado (solo POST).",
        },
      },
      405,
      { Allow: "POST" },
    ),
  );

  app.post(endpoint, async (c) => {
    // DNS rebinding / browser pages: only listed origins; native MCP clients send none.
    const origin = c.req.header("Origin");
    if (origin !== undefined && !config.allowedOrigins.includes(origin))
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Origin no permitido." },
        },
        403,
      );
    const address = ip(c);
    if (failures.exceeded(address))
      return rpcFailure(429, "Demasiados intentos con tokens no válidos.", {
        "Retry-After": String(failures.retryAfter(address)),
      });
    if (!byIp.take(address))
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Demasiadas solicitudes." },
        },
        429,
        { "Retry-After": String(byIp.retryAfter(address)) },
      );
    const header = c.req.header("Authorization") ?? "";
    const match = /^Bearer (\S+)$/.exec(header);
    const token = match?.[1] ?? "";
    // Only well-formed SolarSim agent tokens are forwarded; anything else (a desktop JWT, another provider's
    // token, garbage) stops here and counts as a failure for this IP. A missing header does not count.
    if (!isAgentBearerToken(token)) {
      if (header) failures.take(address);
      return challenge("Se requiere un token de agente de SolarSim");
    }
    const key = createHash("sha256").update(token).digest("hex");
    if (!byToken.take(key))
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32000,
            message: "Demasiadas solicitudes para este acceso.",
          },
        },
        429,
        { "Retry-After": String(byToken.retryAfter(key)) },
      );

    let raw: string;
    try {
      raw = await readLimited(c.req.raw, config.maxBodyBytes);
    } catch (error) {
      if (error instanceof TooLarge)
        return rpcFailure(413, "Solicitud demasiado grande.");
      return rpcFailure(400, "No se pudo leer la solicitud.");
    }
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "JSON no válido." },
        },
        400,
      );
    }
    const id = (message as { id?: unknown } | null)?.id;
    const version = c.req.header("MCP-Protocol-Version");
    if (
      version !== undefined &&
      !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)
    ) {
      const reply = protocolVersionError(id, version);
      return json(reply.body, reply.status);
    }

    // Activity label only (authorizes nothing): clientInfo from initialize, remembered per token, no sessions.
    const announced = safeAgentLabel(
      (message as any)?.params?.clientInfo?.name,
    );
    if (announced) {
      if (labels.size > 5000) labels.clear();
      labels.set(key, announced);
    }
    const label =
      announced ??
      labels.get(key) ??
      safeAgentLabel(c.req.header("User-Agent")?.split("/")[0]) ??
      undefined;
    const api = new ApiClient(config.apiUrl, token, fetchImpl, {
      client: label,
      forwardedFor: address === "unknown" ? undefined : address,
    });
    let identity: AgentIdentity;
    try {
      const cached = identities.get(key);
      if (cached && cached.expires > Date.now()) identity = cached.identity;
      else {
        identity = await api.whoami();
        if (identities.size > 5000) identities.clear();
        identities.set(key, { identity, expires: Date.now() + ttl });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        failures.take(address);
        return challenge("Token inválido, caducado o revocado");
      }
      const status =
        error instanceof ApiError && error.status === 426 ? 503 : 502;
      return json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32603,
            message:
              error instanceof ApiError ? error.message : "La API no responde.",
          },
        },
        status,
      );
    }
    try {
      const reply = await handleMessage(message, { identity, api });
      if (reply.status === 202) return new Response(null, { status: 202 });
      return json(reply.body, reply.status);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        identities.delete(key);
        return challenge("Token inválido, caducado o revocado");
      }
      return json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32603, message: "Error interno." },
        },
        500,
      );
    }
  });

  app.notFound((c) => c.json({ error: "No encontrado" }, 404));
  return app;
}
