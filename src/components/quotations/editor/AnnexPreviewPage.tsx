import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { goesSeparate, QUOTATION_SHEET_TEXTS as T } from '../../../../shared/quotations';
import type { QuotationAttachment } from '../../../types/quotation';
import { SHEET_LAYOUT } from '../../../features/quotations/paginate';
import { formatFileSize, pageCountLabel } from '../../../features/quotations/attachments';
import { useAssetImage } from '../../../features/quotations/assetImages';
import { PDFAttachmentStorage } from '../../../services/pdfAttachmentStorage';
import { bytesToDataUrl } from '../../../utils/dataUrl';
import { sniffDocumentFileType, type DocumentFileType } from '../../../../shared/fileSignatures';
import { SANS, SHEET_INK, SHEET_MUTED, SHEET_RULE, SHEET_TINT } from '../sheet/sheetTheme';

/** «Anexo 1 de 3»: numeración propia de las páginas de referencia, aparte de la de la hoja. */
export const annexPreviewLabel = (index: number, total: number): string => `Anexo ${index} de ${total}`;

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

/**
 * Miniatura y tipo real del adjunto. La miniatura: su `thumbnailDataUrl` (en línea o referencia del servidor) o, si sus
 * bytes están en este equipo y son una imagen, la propia imagen. El tipo sale de la firma de esos bytes (PDF o imagen);
 * sin ellos, de la extensión del nombre. Solo estado local: mirar no escribe ni descarga el archivo del servidor.
 */
function useAnnexFile(attachment: QuotationAttachment): { image: string | null; isImage: boolean } {
  const thumbnail = useAssetImage(attachment.thumbnailDataUrl);
  const [local, setLocal] = useState<{ id: string; image: string | null; type: DocumentFileType | null } | null>(null);
  const wantsLocal = !attachment.thumbnailDataUrl;
  useEffect(() => {
    if (!wantsLocal) return;
    let cancelled = false;
    void PDFAttachmentStorage.getAttachment(attachment.id).then((bytes) => {
      if (cancelled || !bytes) return;
      const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
      setLocal({ id: attachment.id, type, image: type && type.startsWith('image/') ? bytesToDataUrl(bytes, type) : null });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attachment.id, wantsLocal]);
  const mine = local?.id === attachment.id ? local : null;
  const isImage = mine?.type ? mine.type.startsWith('image/') : IMAGE_FILE.test(attachment.fileName);
  return { image: thumbnail ?? mine?.image ?? null, isImage };
}

/**
 * Página de referencia de un adjunto «Dentro del PDF» en la vista previa (A4 de 850×1202 px, como la hoja): título,
 * archivo, páginas si se conocen y miniatura si la hay, marcada como vista previa. Lleva `data-quotation-annex-preview`
 * y nunca `data-quotation-page`: la exportación no la rasteriza, fusiona el archivo real (`exportQuotationPdf`).
 */
export const AnnexPreviewPage: React.FC<{
  attachment: QuotationAttachment;
  index: number;
  total: number;
  number: string | null;
  accent: string;
}> = ({ attachment, index, total, number, accent }) => {
  const { image, isImage } = useAnnexFile(attachment);
  const label = annexPreviewLabel(index, total);
  const kind = isImage ? 'Imagen' : 'PDF';
  const meta = [kind, pageCountLabel(attachment.pageCount), formatFileSize(attachment.fileSize)].filter(Boolean).join(' · ');
  return (
    <div
      data-quotation-annex-preview={index}
      aria-label={`${label}: vista previa de «${attachment.title || attachment.fileName}»`}
      style={{
        width: SHEET_LAYOUT.width, height: SHEET_LAYOUT.height, boxSizing: 'border-box', background: '#ffffff', color: SHEET_INK, fontFamily: SANS,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ height: 6, background: accent, flexShrink: 0 }} />
      <div style={{ padding: '40px 56px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: SHEET_MUTED, border: `1.5px dashed ${SHEET_MUTED}`, borderRadius: 999, padding: '6px 14px', lineHeight: 1.3 }}>
          Vista previa · Se añadirá completo al exportar
        </span>
      </div>
      <div style={{ padding: '28px 56px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{attachment.title || attachment.fileName}</div>
        <div style={{ fontSize: 15, color: SHEET_MUTED, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{attachment.fileName}</div>
        <div style={{ fontSize: 14, color: SHEET_MUTED, lineHeight: 1.4 }}>{meta}</div>
        {goesSeparate(attachment) && <div style={{ fontSize: 14, color: SHEET_MUTED, lineHeight: 1.4 }}>También va aparte en el correo.</div>}
      </div>
      <div style={{ flex: '1 1 auto', margin: '32px 56px 40px', border: `2px dashed ${SHEET_RULE}`, borderRadius: 12, background: SHEET_TINT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 0 }}>
        {image ? (
          <img alt={`Miniatura de ${attachment.title || attachment.fileName}`} src={image} className="block h-auto max-h-[760px] w-auto max-w-[640px]" style={{ boxShadow: '0 1px 2px rgba(24,34,48,0.12), 0 8px 24px rgba(24,34,48,0.12)', background: '#ffffff' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: SHEET_MUTED, textAlign: 'center' }}>
            <FileText style={{ width: 72, height: 72 }} strokeWidth={1.25} aria-hidden="true" />
            <div style={{ fontSize: 16, lineHeight: 1.4, maxWidth: 420 }}>
              {kind === 'PDF' ? 'Las páginas del PDF se añaden aquí, completas, al exportar.' : 'La imagen se añade aquí, en una página A4, al exportar.'}
            </div>
          </div>
        )}
      </div>
      <div style={{ height: SHEET_LAYOUT.footer, boxSizing: 'border-box', padding: '0 56px', borderTop: `1px solid ${SHEET_RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10.5, lineHeight: 1.2, color: SHEET_MUTED, flexShrink: 0 }}>
        <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{`${number || T.draftNumber} · ${label}`}</span>
      </div>
    </div>
  );
};
