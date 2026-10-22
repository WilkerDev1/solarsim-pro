import { useEffect, useMemo, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { loadEquipmentAssetBlob, loadEquipmentThumbnail, type PreviewSession } from './equipmentPreviewLoader';
import { selectEquipmentPreviewSource, type EquipmentPreviewSource, type PreviewableEquipment } from './previewSource';

export type AssetPreviewStatus = 'none' | 'loading' | 'ready' | 'unavailable';

export interface AssetPreviewState {
  status: AssetPreviewStatus;
  url: string | null;
  mimeType: string | null;
  source: EquipmentPreviewSource | null;
}

/** The current workspace as a preview session; changes when the account, organization or server changes. */
export function usePreviewSession(): PreviewSession {
  const scope = useSimulationStore((state) => state.workspaceScope);
  const serverUrl = useSimulationStore((state) => state.syncSettings.serverUrl);
  const authToken = useSimulationStore((state) => state.syncSettings.authToken);
  return useMemo(() => ({ scope: scope || 'local', serverUrl, authToken }), [scope, serverUrl, authToken]);
}

/** Object URL for a cached blob, revoked when the component unmounts or the source changes. */
function useBlobUrl(load: (() => Promise<Blob | null>) | null, deps: unknown[]): Omit<AssetPreviewState, 'source'> {
  const [state, setState] = useState<Omit<AssetPreviewState, 'source'>>({ status: 'none', url: null, mimeType: null });
  const sessionGeneration = useSimulationStore((s) => s.sessionGeneration);
  useEffect(() => {
    if (!load) { setState({ status: 'none', url: null, mimeType: null }); return; }
    let disposed = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading', url: null, mimeType: null });
    void load().then((blob) => {
      if (disposed || sessionGeneration !== useSimulationStore.getState().sessionGeneration) return;
      if (!blob) { setState({ status: 'unavailable', url: null, mimeType: null }); return; }
      objectUrl = URL.createObjectURL(blob);
      setState({ status: 'ready', url: objectUrl, mimeType: blob.type });
    });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [...deps, sessionGeneration]);
  return state;
}

/** Thumbnail of one asset: the image itself, or the first page when it is a PDF datasheet. */
export function useAssetThumbnail(source: EquipmentPreviewSource | null, options: { enabled?: boolean; width?: number } = {}): AssetPreviewState {
  const session = usePreviewSession();
  const { enabled = true, width = 96 } = options;
  const active = enabled && source;
  const state = useBlobUrl(active ? () => loadEquipmentThumbnail(session, source, width) : null,
    [active ? source.assetId : null, source?.kind, session, width]);
  return { ...state, source };
}

/** Catalog preview of an equipment item: first image, otherwise the first page of its datasheet. */
export function useEquipmentAssetPreview(item: PreviewableEquipment | null | undefined, options: { enabled?: boolean; width?: number } = {}): AssetPreviewState {
  const source = selectEquipmentPreviewSource(item);
  const stable = useMemo(() => source, [source?.assetId, source?.kind]);
  return useAssetThumbnail(stable, options);
}

/** Full original asset (image or PDF) for the preview dialog. */
export function useEquipmentAssetBlob(assetId: string | null | undefined, enabled = true): Omit<AssetPreviewState, 'source'> & { blob: () => Promise<Blob | null> } {
  const session = usePreviewSession();
  const active = enabled && assetId ? assetId : null;
  const load = useMemo(() => (active ? () => loadEquipmentAssetBlob(session, active) : null), [active, session]);
  const state = useBlobUrl(load, [load]);
  return { ...state, blob: load ?? (async () => null) };
}
