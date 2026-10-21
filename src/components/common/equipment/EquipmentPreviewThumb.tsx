import React, { useEffect, useRef, useState } from 'react';
import { BatteryCharging, Cpu, Sun } from 'lucide-react';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { useEquipmentAssetPreview } from '../../../features/equipmentPreview/useEquipmentAssetPreview';
import { selectEquipmentPreviewSource } from '../../../features/equipmentPreview/previewSource';
import { EquipmentPreviewDialog } from './EquipmentPreviewDialog';

export type EquipmentPreviewItem = Pick<SolarEquipmentItem, 'type' | 'displayName' | 'imageAssetIds' | 'imageNames' | 'datasheetAssetId' | 'datasheetName'>;

const TYPE_ICON = { panel: Sun, inverter: Cpu, battery: BatteryCharging } as const;

/** Starts loading only once the element is near the viewport (catalog tables can be long). */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return [ref, visible] as const;
}

/**
 * Equipment icon for tables and selectors: its first image, otherwise the first page of its datasheet,
 * otherwise the type icon. When `interactive`, a click opens the preview dialog.
 */
export function EquipmentPreviewThumb({ item, size = 40, interactive = true, className = '' }: {
  item: EquipmentPreviewItem;
  size?: number;
  interactive?: boolean;
  className?: string;
}) {
  const [ref, visible] = useNearViewport<HTMLSpanElement>();
  const [open, setOpen] = useState(false);
  const preview = useEquipmentAssetPreview(item, { enabled: visible, width: Math.max(96, size * 2) });
  const Icon = TYPE_ICON[item.type] ?? Sun;
  const hasAssets = !!selectEquipmentPreviewSource(item);
  const label = preview.source?.kind === 'datasheet' ? `Ficha técnica de ${item.displayName}` : `Imagen de ${item.displayName}`;
  const face = (
    <span
      ref={ref}
      data-preview-status={preview.status}
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-emerald-400 ${className}`}
    >
      {preview.url
        ? <img src={preview.url} alt={label} className={`h-full w-full ${preview.source?.kind === 'datasheet' ? 'object-cover object-top' : 'object-contain p-0.5'}`} />
        : <Icon aria-hidden="true" className={`h-1/2 w-1/2 ${preview.status === 'loading' ? 'animate-pulse opacity-60' : ''}`} />}
    </span>
  );
  if (!interactive || !hasAssets) return face;
  return (
    <>
      <button
        type="button"
        title="Ver imágenes y ficha técnica"
        aria-label={`Ver imágenes y ficha técnica de ${item.displayName}`}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {face}
      </button>
      {open && <EquipmentPreviewDialog item={item} onClose={() => setOpen(false)} />}
    </>
  );
}
