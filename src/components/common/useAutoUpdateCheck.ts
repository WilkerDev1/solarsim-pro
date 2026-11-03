import { useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { UpdateState } from '../../types';

/** Primera comprobación unos segundos después de abrir, para no competir con la carga inicial. */
export const FIRST_UPDATE_CHECK_DELAY_MS = 8_000;
/** Las releases son esporádicas: cada 6 horas basta y queda muy lejos del límite de la API de GitHub. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Con una actualización ya encontrada o en curso no se vuelve a consultar: el aviso no debe desaparecer por un fallo de red. */
export const shouldAutoCheckForUpdates = (state: UpdateState): boolean =>
  state === 'idle' || state === 'not-available' || state === 'error';

/** Busca actualizaciones en segundo plano (solo en Electron) para que el aviso del panel aparezca sin abrir el modal. */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || typeof api.checkForUpdates !== 'function') return undefined;
    const check = () => {
      if (!shouldAutoCheckForUpdates(useSimulationStore.getState().updateInfo.state)) return;
      // El resultado llega por el canal update-status que escucha UpdateModal; un fallo solo deja el estado en «error».
      try {
        api.checkForUpdates().catch(() => {});
      } catch {
        // Un preload antiguo o incompleto no debe romper el temporizador.
      }
    };
    const first = window.setTimeout(check, FIRST_UPDATE_CHECK_DELAY_MS);
    const every = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
