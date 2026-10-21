/** Client records shared by the app, the API and the agent tools. A linked client is independent of the name printed in a proposal. */

export const CLIENT_KINDS = {
  persona: "Persona",
  empresa: "Empresa",
} as const;
export type ClientKind = keyof typeof CLIENT_KINDS;

/** Editable content of a client; every field except the name is optional and stored as an empty string when absent. */
export interface ClientInput {
  kind: ClientKind;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  province: string;
  notes: string;
}

export const CLIENT_LIMITS = {
  id: 64,
  name: 255,
  taxId: 32,
  phone: 64,
  email: 255,
  address: 500,
  province: 100,
  notes: 4000,
} as const;

/** RNC/cédula without separators: "1-31-12345-6" → "131123456". Foreign ids keep their letters, uppercased. */
export function normalizeTaxId(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\s.\-_/]/g, "").toUpperCase()
    : "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPTIONAL_TEXT = ["phone", "email", "address", "province", "notes"] as const;

export type ClientValidation =
  | { ok: true; value: ClientInput }
  | { ok: false; error: string };

/** Validates and normalizes untrusted client content (API body, sync payload or agent tool arguments). */
export function validateClientInput(input: unknown): ClientValidation {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "Cliente inválido" };
  const data = input as Record<string, unknown>;
  const kind = data.kind ?? "persona";
  if (kind !== "persona" && kind !== "empresa")
    return { ok: false, error: "Tipo de cliente inválido" };
  if (typeof data.name !== "string" || !data.name.trim())
    return { ok: false, error: "El nombre del cliente es obligatorio" };
  const name = data.name.trim();
  if (name.length > CLIENT_LIMITS.name)
    return { ok: false, error: "El nombre del cliente es demasiado largo" };
  if (data.taxId != null && typeof data.taxId !== "string")
    return { ok: false, error: "RNC o cédula inválido" };
  const taxId = normalizeTaxId(data.taxId);
  if (taxId.length > CLIENT_LIMITS.taxId || !/^[A-Z0-9]*$/.test(taxId))
    return { ok: false, error: "RNC o cédula inválido" };
  const value: ClientInput = {
    kind: kind as ClientKind,
    name,
    taxId,
    phone: "",
    email: "",
    address: "",
    province: "",
    notes: "",
  };
  for (const field of OPTIONAL_TEXT) {
    const raw = data[field];
    if (raw == null) continue;
    if (typeof raw !== "string" || raw.trim().length > CLIENT_LIMITS[field])
      return { ok: false, error: `Campo ${field} inválido` };
    value[field] = raw.trim();
  }
  if (value.email && !EMAIL.test(value.email))
    return { ok: false, error: "Correo del cliente inválido" };
  return { ok: true, value };
}

/** Comparable editable content, excluding server attribution and versions. */
export function clientContent(client: Partial<ClientInput>): ClientInput {
  return {
    kind: client.kind ?? "persona",
    name: (client.name ?? "").trim(),
    taxId: normalizeTaxId(client.taxId),
    phone: client.phone ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
    province: client.province ?? "",
    notes: client.notes ?? "",
  };
}

/** Name key for duplicate warnings: case, accents, punctuation and spacing are immaterial. */
export function clientNameKey(name: unknown): string {
  return typeof name === "string"
    ? name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

/** Existing clients that share the tax id or the normalized name; a warning, never a uniqueness rule. */
export function findDuplicateClients<T extends { id: string; name: string; taxId?: string }>(
  clients: readonly T[],
  candidate: { id?: string; name?: string; taxId?: string },
): { client: T; reason: "taxId" | "name" }[] {
  const taxId = normalizeTaxId(candidate.taxId);
  const name = clientNameKey(candidate.name);
  const matches: { client: T; reason: "taxId" | "name" }[] = [];
  for (const client of clients) {
    if (client.id === candidate.id) continue;
    if (taxId && normalizeTaxId(client.taxId) === taxId)
      matches.push({ client, reason: "taxId" });
    else if (name && clientNameKey(client.name) === name)
      matches.push({ client, reason: "name" });
  }
  return matches;
}
