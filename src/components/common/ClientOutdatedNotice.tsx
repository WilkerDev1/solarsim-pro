import React, { useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { getClientOutdated, isServerBlocked, subscribeClientOutdated } from '../../services/clientVersionGate';
import { SyncService } from '../../services/syncService';

interface ViewProps {
  /** Versión mínima que exige la API; `null` si no la informó. */
  minVersion: string | null;
  onUpdate: () => void;
}

/** Aviso fijo cuando la API rechazó esta versión (426): la sincronización queda detenida, el trabajo local no. */
export const ClientOutdatedNoticeView: React.FC<ViewProps> = ({ minVersion, onUpdate }) => (
  <div role="alert" className="fixed bottom-4 left-1/2 z-40 flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-lg dark:border-amber-700/60 dark:bg-amber-950/80 dark:text-amber-200">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="m-0 font-semibold">Actualiza SolarSim para seguir sincronizando</p>
      <p className="m-0 mt-1">
        {minVersion ? `Este servidor exige la versión ${minVersion} o superior. ` : 'Este servidor exige una versión más reciente. '}
        Tu trabajo se guarda en este equipo y se enviará cuando actualices.
      </p>
      <button type="button" onClick={onUpdate} className="mt-3 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500">
        Buscar actualización
      </button>
    </div>
  </div>
);

export const ClientOutdatedNotice: React.FC = () => {
  const outdated = useSyncExternalStore(subscribeClientOutdated, getClientOutdated, getClientOutdated);
  const { serverUrl, authToken, openUpdateModal, setUpdateInfo } = useSimulationStore(useShallow((s) => ({ serverUrl: s.syncSettings.serverUrl, authToken: s.syncSettings.authToken, openUpdateModal: s.openUpdateModal, setUpdateInfo: s.setUpdateInfo })));
  if (!outdated || !authToken || !isServerBlocked(SyncService.cleanUrl(serverUrl))) return null;
  const onUpdate = () => {
    openUpdateModal();
    const updater = window.electronAPI;
    if (typeof updater?.checkForUpdates !== 'function') return;
    setUpdateInfo({ state: 'checking' });
    updater.checkForUpdates().then((result) => {
      if (!result.success) setUpdateInfo({ state: 'error', error: result.error || 'No se pudo buscar la actualización.' });
    }).catch((error: unknown) => setUpdateInfo({ state: 'error', error: error instanceof Error ? error.message : 'No se pudo buscar la actualización.' }));
  };
  return <ClientOutdatedNoticeView minVersion={outdated.minVersion} onUpdate={onUpdate} />;
};
