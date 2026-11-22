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

export type ScrollReaction = 'ignore' | 'follow' | 'close';

/**
 * Qué hace el tooltip ante un `scroll`. Si el scroll no mueve el ⓘ, nada. Si el ⓘ tiene el foco (teclado: al llegar
 * con Tab el navegador desplaza el dock para mostrarlo), el tooltip sigue al ⓘ mientras esté a la vista y se cierra si
 * sale de ella. Si se abrió con el puntero, se cierra: no queda fijo tapando otros controles.
 */
export function scrollReaction({ movesAnchor, focused, anchorInView }: { movesAnchor: boolean; focused: boolean; anchorInView: boolean }): ScrollReaction {
  if (!movesAnchor) return 'ignore';
  if (focused && anchorInView) return 'follow';
  return 'close';
}

/** ¿El rectángulo del ⓘ se ve dentro de la ventana y de los rectángulos de recorte de sus ancestros con scroll? Pura. */
export function anchorVisible(anchor: TipRect, clips: readonly TipRect[], viewport: TipViewport): boolean {
  let left = 0;
  let top = 0;
  let right = viewport.width;
  let bottom = viewport.height;
  for (const box of clips) {
    left = Math.max(left, box.left); top = Math.max(top, box.top);
    right = Math.min(right, box.right); bottom = Math.min(bottom, box.bottom);
  }
  return anchor.bottom > top && anchor.top < bottom && anchor.right > left && anchor.left < right;
}
