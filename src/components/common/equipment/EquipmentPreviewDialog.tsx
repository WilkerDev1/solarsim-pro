import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useEquipmentAssetBlob } from '../../../features/equipmentPreview/useEquipmentAssetPreview';
import type { EquipmentPreviewItem } from './EquipmentPreviewThumb';

const MAX_DATASHEET_PAGES = 8;

/** Marks the dialog's portal so dropdowns that close on outside clicks can ignore it. */
export const EQUIPMENT_PREVIEW_ATTRIBUTE = 'data-equipment-preview-dialog';

export function isInsideEquipmentPreview(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === 'function' && !!element.closest(`[${EQUIPMENT_PREVIEW_ATTRIBUTE}]`);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GalleryImage({ assetId, name }: { assetId: string; name: string }) {
  const asset = useEquipmentAssetBlob(assetId);
  if (asset.url && asset.mimeType?.startsWith('image/'))
    return <img src={asset.url} alt={name} className="max-h-[60vh] max-w-full w-auto h-auto rounded-lg border border-slate-200 bg-white object-contain dark:border-zinc-700" />;
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
    {asset.status === 'loading' ? 'Cargando imagen…' : 'Imagen no disponible en este dispositivo.'}
  </p>;
}

function DatasheetPages({ assetId, name }: { assetId: string; name: string }) {
  const asset = useEquipmentAssetBlob(assetId);
  const [pages, setPages] = useState<{ urls: string[]; pageCount: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  useEffect(() => {
    if (asset.status !== 'ready' || asset.mimeType !== 'application/pdf') return;
    let disposed = false;
    let urls: string[] = [];
    setRendering(true);
    void (async () => {
      const blob = await asset.blob();
      if (!blob || disposed) return;
      const { PDFThumbnailService } = await import('../../../services/pdfThumbnailService');
      const rendered = await PDFThumbnailService.renderPages(await blob.arrayBuffer(), 720, MAX_DATASHEET_PAGES).catch(() => ({ pages: [], pageCount: 0 }));
      if (disposed) return;
      urls = rendered.pages.map((page) => URL.createObjectURL(page));
      setPages({ urls, pageCount: rendered.pageCount });
    })().finally(() => { if (!disposed) setRendering(false); });
    return () => { disposed = true; urls.forEach((url) => URL.revokeObjectURL(url)); setPages(null); };
  }, [asset.status, asset.mimeType, asset.url]);

  const download = async () => {
    const blob = await asset.blob();
    if (blob) saveBlob(blob, name);
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h5 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-emerald-500" />Ficha técnica</h5>
        <button type="button" disabled={asset.status !== 'ready'} onClick={() => void download()}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:border-zinc-700">
          <Download className="h-3.5 w-3.5" />Descargar
        </button>
      </div>
      {asset.status === 'loading' || rendering ? <p role="status" className="text-xs text-slate-500 dark:text-zinc-400">Preparando la ficha…</p> : null}
      {asset.status === 'unavailable' && <p className="text-xs text-slate-500 dark:text-zinc-400">La ficha no está disponible en este dispositivo. Inicia sesión en el servidor para descargarla.</p>}
      {asset.url && asset.mimeType?.startsWith('image/') && <img src={asset.url} alt={name} className="max-h-[70vh] max-w-full w-auto h-auto rounded-lg border border-slate-200 bg-white dark:border-zinc-700" />}
      {pages?.urls.map((url, index) => (
        <img key={url} src={url} alt={`${name}, página ${index + 1}`} className="max-w-full w-auto h-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-zinc-700" />
      ))}
      {pages && pages.pageCount > pages.urls.length && <p className="text-xs text-slate-500 dark:text-zinc-400">
        Se muestran {pages.urls.length} de {pages.pageCount} páginas. Descarga la ficha para verla completa.
      </p>}
    </section>
  );
}

/** Gallery of the equipment images and the pages of its datasheet, with download. */
export function EquipmentPreviewDialog({ item, onClose }: { item: EquipmentPreviewItem; onClose: () => void }) {
  const dark = useSimulationStore((state) => state.sidebarTheme === 'dark');
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('keydown', keyboard, true); previous?.focus(); };
  }, [onClose]);
  const images = (item.imageAssetIds || []).filter(Boolean);
  return createPortal(
    <div className={dark ? 'dark' : ''} {...{ [EQUIPMENT_PREVIEW_ATTRIBUTE]: '' }}>
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-label={`Vista previa de ${item.displayName}`} onClick={(event) => event.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-[#2e2e38] dark:bg-[#181820] dark:text-zinc-100">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-[#282832]">
            <h4 className="text-sm font-bold">{item.displayName}</h4>
            <button type="button" aria-label="Cerrar vista previa" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
          </header>
          <div className="space-y-6 overflow-y-auto p-4">
            {images.length > 0 && <section className="space-y-3">
              <h5 className="text-sm font-semibold">Imágenes ({images.length})</h5>
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((id, index) => <GalleryImage key={id} assetId={id} name={item.imageNames?.[index] || `Imagen ${index + 1}`} />)}
              </div>
            </section>}
            {item.datasheetAssetId && <DatasheetPages assetId={item.datasheetAssetId} name={item.datasheetName || `Ficha técnica - ${item.displayName}.pdf`} />}
            {!images.length && !item.datasheetAssetId && <p className="text-sm text-slate-500 dark:text-zinc-400">Este equipo no tiene imágenes ni ficha técnica.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
