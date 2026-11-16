import { randomUUID } from "node:crypto";
import type { AgentScope } from "../../shared/agentAccess.js";
import { findAgentTool } from "../../shared/agentTools/definitions.js";
import { validateJsonSchema } from "../../shared/agentTools/jsonSchema.js";
import type {
  AgentToolDefinition,
  AgentToolOutcome,
} from "../../shared/agentTools/types.js";
import {
  CLIENT_KINDS,
  filterClients,
  type ClientKind,
} from "../../shared/clients.js";
import { readEquipment } from "../../shared/equipment/index.js";
import { isWriterRole } from "../../shared/permissions.js";
import { ApiError, type ApiClient } from "./apiClient.js";

/** Same 64 KB cap as the in-app registry: agents must narrow the query instead of receiving huge payloads. */
export const MAX_RESULT_BYTES = 64 * 1024;

type Handler = (
  args: Record<string, any>,
  api: ApiClient,
) => Promise<AgentToolOutcome>;

interface RemoteTool {
  definition: AgentToolDefinition;
  /** API scope the tool needs; `write` tools are only listed for write grants of writer accounts. */
  scope: AgentScope;
  run: Handler;
}

const normalize = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const ok = (data: unknown): AgentToolOutcome => ({ status: "ok", data });
/** Remote writes have no device "Deshacer": the API logs them and proposal edits keep a version checkpoint. */
const applied = (data: unknown, target: string): AgentToolOutcome => ({
  status: "applied",
  data,
  activityId: `remote:${target}`,
});
const fail = (code: string, message: string): AgentToolOutcome => ({
  status: "error",
  code,
  message,
});

/** An id that is about to be interpolated into an API path or query is not a usable id. */
class InvalidId extends Error {}
/**
 * Path segment for an id: `encodeURIComponent` leaves "." and ".." untouched, which would make `/api/projects/..`
 * resolve to `/api/`. Empty, ".", "..", and any "/" or "\" are rejected for every tool.
 */
export function pathId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    /[/\\]/.test(value)
  )
    throw new InvalidId();
  return encodeURIComponent(value);
}

/** Shared definition (same name, title, kind and schema) with remote-only adjustments where semantics differ. */
function shared(
  name: string,
  patch: Partial<AgentToolDefinition> = {},
): AgentToolDefinition {
  const definition = findAgentTool(name);
  if (!definition) throw new Error(`Unknown agent tool ${name}`);
  return { ...definition, ...patch };
}

async function equipmentList(api: ApiClient) {
  const result = await api.request<{ items: any[]; deletedIds: string[] }>(
    "GET",
    "/api/equipment",
  );
  const deleted = new Set(result.deletedIds ?? []);
  return (result.items ?? []).filter((e) => !deleted.has(e.id));
}
async function clientList(api: ApiClient) {
  return (
    (await api.request<{ clients: any[] }>("GET", "/api/clients")).clients ?? []
  );
}
const clientData = (c: any) => ({
  id: c.id,
  kind: c.kind,
  kindLabel: CLIENT_KINDS[c.kind as ClientKind],
  name: c.name,
  taxId: c.taxId,
  phone: c.phone,
  email: c.email,
  address: c.address,
  province: c.province,
  notes: c.notes,
});
const CLIENT_FIELDS = [
  "kind",
  "name",
  "taxId",
  "phone",
  "email",
  "address",
  "province",
  "notes",
] as const;
const pickClientInput = (args: Record<string, any>) =>
  Object.fromEntries(
    CLIENT_FIELDS.filter((k) => typeof args[k] === "string").map((k) => [
      k,
      args[k],
    ]),
  );

const TOOLS: RemoteTool[] = [
  {
    definition: shared("search_projects", {
      description:
        "Busca propuestas sincronizadas de la organización por nombre del cliente, código o provincia. Máximo 12. No incluye la papelera.",
    }),
    scope: "read",
    run: async (args, api) => {
      const query = encodeURIComponent(String(args.query ?? ""));
      const result = await api.request(
        "GET",
        `/api/projects?limit=12&query=${query}`,
      );
      return ok({ projects: result.projects, limit: 12 });
    },
  },
  {
    definition: shared("get_project", {
      description:
        "Consulta los datos guardados de una propuesta sincronizada por id: cliente impreso, equipos, tarifas, finanzas y consumos. No ejecuta el motor: producción, ahorro y retorno se consultan en la app.",
      inputSchema: {
        ...findAgentTool("get_project")!.inputSchema,
        required: ["id"],
      },
    }),
    scope: "read",
    run: async (args, api) => {
      const { project: p } = await api.request(
        "GET",
        `/api/projects/${pathId(args.id)}`,
      );
      return ok({
        id: p.id,
        version: p.version,
        status: p.status,
        decision: p.commercial?.status ?? "pending",
        isDeleted: p.isDeleted === true,
        clientId: p.clientId ?? null,
        client: p.client,
        equipment:
          p.specs && typeof p.specs === "object"
            ? readEquipment(p.specs)
            : null,
        rates: p.rates,
        financials: p.financials,
        monthlyConsumption: p.monthlyConsumption,
        updatedAt: p.updatedAt,
        lastModifiedBy: p.lastModifiedBy,
        note: "Datos guardados en el servidor. Los resultados calculados se obtienen en SolarSim (el MCP remoto no ejecuta el motor).",
      });
    },
  },
  {
    definition: shared("search_equipment"),
    scope: "read",
    run: async (args, api) => {
      if (
        args.unavailableOnly !== undefined &&
        typeof args.unavailableOnly !== "boolean"
      )
        return fail("invalid_input", "Filtro de disponibilidad inválido.");
      const query = normalize(args.query);
      const found = (await equipmentList(api))
        .filter(
          (e) =>
            normalize(`${e.brand} ${e.displayName} ${e.modelSeries}`).includes(
              query,
            ) &&
            (!args.unavailableOnly ||
              !e.supplierPrices?.some(
                (p: any) => p.stockStatus === "in_stock",
              )),
        )
        .slice(0, 12);
      return ok({
        equipment: found.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.displayName,
          brand: e.brand,
          offers: e.supplierPrices,
          stockNote: !e.supplierPrices?.length
            ? "Sin ofertas; disponibilidad desconocida"
            : undefined,
        })),
        limit: 12,
      });
    },
  },
  {
    definition: shared("get_equipment"),
    scope: "read",
    run: async (args, api) => {
      const e = (await equipmentList(api)).find((item) => item.id === args.id);
      if (!e)
        return fail("not_found", "Equipo no disponible en esta organización.");
      return ok({ ...e, datasheetUrl: undefined, syncServerUrl: undefined });
    },
  },
  {
    definition: shared("list_supplier_offers"),
    scope: "read",
    run: async (args, api) => {
      const query = normalize(args.query);
      const supplier = normalize(args.supplier);
      const offers = (await equipmentList(api))
        .filter((e) => !args.equipmentId || e.id === args.equipmentId)
        .flatMap((e) =>
          (e.supplierPrices || []).map((o: any) => ({
            equipmentId: e.id,
            equipmentName: e.displayName,
            type: e.type,
            offerId: o.id,
            supplierName: o.supplierName,
            priceUSD: o.priceUSD,
            currency: o.currency,
            priceDOP: o.priceDOP,
            stockStatus: o.stockStatus,
            sku: o.sku,
            updatedAt: o.updatedAt,
            preferred: e.preferredSupplierId === o.id,
          })),
        )
        .filter(
          (o: any) =>
            (!supplier || normalize(o.supplierName).includes(supplier)) &&
            (!query ||
              normalize(
                `${o.equipmentName} ${o.supplierName} ${o.sku}`,
              ).includes(query)),
        )
        .slice(0, 50);
      return ok({ offers, limit: 50 });
    },
  },
  {
    definition: shared("get_tariffs", {
      description:
        "Consulta la matriz de tarifas personalizada de la organización y su procedencia; sin matriz propia se usa el pliego oficial integrado en la app.",
    }),
    scope: "read",
    run: async (_args, api) => {
      const result = await api.request("GET", "/api/tariffs");
      return ok({ matrix: result.matrix ?? null, message: result.message });
    },
  },
  {
    definition: shared("search_clients", {
      description:
        "Busca en el directorio de clientes por nombre, RNC/cédula, teléfono o correo. Máximo 20.",
    }),
    scope: "read",
    run: async (args, api) => {
      const clients = filterClients(
        await clientList(api),
        String(args.query ?? ""),
        args.kind ?? "all",
      ).slice(0, 20);
      return ok({
        clients: clients.map((c) => ({
          id: c.id,
          kind: c.kind,
          name: c.name,
          taxId: c.taxId,
          phone: c.phone,
          email: c.email,
          province: c.province,
        })),
        limit: 20,
      });
    },
  },
  {
    definition: shared("get_client"),
    scope: "read",
    run: async (args, api) => {
      const client = (await clientList(api)).find((c) => c.id === args.id);
      if (!client)
        return fail(
          "not_found",
          "Cliente no encontrado en esta organización. Usa search_clients.",
        );
      const { projects } = await api.request(
        "GET",
        `/api/projects?limit=50&clientId=${pathId(client.id)}`,
      );
      const count = (key: string) =>
        projects.reduce(
          (acc: Record<string, number>, p: any) => ({
            ...acc,
            [p[key] ?? "pending"]: (acc[p[key] ?? "pending"] ?? 0) + 1,
          }),
          {},
        );
      return ok({
        client: { ...clientData(client), proposalCount: projects.length },
        summary: {
          total: projects.length,
          documents: count("status"),
          decisions: count("decision"),
        },
        proposals: projects.slice(0, 30).map((p: any) => ({
          id: p.id,
          code: p.code,
          printedName: p.name,
          status: p.status,
          decision: p.decision ?? "pending",
          updatedAt: p.updatedAt,
        })),
      });
    },
  },
  {
    definition: shared("create_client"),
    scope: "write",
    run: async (args, api) => {
      const id = `client-${randomUUID()}`;
      const { client } = await api.request("PUT", `/api/clients/${id}`, {
        kind: "empresa",
        ...pickClientInput(args),
        baseVersion: 0,
      });
      return applied(
        { clientId: client.id, client: clientData(client) },
        client.id,
      );
    },
  },
  {
    definition: shared("update_client"),
    scope: "write",
    run: async (args, api) => {
      const updates = pickClientInput(args);
      if (!Object.keys(updates).length)
        return fail("invalid_input", "Indica al menos un campo a cambiar.");
      const current = (await clientList(api)).find((c) => c.id === args.id);
      if (!current)
        return fail(
          "not_found",
          "Cliente no encontrado en esta organización. Usa search_clients.",
        );
      // CAS: the version read here; if someone edits in between, the API answers 409 and nothing is overwritten.
      const { client } = await api.request(
        "PUT",
        `/api/clients/${pathId(current.id)}`,
        {
          ...Object.fromEntries(CLIENT_FIELDS.map((k) => [k, current[k]])),
          ...updates,
          baseVersion: current.version,
        },
      );
      return applied({ client: clientData(client) }, client.id);
    },
  },
  {
    definition: shared("link_proposal_to_client"),
    scope: "write",
    run: async (args, api) => {
      const { project } = await api.request(
        "GET",
        `/api/projects/${pathId(args.proposalId)}`,
      );
      const result = await api.request(
        "PUT",
        `/api/projects/${pathId(project.id)}/client-link`,
        {
          clientId: args.clientId ?? null,
          baseVersion: project.version,
        },
      );
      return applied(
        {
          proposalId: project.id,
          clientId: result.project.clientId ?? null,
          version: result.version,
        },
        project.id,
      );
    },
  },
];

/** Tools visible to a grant: read tools always; write tools only when scope and role both allow writing. */
export function remoteTools(identity: {
  scope: AgentScope;
  role: string;
}): RemoteTool[] {
  // Shared permission rule; an unknown, empty or legacy role (VIEWER) never writes.
  const canWrite = identity.scope === "write" && isWriterRole(identity.role);
  return TOOLS.filter((tool) => tool.scope === "read" || canWrite);
}

/** Names never exposed remotely (docs/MCP_REMOTE.md#herramientas): guarded tools need a person in the app. */
export const REMOTE_TOOL_NAMES = TOOLS.map((t) => t.definition.name);

export async function callRemoteTool(
  name: string,
  args: unknown,
  identity: { scope: AgentScope; role: string },
  api: ApiClient,
): Promise<AgentToolOutcome> {
  const tool = remoteTools(identity).find((t) => t.definition.name === name);
  if (!tool) {
    const known = findAgentTool(name);
    if (known?.kind === "guarded")
      return fail(
        "confirmation_required",
        "Esta acción requiere confirmación de una persona en SolarSim y no está disponible por el MCP remoto. Pide al usuario que la haga en la app.",
      );
    if (TOOLS.some((t) => t.definition.name === name))
      return fail(
        "forbidden",
        "El acceso concedido o el rol de la cuenta solo permite consultar.",
      );
    return fail(
      "unknown_tool",
      known
        ? "Herramienta no disponible en el MCP remoto (solo en la app de escritorio)."
        : "Herramienta desconocida.",
    );
  }
  // `arguments` may be omitted (= {}), but anything other than an object is invalid input, not an empty call.
  if (
    args !== undefined &&
    args !== null &&
    (typeof args !== "object" || Array.isArray(args))
  )
    return fail("invalid_input", "arguments debe ser un objeto.");
  const input = (args ?? {}) as Record<string, any>;
  const errors = validateJsonSchema(tool.definition.inputSchema, input);
  if (errors.length) return fail("invalid_input", errors.slice(0, 5).join(" "));
  try {
    const outcome = await tool.run(input, api.withTool(name));
    if (JSON.stringify(outcome).length > MAX_RESULT_BYTES)
      return fail(
        "result_too_large",
        "La respuesta supera 64 KB; acota la búsqueda.",
      );
    return outcome;
  } catch (error) {
    if (error instanceof InvalidId)
      return fail("invalid_input", "Identificador no válido.");
    if (error instanceof ApiError) {
      // Token problems are protocol-level (401 lets the client refresh or sign in again).
      if (error.status === 401) throw error;
      return fail(error.code, error.message);
    }
    return fail("tool_failed", "La herramienta no pudo ejecutarse.");
  }
}
