// Ancho del panel de parámetros. En ventanas amplias respeta el ancho elegido (mínimo 380 px);
// en ventanas estrechas (pantalla dividida) cede hasta el 40 % del ancho, sin bajar de 280 px.
export const PARAMETER_SIDEBAR_MIN_PX = 280;
const PREFERRED_FLOOR_PX = 380;

export function parameterSidebarCssWidth(preferredPx: number): string {
  const preferred = Number.isFinite(preferredPx) ? Math.max(preferredPx, PREFERRED_FLOOR_PX) : PREFERRED_FLOOR_PX;
  return `min(${preferred}px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`;
}
