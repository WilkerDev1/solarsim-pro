import { useEffect, useState } from 'react';
import { fetchEquipmentAsset } from '../../../services/equipmentAssetService';
import { useSimulationStore } from '../../../store/useSimulationStore';

export function EquipmentImagePreview({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const session = useSimulationStore(state => state.sessionGeneration);
  useEffect(() => {
    let disposed = false, objectUrl: string | undefined;
    const abort = new AbortController();
    const state = useSimulationStore.getState();
    setUrl(null);
    if (state.syncSettings.authToken) {
      void fetchEquipmentAsset(state.syncSettings.serverUrl, state.syncSettings.authToken, id, abort.signal).then(blob => {
        if (disposed || session !== useSimulationStore.getState().sessionGeneration || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      }).catch(() => { /* Download action reports errors; a failed preview remains neutral. */ });
    }
    return () => { disposed = true; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, session]);
  return url ? <img src={url} alt={name} className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"/> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-500">Imagen</span>;
}
