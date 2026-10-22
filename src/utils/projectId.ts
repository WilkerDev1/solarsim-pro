let counter = 0;

/**
 * Id único de proyecto con prefijo estable (`proj-` por defecto).
 * Usa `crypto.randomUUID()` cuando existe; si no, `Date.now()` + aleatorio + contador
 * monotónico para que dos ids creados en el mismo milisegundo nunca coincidan.
 */
export function createProjectId(prefix = 'proj'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now()}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
