import { equipmentPreviewCache, previewCacheKey, type EquipmentPreviewCache } from '../../services/equipmentPreviewCache';
import { fetchEquipmentAsset } from '../../services/equipmentAssetService';
import { sniffAssetMimeType, type EquipmentPreviewSource } from './previewSource';

/** Who is asking: the workspace scope keys the cache, the credentials only reach the server request. */
export interface PreviewSession {
  scope: string;
  serverUrl: string;
  authToken: string | null;
}

export const ASSET_FETCH_TIMEOUT_MS = 15_000;

/** Server download with a hard timeout; the bytes are re-typed from their content, never from Content-Type. */
export async function fetchAssetBlob(session: PreviewSession, assetId: string, fetchAsset = fetchEquipmentAsset): Promise<Blob | null> {
  if (!session.authToken) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSET_FETCH_TIMEOUT_MS);
  try {
    const blob = await fetchAsset(session.serverUrl, session.authToken, assetId, controller.signal);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = sniffAssetMimeType(bytes);
    return type ? new Blob([bytes], { type }) : null;
  } catch (error) {
    // A timeout is a failure worth remembering; only caller cancellations are not.
    if (controller.signal.aborted) throw new Error('La descarga del adjunto superó el tiempo límite.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const sourceKey = (session: PreviewSession, assetId: string) => previewCacheKey(session.scope, assetId, 'source');
export const thumbKey = (session: PreviewSession, assetId: string, width: number) => previewCacheKey(session.scope, assetId, `thumb@${width}`);

/** Original asset bytes (typed by content). Without a session only what is already cached is returned. */
export function loadEquipmentAssetBlob(session: PreviewSession, assetId: string, cache: EquipmentPreviewCache = equipmentPreviewCache): Promise<Blob | null> {
  const key = sourceKey(session, assetId);
  if (!session.authToken) return cache.get(key);
  return cache.load(key, () => fetchAssetBlob(session, assetId));
}

async function downscaleImage(blob: Blob, width: number): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= width) { bitmap.close(); return blob; }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); return blob; }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const scaled = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    canvas.width = 0;
    canvas.height = 0;
    return scaled ?? blob;
  } catch {
    return blob;
  }
}

/** Small JPEG of an image, or of the first datasheet page. A source declared as image must contain an image. */
export function loadEquipmentThumbnail(session: PreviewSession, source: EquipmentPreviewSource, width: number, cache: EquipmentPreviewCache = equipmentPreviewCache): Promise<Blob | null> {
  const key = thumbKey(session, source.assetId, width);
  const render = async () => {
    const original = await loadEquipmentAssetBlob(session, source.assetId, cache);
    if (!original) return null;
    if (original.type === 'application/pdf') {
      if (source.kind === 'image') return null;
      const { PDFThumbnailService } = await import('../../services/pdfThumbnailService');
      return PDFThumbnailService.renderFirstPage(await original.arrayBuffer(), width);
    }
    return downscaleImage(original, width);
  };
  return cache.load(key, render);
}

/** Seeds the cache with bytes this device already has (e.g. a file just uploaded), so previews skip the download. */
export async function seedEquipmentAssetBlob(session: PreviewSession, assetId: string, blob: Blob, cache: EquipmentPreviewCache = equipmentPreviewCache): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = sniffAssetMimeType(bytes);
  if (type) await cache.put(sourceKey(session, assetId), new Blob([bytes], { type }));
}
