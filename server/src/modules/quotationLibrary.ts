import type { Hono } from "hono";
import type { PoolClient } from "pg";
import {
  UNKNOWN_DOCUMENT_ASSET,
  assetRefHash,
  isAssetRef,
} from "../../../shared/documentAssets.js";
import { isWriterRole } from "../../../shared/permissions.js";
import {
  QUOTATION_LIBRARY_LIMITS,
  validateQuotationSignature,
  validateQuotationTemplate,
  type LibraryValidation,
} from "../../../shared/quotations/library.js";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { isRecordId, readObjectBody } from "../request.js";
import {
  DOCUMENT_IMAGE_TYPES,
  parseDataUrl,
} from "../../../shared/fileSignatures.js";
import { missingAssets } from "./documentAssets.js";
import { normalizeSince } from "./quotations.js";

interface LibraryCollection {
  path: string;
  table: "quotation_templates" | "quotation_signatures";
  /** Key of the record in write responses and of the list in reads. */
  item: "template" | "signature";
  list: "templates" | "signatures";
  validate: (raw: unknown) => LibraryValidation<Record<string, any>>;
  /** Only one default: for signatures, one per kind. */
  defaultScope: (value: Record<string, any>) => string | null;
  images: (value: Record<string, any>) => string[];
  messages: { invalid: string; changed: string; notFound: string };
}

const COLLECTIONS: LibraryCollection[] = [
  {
    path: "/api/quotation-templates",
    table: "quotation_templates",
    item: "template",
    list: "templates",
    validate: validateQuotationTemplate,
    defaultScope: () => null,
    images: () => [],
    messages: {
      invalid: "Plantilla inválida",
      changed: "La plantilla cambió. Sincroniza antes de editar.",
      notFound: "Plantilla no encontrada",
    },
  },
  {
    path: "/api/quotation-signatures",
    table: "quotation_signatures",
    item: "signature",
    list: "signatures",
    validate: validateQuotationSignature,
    defaultScope: (value) => value.kind,
    images: (value) => [value.image],
    messages: {
      invalid: "Firma inválida",
      changed: "La firma cambió. Sincroniza antes de editar.",
      notFound: "Firma no encontrada",
    },
  },
];

const record = (r: Record<string, any>) => ({
  ...r.data_json,
  id: r.id,
  organizationId: r.organization_id,
  version: r.version,
  baseVersion: r.version,
  createdById: r.created_by_id,
  createdBy: r.created_by_name,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const current = (row: Record<string, any> | undefined) =>
  row && !row.deleted_at ? record(row) : null;

async function lockCollection(
  client: PoolClient,
  table: string,
  organizationId: string,
  shared = false,
) {
  await client.query(
    `SELECT ${shared ? "pg_advisory_xact_lock_shared" : "pg_advisory_xact_lock"}(hashtext($1))`,
    [`solarsim-${table}:${organizationId}`],
  );
}

/**
 * Quotation templates and signatures/stamps (docs/DATABASE_AND_API_SPECIFICATION.md#plantillas-y-firmas-de-cotización-migración-012):
 * same contract as the quotation routes (CAS with `baseVersion`, 409 with the server record, soft delete, `?since=`).
 * Marking one as default clears the flag of the others in the same transaction (bumping their version).
 */
export function registerQuotationLibraryRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  for (const collection of COLLECTIONS) {
    const { table, messages } = collection;

    app.get(collection.path, async (c) => {
      const user = await authenticate(c);
      if (!user) return c.json({ error: "No autorizado" }, 401);
      const raw = c.req.query("since");
      const since =
        raw === undefined ? "1970-01-01T00:00:00.000000Z" : normalizeSince(raw);
      if (since === null) return c.json({ error: "Cursor inválido" }, 400);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockCollection(client, table, user.organizationId, true);
        const cursor = (
          await client.query(
            "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as cursor",
          )
        ).rows[0].cursor;
        const rows = await client.query(
          `SELECT * FROM ${table} WHERE organization_id=$1 AND updated_at >= $2::timestamptz AND updated_at <= $3::timestamptz ORDER BY updated_at, id`,
          [user.organizationId, since, cursor],
        );
        await client.query("COMMIT");
        return c.json({
          success: true,
          [collection.list]: rows.rows.filter((r) => !r.deleted_at).map(record),
          deletedIds: rows.rows.filter((r) => r.deleted_at).map((r) => r.id),
          serverTimestamp: cursor,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    app.put(`${collection.path}/:id`, async (c) => {
      const user = await authenticate(c);
      if (!user) return c.json({ error: "No autorizado" }, 401);
      if (!isWriterRole(user.role))
        return c.json({ error: "Permisos insuficientes" }, 403);
      const data = await readObjectBody(c),
        id = c.req.param("id");
      if (
        !isRecordId(id) ||
        !Number.isSafeInteger(data.baseVersion) ||
        data.baseVersion < 0
      )
        return c.json({ error: messages.invalid }, 400);
      const baseVersion: number = data.baseVersion;
      const input = collection.validate(data.content);
      if (!input.ok) return c.json({ error: input.error }, 400);
      const value = input.value;
      const images = collection.images(value).filter(Boolean);
      if (images.some((image) => !isAssetRef(image)))
        return c.json(
          {
            error:
              "Las imágenes deben subirse como referencia de activo, no en línea.",
            code: "inline_image_not_allowed",
          },
          400,
        );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockCollection(client, table, user.organizationId);
        const denied = await lockCurrentMembership(client, user);
        if (denied) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La sesión o los permisos cambiaron" },
            denied,
          );
        }
        const fail = async (
          status: 400 | 409,
          body: Record<string, unknown>,
        ) => {
          await client.query("ROLLBACK");
          return c.json(body, status);
        };
        // An image reference must name an asset of this organization (another organization's hash is unknown here).
        const missing = await missingAssets(
          client,
          user.organizationId,
          images,
        );
        if (missing.length)
          return fail(400, {
            error: "La imagen no está en el servidor. Vuelve a subirla.",
            code: UNKNOWN_DOCUMENT_ASSET,
            missing,
          });
        // The stored asset must itself be an allowed image within the signature limit (an asset reference can name a
        // PDF attachment or an old SVG logo of the organization).
        if (images.length) {
          const stored = (
            await client.query<{ content: string }>(
              "SELECT content FROM document_assets WHERE organization_id=$1 AND sha256 = ANY($2::char(64)[])",
              [user.organizationId, images.map(assetRefHash)],
            )
          ).rows;
          const invalid = stored.some((row) => {
            const parsed = parseDataUrl(row.content);
            return (
              !parsed?.actual ||
              parsed.actual !== parsed.declared ||
              !DOCUMENT_IMAGE_TYPES.includes(parsed.actual as never) ||
              parsed.byteLength > QUOTATION_LIBRARY_LIMITS.signatureImageBytes
            );
          });
          if (invalid)
            return fail(400, {
              error: `La imagen debe ser PNG, JPEG o WebP de hasta ${QUOTATION_LIBRARY_LIMITS.signatureImageBytes / 1024} KB.`,
              code: "invalid_signature_image",
            });
        }
        const existing = (
          await client.query(
            `SELECT * FROM ${table} WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
            [user.organizationId, id],
          )
        ).rows[0];
        if (
          existing?.deleted_at ||
          (existing ? baseVersion !== existing.version : baseVersion !== 0)
        )
          return fail(409, {
            error: messages.changed,
            [collection.item]: current(existing),
          });
        const row = existing
          ? (
              await client.query(
                `UPDATE ${table} SET data_json=$3,version=version+1,updated_at=clock_timestamp()
                WHERE organization_id=$1 AND id=$2 AND version=$4 AND deleted_at IS NULL RETURNING *`,
                [user.organizationId, id, JSON.stringify(value), baseVersion],
              )
            ).rows[0]
          : (
              await client.query(
                `INSERT INTO ${table} (organization_id,id,data_json,created_by_id,created_by_name)
                VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id,id) DO NOTHING RETURNING *`,
                [
                  user.organizationId,
                  id,
                  JSON.stringify(value),
                  user.id,
                  user.name,
                ],
              )
            ).rows[0];
        if (!row) {
          const latest = (
            await client.query(
              `SELECT * FROM ${table} WHERE organization_id=$1 AND id=$2`,
              [user.organizationId, id],
            )
          ).rows[0];
          return fail(409, {
            error: messages.changed,
            [collection.item]: current(latest),
          });
        }
        let cleared: { id: string; version: number }[] = [];
        if (value.isDefault) {
          // One default (per kind for signatures): the others lose the flag and reach every device with the pull.
          // Their new versions go back too, so the writer rebases its own copies without a spurious 409.
          const scope = collection.defaultScope(value);
          cleared = (
            await client.query<{ id: string; version: number }>(
              `UPDATE ${table} SET data_json=jsonb_set(data_json,'{isDefault}','false'::jsonb),version=version+1,updated_at=clock_timestamp()
            WHERE organization_id=$1 AND id<>$2 AND deleted_at IS NULL AND (data_json->>'isDefault')='true'
            ${scope === null ? "" : "AND data_json->>'kind'=$3"} RETURNING id,version`,
              scope === null
                ? [user.organizationId, id]
                : [user.organizationId, id, scope],
            )
          ).rows;
        }
        await client.query("COMMIT");
        return c.json({
          success: true,
          [collection.item]: record(row),
          cleared,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    app.delete(`${collection.path}/:id`, async (c) => {
      const user = await authenticate(c);
      if (!user) return c.json({ error: "No autorizado" }, 401);
      if (!isWriterRole(user.role))
        return c.json({ error: "Permisos insuficientes" }, 403);
      if (!isRecordId(c.req.param("id")))
        return c.json({ error: messages.invalid }, 400);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockCollection(client, table, user.organizationId);
        const denied = await lockCurrentMembership(client, user);
        if (denied) {
          await client.query("ROLLBACK");
          return c.json(
            { error: "La sesión o los permisos cambiaron" },
            denied,
          );
        }
        const row = (
          await client.query(
            `SELECT * FROM ${table} WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
            [user.organizationId, c.req.param("id")],
          )
        ).rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return c.json({ error: messages.notFound }, 404);
        }
        const baseVersion = Number(c.req.query("baseVersion"));
        if (
          !Number.isSafeInteger(baseVersion) ||
          baseVersion < 1 ||
          baseVersion !== row.version
        ) {
          await client.query("ROLLBACK");
          return c.json(
            { error: messages.changed, [collection.item]: current(row) },
            409,
          );
        }
        if (!row.deleted_at)
          await client.query(
            `UPDATE ${table} SET deleted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2`,
            [user.organizationId, row.id],
          );
        await client.query("COMMIT");
        return c.json({ success: true });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
}
