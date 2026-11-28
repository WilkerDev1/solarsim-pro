/**
 * Enlace entre el store del resaltado (`dockHighlightStore`) y el simulador (F5a). No toca el panel del asistente: escucha lo
 * que publicó `commitProjectEdits` cuando el origen del lote es el asistente, de modo que sirve igual con el panel de hoy, con
 * el de F4/F5b o con un gancho de desarrollo (docs/QA.md). Nunca enfoca, desplaza ni navega.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { dockHighlightStore } from '../../../store/dockHighlightStore';
import { dockHighlightView, nextExpiry, type DockHighlightView } from '../../../domain/dockHighlight';
import type { DockSectionKey, SimulatorTabKey } from '../../../domain/fieldAnchors';
import { presentInDock, collapsedInDock, syncChangedMarks, type MarkRoot } from './dockHighlightDom';

const EMPTY: DockHighlightView = { controls: [], sections: {}, tabs: {} };
const sameView = (a: DockHighlightView, b: DockHighlightView) => JSON.stringify(a) === JSON.stringify(b);

/** Las marcas vivas y un temporizador que las quita al caducar (uno solo, para la más próxima). */
function useHighlightState() {
  const state = useSyncExternalStore(dockHighlightStore.subscribe, dockHighlightStore.getState, dockHighlightStore.getState);
  useEffect(() => {
    const next = nextExpiry(state, Date.now());
    if (next === null) return undefined;
    const timer = setTimeout(() => dockHighlightStore.prune(), Math.max(0, next - Date.now()) + 25);
    return () => clearTimeout(timer);
  }, [state]);
  return state;
}

/**
 * Para el dock: marca en el DOM los controles que cambió el asistente y devuelve el indicador «Cambió aquí» de cada sección que
 * lo necesita (plegada, o con un cambio que no se ve en un control). La vista se calcula tras pintar, con lo que de verdad hay
 * en pantalla (un control que oculta la organización o el modo cae en su sección).
 */
export function useDockHighlight(projectId: string, open: Readonly<Record<DockSectionKey, boolean>>, rootRef: RefObject<HTMLElement | null>): Partial<Record<DockSectionKey, string>> {
  const state = useHighlightState();
  const [view, setView] = useState<DockHighlightView>(EMPTY);
  const marked = useRef(false);
  useEffect(() => {
    const root = rootRef.current as unknown as MarkRoot | null;
    const next = root && state.marks.length
      ? dockHighlightView(state, Date.now(), { projectId, open, isPresent: (target) => presentInDock(root, target), isCollapsed: (target) => collapsedInDock(root, target) })
      : EMPTY;
    if (root && (marked.current || next.controls.length)) syncChangedMarks(root, next.controls);
    marked.current = next.controls.length > 0;
    setView((previous) => (sameView(previous, next) ? previous : next));
  });
  return view.sections;
}

/** Para la barra de pestañas del simulador: el indicador de la pestaña que no se ve. */
export function useTabHighlight(projectId: string, activeTab: SimulatorTabKey | string): Partial<Record<SimulatorTabKey, string>> {
  const state = useHighlightState();
  return dockHighlightView(state, Date.now(), { projectId, open: ALL_OPEN, isPresent: () => true, activeTab }).tabs;
}

const ALL_OPEN: Record<DockSectionKey, boolean> = { client: true, rates: true, equipment: true, costs: true, financials: true };
