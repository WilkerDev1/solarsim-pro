import type { Context, Hono } from "hono";
import {
  AGENT_CLIENT_HEADER,
  AGENT_GRANT_LIMITS,
  AGENT_TOKEN_PREFIX,
  AGENT_TOOL_HEADER,
  matchAgentRoute,
  safeAgentLabel,
  scopeAllows,
  type AgentAccessStatus,
  type AgentActivityEntry,
  type AgentIdentity,
} from "../../../../shared/agentAccess.js";
import { FixedWindowLimiter } from "../../../../shared/fixedWindowLimiter.js";
import { isAdminRole } from "../../../../shared/permissions.js";
import type { AgentAccessConfig } from "../../config.js";
import type { AuthUser, Dependencies } from "../../dependencies.js";
import { readObjectBody } from "../../request.js";
import {
  authenticateAgentToken,
  createGrant,
  grantSummary,
  hashSecret,
  newSecret,
  purgeExpired,
  revokeGrant,
  storeToken,
} from "./tokens.js";

/** Agent identities resolved by the gate, read back by the route's `authenticate`. */
const agentUsers = new WeakMap<Request, AuthUser>();
export const agentUserFor = (c: Context): AuthUser | null =>
  agentUsers.get(c.req.raw) ?? null;
export const isAgentBearer = (header: string | undefined) =>
  header?.startsWith(`Bearer ${AGENT_TOKEN_PREFIX}`) === true;

/**
 * Agent token gate for /api/*. Runs before every route: an `ssm_` bearer only reaches the routes listed in
 * shared/agentAccess.ts, with its scope, its own rate limit and an activity row per request. Session-issuing
 * routes (/api/auth/*) are never listed, so an agent token can never be exchanged for a desktop JWT.
 */
export function registerAgentGate(
  app: Hono,
  pool: Dependencies["pool"],
  config: AgentAccessConfig,
) {
  const limiter = new FixedWindowLimiter(240, 60000);
  app.use("/api/*", async (c, next) => {
    const header = c.req.header("Authorization");
    if (!isAgentBearer(header)) return next();
    if (!config.enabled || !config.mcpUrl)
      return c.json({ error: "No autorizado" }, 401);
    const route = matchAgentRoute(c.req.method, c.req.path);
    if (!route)
      return c.json(
        {
          error: "Esta ruta no admite tokens de agente",
          code: "agent_route_forbidden",
        },
        403,
      );
    const secret = header!.slice(7);
    const key = hashSecret(secret);
    if (!limiter.take(key)) {
      c.header("Retry-After", String(limiter.retryAfter(key)));
      return c.json(
        { error: "Demasiadas solicitudes del agente", code: "rate_limited" },
        429,
      );
    }
    const user = await authenticateAgentToken(pool, secret, config.mcpUrl);
    if (!user?.agent)
      return c.json({ error: "Token de agente inválido o revocado" }, 401);
    if (!scopeAllows(user.agent.scope, route.scope))
      return c.json(
        {
          error: "El acceso concedido es de solo lectura",
          code: "insufficient_scope",
        },
        403,
      );
    agentUsers.set(c.req.raw, user);
    await next();
    try {
      await pool.query(
        `INSERT INTO agent_activity (organization_id,user_id,grant_id,tool,client_label,method,route,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          user.organizationId,
          user.id,
          user.agent.grantId,
          safeAgentLabel(c.req.header(AGENT_TOOL_HEADER)),
          safeAgentLabel(c.req.header(AGENT_CLIENT_HEADER)),
          route.method,
          route.path,
          c.res.status,
        ],
      );
    } catch (error) {
      console.error(
        "Agent activity log failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
  });
}

const DISABLED = {
  error: "El acceso remoto de agentes no está habilitado en este servidor",
  code: "agent_access_disabled",
};

/** Desktop management of agent access: personal tokens, OAuth connections and activity (JWT sessions only). */
export function registerAgentAccessRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
  config: AgentAccessConfig,
) {
  const sessionUser = async (c: Context) => {
    const user = await authenticate(c);
    return user && !user.agent ? user : null;
  };
  app.get("/api/agent-access/status", async (c) => {
    if (!(await sessionUser(c))) return c.json({ error: "No autorizado" }, 401);
    const status: AgentAccessStatus = {
      enabled: config.enabled,
      oauthEnabled: Boolean(config.enabled && config.oauth),
      ...(config.enabled ? { mcpUrl: config.mcpUrl } : {}),
    };
    return c.json({ success: true, ...status });
  });
  /** Only for agent tokens: lets the MCP service validate a bearer and pick the tools it may list. */
  app.get("/api/agent-access/whoami", async (c) => {
    const user = await authenticate(c);
    if (!user?.agent) return c.json({ error: "No autorizado" }, 401);
    const identity: AgentIdentity = {
      scope: user.agent.scope,
      role: user.role,
      userName: user.name,
      organizationName: user.organizationName,
    };
    return c.json({ success: true, ...identity });
  });
  app.get("/api/agent-access/grants", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!config.enabled) return c.json(DISABLED, 404);
    const rows = await pool.query(
      `SELECT * FROM agent_grants WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at>clock_timestamp()) ORDER BY created_at DESC`,
      [user.organizationId, user.id],
    );
    return c.json({ success: true, grants: rows.rows.map(grantSummary) });
  });
  app.post("/api/agent-access/grants", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!config.enabled || !config.mcpUrl) return c.json(DISABLED, 404);
    const body = await readObjectBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const scope = body.scope;
    const days = body.expiresInDays;
    if (
      !name ||
      name.length > AGENT_GRANT_LIMITS.name ||
      (scope !== "read" && scope !== "write") ||
      !(AGENT_GRANT_LIMITS.expiresInDays as readonly number[]).includes(days)
    )
      return c.json(
        {
          error:
            "Nombre, alcance (read/write) y vigencia (30, 90 o 365 días) requeridos",
        },
        400,
      );
    if (scope === "write" && user.role === "LECTOR")
      return c.json(
        { error: "Tu rol solo permite tokens de solo lectura" },
        403,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes creations per user so the active-token cap cannot be raced.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `solarsim-agent-grants:${user.id}`,
      ]);
      const active = (
        await client.query(
          `SELECT count(*)::int AS n FROM agent_grants WHERE user_id=$1 AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
          [user.id],
        )
      ).rows[0].n;
      if (active >= AGENT_GRANT_LIMITS.perUser) {
        await client.query("ROLLBACK");
        return c.json(
          { error: "Límite de accesos activos alcanzado; revoca alguno" },
          409,
        );
      }
      const secret = newSecret("pat");
      const expiresAt = new Date(Date.now() + days * 86400000);
      const grantId = await createGrant(client, {
        user,
        kind: "token",
        name,
        scope,
        resource: config.mcpUrl,
        expiresAt,
        tokenPrefix: secret.slice(0, 14),
      });
      await storeToken(client, grantId, "pat", secret, expiresAt);
      const row = (
        await client.query("SELECT * FROM agent_grants WHERE id=$1", [grantId])
      ).rows[0];
      await purgeExpired(client);
      await client.query("COMMIT");
      // The secret is returned once and never again: only its hash is stored.
      return c.json(
        { success: true, grant: grantSummary(row), token: secret },
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/agent-access/grants/:id", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!config.enabled) return c.json(DISABLED, 404);
    // Revocation is terminal and idempotent, so it needs no baseVersion: no concurrent edit can be lost.
    const row = (
      await pool.query(
        "SELECT id,user_id FROM agent_grants WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL",
        [c.req.param("id"), user.organizationId],
      )
    ).rows[0];
    if (!row || (row.user_id !== user.id && !isAdminRole(user.role)))
      return c.json({ error: "Acceso no encontrado" }, 404);
    await revokeGrant(pool, row.id);
    return c.json({ success: true });
  });
  app.get("/api/agent-access/activity", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!config.enabled) return c.json(DISABLED, 404);
    // Members see their own agents; administrators audit the whole organization.
    const all =
      isAdminRole(user.role) && c.req.query("scope") === "organization";
    const rows = await pool.query(
      `SELECT a.*,u.name AS user_name,g.name AS grant_name FROM agent_activity a
       LEFT JOIN users u ON u.id=a.user_id LEFT JOIN agent_grants g ON g.id=a.grant_id
       WHERE a.organization_id=$1 AND ($2::boolean OR a.user_id=$3) ORDER BY a.id DESC LIMIT 200`,
      [user.organizationId, all, user.id],
    );
    const activity: AgentActivityEntry[] = rows.rows.map((r) => ({
      id: String(r.id),
      userName: r.user_name ?? "",
      grantName: r.grant_name,
      tool: r.tool,
      clientLabel: r.client_label,
      method: r.method,
      route: r.route,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    }));
    return c.json({ success: true, activity });
  });
}
