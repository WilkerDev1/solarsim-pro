import type { Hono } from "hono";
import type { PoolClient } from "pg";
import { isWriterRole } from "../../../shared/permissions.js";
import { REFERENCE_EQUIPMENT_IDS } from "../../../shared/referenceEquipment.js";
import {
  PRICE_OBSERVATION_LIMITS,
  hasNulCharacter,
  isObservationId,
  validateObservation,
  type EquipmentPriceObservation,
  type GenericPriceInfo,
  type ObservationInput,
} from "../../../shared/equipmentPrices.js";
import type { AuthUser, Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";

const REFERENCE_ORGANIZATION = "org-electsun-default";
const REFERENCE_IDS = new Set<string>(REFERENCE_EQUIPMENT_IDS);
const DEFAULT_HISTORY_LIMIT = 100;

type Row = Record<string, any>;
const iso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : value == null
      ? null
      : String(value);

/** Database row → API record (shared/equipmentPrices.ts). Optional client fields are omitted when absent. */
function observationJson(row: Row): EquipmentPriceObservation {
  const out: EquipmentPriceObservation = {
    id: row.id,
    seq: Number(row.seq),
    equipmentId: row.equipment_id,
    kind: row.kind,
    priceUSD: Number(row.price_usd),
    source: row.source,
    observedAt: iso(row.observed_at) as string,
    createdById: row.created_by_id ?? null,
    createdAt: iso(row.created_at) as string,
    voidedAt: iso(row.voided_at),
    voidedById: row.voided_by_id ?? null,
  };
  if (row.original_currency) out.originalCurrency = row.original_currency;
  if (row.original_price != null)
    out.originalPrice = Number(row.original_price);
  if (row.supplier_name) out.supplierName = row.supplier_name;
  if (row.supplier_offer_id) out.supplierOfferId = row.supplier_offer_id;
  if (row.project_id) out.projectId = row.project_id;
  if (row.derived_from_id) out.derivedFromId = row.derived_from_id;
  if ("created_by_name" in row) out.createdByName = row.created_by_name ?? null;
  if ("project_name" in row) {
    out.projectName = row.project_name ?? null;
    out.projectCode = row.project_code ?? null;
  }
  return out;
}

/**
 * Same record as one already stored? `observed_at` was clamped to the insertion time when the client sent a future
 * date (then it equals `created_at`), so a replay of that record is still the same content.
 */
function sameContent(row: Row, input: ObservationInput): boolean {
  const optional = (value: unknown) => (value == null ? undefined : value);
  const number = (value: unknown) =>
    value == null ? undefined : Number(value);
  const stored = (row.observed_at as Date).getTime();
  const created = (row.created_at as Date).getTime();
  const requested = Date.parse(input.observedAt);
  return (
    row.equipment_id === input.equipmentId &&
    row.kind === input.kind &&
    Number(row.price_usd) === input.priceUSD &&
    optional(row.original_currency) === input.originalCurrency &&
    number(row.original_price) === input.originalPrice &&
    row.source === input.source &&
    optional(row.supplier_name) === input.supplierName &&
    optional(row.supplier_offer_id) === input.supplierOfferId &&
    optional(row.project_id) === input.projectId &&
    optional(row.derived_from_id) === input.derivedFromId &&
    (stored === requested || (stored === created && requested >= created))
  );
}

/** Equipment ids the organization cannot price: another organization's private models (reference ones are shared). */
async function foreignEquipment(
  client: PoolClient,
  user: AuthUser,
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = (
    await client.query<{ id: string; organization_id: string | null }>(
      "SELECT id, organization_id FROM equipment_catalog WHERE id = ANY($1::varchar[])",
      [ids],
    )
  ).rows;
  return new Set(
    rows
      .filter(
        (row) =>
          row.organization_id !== user.organizationId &&
          !(
            REFERENCE_IDS.has(row.id) &&
            row.organization_id === REFERENCE_ORGANIZATION
          ),
      )
      .map((row) => row.id),
  );
}

async function insertObservation(
  client: PoolClient,
  user: AuthUser,
  input: ObservationInput,
): Promise<Row | undefined> {
  // One clock reading for both columns: a clamped `observed_at` equals `created_at` (see sameContent).
  const result = await client.query(
    `WITH t AS (SELECT clock_timestamp() AS now)
     INSERT INTO equipment_price_observations
       (organization_id,id,equipment_id,kind,price_usd,original_currency,original_price,source,supplier_name,
        supplier_offer_id,project_id,derived_from_id,observed_at,created_by_id,created_at)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,LEAST($13::timestamptz,t.now),$14,t.now FROM t
     ON CONFLICT (organization_id,id) DO NOTHING
     RETURNING *`,
    [
      user.organizationId,
      input.id,
      input.equipmentId,
      input.kind,
      input.priceUSD,
      input.originalCurrency ?? null,
      input.originalPrice ?? null,
      input.source,
      input.supplierName ?? null,
      input.supplierOfferId ?? null,
      input.projectId ?? null,
      input.derivedFromId ?? null,
      input.observedAt,
      user.id,
    ],
  );
  return result.rows[0];
}

export function registerEquipmentPriceRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.post("/api/equipment-prices/batch", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (!isWriterRole(user.role))
      return c.json({ error: "Permisos insuficientes" }, 403);
    const body = await readObjectBody(c);
    const observations = body.observations ?? [];
    const voids = body.voids ?? [];
    if (
      !Array.isArray(observations) ||
      !Array.isArray(voids) ||
      observations.length > PRICE_OBSERVATION_LIMITS.batchObservations ||
      voids.length > PRICE_OBSERVATION_LIMITS.batchVoids
    )
      return c.json(
        {
          error: `Lote de precios inválido (máximo ${PRICE_OBSERVATION_LIMITS.batchObservations} registros y ${PRICE_OBSERVATION_LIMITS.batchVoids} anulaciones)`,
        },
        400,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Membership lock only: price records never take the project lock.
      const denied = await lockCurrentMembership(client, user, true);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const validated = observations.map((entry: unknown) =>
        validateObservation(entry),
      );
      const foreign = await foreignEquipment(client, user, [
        ...new Set(
          validated.flatMap((v) => (v.ok ? [v.value.equipmentId] : [])),
        ),
      ]);
      const observationResults: Record<string, unknown>[] = [];
      // Records first, then voids: a batch can create a record and void it.
      for (const [index, check] of validated.entries()) {
        const rawId = (observations[index] as { id?: unknown } | null)?.id;
        const id = typeof rawId === "string" ? rawId.slice(0, 64) : null;
        if (!check.ok) {
          observationResults.push({
            id,
            status: "rejected",
            reason: "invalid",
            error: check.error,
          });
          continue;
        }
        const input = check.value;
        if (foreign.has(input.equipmentId)) {
          observationResults.push({
            id,
            status: "rejected",
            reason: "foreign_equipment",
          });
          continue;
        }
        const inserted = await insertObservation(client, user, input);
        if (inserted) {
          observationResults.push({
            id,
            status: "created",
            observation: observationJson(inserted),
          });
          continue;
        }
        const existing = (
          await client.query(
            "SELECT * FROM equipment_price_observations WHERE organization_id=$1 AND id=$2",
            [user.organizationId, input.id],
          )
        ).rows[0];
        observationResults.push(
          sameContent(existing, input)
            ? {
                id,
                status: "duplicate",
                observation: observationJson(existing),
              }
            : { id, status: "conflict" },
        );
      }
      const voidResults: Record<string, unknown>[] = [];
      for (const entry of voids as unknown[]) {
        const id = (entry as { id?: unknown } | null)?.id;
        if (!isObservationId(id)) {
          voidResults.push({
            id: typeof id === "string" ? id.slice(0, 64) : null,
            status: "rejected",
          });
          continue;
        }
        const voided = await client.query(
          `UPDATE equipment_price_observations SET voided_at=clock_timestamp(), voided_by_id=$3
           WHERE organization_id=$1 AND id=$2 AND voided_at IS NULL RETURNING id`,
          [user.organizationId, id, user.id],
        );
        if (voided.rowCount) {
          voidResults.push({ id, status: "voided" });
          continue;
        }
        const exists = await client.query(
          "SELECT 1 FROM equipment_price_observations WHERE organization_id=$1 AND id=$2",
          [user.organizationId, id],
        );
        // not_found: the record may still be on its way from another client; the caller retries.
        voidResults.push({
          id,
          status: exists.rowCount ? "already_voided" : "not_found",
        });
      }
      await client.query("COMMIT");
      return c.json({
        success: true,
        observations: observationResults,
        voids: voidResults,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  /** History of one equipment, newest first, paginated by `seq`. Plain read: no locks. */
  app.get("/api/equipment-prices", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const equipmentId = c.req.query("equipmentId") ?? "";
    const limitText = c.req.query("limit");
    const beforeText = c.req.query("before");
    const limit =
      limitText === undefined ? DEFAULT_HISTORY_LIMIT : Number(limitText);
    const before =
      beforeText === undefined || beforeText === ""
        ? null
        : /^\d{1,18}$/.test(beforeText)
          ? beforeText
          : undefined;
    if (
      !equipmentId ||
      equipmentId.length > PRICE_OBSERVATION_LIMITS.equipmentId ||
      hasNulCharacter(equipmentId) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > PRICE_OBSERVATION_LIMITS.historyPage ||
      before === undefined
    )
      return c.json(
        {
          error: `Consulta de historial inválida (equipmentId, limit ≤ ${PRICE_OBSERVATION_LIMITS.historyPage}, before)`,
        },
        400,
      );
    // The proposal name comes from the organization's own project while it exists (trash included).
    const rows = (
      await pool.query(
        `SELECT o.*, u.name AS created_by_name, p.client_name AS project_name, p.project_code
         FROM equipment_price_observations o
         LEFT JOIN users u ON u.id = o.created_by_id
         LEFT JOIN projects p ON p.id = o.project_id AND p.organization_id = o.organization_id
         WHERE o.organization_id=$1 AND o.equipment_id=$2 AND ($3::bigint IS NULL OR o.seq < $3::bigint)
         ORDER BY o.seq DESC
         LIMIT $4`,
        [user.organizationId, equipmentId, before, limit],
      )
    ).rows;
    const observations = rows.map(observationJson);
    return c.json({
      success: true,
      observations,
      nextBefore:
        observations.length === limit
          ? (observations.at(-1)?.seq ?? null)
          : null,
    });
  });

  /** Current generic price per equipment, without equipment the organization hid. Plain read: no locks. */
  app.get("/api/equipment-prices/generic", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const rows = (
      await pool.query(
        `SELECT DISTINCT ON (o.equipment_id) o.equipment_id, o.price_usd, o.observed_at, o.id
         FROM equipment_price_observations o
         WHERE o.organization_id=$1 AND o.kind='generic' AND o.voided_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM equipment_tombstones t WHERE t.organization_id=$1 AND t.id=o.equipment_id)
         ORDER BY o.equipment_id, o.seq DESC`,
        [user.organizationId],
      )
    ).rows;
    const prices: Record<string, GenericPriceInfo> = {};
    for (const row of rows)
      prices[row.equipment_id] = {
        priceUSD: Number(row.price_usd),
        observedAt: iso(row.observed_at) as string,
        observationId: row.id,
      };
    return c.json({ success: true, prices });
  });
}
