import {
  CLIENT_HEADER,
  formatClientHeader,
} from "../../shared/clientVersion.js";
import {
  AGENT_CLIENT_HEADER,
  AGENT_TOOL_HEADER,
  type AgentIdentity,
} from "../../shared/agentAccess.js";
import { SERVICE_VERSION } from "./config.js";

/** Name this service presents to the API's minimum client version gate. */
export const SERVICE_CLIENT = formatClientHeader("mcp-remote", SERVICE_VERSION);
const TIMEOUT_MS = 15000;

/** API failure translated for agents. `status` is the API's HTTP status (0 = unreachable). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function failure(status: number, body: any): ApiError {
  const message =
    typeof body?.error === "string"
      ? body.error
      : "La API rechazó la solicitud.";
  if (status === 401)
    return new ApiError(
      401,
      "unauthorized",
      "El token de agente no es válido, caducó o fue revocado.",
    );
  if (status === 403)
    return new ApiError(403, body?.code ?? "forbidden", message);
  if (status === 404) return new ApiError(404, "not_found", message);
  if (status === 409)
    return new ApiError(
      409,
      "conflict",
      `${message} Vuelve a consultar el dato y reintenta.`,
    );
  if (status === 426)
    return new ApiError(
      426,
      "service_outdated",
      "El servicio MCP remoto está desactualizado respecto a la API; avisa al administrador.",
    );
  if (status === 429)
    return new ApiError(
      429,
      "rate_limited",
      "Demasiadas solicitudes; espera un momento.",
    );
  if (status === 400) return new ApiError(400, "invalid_input", message);
  return new ApiError(
    status,
    "api_error",
    "La API no pudo completar la solicitud.",
  );
}

/**
 * Calls the API on behalf of one agent token. The token is forwarded as is: the API resolves the account,
 * checks the route allowlist, scope, role and CAS, and logs the activity. This service holds no secrets.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly labels: {
      tool?: string;
      client?: string;
      /** End client's IP, for the API's per-IP limits when it trusts this service as a proxy. */
      forwardedFor?: string;
    } = {},
  ) {}

  withTool(tool: string): ApiClient {
    return new ApiClient(this.baseUrl, this.token, this.fetchImpl, {
      ...this.labels,
      tool,
    });
  }

  async request<T = any>(
    method: "GET" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          [CLIENT_HEADER]: SERVICE_CLIENT,
          Accept: "application/json",
          ...(this.labels.tool
            ? { [AGENT_TOOL_HEADER]: this.labels.tool }
            : {}),
          ...(this.labels.client
            ? { [AGENT_CLIENT_HEADER]: this.labels.client }
            : {}),
          ...(this.labels.forwardedFor
            ? { "X-Forwarded-For": this.labels.forwardedFor }
            : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(
        0,
        "api_unreachable",
        "La API de SolarSim no responde en este momento.",
      );
    }
    let json: any = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) throw failure(response.status, json);
    return json as T;
  }

  whoami(): Promise<AgentIdentity> {
    return this.request<AgentIdentity>("GET", "/api/agent-access/whoami");
  }
}
