import type { Hono } from "hono";
import type { PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { isAssetRef } from "../../../shared/documentAssets.js";
import { isWriterRole } from "../../../shared/permissions.js";
import {
  formatQuotationNumber,
  quotationNumberYear,
} from "../../../shared/quotations/numbering.js";
import {
  canTransitionQuotation,
  isQuotationContentLocked,
} from "../../../shared/quotations/status.js";
import type { QuotationContent } from "../../../shared/quotations/types.js";
import {
  QUOTATION_LIMITS,
  validateQuotationContent,
} from "../../../shared/quotations/validation.js";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";

/**
 * Quotation writes, the cascades that unlink them (client and folder deletion) and the delta read share this
 * per-organization transaction lock. Writers take it exclusively before their membership lock (after the projects
 * lock when both are needed); readers take it shared, so the returned cursor is a coherent cut.
 */
export async function lockQuotations(
  client: PoolClient,
  organizationId: string,
  shared = false,
): Promise<void> {
  await client.query(
    `SELECT ${shared ? "pg_advisory_xact_lock_shared" : "pg_advisory_xact_lock"}(hashtext($1))`,
    [`solarsim-quotations:${organizationId}`],
  );
}

/** Removes a deleted client's or folder's link from the live quotations of the organization (printed data is kept). */
export async function unlinkQuotations(
  client: PoolClient,
  organizationId: string,
  link: "clientId" | "folderId",
  id: string,
): Promise<void> {
  const column = link === "clientId" ? "client_id" : "folder_id";
  await client.query(
    `UPDATE quotations SET data_json=data_json-'${link}',${column}=NULL,version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND ${column}=$2 AND deleted_at IS NULL`,
    [organizationId, id],
  );
}

const quotationRecord = (r: Record<string, any>) => ({
  ...(r.data_json as QuotationContent),
  status: r.status,
  id: r.id,
  number: r.number,
  organizationId: r.organization_id,
  version: r.version,
  baseVersion: r.version,
  createdById: r.created_by_id,
  createdBy: r.created_by_name,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const current = (row: Record<string, any> | undefined) =>
  row && !row.deleted_at ? quotationRecord(row) : null;

/**
 * Parses `since`: the `serverTimestamp` format (microseconds, UTC) or any ISO instant with a real date from 1970 on.
 * Returns the instant in UTC keeping its microseconds (offsets are whole minutes), so PostgreSQL never sees an offset
 * or a year it cannot parse; `null` when it cannot be interpreted.
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const MAX_INSTANT = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
export function normalizeSince(value: string): string | null {
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1970 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || instant > MAX_INSTANT) return null;
  const fraction = (match[5] ?? "").padEnd(6, "0");
  return `${new Date(instant).toISOString().slice(0, 19)}.${fraction}Z`;
}

/** Images travel as `asset:sha256:` references only; the API never stores inline data URLs for quotations. */
const hasInlineImage = (value: QuotationContent) =>
  [value.issuer.logo, ...value.attachments.map((a) => a.thumbnailDataUrl)].some(
    (image) => !!image && !isAssetRef(image),
  );

/** Saved content normalized by the current validator, so a validator change never locks an issued quotation. */
const storedContent = (row: Record<string, any>): Record<string, any> => {
  const stored = validateQuotationContent(row.data_json);
  return stored.ok ? stored.value : row.data_json;
};

const withoutStatus = (value: Record<string, any>) => {
  const { status: _status, ...rest } = value;
  return rest;
};

/** Organization quotations (docs/DATABASE_AND_API_SPECIFICATION.md#cotizaciones-migración-011): numbered by the API, CAS writes, soft delete, delta reads. */
export function registerQuotationRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/quotations", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const raw = c.req.query("since");
    const since =
      raw === undefined ? "1970-01-01T00:00:00.000000Z" : normalizeSince(raw);
    if (since === null) return c.json({ error: "Cursor inválido" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockQuotations(client, user.organizationId, true);
      // Same cut as the project pull: every write holding the lock committed before this instant.
      const cursor = (
        await client.query(
          "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as cursor",
        )
      ).rows[0].cursor;
      const rows = await client.query(
        "SELECT * FROM quotations WHERE organization_id=$1 AND updated_at >= $2::timestamptz AND updated_at <= $3::timestamptz ORDER BY updated_at, id",
        [user.organizationId, since, cursor],
      );
      await client.query("COMMIT");
      return c.json({
        success: true,
        quotations: rows.rows.filter((r) => !r.deleted_at).map(quotationRecord),
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

  app.put("/api/quotations/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
      return c.json({ error: "Permisos insuficientes" }, 403);
    const data = await readObjectBody(c),
      id = c.req.param("id");
    if (
      !id ||
      id.length > QUOTATION_LIMITS.id ||
      !Number.isSafeInteger(data.baseVersion) ||
      data.baseVersion < 0
    )
      return c.json({ error: "Cotización inválida" }, 400);
    const baseVersion: number = data.baseVersion;
    // A malformed client link is an `invalid_client` conflict, as in the proposal push, not a validation error.
    let raw = data.content;
    let malformedClient = false;
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      raw.clientId != null &&
      (typeof raw.clientId !== "string" ||
        raw.clientId.trim().length > QUOTATION_LIMITS.id)
    ) {
      malformedClient = true;
      const { clientId: _clientId, ...rest } = raw;
      raw = rest;
    }
    const input = validateQuotationContent(raw);
    if (!input.ok) return c.json({ error: input.error }, 400);
    const value = input.value;
    if (hasInlineImage(value))
      return c.json(
        {
          error:
            "Las imágenes de la cotización deben subirse como referencia de activo, no en línea.",
          code: "inline_image_not_allowed",
        },
        400,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockQuotations(client, user.organizationId);
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const existing = (
        await client.query(
          "SELECT * FROM quotations WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, id],
        )
      ).rows[0];
      const fail = async (status: 400 | 409, body: Record<string, unknown>) => {
        await client.query("ROLLBACK");
        return c.json(body, status);
      };
      // Deleted ids are never revived: their number is spent and links were already removed.
      if (
        existing?.deleted_at ||
        (existing ? baseVersion !== existing.version : baseVersion !== 0)
      )
        return fail(409, {
          error: "La cotización cambió. Sincroniza antes de editar.",
          quotation: current(existing),
        });
      // A new quotation starts as a draft or already issued; nothing else spends a number.
      if (!existing && value.status !== "draft" && value.status !== "issued")
        return fail(400, {
          error:
            "Una cotización nueva solo puede crearse como borrador o emitida",
          code: "invalid_transition",
        });
      if (existing) {
        const saved = existing.status as QuotationContent["status"];
        if (
          value.status !== saved &&
          !canTransitionQuotation(saved, value.status)
        )
          return fail(400, {
            error: "Cambio de estado no permitido",
            code: "invalid_transition",
          });
        if (
          isQuotationContentLocked(saved) &&
          !isDeepStrictEqual(
            withoutStatus(storedContent(existing)),
            withoutStatus(value),
          )
        )
          return fail(400, {
            error:
              "La cotización ya no es un borrador: reábrela para editar su contenido.",
            code: "quotation_locked",
          });
      }
      // Clients created offline stay linkable until they are published; known ones must be own and alive.
      let invalidClient = malformedClient;
      if (!invalidClient && value.clientId) {
        const linked = (
          await client.query(
            "SELECT organization_id,deleted_at FROM clients WHERE id=$1",
            [value.clientId],
          )
        ).rows;
        const own = linked.find(
          (row) => row.organization_id === user.organizationId,
        );
        invalidClient = (linked.length > 0 && !own) || !!own?.deleted_at;
      }
      if (invalidClient)
        return fail(409, {
          error: "El cliente enlazado no existe en esta organización.",
          code: "invalid_client",
          reason: "invalid_client",
          quotation: current(existing),
        });
      // Same rule as the proposal push: unknown folders were created offline; deleted, foreign or someone else's
      // private folders are rejected unless the quotation already sits in that folder.
      if (value.folderId) {
        const folders = (
          await client.query(
            "SELECT organization_id,visibility,created_by_id,deleted_at FROM project_folders WHERE id=$1",
            [value.folderId],
          )
        ).rows;
        const own = folders.find(
          (row) => row.organization_id === user.organizationId,
        );
        const unchanged = existing?.folder_id === value.folderId;
        if (
          (folders.length > 0 && !own) ||
          own?.deleted_at ||
          (own?.visibility === "private" &&
            own.created_by_id !== user.id &&
            !unchanged)
        )
          return fail(409, {
            error: "La carpeta no existe o no está disponible.",
            code: "invalid_folder",
            reason: "invalid_folder",
            quotation: current(existing),
          });
      }
      const links = [
        value.clientId ?? null,
        value.sourceProjectId ?? null,
        value.folderId ?? null,
      ];
      let row: Record<string, any> | undefined;
      if (existing) {
        row = (
          await client.query(
            `UPDATE quotations SET status=$3,client_id=$4,source_project_id=$5,folder_id=$6,data_json=$7,version=version+1,updated_at=clock_timestamp()
            WHERE organization_id=$1 AND id=$2 AND version=$8 AND deleted_at IS NULL RETURNING *`,
            [
              user.organizationId,
              id,
              value.status,
              ...links,
              JSON.stringify(value),
              baseVersion,
            ],
          )
        ).rows[0];
      } else {
        // The counter row is locked and incremented in this transaction: concurrent creations serialize on it,
        // a rollback releases the number and a deleted quotation never gives its number back.
        const year = quotationNumberYear(value.issueDate);
        const sequence = (
          await client.query(
            `INSERT INTO quotation_counters (organization_id,year,last_number) VALUES ($1,$2,1)
            ON CONFLICT (organization_id,year) DO UPDATE SET last_number=quotation_counters.last_number+1 RETURNING last_number`,
            [user.organizationId, year],
          )
        ).rows[0].last_number;
        row = (
          await client.query(
            `INSERT INTO quotations (organization_id,id,number,status,client_id,source_project_id,folder_id,data_json,created_by_id,created_by_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (organization_id,id) DO NOTHING RETURNING *`,
            [
              user.organizationId,
              id,
              formatQuotationNumber(year, sequence),
              value.status,
              ...links,
              JSON.stringify(value),
              user.id,
              user.name,
            ],
          )
        ).rows[0];
      }
      // Defense in depth: the lock already serializes writers, but a write never lands on an unexpected version.
      if (!row) {
        const latest = (
          await client.query(
            "SELECT * FROM quotations WHERE organization_id=$1 AND id=$2",
            [user.organizationId, id],
          )
        ).rows[0];
        return fail(409, {
          error: "La cotización cambió. Sincroniza antes de editar.",
          quotation: current(latest),
        });
      }
      await client.query("COMMIT");
      return c.json({ success: true, quotation: quotationRecord(row) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/api/quotations/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
      return c.json({ error: "Permisos insuficientes" }, 403);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockQuotations(client, user.organizationId);
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const row = (
        await client.query(
          "SELECT * FROM quotations WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [user.organizationId, c.req.param("id")],
        )
      ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return c.json({ error: "Cotización no encontrada" }, 404);
      }
      const baseVersion = Number(c.req.query("baseVersion"));
      if (
        !Number.isSafeInteger(baseVersion) ||
        baseVersion < 1 ||
        baseVersion !== row.version
      ) {
        await client.query("ROLLBACK");
        return c.json(
          {
            error: "La cotización cambió. Sincroniza antes de eliminar.",
            quotation: current(row),
          },
          409,
        );
      }
      if (!row.deleted_at)
        await client.query(
          "UPDATE quotations SET deleted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2",
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
