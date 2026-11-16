/** Configuration by environment variables (docs/MCP_REMOTE.md#variables). A typo fails at startup. */
export const SERVICE_VERSION = "2.7.4";

export interface McpRemoteConfig {
  port: number;
  host: string;
  /** Canonical public URL of the MCP endpoint (RFC 8707 resource). Must equal the API's MCP_REMOTE_URL. */
  publicUrl: string;
  /** Internal base URL of the API, e.g. http://solarsim-api:3000. Never exposed to clients. */
  apiUrl: string;
  /** OAuth issuer (the API's API_PUBLIC_URL). Without it only personal tokens are accepted. */
  authorizationServer?: string;
  /** Browser origins allowed to call /mcp. Native MCP clients send no Origin. */
  allowedOrigins: string[];
  maxBodyBytes: number;
}

const isLoopback = (host: string) =>
  host === "127.0.0.1" || host === "localhost" || host === "[::1]";

function url(
  name: string,
  value: unknown,
  options: { originOnly?: boolean; internal?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  const secure =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" &&
      (options.internal || isLoopback(parsed.hostname)));
  if (
    !secure ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    (options.originOnly && parsed.pathname !== "/")
  )
    throw new Error(
      `${name} must be ${options.internal ? "an http(s)" : "an https"} URL without query or fragment${options.originOnly ? " or path" : ""}.`,
    );
  return options.originOnly
    ? parsed.origin
    : `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpRemoteConfig {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a TCP port.");
  const publicUrl = url("MCP_PUBLIC_URL", env.MCP_PUBLIC_URL);
  if (new URL(publicUrl).pathname === "/")
    throw new Error(
      "MCP_PUBLIC_URL must include the endpoint path, e.g. /mcp.",
    );
  const maxBodyBytes = Number(env.MCP_MAX_BODY_BYTES ?? 256 * 1024);
  if (
    !Number.isInteger(maxBodyBytes) ||
    maxBodyBytes < 1024 ||
    maxBodyBytes > 4 * 1024 * 1024
  )
    throw new Error("MCP_MAX_BODY_BYTES must be between 1024 and 4194304.");
  return {
    port,
    host: env.HOST ?? "0.0.0.0",
    publicUrl,
    // Internal network inside the MCP container's host: plain http is acceptable there (docs/MCP_REMOTE.md).
    apiUrl: url("API_INTERNAL_URL", env.API_INTERNAL_URL, { internal: true }),
    ...(env.OAUTH_ISSUER_URL
      ? {
          authorizationServer: url("OAUTH_ISSUER_URL", env.OAUTH_ISSUER_URL, {
            originOnly: true,
          }),
        }
      : {}),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => url("MCP_ALLOWED_ORIGINS", o, { originOnly: true })),
    maxBodyBytes,
  };
}
