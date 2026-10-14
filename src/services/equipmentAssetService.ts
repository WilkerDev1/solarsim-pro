import { fetchWithSessionRetry } from './syncService';

export interface EquipmentAsset { id: string; name: string; mimeType: string; sizeBytes: number; sha256: string; kind: 'datasheet' | 'image' }
export function validateEquipmentAsset(file: File, kind: EquipmentAsset['kind']) {
  const allowed = kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Formato no admitido. Usa PDF para fichas, o PNG, JPG y WebP para imágenes.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('El archivo debe tener contenido y no superar 8 MB.');
}
export async function uploadEquipmentAsset(server: string, token: string, file: File, kind: EquipmentAsset['kind'], signal?: AbortSignal): Promise<EquipmentAsset> {
  validateEquipmentAsset(file, kind);
  if (!token) throw new Error('Inicia sesión para guardar adjuntos en el servidor.');
  const body = new FormData(); body.append('file', file); body.append('kind', kind);
  const response = await fetchWithSessionRetry(`${server.trim().replace(/\/+$/, '')}/api/equipment-assets`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.asset?.id) throw new Error(data?.error || `No se pudo guardar el adjunto (HTTP ${response.status}).`);
  return data.asset;
}
export async function fetchEquipmentAsset(server: string, token: string, id: string, signal?: AbortSignal): Promise<Blob> {
  if (!token) throw new Error('Inicia sesión para descargar adjuntos del servidor.');
  const response = await fetchWithSessionRetry(`${server.trim().replace(/\/+$/, '')}/api/equipment-assets/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`No se pudo abrir el adjunto (HTTP ${response.status}).`);
  return response.blob();
}
