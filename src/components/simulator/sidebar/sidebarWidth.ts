// Ancho del panel de parámetros. En ventanas amplias respeta el ancho elegido (mínimo 380 px);
// en ventanas estrechas (pantalla dividida) cede hasta el 40 % del ancho, sin bajar de 280 px.
export const PARAMETER_SIDEBAR_MIN_PX = 280;
const PREFERRED_FLOOR_PX = 380;
const DRAG_MAX_PX = 600;
const NARROW_SHARE = 0.4;

export function parameterSidebarCssWidth(preferredPx: number): string {
  const preferred = Number.isFinite(preferredPx) ? Math.max(preferredPx, PREFERRED_FLOOR_PX) : PREFERRED_FLOOR_PX;
  return `min(${preferred}px, max(${PARAMETER_SIDEBAR_MIN_PX}px, ${NARROW_SHARE * 100}vw))`;
}

// Ancho que se guarda al arrastrar el borde: el mismo tope que se dibuja (40 % de la ventana), para que el
// borde siga al cursor y no quede un valor mayor oculto que reaparezca al maximizar.
export function draggedSidebarWidth(pointerX: number, sidebarLeft: number, viewportWidth: number): number {
  const max = Math.min(DRAG_MAX_PX, Math.max(PARAMETER_SIDEBAR_MIN_PX, viewportWidth * NARROW_SHARE));
  return Math.round(Math.max(PARAMETER_SIDEBAR_MIN_PX, Math.min(max, pointerX - sidebarLeft)));
}
