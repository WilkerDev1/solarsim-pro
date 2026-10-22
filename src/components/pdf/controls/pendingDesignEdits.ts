/**
 * Ediciones del dock que guardan tras una pausa (p. ej. la opacidad de la marca de agua).
 * Exportar o imprimir las confirma antes de capturar la hoja.
 */
const flushers = new Set<() => void>();

export function registerPendingDesignEdit(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export function flushPendingDesignEdits(): void {
  for (const flush of [...flushers]) flush();
}
