import { createHash, randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { Dependencies } from "../dependencies.js";
import { lockCurrentMembership } from "../membership.js";
export function registerEquipmentAssetRoutes(
  app: Hono,
  { pool, authenticate }: Dependencies,
): void {
  app.post("/api/equipment-assets", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    if (user.role === "LECTOR")
      return c.json({ error: "Permisos insuficientes" }, 403);
    const body = await c.req.parseBody(),
      file = body.file,
      kind = body.kind;
    if (
      !(file instanceof File) ||
      !["datasheet", "image"].includes(String(kind)) ||
      file.size < 1 ||
      file.size > 8 * 1024 * 1024
    )
      return c.json(
        { error: "Adjunta un PDF o una imagen de hasta 8 MB" },
        400,
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "image/jpeg"
            : bytes.subarray(0, 4).toString() === "RIFF" &&
                bytes.subarray(8, 12).toString() === "WEBP"
              ? "image/webp"
              : null;
    if (!mime || (kind === "image" && mime === "application/pdf"))
      return c.json(
        { error: "Formato no admitido. Usa PDF, PNG, JPEG o WebP." },
        400,
      );
    const name =
      file.name.replace(/[\r\n\x00-\x1f/\\]/g, "_").slice(0, 255) || "adjunto";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const denied = await lockCurrentMembership(client, user);
      if (denied) {
        await client.query("ROLLBACK");
        return c.json({ error: "La sesión o los permisos cambiaron" }, denied);
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const result = await client.query(
        `INSERT INTO equipment_assets (id,organization_id,kind,sha256,name,mime_type,size_bytes,content,created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,kind,sha256) DO UPDATE SET sha256=EXCLUDED.sha256
        RETURNING id,name,mime_type,size_bytes,sha256,kind`,
        [
          randomUUID(),
          user.organizationId,
          kind,
          digest,
          name,
          mime,
          file.size,
          bytes,
          user.id,
        ],
      );
      await client.query("COMMIT");
      const r = result.rows[0];
      return c.json({
        success: true,
        asset: {
          id: r.id,
          name: r.name,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          sha256: r.sha256,
          kind: r.kind,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.get("/api/equipment-assets/:id", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ error: "No autorizado" }, 401);
    const row = (
      await pool.query(
        "SELECT * FROM equipment_assets WHERE id=$1 AND organization_id=$2",
        [c.req.param("id"), user.organizationId],
      )
    ).rows[0];
    if (!row) return c.json({ error: "Adjunto no encontrado" }, 404);
    c.header("Content-Type", row.mime_type);
    c.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "private, no-store");
    return c.body(new Uint8Array(row.content));
  });
}
