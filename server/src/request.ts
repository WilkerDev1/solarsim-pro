import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
/** Reject null, arrays and primitives before route-specific validation. */
export async function readObjectBody(c: Context): Promise<Record<string, any>> {
  const body: unknown = await c.req.json();
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HTTPException(400, { message: "Se requiere un objeto JSON" });
  return body as Record<string, any>;
}

/**
 * Id of a synced record (quotation, template, signature): 1–64 characters, no control characters or lone UTF-16
 * surrogates (PostgreSQL rejects `\u0000`, which `%00` in the path decodes to: a 400, never a 500).
 */
export function isRecordId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 64 &&
    !/[\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(
      id,
    )
  );
}
