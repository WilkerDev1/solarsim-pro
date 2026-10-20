/** Role rules shared by the app. The server only knows ADMIN, EDITOR and LECTOR; VIEWER is a legacy client alias of LECTOR. */

type Role = string | null | undefined;
type Account = { role?: Role } | null | undefined;

/** May create and edit proposals, catalog entries and folders. */
export function isWriterRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'EDITOR';
}

/** Manages the organization, its members and shared policies. */
export function isAdminRole(role: Role): boolean {
  return role === 'ADMIN';
}

/** Read-only member. */
export function isReaderRole(role: Role): boolean {
  return role === 'LECTOR' || role === 'VIEWER';
}

/** Writer rights; without an account (local mode) the user owns everything. */
export function canWrite(user: Account): boolean {
  return !user || isWriterRole(user.role);
}

/** Admin rights; without an account (local mode) the user owns everything. */
export function canAdminister(user: Account): boolean {
  return !user || isAdminRole(user.role);
}

/** Server role name for display and forms (VIEWER → LECTOR). */
export function normalizeRole<R extends string | null | undefined>(role: R): R | 'LECTOR' {
  return role === 'VIEWER' ? 'LECTOR' : role;
}
