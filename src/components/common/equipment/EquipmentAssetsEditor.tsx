import { isWriterRole } from '../../../../shared/permissions';
import { EquipmentImagePreview } from './EquipmentImagePreview';
import React, { useEffect, useRef, useState } from 'react';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { fetchEquipmentAsset, uploadEquipmentAsset } from '../../../services/equipmentAssetService';

export function EquipmentAssetsEditor({ item, onChange, disabled, dark, onBusy }: { item: Partial<SolarEquipmentItem>; onChange: (patch: Partial<SolarEquipmentItem>) => void; disabled: boolean; dark: boolean; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); onBusy(false); }; }, [onBusy]);
  const current = useSimulationStore();
  const run = async (operation: (server: string, token: string, signal: AbortSignal, valid: () => boolean) => Promise<void>) => {
    const initial = useSimulationStore.getState();
    const { authToken, currentUser, serverUrl } = initial.syncSettings;
    if (!authToken || !currentUser) { setError('Inicia sesión para guardar o abrir los adjuntos del servidor.'); return; }
    const valid = () => mounted.current && useSimulationStore.getState().sessionGeneration === initial.sessionGeneration;
    controller.current = new AbortController(); setBusy(true); onBusy(true); setError('');
    try { await operation(serverUrl, authToken, controller.current.signal, valid); }
    catch (cause) { if (valid()) setError(cause instanceof Error ? cause.message : 'No se pudo procesar el adjunto.'); }
    finally { if (valid()) { setBusy(false); onBusy(false); } }
  };
  const upload = (file: File | undefined, kind: 'datasheet' | 'image') => {
    if (!file || busy || disabled) return;
    void run(async (server, token, signal, valid) => {
      if (!isWriterRole(useSimulationStore.getState().syncSettings.currentUser?.role || '')) throw new Error('Tu cuenta solo puede consultar adjuntos.');
      const asset = await uploadEquipmentAsset(server, token, file, kind, signal);
      if (!valid()) return;
      if (kind === 'datasheet') onChange({ datasheetAssetId: asset.id, datasheetName: asset.name });
      else if (!(item.imageAssetIds || []).includes(asset.id)) onChange({ imageAssetIds: [...(item.imageAssetIds || []), asset.id], imageNames: [...(item.imageAssetIds || []).map((_, index) => item.imageNames?.[index] || `Imagen ${index + 1}`), asset.name] });
    });
  };
  const download = (id: string, name: string) => void run(async (server, token, signal, valid) => {
    const blob = await fetchEquipmentAsset(server, token, id, signal);
    if (!valid()) return;
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const control = `w-full rounded-lg border p-2 text-sm ${dark ? 'border-zinc-700 bg-zinc-900' : 'border-slate-300 bg-white'}`;
  return <section className={`space-y-3 rounded-xl border p-4 ${dark ? 'border-zinc-700' : 'border-slate-200'}`}>
    <h5 className="font-semibold">Ficha técnica e imágenes</h5><p className={`text-xs ${dark ? "text-zinc-400" : "text-slate-500"}`}>Una ficha por modelo y hasta seis imágenes. El servidor reutiliza archivos idénticos de tu organización; reemplazar la ficha solo cambia este modelo.</p>
    {!current.syncSettings.currentUser && <p className="text-sm text-amber-700">El catálogo local puede editarse sin conexión. Los adjuntos requieren iniciar sesión en el servidor.</p>}
    <label className="block text-xs">{item.datasheetAssetId ? 'Reemplazar ficha técnica' : 'Adjuntar ficha técnica'}<input disabled={disabled || busy || !current.syncSettings.currentUser} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className={control} onChange={e => { upload(e.target.files?.[0], 'datasheet'); e.target.value = ''; }}/></label>
    {item.datasheetAssetId && <div className="flex justify-between gap-3 text-sm"><button type="button" disabled={busy} className={`underline ${dark ? 'text-emerald-300' : 'text-emerald-700'}`} onClick={() => download(item.datasheetAssetId!, item.datasheetName || 'ficha-tecnica.pdf')}>{item.datasheetName || 'Descargar ficha técnica'}</button><button type="button" disabled={disabled || busy} onClick={() => onChange({ datasheetAssetId: undefined, datasheetName: undefined })}>Desvincular</button></div>}
    <label className="block text-xs">Imagen del equipo ({item.imageAssetIds?.length || 0}/6)<input disabled={disabled || busy || !current.syncSettings.currentUser || (item.imageAssetIds?.length || 0) >= 6} type="file" accept="image/jpeg,image/png,image/webp" className={control} onChange={e => { upload(e.target.files?.[0], 'image'); e.target.value = ''; }}/></label>
    {(item.imageAssetIds || []).map((id, index) => <div key={id} className="flex items-center justify-between gap-3 text-sm"><EquipmentImagePreview id={id} name={item.imageNames?.[index] || `Imagen ${index + 1}`}/><button type="button" disabled={busy} className={`underline ${dark ? 'text-emerald-300' : 'text-emerald-700'}`} onClick={() => download(id, item.imageNames?.[index] || 'imagen')}>{item.imageNames?.[index] || `Imagen ${index + 1}`}</button><button type="button" disabled={disabled || busy} onClick={() => onChange({ imageAssetIds: item.imageAssetIds?.filter((_, i) => i !== index), imageNames: item.imageNames?.filter((_, i) => i !== index) })}>Desvincular</button></div>)}
    {busy && <p role="status" className="text-sm">Procesando archivo…</p>}{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
  </section>;
}
