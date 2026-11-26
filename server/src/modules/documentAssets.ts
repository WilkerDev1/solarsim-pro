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
import {
  DOCUMENT_FILE_TYPES,
  checkDocumentDataUrl,
  parseDataUrl,
  sniffDocumentFileType,
  type DocumentFileType,
} from "../../../shared/fileSignatures.js";
import { isWriterRole } from "../../../shared/permissions.js";
import { QUOTATION_LIBRARY_LIMITS } from "../../../shared/quotations/library.js";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";

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

  /**
   * Uploads one loose file (quotation logo, signature, stamp or attachment) that belongs to no proposal. The body is
   * `{ content: "data:<type>;base64,…" }`: the same text the reference hashes, so `asset:sha256:` stays the sha256 of
   * the exact content, as in migration 009. Only PDF, PNG, JPEG and WebP whose real signature matches the declared
   * type, up to `QUOTATION_LIBRARY_LIMITS.attachmentBytes`; never SVG or HTML.
   */
  app.post("/api/document-assets", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
      return c.json({ error: "Permisos insuficientes" }, 403);
    const body = await readObjectBody(c);
    const content = typeof body.content === "string" ? body.content : "";
    const checked = checkDocumentDataUrl(content, {
      maxBytes: QUOTATION_LIBRARY_LIMITS.attachmentBytes,
    });
    if (!checked.ok)
      return c.json(
        checked.reason === "size"
          ? {
              error: `El archivo debe tener contenido y no superar ${QUOTATION_LIBRARY_LIMITS.attachmentBytes / 1024 / 1024} MB.`,
              code: "asset_too_large",
            }
          : {
              error:
                "Formato no admitido: usa PDF, PNG, JPEG o WebP (el contenido debe coincidir con su tipo).",
              code: "unsupported_asset_type",
            },
        checked.reason === "size" ? 413 : 415,
      );
    // The head was checked; the whole body must decode to exactly that many bytes with the same signature.
    const bytes = Buffer.from(
      content.slice(content.indexOf(",") + 1),
      "base64",
    );
    if (
      bytes.length !== checked.byteLength ||
      sniffDocumentFileType(bytes) !== checked.type
    )
      return c.json(
        { error: "El archivo está dañado.", code: "unsupported_asset_type" },
        415,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const hash = assetSha256(content);
      await client.query(
        "INSERT INTO document_assets (organization_id,sha256,content,size_bytes) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,sha256) DO NOTHING",
        [
          user.organizationId,
          hash,
          content,
          Buffer.byteLength(content, "utf8"),
        ],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        sha256: hash,
        ref: assetRef(hash),
        mimeType: checked.type,
        sizeBytes: bytes.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * The bytes of one stored file as a download, only inside its organization. The stored text is checked again (older
   * proposal images may hold any data URL): only the allowed types are served, always as an attachment with `nosniff`
   * and a sandboxing CSP, so nothing is ever rendered as a page of the API's origin.
   */
  app.get("/api/document-assets/:sha256/file", async (c) => {
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
    if (!row) return c.json({ error: "Archivo no encontrado" }, 404);
    const parsed = parseDataUrl(row.content);
    if (
      !parsed?.actual ||
      parsed.actual !== parsed.declared ||
      !DOCUMENT_FILE_TYPES.includes(parsed.actual)
    )
      return c.json({ error: "Este archivo no se puede descargar." }, 415);
    const bytes = Buffer.from(parsed.base64, "base64");
    if (sniffDocumentFileType(bytes) !== parsed.actual)
      return c.json({ error: "Este archivo no se puede descargar." }, 415);
    const extension = EXTENSIONS[parsed.actual];
    const requested = (c.req.query("name") ?? "")
      .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, "_")
      .trim()
      .slice(0, 120);
    const base =
      requested.replace(/\.[A-Za-z0-9]{1,5}$/, "") ||
      `documento-${hash.slice(0, 8)}`;
    c.header("Content-Type", parsed.actual);
    c.header(
      "Content-Disposition",
      `attachment; filename="${base.replace(/[^\x20-\x7e]/g, "_")}${extension}"; filename*=UTF-8''${encodeURIComponent(base + extension)}`,
    );
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", "default-src 'none'; sandbox");
    c.header("Cache-Control", "private, no-store");
    return c.body(new Uint8Array(bytes));
  });
}

const EXTENSIONS: Record<DocumentFileType, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export { isAssetRef, assetRefHash };
