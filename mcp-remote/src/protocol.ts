import type { AgentIdentity } from "../../shared/agentAccess.js";
import { AGENT_RULES_ES } from "../../shared/agentTools/rules.js";
import type { AgentToolOutcome } from "../../shared/agentTools/types.js";
import type { ApiClient } from "./apiClient.js";
import { SERVICE_VERSION } from "./config.js";
import { callRemoteTool, remoteTools } from "./tools.js";

/**
 * Minimal, stateless MCP server over Streamable HTTP with JSON responses (no SSE, no sessions).
 * Speaks the initialize-based revisions (2025-03-26 … 2025-11-25) that today's connectors use; a request for
 * a revision it does not implement (e.g. 2026-07-28) gets UnsupportedProtocolVersionError listing these, so
 * dual-era clients fall back to `initialize` (docs/MCP_REMOTE.md#protocolo).
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;

export const REMOTE_INSTRUCTIONS = `${AGENT_RULES_ES} Estás conectado al MCP remoto de SolarSim: trabajas sobre los datos sincronizados de la organización con los permisos actuales de la cuenta. Las acciones que requieren confirmación humana (precios, estados, papelera, borrados) no están disponibles por esta vía: pide al usuario que las haga en la app.`;

export interface RpcContext {
  identity: AgentIdentity;
  api: ApiClient;
}

export interface RpcReply {
  status: number;
  body?: unknown;
}

const rpcError = (
  id: unknown,
  code: number,
  message: string,
  data?: unknown,
  status = 200,
): RpcReply => ({
  status,
  body: {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  },
});
const rpcResult = (id: unknown, result: unknown): RpcReply => ({
  status: 200,
  body: { jsonrpc: "2.0", id, result },
});

export function outcomeText(outcome: AgentToolOutcome): string {
  const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);
  switch (outcome.status) {
    case "ok":
      return json(outcome.data);
    case "applied":
      return `Cambio aplicado en SolarSim y registrado en la actividad remota (Ajustes → Agentes e IA). No tiene «Deshacer» automático; las propuestas conservan su historial de versiones.\n${json(outcome.data)}`;
    case "pending_confirmation":
      return `${outcome.summary}\nEsta acción espera confirmación en SolarSim (id ${outcome.actionId}).`;
    case "error":
      return `${outcome.message} (${outcome.code})`;
  }
}

/** `tools/list` entry: same name, title, description and schema as the in-app registry. */
export function toMcpTool(
  definition: ReturnType<typeof remoteTools>[number]["definition"],
) {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: { ...definition.inputSchema, type: "object" as const },
    annotations: {
      title: definition.title,
      readOnlyHint: definition.kind === "read",
      // No guarded tool is exposed remotely; remote writes create or edit, never delete.
      destructiveHint: false,
      openWorldHint: false,
    },
  };
}

export function protocolVersionError(id: unknown, requested: string): RpcReply {
  return rpcError(
    id,
    UNSUPPORTED_PROTOCOL_VERSION,
    "Unsupported protocol version",
    { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested },
    400,
  );
}

const isSupported = (version: unknown): version is string =>
  typeof version === "string" &&
  (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);

/** Handles one JSON-RPC message. Batches are not part of the supported revisions since 2025-06-18. */
export async function handleMessage(
  message: unknown,
  ctx: RpcContext,
): Promise<RpcReply> {
  if (!message || typeof message !== "object" || Array.isArray(message))
    return rpcError(
      null,
      -32600,
      "Solicitud JSON-RPC inválida (sin lotes).",
      undefined,
      400,
    );
  const msg = message as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: any;
  };
  if (msg.jsonrpc !== "2.0")
    return rpcError(
      msg.id,
      -32600,
      "Solicitud JSON-RPC inválida.",
      undefined,
      400,
    );
  // Notifications and client responses carry no reply.
  if (typeof msg.method !== "string" || msg.id === undefined)
    return { status: 202 };
  const modern = msg.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  if (modern !== undefined && !isSupported(modern))
    return protocolVersionError(msg.id, String(modern));
  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: isSupported(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "solarsim-remote",
          title: "SolarSim Pro",
          version: SERVICE_VERSION,
        },
        instructions: REMOTE_INSTRUCTIONS,
      });
    }
    case "server/discover":
      return protocolVersionError(msg.id, String(modern ?? "unknown"));
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: remoteTools(ctx.identity).map((t) => toMcpTool(t.definition)),
      });
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string")
        return rpcError(msg.id, -32602, "Falta el nombre de la herramienta.");
      const outcome = await callRemoteTool(
        name,
        msg.params?.arguments ?? {},
        ctx.identity,
        ctx.api,
      );
      return rpcResult(msg.id, {
        content: [{ type: "text", text: outcomeText(outcome) }],
        structuredContent: outcome,
        isError: outcome.status === "error",
      });
    }
    default:
      return rpcError(msg.id, -32601, "Método no admitido.");
  }
}
