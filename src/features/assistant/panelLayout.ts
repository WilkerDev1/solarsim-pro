/**
 * Acoplado o flotante (F5b). Puro: decide cómo se coloca el panel del asistente según la vista y el ancho de la ventana.
 *
 * En el simulador, el resumen (project-hub) y la vista previa del PDF el panel se acopla como columna derecha cuando al
 * contenido le quedan al menos `DOCK_MIN_CONTENT_PX`, para no tapar resultados; si no caben, o en cualquier otra vista
 * (Inicio, clientes, cotizaciones…), sigue flotante. El presupuesto descuenta el dock principal (64 px) y, en el simulador, el
 * dock de parámetros con el ancho que dibuja su CSS (`parameterSidebarCssWidth`: así la pantalla dividida, donde cede al 40 %,
 * no acopla). En la vista previa del PDF descuenta además su barra de controles y exige la página entera
 * (`PDF_PAGE_CONTENT_PX`) en lugar de 640 px. Acoplar o flotar no remonta el panel: es el mismo elemento con otra clase (AppAssistant.tsx).
 */
import { PARAMETER_SIDEBAR_MIN_PX } from '../../components/simulator/sidebar/sidebarWidth';

export const ASSISTANT_PANEL_MIN_PX = 280;
export const ASSISTANT_PANEL_MAX_PX = 720;
export const ASSISTANT_PANEL_DEFAULT_PX = 380;
/** Ancho mínimo que debe quedar para el contenido de la vista con el panel acoplado. */
export const DOCK_MIN_CONTENT_PX = 640;
/**
 * En la vista previa del PDF el contenido es la página: 850 px (`w-[850px]` en PDFProposalView) más el margen del lienzo
 * (`lg:p-8`, 32 px por lado). Con menos, la columna recortaría la página y habría que desplazarse en horizontal.
 */
export const PDF_PAGE_CONTENT_PX = 850 + 2 * 32;
/** Dock vertical de navegación (`w-16` en PrimaryIconDock). */
export const PRIMARY_DOCK_PX = 64;
/** Vistas donde el panel puede acoplarse. */
export const DOCKABLE_VIEWS: readonly string[] = ['simulator', 'project-hub', 'pdf-preview'];

/** Mínimo del dock de parámetros en ventanas amplias y su cuota en las estrechas (los de `parameterSidebarCssWidth`). */
const SIDEBAR_PREFERRED_FLOOR_PX = 380;
const SIDEBAR_NARROW_SHARE = 0.4;

/** Barra de controles de la vista previa del PDF: `w-[min(340px,40vw)] min-w-[260px]` (PDFSidebarControls). */
export function pdfControlsPx(viewportWidth: number): number {
  return Math.round(Math.max(260, Math.min(340, 0.4 * viewportWidth)));
}

/** Ancho real del dock de parámetros: `min(max(preferido, 380), max(280, 40 % de la ventana))`, como su CSS. */
export function parameterSidebarPx(preferredPx: number, viewportWidth: number): number {
  const preferred = Number.isFinite(preferredPx) ? Math.max(preferredPx, SIDEBAR_PREFERRED_FLOOR_PX) : SIDEBAR_PREFERRED_FLOOR_PX;
  return Math.round(Math.min(preferred, Math.max(PARAMETER_SIDEBAR_MIN_PX, SIDEBAR_NARROW_SHARE * viewportWidth)));
}

export interface AssistantPanelLayoutInput {
  view: string;
  viewportWidth: number;
  /** Ancho elegido al arrastrar el borde (sin él, el de fábrica). */
  panelWidth?: number;
  /** `sidebarWidth` del store (solo cuenta en el simulador). */
  parameterSidebarWidth?: number;
}

export interface AssistantPanelLayout {
  mode: 'docked' | 'floating';
  /** Ancho de la columna acoplada (en flotante, el de fábrica: el CSS del flotante manda). */
  width: number;
  minWidth: number;
  /** Lo más ancho que puede ser la columna sin dejar al contenido por debajo de `DOCK_MIN_CONTENT_PX`. */
  maxWidth: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function assistantPanelLayout({ view, viewportWidth, panelWidth, parameterSidebarWidth }: AssistantPanelLayoutInput): AssistantPanelLayout {
  const wanted = Number.isFinite(panelWidth) ? (panelWidth as number) : ASSISTANT_PANEL_DEFAULT_PX;
  const reserved = PRIMARY_DOCK_PX
    + (view === 'simulator' ? parameterSidebarPx(parameterSidebarWidth ?? SIDEBAR_PREFERRED_FLOOR_PX, viewportWidth) : 0)
    + (view === 'pdf-preview' ? pdfControlsPx(viewportWidth) : 0);
  const minContent = view === 'pdf-preview' ? PDF_PAGE_CONTENT_PX : DOCK_MIN_CONTENT_PX;
  const room = Math.floor(Math.min(ASSISTANT_PANEL_MAX_PX, viewportWidth - reserved - minContent));
  if (!DOCKABLE_VIEWS.includes(view) || !Number.isFinite(viewportWidth) || room < ASSISTANT_PANEL_MIN_PX)
    return { mode: 'floating', width: ASSISTANT_PANEL_DEFAULT_PX, minWidth: ASSISTANT_PANEL_MIN_PX, maxWidth: ASSISTANT_PANEL_MAX_PX };
  return { mode: 'docked', width: Math.round(clamp(wanted, ASSISTANT_PANEL_MIN_PX, room)), minWidth: ASSISTANT_PANEL_MIN_PX, maxWidth: room };
}

/** Ancho al arrastrar el borde izquierdo de la columna (o con las flechas): crece hacia la izquierda, acotado. */
export function draggedAssistantWidth(startWidth: number, startX: number, pointerX: number, layout: Pick<AssistantPanelLayout, 'minWidth' | 'maxWidth'>): number {
  return Math.round(clamp(startWidth + (startX - pointerX), layout.minWidth, layout.maxWidth));
}
