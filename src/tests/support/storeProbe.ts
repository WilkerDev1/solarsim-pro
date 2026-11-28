// Instrumentación de pruebas de caracterización: cuenta escrituras del store y llamadas a triggerAutoSync sin cambiar su comportamiento.
import type { useSimulationStore } from '../../store/useSimulationStore';

type Store = typeof useSimulationStore;

/** Claves de datos (no funciones) que cambiaron entre dos estados, en el orden en que las declara el store. */
export function changedKeys(next: Record<string, unknown>, previous: Record<string, unknown>): string[] {
  return Object.keys(next).filter((key) => typeof next[key] !== 'function' && next[key] !== previous[key]);
}

export interface StoreProbe {
  /** Una entrada por notificación del store (cada `set`), con las claves de datos que cambió. */
  writes: string[][];
  /** Veces que se llamó a `triggerAutoSync`, con su argumento `immediate`. */
  syncCalls: (boolean | undefined)[];
  /** `updatedAt` de la propuesta vigilada tras cada escritura que cambió `projects`. */
  updatedAtStamps: string[];
  /** Descarta lo registrado hasta ahora (para medir solo una fase). */
  reset(): void;
  /** Quita el suscriptor y restaura `triggerAutoSync`. */
  stop(): void;
}

export function probeStore(store: Store, watchedProjectId: string): StoreProbe {
  const original = store.getState().triggerAutoSync;
  const probe: StoreProbe = {
    writes: [], syncCalls: [], updatedAtStamps: [],
    reset() { probe.writes.length = 0; probe.syncCalls.length = 0; probe.updatedAtStamps.length = 0; },
    stop() { unsubscribe(); store.setState({ triggerAutoSync: original }); },
  };
  store.setState({ triggerAutoSync: (immediate?: boolean) => { probe.syncCalls.push(immediate); } });
  const unsubscribe = store.subscribe((next, previous) => {
    probe.writes.push(changedKeys(next as unknown as Record<string, unknown>, previous as unknown as Record<string, unknown>));
    if (next.projects !== previous.projects) probe.updatedAtStamps.push(next.projects.find((p) => p.id === watchedProjectId)?.updatedAt ?? '');
  });
  return probe;
}

/** El historial de Ctrl+Z (`recordUndoState`) se agrupa 600 ms: espera a que se asiente. */
export const settleUndoDebounce = () => new Promise<void>((resolve) => setTimeout(resolve, 750));
