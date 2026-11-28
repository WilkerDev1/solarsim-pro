/**
 * Estado del resaltado en vivo del dock (F5a), fuera de React y fuera del store principal: así un lote del asistente no
 * añade escrituras al store de propuestas (una escritura, un sello, un autosync) ni hace repintar nada que no escuche.
 * La lógica es pura (`src/domain/dockHighlight.ts`); aquí solo hay suscriptores y el reloj.
 *
 * Lo alimenta `commitProjectEdits` (`projectSlice.ts`) cuando el origen del lote es el asistente: la misma fuente que el
 * diario de deshacer (`fields`, `turnId`), no el panel del asistente. Lo escuchan el dock y la pestaña de Energía
 * (`useDockHighlight`). En memoria: no se persiste ni se sincroniza.
 */
import {
  EMPTY_HIGHLIGHTS, addHighlights, pruneExpired, type DockHighlightState, type HighlightedChange,
} from '../domain/dockHighlight';

export interface DockHighlightStore {
  getState: () => DockHighlightState;
  subscribe: (listener: () => void) => () => void;
  /** Destaca lo que cambió un lote aplicado por el asistente en `projectId`. Sin anclas, no notifica. */
  publish: (projectId: string, changes: readonly HighlightedChange[], now?: number) => void;
  /** Quita las marcas caducadas (las llama el temporizador del dock). */
  prune: (now?: number) => void;
  clear: () => void;
}

export function createDockHighlightStore(): DockHighlightStore {
  let state = EMPTY_HIGHLIGHTS;
  const listeners = new Set<() => void>();
  const set = (next: DockHighlightState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish: (projectId, changes, now = Date.now()) => set(addHighlights(state, { projectId, changes, now })),
    prune: (now = Date.now()) => set(pruneExpired(state, now)),
    clear: () => set(EMPTY_HIGHLIGHTS),
  };
}

/** El resaltado de la aplicación: uno solo. */
export const dockHighlightStore = createDockHighlightStore();
