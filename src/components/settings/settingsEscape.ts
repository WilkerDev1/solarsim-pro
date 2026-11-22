/** Modales abiertos cuyo Escape es suyo: el <dialog> nativo abierto (ofertas, confirmación) y los diálogos aria-modal. */
export const OPEN_MODAL_SELECTOR = 'dialog[open], [aria-modal="true"]';

export interface EscapeLikeEvent {
  key: string;
  defaultPrevented: boolean;
  target: unknown;
}

/**
 * ¿Un keydown en la ventana debe cerrar Ajustes («Esc = Volver a SolarSim»)? Solo si es Escape, ningún control lo
 * atendió antes (`preventDefault`) y no nace dentro de un modal abierto: el Escape de un diálogo (p. ej. escribir en
 * «Agregar oferta») lo resuelve el propio diálogo con su flujo de descarte. Pura: el destino solo necesita `closest`.
 */
export function settingsEscapeCloses(event: EscapeLikeEvent): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) return false;
  const closest = (event.target as { closest?: unknown } | null)?.closest;
  if (typeof closest !== 'function') return true;
  return !(closest as (selector: string) => unknown).call(event.target, OPEN_MODAL_SELECTOR);
}
