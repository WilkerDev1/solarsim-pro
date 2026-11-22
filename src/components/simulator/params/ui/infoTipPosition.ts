export interface TipRect { left: number; top: number; right: number; bottom: number }
export interface TipSize { width: number; height: number }
export interface TipViewport { width: number; height: number }

export const TIP_MARGIN = 8;
const TIP_GAP = 6;

/**
 * Posición (coordenadas de ventana, `position: fixed`) del tooltip de un ⓘ: alineado a la derecha del icono, acotado
 * horizontalmente a [8, ancho − ancho_tooltip − 8] y volteado hacia abajo si no cabe arriba. Pura: la misma para
 * puntero y teclado.
 */
export function computeTipPosition(anchor: TipRect, tip: TipSize, viewport: TipViewport): { left: number; top: number; placement: 'top' | 'bottom' } {
  const maxLeft = Math.max(TIP_MARGIN, viewport.width - tip.width - TIP_MARGIN);
  const left = Math.min(Math.max(anchor.right - tip.width, TIP_MARGIN), maxLeft);
  const above = anchor.top - tip.height - TIP_GAP;
  if (above >= TIP_MARGIN) return { left, top: above, placement: 'top' };
  const below = anchor.bottom + TIP_GAP;
  // Si tampoco cabe abajo, se acota para que no se salga por el borde inferior (ni por el superior).
  const top = Math.max(TIP_MARGIN, Math.min(below, viewport.height - tip.height - TIP_MARGIN));
  return { left, top, placement: 'bottom' };
}

/**
 * ¿Un evento `scroll` (escuchado en captura en la ventana) mueve el ⓘ? Sí si viene de la ventana o el documento, o de
 * un contenedor que contiene el ⓘ (el dock); no si viene de otro contenedor ajeno. Sin destino conocido, sí (se cierra
 * por seguridad). Pura: recibe cualquier objeto con `contains`, para probarla sin DOM.
 */
export function scrollMovesAnchor(target: unknown, anchor: object | null): boolean {
  if (!anchor) return false;
  const contains = (target as { contains?: unknown } | null)?.contains;
  if (typeof contains !== 'function') return true;
  return Boolean((contains as (other: unknown) => boolean).call(target, anchor));
}
