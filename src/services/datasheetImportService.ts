import { isWriterRole } from '../../shared/permissions';
import { useSimulationStore } from '../store/useSimulationStore';
import type { ExtractedDatasheetData } from '../types/equipment';
import { planDatasheetImport } from '../utils/datasheetImport';
import { uploadEquipmentAsset } from './equipmentAssetService';
import { datasheetFileName } from '../utils/proposalDatasheets';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 6;

export interface DatasheetImportReceipt {
  created: number;
  updated: number;
  ids: string[];
  session: number;
  server: string;
  userId?: string;
  organizationId?: string;
  attachments: Record<string, string | undefined>;
}

/** Commit reviewed models before any network I/O. The store persists its sync queue. */
export function saveDatasheetLocally(data: ExtractedDatasheetData): DatasheetImportReceipt {
  const live = useSimulationStore.getState();
  const user = live.syncSettings.currentUser;
  const server = live.syncSettings.serverUrl.trim().replace(/\/+$/, '');
  if (user && !isWriterRole(user.role))
    throw new Error('Tu cuenta solo puede consultar el catálogo.');
  const plan = planDatasheetImport(data, live.equipmentCatalog);
  for (const entry of plan.updates) {
    const item = live.equipmentCatalog.find(item => item.id === entry.id)!;
    if (user && ((item.organizationId && item.organizationId !== user.organizationId) ||
      (item.syncServerUrl && item.syncServerUrl.trim().replace(/\/+$/, '') !== server)))
      throw new Error('Una coincidencia pertenece a otro ámbito. Guarda un modelo independiente con un nombre diferente.');
  }
  for (const entry of plan.updates) live.updateEquipmentItem(entry.id, entry.patch);
  if (plan.creates.length) live.addEquipmentBatch(plan.creates.map(entry => entry.item));
  const fresh = useSimulationStore.getState();
  const changed = plan.updates.every(entry => fresh.equipmentCatalog.some(item => item.id === entry.id &&
    Object.entries(entry.patch).every(([key, value]) => item[key as keyof typeof item] === value))) &&
    plan.creates.every(entry => fresh.equipmentCatalog.some(item => item.id === entry.item.id));
  if (!changed) throw new Error(fresh.equipmentSyncFeedback || 'No se pudieron guardar todos los equipos. Revisa el catálogo antes de reintentar.');
  const ids = [...plan.updates.map(entry => entry.id), ...plan.creates.map(entry => entry.item.id)];
  return {
    created: plan.creates.length, updated: plan.updates.length, ids,
    session: live.sessionGeneration, server, userId: user?.id, organizationId: user?.organizationId,
    attachments: Object.fromEntries(ids.map(id => [id, fresh.equipmentCatalog.find(item => item.id === id)?.datasheetAssetId])),
  };
}

/** Retrying the optional attachment never imports models again or crosses a session. */
export async function attachImportedDatasheet(receipt: DatasheetImportReceipt, file: File, signal: AbortSignal) {
  const ensureCurrent = () => {
    signal.throwIfAborted();
    const state = useSimulationStore.getState();
    const user = state.syncSettings.currentUser;
    if (state.sessionGeneration !== receipt.session || user?.id !== receipt.userId ||
      user?.organizationId !== receipt.organizationId ||
      state.syncSettings.serverUrl.trim().replace(/\/+$/, '') !== receipt.server)
      throw new Error('La sesión cambió. Los equipos guardados permanecen en su espacio original.');
    if (!user || !state.syncSettings.authToken) throw new Error('Inicia sesión para adjuntar la ficha al servidor.');
    if (!isWriterRole(user.role)) throw new Error('Tu cuenta solo puede consultar el catálogo.');
    for (const id of receipt.ids) {
      const item = state.equipmentCatalog.find(item => item.id === id);
      if (!item || item.organizationId !== receipt.organizationId ||
        item.syncServerUrl?.trim().replace(/\/+$/, '') !== receipt.server ||
        item.datasheetAssetId !== receipt.attachments[id])
        throw new Error('Un equipo o su adjunto cambió. Adjunta la ficha desde la edición del equipo.');
    }
    return state;
  };
  const state = ensureCurrent();
  // A scanned photo is an equipment image: it previews in the catalog but never becomes a PDF annex.
  const kind = IMAGE_TYPES.includes(file.type) ? 'image' : 'datasheet';
  const asset = await uploadEquipmentAsset(receipt.server, state.syncSettings.authToken!, file, kind, signal);
  const current = ensureCurrent();
  for (const id of receipt.ids) {
    const item = current.equipmentCatalog.find(item => item.id === id)!;
    if (kind === 'datasheet') {
      // The server keeps the first upload's name for identical files; each model names it after itself.
      current.updateEquipmentItem(id, { datasheetAssetId: asset.id, datasheetName: datasheetFileName(item.displayName, file.type) });
    } else if (!(item.imageAssetIds || []).includes(asset.id)) {
      if ((item.imageAssetIds?.length || 0) >= MAX_IMAGES) continue; // reported below as not linked
      const ids = item.imageAssetIds || [];
      current.updateEquipmentItem(id, { imageAssetIds: [...ids, asset.id], imageNames: [...ids.map((_, index) => item.imageNames?.[index] || `Imagen ${index + 1}`), item.displayName] });
    }
  }
  const linked = (item: { datasheetAssetId?: string; imageAssetIds?: string[] }) =>
    kind === 'datasheet' ? item.datasheetAssetId === asset.id : (item.imageAssetIds || []).includes(asset.id);
  const unlinked = receipt.ids.map(id => useSimulationStore.getState().equipmentCatalog.find(item => item.id === id)).filter(item => !item || !linked(item));
  // A full gallery is reported, so the scanner keeps the photo pending instead of claiming it was attached.
  const full = unlinked.find(item => kind === 'image' && (item?.imageAssetIds?.length || 0) >= MAX_IMAGES);
  if (full) throw new Error(`${full.displayName} ya tiene ${MAX_IMAGES} imágenes. Quita una en el catálogo y vuelve a intentar.`);
  if (unlinked.length) throw new Error('No se pudo vincular el archivo a todos los equipos. Revisa sus adjuntos en el catálogo.');
}
