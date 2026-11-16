import type { Context } from "hono";
import type { Pool } from "pg";
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "LECTOR";
  organizationId: string;
  organizationName?: string;
  authVersion?: number;
  /** Present only for remote agent tokens (docs/MCP_REMOTE.md); a `read` grant arrives with role LECTOR. */
  agent?: { grantId: string; scope: "read" | "write" };
}
export interface Dependencies {
  pool: Pool;
  jwtSecret: string;
  authenticate: (c: Context) => Promise<AuthUser | null>;
}
