import { REFERENCE_EQUIPMENT_IDS } from "../../../shared/referenceEquipment.js";
import { lockCurrentMembership } from "../membership.js";
import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import { EQUIPMENT_DETAIL_KEYS, equipmentItem } from "./equipmentRepository.js";
export function registerEquipmentRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.get("/api/equipment", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const params: unknown[] = [
      user.organizationId,
      [...REFERENCE_EQUIPMENT_IDS],
    ];
    let sql = `SELECT * FROM equipment_catalog e WHERE (e.organization_id=$1 OR (e.organization_id='org-electsun-default' AND e.id=ANY($2::varchar[]))) AND NOT EXISTS(SELECT 1 FROM equipment_tombstones t WHERE t.id=e.id AND t.organization_id=$1)`;
    const type = c.req.query("type"),
      brand = c.req.query("brand");
    if (type && type !== "all") {
      params.push(type);
      sql += ` AND type=$${params.length}`;
    }
    if (brand && brand !== "all") {
      params.push(`%${brand.trim()}%`);
      sql += ` AND brand ILIKE $${params.length}`;
    }
    const result = await pool.query(sql + " ORDER BY display_name,id", params);
    const deleted = await pool.query(
      "SELECT id FROM equipment_tombstones WHERE organization_id=$1",
      [user.organizationId],
    );
    return c.json({
      success: true,
      items: result.rows.map((r) => equipmentItem(r, user.organizationId)),
      deletedIds: deleted.rows.map((r) => r.id),
    });
  });
  app.post("/api/equipment/batch", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const { items } = await readObjectBody(c);
    if (
      !Array.isArray(items) ||
      items.length > 500 ||
      items.some(
        (item) =>
          !item ||
          typeof item.id !== "string" ||
          !item.id ||
          item.id.length > 64 ||
          !["panel", "inverter", "battery"].includes(item.type),
      )
    )
      return c.json({ error: "Lote de equipos inválido (máximo 500)" }, 400);
    const client = await pool.connect();
    const results: Record<string, any>[] = [];
    try {
      await client.query("BEGIN");
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      // Stable order avoids deadlocks when two batches contain the same equipment in reverse order.
      for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `solarsim-equipment:${item.id}`,
        ]);
        const existing = (
          await client.query(
            "SELECT * FROM equipment_catalog WHERE id=$1 FOR UPDATE",
            [item.id],
          )
        ).rows[0];
        const tombstone =
          (
            await client.query(
              "SELECT id FROM equipment_tombstones WHERE id=$1 AND organization_id=$2",
              [item.id, user.organizationId],
            )
          ).rows.length > 0;
        const conflict = (reason: string, includeCurrent = false) =>
          results.push({
            id: item.id,
            status: "conflict",
            reason,
            ...(includeCurrent && existing
              ? {
                  serverVersion: existing.version,
                  serverItem: equipmentItem(existing, user.organizationId),
                }
              : {}),
          });
        if (tombstone) {
          conflict("deleted");
          continue;
        }
        if (existing && existing.organization_id !== user.organizationId) {
          conflict("organization_mismatch");
          continue;
        }
        if (
          item.organizationId &&
          item.organizationId !== user.organizationId
        ) {
          conflict("organization_mismatch");
          continue;
        }
        if (
          existing &&
          (!Number.isSafeInteger(item.baseVersion) || item.baseVersion < 1)
        ) {
          conflict("base_version_required", true);
          continue;
        }
        if (existing && item.baseVersion !== existing.version) {
          conflict("version_conflict", true);
          continue;
        }
        const details = Object.fromEntries(
          EQUIPMENT_DETAIL_KEYS.filter((key) => item[key] !== undefined).map(
            (key) => [key, item[key]],
          ),
        );
        const result = await client.query(
          `INSERT INTO equipment_catalog (id,organization_id,type,brand,model_series,display_name,power_w,power_kw,capacity_kwh,voltage_v,dod_pct,efficiency_pct,temp_coeff,category,voltage_mppt,supplier_prices,details,version,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET type=EXCLUDED.type,brand=EXCLUDED.brand,model_series=EXCLUDED.model_series,display_name=EXCLUDED.display_name,power_w=EXCLUDED.power_w,power_kw=EXCLUDED.power_kw,capacity_kwh=EXCLUDED.capacity_kwh,voltage_v=EXCLUDED.voltage_v,dod_pct=EXCLUDED.dod_pct,efficiency_pct=EXCLUDED.efficiency_pct,temp_coeff=EXCLUDED.temp_coeff,category=EXCLUDED.category,voltage_mppt=EXCLUDED.voltage_mppt,supplier_prices=EXCLUDED.supplier_prices,details=EXCLUDED.details,version=equipment_catalog.version+1,updated_at=clock_timestamp() WHERE equipment_catalog.organization_id=EXCLUDED.organization_id RETURNING *`,
          [
            item.id,
            user.organizationId,
            item.type,
            item.brand?.trim() || "General",
            item.modelSeries || "Modelo",
            item.displayName || "Equipo",
            item.powerW ?? null,
            item.powerKW ?? null,
            item.capacityKWh ?? null,
            item.voltageV ?? null,
            item.dodPct ?? null,
            item.efficiencyPct ?? null,
            item.tempCoeff ?? null,
            item.category ?? null,
            item.voltageMPPT ?? null,
            JSON.stringify(
              Array.isArray(item.supplierPrices) ? item.supplierPrices : [],
            ),
            JSON.stringify(details),
          ],
        );
        const saved = equipmentItem(result.rows[0], user.organizationId);
        results.push({
          id: item.id,
          status: existing ? "updated" : "created",
          version: saved.version,
          item: saved,
        });
      }
      await client.query("COMMIT");
      return c.json({
        success: true,
        count: results.filter((r) => r.status !== "conflict").length,
        results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete("/api/equipment/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const id = c.req.param("id");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `solarsim-equipment:${id}`,
      ]);
      const row = (
        await client.query(
          "SELECT * FROM equipment_catalog WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        row &&
        row.organization_id !== user.organizationId &&
        row.organization_id !== "org-electsun-default"
      ) {
        await client.query("ROLLBACK");
        return c.json({ error: "Equipo no encontrado" }, 404);
      }
      // Hiding shared reference models affects only the requesting tenant.
      if (row?.organization_id === user.organizationId) {
        const baseVersion = Number(c.req.query("baseVersion"));
        if (!Number.isSafeInteger(baseVersion) || baseVersion !== row.version) {
          await client.query("ROLLBACK");
          return c.json(
            {
              error: "Actualiza antes de eliminar el equipo",
              serverVersion: row.version,
              serverItem: equipmentItem(row, user.organizationId),
            },
            409,
          );
        }
        await client.query(
          "DELETE FROM equipment_catalog WHERE id=$1 AND organization_id=$2",
          [id, user.organizationId],
        );
      }
      await client.query(
        "INSERT INTO equipment_tombstones (id,organization_id) VALUES ($1,$2) ON CONFLICT(organization_id,id) DO NOTHING",
        [id, user.organizationId],
      );
      await client.query("COMMIT");
      return c.json({ success: true, id, deletedIds: [id] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
