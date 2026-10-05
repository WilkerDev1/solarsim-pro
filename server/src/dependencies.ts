import type { Context } from "hono";
import type { Pool } from "pg";
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "LECTOR";
  organizationId: string;
  organizationName?: string;
}
export interface Dependencies {
  pool: Pool;
  jwtSecret: string;
  authenticate: (c: Context) => Promise<AuthUser | null>;
}
