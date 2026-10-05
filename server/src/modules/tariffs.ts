import { readObjectBody } from "../request.js";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";

export function registerTariffsRoutes(app: Hono, deps: Dependencies): void {
  const { pool, authenticate } = deps;
  app.get("/api/tariffs", async (c) => {
    const authUser = await authenticate(c);
    if (!authUser) {
      return c.json({ error: "No autorizado" }, 401);
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT id, organization_id, resolution_code as "resolutionCode",
              effective_date as "effectiveDate", tariffs_json as "tariffsJson",
              updated_by as "updatedBy", updated_at as "updatedAt"
       FROM utility_tariffs
       WHERE (organization_id = $1 OR organization_id = 'org-electsun-default')
       ORDER BY updated_at DESC
       LIMIT 1`,
        [authUser.organizationId],
      );

      if (res.rows.length === 0) {
        return c.json({
          success: true,
          matrix: null,
          message: "Sin tarifas personalizadas; usando pliego base oficial",
        });
      }

      const row = res.rows[0];
      return c.json({
        success: true,
        matrix: {
          resolutionCode: row.resolutionCode,
          effectiveDate: row.effectiveDate,
          lastUpdatedAt: row.updatedAt
            ? new Date(row.updatedAt).toISOString()
            : new Date().toISOString(),
          publishedBy:
            row.updatedBy || "Superintendencia de Electricidad (SIE)",
          ...(row.tariffsJson || {}),
        },
      });
    } catch (error: any) {
      console.error("Error al consultar tarifas eléctricas:", error);
      return c.json(
        { error: error.message || "Error al obtener tarifas" },
        500,
      );
    } finally {
      client.release();
    }
  });

  app.post("/api/tariffs/sync", async (c) => {
    const authUser = await authenticate(c);
    if (!authUser) {
      return c.json({ error: "No autorizado" }, 401);
    }

    if (authUser.role === "LECTOR") {
      return c.json(
        {
          error:
            "Permisos insuficientes: rol Lector/Viewer no puede actualizar tarifas",
        },
        403,
      );
    }

    const body = await readObjectBody(c);
    const { matrix } = body;

    if (!matrix || typeof matrix !== "object") {
      return c.json({ error: "Estructura de matriz tarifaria inválida" }, 400);
    }

    const resolutionCode = matrix.resolutionCode || "SIE-VIGENTE";
    const effectiveDate =
      matrix.effectiveDate || new Date().toISOString().split("T")[0];
    const tariffId = `trf-${authUser.organizationId}`;

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO utility_tariffs (id, organization_id, resolution_code, effective_date, tariffs_json, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         resolution_code = EXCLUDED.resolution_code,
         effective_date = EXCLUDED.effective_date,
         tariffs_json = EXCLUDED.tariffs_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
        [
          tariffId,
          authUser.organizationId,
          resolutionCode,
          effectiveDate,
          JSON.stringify(matrix),
          authUser.name,
        ],
      );

      return c.json({
        success: true,
        message: "Pliego tarifario actualizado y sincronizado exitosamente",
        serverTimestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error al sincronizar tarifas:", error);
      return c.json(
        {
          error:
            error.message || "Error al guardar tarifas en la base de datos",
        },
        500,
      );
    } finally {
      client.release();
    }
  });
}
