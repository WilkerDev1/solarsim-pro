import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Context, Hono } from "hono";
import {
  formatOAuthScope,
  OAUTH_SCOPES,
  parseOAuthScope,
  safeAgentLabel,
  type AgentScope,
} from "../../../../shared/agentAccess.js";
import { FixedWindowLimiter } from "../../../../shared/fixedWindowLimiter.js";
import type { AgentAccessConfig } from "../../config.js";
import type { AuthUser, Dependencies } from "../../dependencies.js";
import { resolveMembership } from "../../membership.js";
import {
  ACCESS_TOKEN_SECONDS,
  createGrant,
  hashSecret,
  issueOAuthTokens,
  purgeExpired,
  revokeGrant,
} from "./tokens.js";

/**
 * OAuth 2.1 authorization server for remote MCP clients (ChatGPT, Claude.ai…): RFC 8414 metadata, RFC 7591
 * dynamic registration of public clients, authorization code + PKCE S256 only, RFC 8707 audience binding to
 * MCP_REMOTE_URL, RFC 9207 `iss`, rotating refresh tokens with reuse detection and RFC 7009 revocation.
 * Sign-in uses the SolarSim account (email and password) on a page served by this API.
 */
const CODE_SECONDS = 120;
const TICKET_SECONDS = 300;
const MAX_REDIRECTS = 5;
const isLoopbackHost = (host: string) =>
  host === "127.0.0.1" || host === "localhost" || host === "[::1]";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch]!,
  );

/** Registration accepts https redirects and RFC 8252 loopback http redirects; nothing else (no custom schemes). */
export function validRedirectUri(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return null;
    if (url.protocol === "https:") return value;
    if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return value;
  } catch {
    /* invalid */
  }
  return null;
}

/** Exact match; loopback redirects match on any port (RFC 8252 §7.3; Claude Code uses an ephemeral port). */
export function redirectMatches(
  registered: string[],
  candidate: string,
): boolean {
  if (registered.includes(candidate)) return true;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !isLoopbackHost(url.hostname)) return false;
  return registered.some((uri) => {
    const r = new URL(uri);
    return (
      r.protocol === "http:" &&
      r.hostname === url.hostname &&
      r.pathname === url.pathname &&
      r.search === url.search
    );
  });
}

/** RFC 8707 resource: same origin (case-insensitive) and path, ignoring a trailing slash. */
export function sameResource(candidate: unknown, resource: string): boolean {
  if (typeof candidate !== "string") return false;
  try {
    const a = new URL(candidate),
      b = new URL(resource);
    const path = (u: URL) => u.pathname.replace(/\/+$/, "");
    return a.origin === b.origin && path(a) === path(b) && !a.search && !a.hash;
  } catch {
    return false;
  }
}

const pkceOk = (verifier: unknown, challenge: string) =>
  typeof verifier === "string" &&
  /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) &&
  createHash("sha256").update(verifier).digest("base64url") === challenge;

function clientIp(c: Context): string {
  // Behind Cloudflare + Caddy (docs/INFRASTRUCTURE_ARCHITECTURE.md); without them every caller shares one bucket.
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local"
  );
}

interface AuthorizeParams {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  requested: AgentScope;
}

export function registerOAuthRoutes(
  app: Hono,
  { pool, jwtSecret }: Dependencies,
  config: AgentAccessConfig,
): void {
  if (!config.enabled || !config.oauth || !config.mcpUrl) return;
  const issuer = config.oauth.issuer;
  const resource = config.mcpUrl;
  const ticketKey = createHash("sha256")
    .update(`oauth-ticket:${jwtSecret}`)
    .digest();
  const registrations = new FixedWindowLimiter(20, 3600000);
  const signInsByIp = new FixedWindowLimiter(20, 600000);
  const signInsByEmail = new FixedWindowLimiter(8, 900000);
  const dummyHash = bcrypt.hashSync(randomUUID(), 10);

  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [OAUTH_SCOPES.read, OAUTH_SCOPES.write],
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${issuer}/api/health`,
    }),
  );

  app.post("/oauth/register", async (c) => {
    if (!registrations.take(clientIp(c)))
      return c.json(
        {
          error: "invalid_client_metadata",
          error_description: "Demasiados registros",
        },
        429,
      );
    let body: Record<string, any>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_client_metadata" }, 400);
    }
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
    const valid = uris.map(validRedirectUri);
    if (!uris.length || uris.length > MAX_REDIRECTS || valid.includes(null))
      return c.json(
        {
          error: "invalid_redirect_uri",
          error_description:
            "Se requieren de 1 a 5 redirect_uris https o de loopback http",
        },
        400,
      );
    const grantTypes = body.grant_types ?? ["authorization_code"];
    if (
      !Array.isArray(grantTypes) ||
      grantTypes.some(
        (g: unknown) => g !== "authorization_code" && g !== "refresh_token",
      )
    )
      return c.json({ error: "invalid_client_metadata" }, 400);
    const clientId = `mcpc-${randomUUID()}`;
    const name = safeAgentLabel(body.client_name) ?? "Cliente MCP";
    await pool.query(
      "INSERT INTO oauth_clients (client_id,client_name,redirect_uris) VALUES ($1,$2,$3)",
      [clientId, name, JSON.stringify(valid)],
    );
    // Public clients only: whatever auth method was requested, none is assigned (RFC 7591 §3.2.1 allows it).
    return c.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: name,
        redirect_uris: valid,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  });

  /** Validates the request; errors before the redirect URI is trusted are shown, never redirected. */
  async function readAuthorize(
    params: Record<string, string | undefined>,
  ): Promise<
    | { ok: true; value: AuthorizeParams }
    | { ok: false; page: string }
    | { ok: false; redirect: string }
  > {
    const client = params.client_id
      ? (
          await pool.query("SELECT * FROM oauth_clients WHERE client_id=$1", [
            params.client_id,
          ])
        ).rows[0]
      : undefined;
    if (!client)
      return {
        ok: false,
        page: "La aplicación no está registrada en SolarSim.",
      };
    const redirectUri = params.redirect_uri ?? "";
    if (!redirectMatches(client.redirect_uris, redirectUri))
      return {
        ok: false,
        page: "La dirección de retorno no coincide con la registrada.",
      };
    const fail = (error: string, description: string) => {
      const url = new URL(redirectUri);
      url.searchParams.set("error", error);
      url.searchParams.set("error_description", description);
      if (params.state) url.searchParams.set("state", params.state);
      url.searchParams.set("iss", issuer);
      return { ok: false as const, redirect: url.toString() };
    };
    if (params.response_type !== "code")
      return fail("unsupported_response_type", "Solo response_type=code");
    if (
      params.code_challenge_method !== "S256" ||
      !/^[A-Za-z0-9\-_]{43,128}$/.test(params.code_challenge ?? "")
    )
      return fail("invalid_request", "PKCE S256 obligatorio");
    if (
      params.resource !== undefined &&
      !sameResource(params.resource, resource)
    )
      return fail("invalid_target", "Recurso desconocido");
    if ((params.state ?? "").length > 1024)
      return fail("invalid_request", "state demasiado largo");
    // No scope means read only (least privilege); unknown scopes are ignored.
    const requested =
      params.scope === undefined ? "read" : parseOAuthScope(params.scope);
    if (!requested) return fail("invalid_scope", "Ámbito no admitido");
    return {
      ok: true,
      value: {
        clientId: client.client_id,
        clientName: client.client_name,
        redirectUri,
        state: params.state,
        codeChallenge: params.code_challenge!,
        requested,
      },
    };
  }

  const securityHeaders = (c: Context, redirectUri?: string) => {
    let target = "";
    try {
      if (redirectUri) target = ` ${new URL(redirectUri).origin}`;
    } catch {
      /* none */
    }
    c.header(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${target}; frame-ancestors 'none'; base-uri 'none'`,
    );
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
  };

  function page(body: string) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SolarSim Pro · Autorizar acceso</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}main{max-width:440px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;line-height:1.5}label{display:block;font-size:14px;margin:12px 0 4px}input[type=email],input[type=password],select{width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}.scope label{display:flex;gap:8px;align-items:flex-start;margin:6px 0}.warn{background:#fffbeb;border:1px solid #fcd34d;padding:8px;border-radius:8px}.err{background:#fef2f2;border:1px solid #fca5a5;padding:8px;border-radius:8px}.row{display:flex;gap:8px;margin-top:20px}button{flex:1;padding:10px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px;cursor:pointer}button.primary{background:#059669;color:#fff;border-color:#059669}code{font-size:13px}</style></head><body><main>${body}</main></body></html>`;
  }

  function consentForm(
    p: AuthorizeParams,
    options: {
      error?: string;
      organizations?: { id: string; name: string }[];
      ticket?: string;
      email?: string;
    },
  ) {
    const host = new URL(p.redirectUri).host;
    const loopback = isLoopbackHost(new URL(p.redirectUri).hostname);
    const hidden = Object.entries({
      client_id: p.clientId,
      redirect_uri: p.redirectUri,
      state: p.state,
      code_challenge: p.codeChallenge,
      code_challenge_method: "S256",
      response_type: "code",
      scope: formatOAuthScope(p.requested),
      resource,
      ticket: options.ticket,
    })
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`,
      )
      .join("");
    const credentials = options.organizations
      ? `<label for="org">Organización</label><select id="org" name="organization_id" required>${options.organizations
          .map(
            (o) =>
              `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`,
          )
          .join("")}</select>`
      : `<label for="email">Correo de SolarSim</label><input id="email" type="email" name="email" autocomplete="username" required value="${escapeHtml(options.email ?? "")}">
<label for="password">Contraseña</label><input id="password" type="password" name="password" autocomplete="current-password" required>`;
    const write =
      p.requested === "write"
        ? `<label><input type="radio" name="grant_scope" value="write"> Consultar y editar clientes y enlaces de propuestas (según tu rol)</label>`
        : "";
    return page(`<h1>Conectar «${escapeHtml(p.clientName)}» con SolarSim Pro</h1>
<p>La aplicación volverá a <strong>${escapeHtml(host)}</strong> al terminar.</p>
${loopback ? `<p class="warn">La dirección de retorno es de este equipo (loopback). Autoriza solo si acabas de iniciar la conexión desde un programa tuyo.</p>` : ""}
${options.error ? `<p class="err" role="alert">${escapeHtml(options.error)}</p>` : ""}
<form method="post" action="/oauth/authorize">${hidden}
<div class="scope"><p>Acceso que concedes:</p><label><input type="radio" name="grant_scope" value="read" checked> Solo consultar propuestas, clientes, catálogo y tarifas</label>${write}</div>
${credentials}
<p>Las acciones que requieren confirmación en SolarSim (precios, estados, papelera, borrados) no están disponibles por esta vía. Puedes revocar el acceso en Ajustes → Agentes e IA.</p>
<div class="row"><button class="primary" type="submit" name="decision" value="allow">Autorizar</button><button type="submit" name="decision" value="deny" formnovalidate>Cancelar</button></div>
</form>`);
  }

  app.get("/oauth/authorize", async (c) => {
    const checked = await readAuthorize(c.req.query());
    if (!checked.ok && "redirect" in checked)
      return c.redirect(checked.redirect, 302);
    securityHeaders(c, checked.ok ? checked.value.redirectUri : undefined);
    if (!checked.ok)
      return c.html(
        page(
          `<h1>No se puede autorizar</h1><p class="err">${escapeHtml(checked.page)}</p>`,
        ),
        400,
      );
    return c.html(consentForm(checked.value, {}));
  });

  /** Active organizations the account can enter, primary first. */
  async function organizationsOf(userId: string, authVersion: number) {
    const rows = (
      await pool.query(
        `SELECT o.id,o.name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1
         UNION ALL SELECT o.id,o.name FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
         WHERE m.user_id=$1 AND m.is_active=TRUE`,
        [userId],
      )
    ).rows;
    const result: { id: string; name: string; user: AuthUser }[] = [];
    for (const row of rows) {
      const user = await resolveMembership(pool, userId, row.id);
      if (
        user &&
        (user.authVersion ?? 0) === authVersion &&
        !result.some((r) => r.id === row.id)
      )
        result.push({ id: row.id, name: row.name, user });
    }
    return result;
  }

  app.post("/oauth/authorize", async (c) => {
    const form = (await c.req.parseBody()) as Record<
      string,
      string | undefined
    >;
    const checked = await readAuthorize(form);
    if (!checked.ok && "redirect" in checked)
      return c.redirect(checked.redirect, 302);
    securityHeaders(c, checked.ok ? checked.value.redirectUri : undefined);
    if (!checked.ok)
      return c.html(
        page(
          `<h1>No se puede autorizar</h1><p class="err">${escapeHtml(checked.page)}</p>`,
        ),
        400,
      );
    const p = checked.value;
    const back = (error: string, code: string) => {
      const url = new URL(p.redirectUri);
      url.searchParams.set("error", code);
      url.searchParams.set("error_description", error);
      if (p.state) url.searchParams.set("state", p.state);
      url.searchParams.set("iss", issuer);
      return c.redirect(url.toString(), 302);
    };
    if (form.decision !== "allow")
      return back("La persona canceló", "access_denied");
    let userId: string, authVersion: number;
    if (form.ticket) {
      try {
        const claims = jwt.verify(form.ticket, ticketKey, {
          algorithms: ["HS256"],
          audience: `solarsim-oauth:${p.clientId}`,
        }) as jwt.JwtPayload;
        userId = String(claims.sub);
        authVersion = Number(claims.av ?? 0);
      } catch {
        return c.html(
          consentForm(p, {
            error: "La sesión de autorización caducó; vuelve a iniciar sesión.",
          }),
          400,
        );
      }
    } else {
      const email = (form.email ?? "").trim().toLowerCase();
      const password = form.password ?? "";
      if (!signInsByIp.take(clientIp(c)) || !signInsByEmail.take(email)) {
        c.header("Retry-After", "600");
        return c.html(
          consentForm(p, {
            error: "Demasiados intentos. Espera unos minutos.",
            email,
          }),
          429,
        );
      }
      const row = email
        ? (
            await pool.query(
              "SELECT id,password_hash,is_active,auth_version FROM users WHERE email=$1",
              [email],
            )
          ).rows[0]
        : undefined;
      // Same bcrypt cost whether or not the account exists: no account enumeration by timing.
      const valid = await bcrypt.compare(
        password,
        row?.password_hash ?? dummyHash,
      );
      if (!row || !valid || !row.is_active)
        return c.html(
          consentForm(p, { error: "Credenciales inválidas.", email }),
          401,
        );
      signInsByEmail.reset(email);
      userId = row.id;
      authVersion = row.auth_version ?? 0;
    }
    const organizations = await organizationsOf(userId, authVersion);
    if (!organizations.length)
      return c.html(
        consentForm(p, {
          error: "No tienes acceso activo a una organización.",
        }),
        403,
      );
    let chosen = organizations.length === 1 ? organizations[0] : undefined;
    if (!chosen && form.organization_id)
      chosen = organizations.find((o) => o.id === form.organization_id);
    if (!chosen) {
      const ticket = jwt.sign({ av: authVersion }, ticketKey, {
        algorithm: "HS256",
        subject: userId,
        audience: `solarsim-oauth:${p.clientId}`,
        expiresIn: TICKET_SECONDS,
      });
      return c.html(consentForm(p, { organizations, ticket }));
    }
    const user = chosen.user;
    // The account's role caps the grant: a LECTOR can never authorize writes.
    const scope: AgentScope =
      form.grant_scope === "write" &&
      p.requested === "write" &&
      user.role !== "LECTOR"
        ? "write"
        : "read";
    const code = randomBytes(32).toString("base64url");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const grantId = await createGrant(client, {
        user,
        kind: "oauth",
        name: p.clientName,
        scope,
        resource,
        clientId: p.clientId,
      });
      await client.query(
        "INSERT INTO oauth_codes (code_hash,client_id,grant_id,redirect_uri,code_challenge,expires_at) VALUES ($1,$2,$3,$4,$5,clock_timestamp()+make_interval(secs=>$6))",
        [
          hashSecret(code),
          p.clientId,
          grantId,
          p.redirectUri,
          p.codeChallenge,
          CODE_SECONDS,
        ],
      );
      await purgeExpired(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const url = new URL(p.redirectUri);
    url.searchParams.set("code", code);
    if (p.state) url.searchParams.set("state", p.state);
    url.searchParams.set("iss", issuer);
    return c.redirect(url.toString(), 302);
  });

  const tokenError = (
    c: Context,
    error: string,
    description: string,
    status: 400 | 401 = 400,
  ) => {
    c.header("Cache-Control", "no-store");
    return c.json({ error, error_description: description }, status);
  };
  async function readForm(c: Context): Promise<Record<string, string>> {
    const type = c.req.header("Content-Type") ?? "";
    if (type.includes("application/json")) {
      const body = await c.req.json().catch(() => ({}));
      return Object.fromEntries(
        Object.entries(body ?? {}).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
    }
    const body = await c.req.parseBody();
    return Object.fromEntries(
      Object.entries(body).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
  }

  app.post("/oauth/token", async (c) => {
    const form = await readForm(c);
    if (
      form.grant_type !== "authorization_code" &&
      form.grant_type !== "refresh_token"
    )
      return tokenError(
        c,
        "unsupported_grant_type",
        "Solo authorization_code y refresh_token",
      );
    if (!form.client_id)
      return tokenError(c, "invalid_client", "client_id requerido", 401);
    if (form.resource !== undefined && !sameResource(form.resource, resource))
      return tokenError(c, "invalid_target", "Recurso desconocido");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      let grant: Record<string, any> | undefined;
      if (form.grant_type === "authorization_code") {
        const row = (
          await db.query(
            "SELECT * FROM oauth_codes WHERE code_hash=$1 FOR UPDATE",
            [hashSecret(form.code ?? "")],
          )
        ).rows[0];
        if (!row || row.client_id !== form.client_id) {
          await db.query("ROLLBACK");
          return tokenError(c, "invalid_grant", "Código inválido");
        }
        if (row.used_at) {
          // A replayed code means it leaked: everything issued from it is revoked (OAuth 2.1 §4.1.3).
          await revokeGrant(db, row.grant_id);
          await db.query("COMMIT");
          return tokenError(c, "invalid_grant", "Código ya usado");
        }
        if (
          row.expires_at.getTime() < Date.now() ||
          row.redirect_uri !== form.redirect_uri ||
          !pkceOk(form.code_verifier, row.code_challenge)
        ) {
          await db.query("ROLLBACK");
          return tokenError(
            c,
            "invalid_grant",
            "Código, redirect_uri o PKCE inválidos",
          );
        }
        await db.query(
          "UPDATE oauth_codes SET used_at=clock_timestamp() WHERE code_hash=$1",
          [row.code_hash],
        );
        grant = (
          await db.query("SELECT * FROM agent_grants WHERE id=$1 FOR UPDATE", [
            row.grant_id,
          ])
        ).rows[0];
      } else {
        const row = (
          await db.query(
            "SELECT * FROM agent_tokens WHERE token_hash=$1 AND kind='refresh' FOR UPDATE",
            [hashSecret(form.refresh_token ?? "")],
          )
        ).rows[0];
        if (!row) {
          await db.query("ROLLBACK");
          return tokenError(c, "invalid_grant", "Token de renovación inválido");
        }
        grant = (
          await db.query("SELECT * FROM agent_grants WHERE id=$1 FOR UPDATE", [
            row.grant_id,
          ])
        ).rows[0];
        if (row.used_at) {
          // Refresh token reuse: the rotated token was stolen or replayed. Revoke the whole connection.
          await revokeGrant(db, row.grant_id);
          await db.query("COMMIT");
          return tokenError(c, "invalid_grant", "Token de renovación ya usado");
        }
        if (
          row.expires_at.getTime() < Date.now() ||
          grant?.client_id !== form.client_id
        ) {
          await db.query("ROLLBACK");
          return tokenError(c, "invalid_grant", "Token de renovación inválido");
        }
        await db.query(
          "UPDATE agent_tokens SET used_at=clock_timestamp() WHERE token_hash=$1",
          [row.token_hash],
        );
      }
      const member =
        grant && !grant.revoked_at
          ? await resolveMembership(db, grant.user_id, grant.organization_id)
          : null;
      if (
        !grant ||
        !member ||
        (member.authVersion ?? 0) !== grant.auth_version
      ) {
        await db.query("ROLLBACK");
        return tokenError(
          c,
          "invalid_grant",
          "El acceso fue revocado o la cuenta cambió",
        );
      }
      const tokens = await issueOAuthTokens(db, grant.id);
      await db.query(
        "UPDATE oauth_clients SET last_used_at=clock_timestamp() WHERE client_id=$1",
        [grant.client_id],
      );
      await db.query("COMMIT");
      c.header("Cache-Control", "no-store");
      c.header("Pragma", "no-cache");
      return c.json({
        access_token: tokens.access,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_SECONDS,
        refresh_token: tokens.refresh,
        scope: formatOAuthScope(grant.scope),
      });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  });

  app.post("/oauth/revoke", async (c) => {
    const form = await readForm(c);
    const row = form.token
      ? (
          await pool.query(
            "SELECT grant_id FROM agent_tokens WHERE token_hash=$1 AND kind IN ('access','refresh')",
            [hashSecret(form.token)],
          )
        ).rows[0]
      : undefined;
    // RFC 7009: unknown tokens also answer 200. Revoking either token ends the whole connection.
    if (row) await revokeGrant(pool, row.grant_id);
    return c.body(null, 200);
  });
}
