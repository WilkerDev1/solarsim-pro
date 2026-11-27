/**
 * Copias de bytes de adjuntos en curso (al duplicar una cotización): mientras se copia desde un id, sus bytes no se
 * pueden borrar aunque la cotización original ya no lo use.
 */
const inFlight = new Map<string, number>();

export function trackAttachmentCopy(fromId: string, copy: Promise<unknown>): Promise<unknown> {
  inFlight.set(fromId, (inFlight.get(fromId) ?? 0) + 1);
  return copy.finally(() => {
    const left = (inFlight.get(fromId) ?? 1) - 1;
    if (left > 0) inFlight.set(fromId, left);
    else inFlight.delete(fromId);
  });
}

export const isAttachmentBeingCopied = (id: string): boolean => inFlight.has(id);

/** Espera a que terminen las copias que leen de `id` (para borrar sus bytes después). */
export async function attachmentCopiesSettled(id: string): Promise<void> {
  while (inFlight.has(id)) await new Promise((resolve) => setTimeout(resolve, 10));
}
