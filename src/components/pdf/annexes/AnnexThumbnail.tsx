import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { AttachedPDFDocument } from '../../../types';
import { equipmentPreviewCache, previewCacheKey } from '../../../services/equipmentPreviewCache';
import { PDFAttachmentStorage } from '../../../services/pdfAttachmentStorage';
import { useAssetThumbnail } from '../../../features/equipmentPreview/useEquipmentAssetPreview';
import { annexAssetId } from '../../../services/proposalAttachmentResolver';

const WIDTH = 96;

/** First page of an annex stored on this device, cached like equipment previews (never written into the proposal). */
function useLocalAnnexThumbnail(attachmentId: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let objectUrl: string | null = null;
    void equipmentPreviewCache.load(previewCacheKey('annex', attachmentId, `thumb@${WIDTH}`), async () => {
      const bytes = await PDFAttachmentStorage.getAttachment(attachmentId);
      if (!bytes) return null;
      const { PDFThumbnailService } = await import('../../../services/pdfThumbnailService');
      return PDFThumbnailService.renderFirstPage(bytes, WIDTH);
    }).then((blob) => {
      if (disposed || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(null); };
  }, [attachmentId, enabled]);
  return url;
}

/** Page-1 preview: catalog asset preview, else local bytes, else a thumbnail saved by older versions. */
export function AnnexThumbnail({ doc }: { doc: AttachedPDFDocument }) {
  const assetId = annexAssetId(doc);
  const source = useMemo(() => (assetId ? { assetId, kind: 'datasheet' as const } : null), [assetId]);
  const catalog = useAssetThumbnail(source, { width: WIDTH });
  const local = useLocalAnnexThumbnail(doc.id, !doc.thumbnailDataUrl && catalog.status !== 'ready');
  const url = catalog.url || local || doc.thumbnailDataUrl || null;
  return (
    <div className="relative w-11 h-15 rounded-lg overflow-hidden border border-emerald-500/30 bg-black/40 shrink-0 shadow-xs group-hover:border-emerald-400 transition-all flex items-center justify-center">
      {url ? (
        <img src={url} alt={doc.title} className="w-full h-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-950/20 text-emerald-400">
          <FileText className="w-5 h-5" />
          <span className="text-[7.5px] font-mono font-bold mt-0.5">PDF</span>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-[2px] text-[7.5px] font-mono text-center text-zinc-300 py-0.5 leading-none">
        Pág 1
      </div>
    </div>
  );
}
