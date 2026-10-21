import { useMemo } from 'react';
import { useAssetThumbnail } from '../../../features/equipmentPreview/useEquipmentAssetPreview';

/** One catalog image (cached per workspace). A failed or non-image asset stays a neutral placeholder. */
export function EquipmentImagePreview({ id, name }: { id: string; name: string }) {
  const source = useMemo(() => ({ assetId: id, kind: 'image' as const }), [id]);
  const preview = useAssetThumbnail(source, { width: 128 });
  return preview.url && preview.mimeType?.startsWith('image/')
    ? <img src={preview.url} alt={name} className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"/>
    : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-500">Imagen</span>;
}
