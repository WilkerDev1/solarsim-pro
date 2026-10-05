import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
/** Reject null, arrays and primitives before route-specific validation. */
export async function readObjectBody(c: Context): Promise<Record<string, any>> {
  const body: unknown = await c.req.json();
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HTTPException(400, { message: "Se requiere un objeto JSON" });
  return body as Record<string, any>;
}
