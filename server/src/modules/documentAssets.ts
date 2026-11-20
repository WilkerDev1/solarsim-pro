import { createHash } from "node:crypto";
import type { Context, Hono } from "hono";
import type { Pool, PoolClient } from "pg";
import {
  ASSET_REFS_QUERY,
  MAX_ASSET_LENGTH,
  SHA256_HEX,
  UNKNOWN_DOCUMENT_ASSET,
  assetRef,
  assetRefHash,
  collectAssetRefs,
  isAssetCandidate,
  isAssetRef,
  mapDocumentAssetFields,
  replaceAssetRefs,
} from "../../../shared/documentAssets.js";
import type { Dependencies } from "../dependencies.js";

type Db = Pool | PoolClient;
export const assetSha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

/** A document references an image this organization does not have. */
export class UnknownDocumentAssetError extends Error {
  constructor(readonly missing: string[]) {
    super(UNKNOWN_DOCUMENT_ASSET);
  }
}

/** Hashes referenced by `value` that the organization does not store. */
export async function missingAssets(
  db: Db,
  organizationId: string,
  value: unknown,
): Promise<string[]> {
  const wanted = [...collectAssetRefs(value)];
  if (!wanted.length) return [];
  const known = new Set(
    (
      await db.query<{ sha256: string }>(
        "SELECT sha256 FROM document_assets WHERE organization_id=$1 AND sha256 = ANY($2::char(64)[])",
        [organizationId, wanted],
      )
    ).rows.map((row) => row.sha256),
  );
  return wanted.filter((hash) => !known.has(hash));
}

/**
 * Moves every inline image of `document` into `document_assets` (once per organization) and returns the document
 * with references. Existing references must belong to the organization.
 */
export async function storeDocumentAssets<T>(
  db: Db,
  organizationId: string,
  document: T,
  { requireKnown = true }: { requireKnown?: boolean } = {},
): Promise<T> {
  const inline = new Map<string, string>();
  const compact = mapDocumentAssetFields(document, (value) => {
    if (!isAssetCandidate(value) || value.length > MAX_ASSET_LENGTH)
      return value;
    const hash = assetSha256(value);
    inline.set(hash, value);
    return assetRef(hash);
  });
  for (const [hash, content] of inline)
    await db.query(
      "INSERT INTO document_assets (organization_id,sha256,content,size_bytes) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,sha256) DO NOTHING",
      [organizationId, hash, content, Buffer.byteLength(content, "utf8")],
    );
  if (requireKnown) {
    const missing = await missingAssets(db, organizationId, compact);
    if (missing.length) throw new UnknownDocumentAssetError(missing);
  }
  return compact;
}

/** Replaces every reference in a response body with the organization's stored content. */
export async function inlineDocumentAssets<T>(
  db: Db,
  organizationId: string,
  body: T,
): Promise<T> {
  const wanted = [...collectAssetRefs(body)];
  if (!wanted.length) return body;
  const contents = new Map(
    (
      await db.query<{ sha256: string; content: string }>(
        "SELECT sha256, content FROM document_assets WHERE organization_id=$1 AND sha256 = ANY($2::char(64)[])",
        [organizationId, wanted],
      )
    ).rows.map((row) => [row.sha256, row.content]),
  );
  return replaceAssetRefs(body, (hash) => contents.get(hash));
}

export const wantsAssetRefs = (c: Context) =>
  c.req.query(ASSET_REFS_QUERY) === "1";

/**
 * JSON response for routes that return proposals: references only for clients that announce them, the stored
 * content for everyone else (older desktops, agents).
 */
export async function projectJson(
  c: Context,
  db: Db,
  organizationId: string,
  body: unknown,
  status?: number,
) {
  const payload = wantsAssetRefs(c)
    ? body
    : await inlineDocumentAssets(db, organizationId, body);
  return status === undefined
    ? c.json(payload as any)
    : c.json(payload as any, status as any);
}

export function registerDocumentAssetRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  /** Content of one image, only inside its organization (any role: readers render the same documents). */
  app.get("/api/document-assets/:sha256", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const hash = c.req.param("sha256");
    if (!SHA256_HEX.test(hash))
      return c.json({ error: "Identificador inválido" }, 400);
    const row = (
      await pool.query<{ content: string }>(
        "SELECT content FROM document_assets WHERE organization_id=$1 AND sha256=$2",
        [user.organizationId, hash],
      )
    ).rows[0];
    if (!row) return c.json({ error: "Imagen no encontrada" }, 404);
    c.header("Cache-Control", "private, max-age=31536000, immutable");
    return c.json({ success: true, sha256: hash, content: row.content });
  });
}

export { isAssetRef, assetRefHash };
