/**
 * Lógica pura del resaltado en vivo (F5a): qué rutas que cambió el asistente se destacan en el simulador, durante cuánto y
 * cómo se agrupan. Sin React, sin DOM, sin reloj propio (el momento llega como `now`) y sin store: lo guarda
 * `src/store/dockHighlightStore.ts` y lo pinta `useDockHighlight` (dock) y la pestaña de Energía.
 *
 * Reglas (requisito del dueño: «que se apliquen en vivo y con el destacado», «sin que la interfaz navegue»):
 * - Una marca por ancla (`fieldAnchors.ts`); el mismo control tocado dos veces se renueva, no se duplica.
 * - Dura `HIGHLIGHT_TTL_MS`; pasado el plazo desaparece sola. Cambiar de propuesta empieza de cero.
 * - Nunca abre una sección, desplaza ni mueve el foco: un control a la vista se destaca; una sección plegada, un control que
 *   no está en pantalla (lo oculta la organización o el modo) y lo que ningún control edita (RNC, NIC, consumo en la pestaña
 *   de Energía) llevan un indicador discreto «Cambió aquí» con el detalle.
 */
import { fieldLabel } from './projectFields';
import {
  anchorForPath, type AnchorPlace, type AnchorPrecision, type DockSectionKey, type SimulatorTabKey,
} from './fieldAnchors';

/** Cuánto dura el destacado (el usuario lo ve sin que estorbe). */
export const HIGHLIGHT_TTL_MS = 6000;
/** Etiquetas que se nombran en un indicador antes de «y N más». */
const MAX_HINT_LABELS = 3;

export interface HighlightedChange {
  /** Ruta concreta del registro de campos (`rates.targetCoveragePct`). */
  path: string;
  /** Etiqueta legible; sin ella, la del registro. */
  label?: string;
}

export interface HighlightMark {
  /** Identidad de la marca: el ancla del control o de la fila, o `dock:<sección>` / `tab:<pestaña>` si es la sección o la pestaña. */
  key: string;
  place: AnchorPlace;
  /** `data-dock-anchor` del control o de la fila; sin él, la marca es de la sección o la pestaña. */
  target?: string;
  precision: AnchorPrecision;
  /** Lo que cambió en esta ancla (sin repetir), para el indicador. */
  labels: string[];
  /** Instante en que caduca. */
  until: number;
}

export interface DockHighlightState {
  projectId: string | null;
  marks: HighlightMark[];
}

export const EMPTY_HIGHLIGHTS: DockHighlightState = Object.freeze({ projectId: null, marks: [] }) as DockHighlightState;

const placeKey = (place: AnchorPlace) => (place.surface === 'dock' ? `dock:${place.section}` : `tab:${place.tab}`);

/**
 * Añade las marcas de un lote aplicado por el asistente. Las rutas sin ancla (lo derivado de solo lectura, el documento, lo que
 * no está en el registro) no destacan nada. Devuelve el mismo objeto si el lote no aporta ninguna marca.
 */
export function addHighlights(
  state: DockHighlightState,
  input: { projectId: string; changes: readonly HighlightedChange[]; now: number; ttlMs?: number },
): DockHighlightState {
  const until = input.now + (input.ttlMs ?? HIGHLIGHT_TTL_MS);
  const sameProject = state.projectId === input.projectId;
  const marks = new Map<string, HighlightMark>((sameProject ? state.marks : []).filter((mark) => mark.until > input.now).map((mark) => [mark.key, mark]));
  let touched = false;
  for (const change of input.changes) {
    const anchor = anchorForPath(change.path);
    if (!anchor) continue;
    touched = true;
    const key = anchor.target ?? placeKey(anchor.place);
    const label = change.label?.trim() || fieldLabel(change.path);
    const known = marks.get(key);
    marks.set(key, {
      key, place: anchor.place, ...(anchor.target ? { target: anchor.target } : {}), precision: anchor.precision,
      labels: known && known.labels.includes(label) ? known.labels : [...(known?.labels ?? []), label], until,
    });
  }
  if (!touched) return state;
  return { projectId: input.projectId, marks: [...marks.values()] };
}

/** Marcas que siguen vivas en `now`. */
export const activeMarks = (state: DockHighlightState, now: number): HighlightMark[] => state.marks.filter((mark) => mark.until > now);

/** El estado sin las marcas caducadas (el mismo objeto si no caducó ninguna). */
export function pruneExpired(state: DockHighlightState, now: number): DockHighlightState {
  const live = activeMarks(state, now);
  if (live.length === state.marks.length) return state;
  return live.length ? { projectId: state.projectId, marks: live } : EMPTY_HIGHLIGHTS;
}

/** Cuándo caduca la próxima marca viva, para programar un solo temporizador; `null` si no queda ninguna. */
export function nextExpiry(state: DockHighlightState, now: number): number | null {
  const live = activeMarks(state, now);
  return live.length ? Math.min(...live.map((mark) => mark.until)) : null;
}

export interface DockHighlightContext {
  /** La propuesta que se está viendo: las marcas de otra no se muestran. */
  projectId: string;
  /** Secciones abiertas del dock. */
  open: Readonly<Record<DockSectionKey, boolean>>;
  /** ¿Hay en pantalla un elemento con ese `data-dock-anchor`? (consulta al DOM; lo ocultan la organización o el modo). */
  isPresent: (target: string) => boolean;
  /** ¿Está el control en el DOM pero dentro de un desplegable «Avanzado» plegado? Cae en la sección, con esa nota. */
  isCollapsed?: (target: string) => boolean;
  /** Pestaña que se está viendo: la de Energía no necesita indicador si ya está a la vista. */
  activeTab?: string;
}

export interface DockHighlightView {
  /** `data-dock-anchor` de los controles y filas que se destacan. */
  controls: string[];
  /** Indicador «Cambió aquí» por sección del dock. */
  sections: Partial<Record<DockSectionKey, string>>;
  /** Indicador por pestaña que no se está viendo. */
  tabs: Partial<Record<SimulatorTabKey, string>>;
}

const EMPTY_VIEW: DockHighlightView = { controls: [], sections: {}, tabs: {} };
const HIDDEN_CONTROL_NOTE = 'sin control visible ahora: lo oculta la organización o el modo';

const COLLAPSED_NOTE = 'en Avanzado, plegado';

/** Cada etiqueta lleva su propia nota (Avanzado plegado, oculto por la organización): no se contagian entre controles. */
const withNote = (label: string, note?: string): string => (note ? `${label} (${note})` : label);

function hintText(labels: readonly string[]): string {
  const shown = labels.slice(0, MAX_HINT_LABELS).join(', ');
  const rest = labels.length - MAX_HINT_LABELS;
  return `Cambió aquí: ${shown}${rest > 0 ? ` y ${rest} más` : ''}`;
}

/**
 * Qué se destaca y qué indicadores se muestran, dadas las marcas vivas y lo que hay en pantalla.
 * - control o fila a la vista: se destaca; la sección solo lleva indicador si está plegada (entonces lista lo que cambió);
 * - control o fila que no está en pantalla: cae en la sección, con el motivo;
 * - lo que no tiene control con id: la sección (o la pestaña, si no es la que se ve).
 */
export function dockHighlightView(state: DockHighlightState, now: number, ctx: DockHighlightContext): DockHighlightView {
  if (state.projectId !== ctx.projectId) return EMPTY_VIEW;
  const marks = activeMarks(state, now);
  if (!marks.length) return EMPTY_VIEW;
  const controls = new Set<string>();
  const hints = new Map<DockSectionKey, string[]>();
  const tabs: DockHighlightView['tabs'] = {};
  const hint = (section: DockSectionKey, labels: readonly string[], note?: string) => {
    const known = hints.get(section) ?? [];
    hints.set(section, [...new Set([...known, ...labels.map((label) => withNote(label, note))])]);
  };
  for (const mark of marks) {
    if (mark.place.surface === 'tab') {
      if (mark.place.tab !== ctx.activeTab) tabs[mark.place.tab] = hintText(mark.labels);
      continue;
    }
    const section = mark.place.section;
    if (mark.target && ctx.isPresent(mark.target)) {
      controls.add(mark.target);
      if (!ctx.open[section]) hint(section, mark.labels);
    } else if (mark.target && ctx.isCollapsed?.(mark.target)) {
      hint(section, mark.labels, COLLAPSED_NOTE);
    } else {
      hint(section, mark.labels, mark.target ? HIDDEN_CONTROL_NOTE : undefined);
    }
  }
  const sections: DockHighlightView['sections'] = {};
  for (const [section, labels] of hints) sections[section] = hintText(labels);
  return { controls: [...controls], sections, tabs };
}
