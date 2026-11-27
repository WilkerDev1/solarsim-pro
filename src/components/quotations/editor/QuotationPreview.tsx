import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Mail } from 'lucide-react';
import { sheetPageLabel } from '../../../../shared/quotations';
import { SHEET_LAYOUT, paginateQuotation } from '../../../features/quotations/paginate';
import { exportQuotationPdf, quotationPages } from '../../../features/quotations/exportQuotationPdf';
import { QuotationSheet, type QuotationSheetData } from '../sheet/QuotationSheet';
import type { QuotationAttachment } from '../../../types/quotation';
import { skippedAttachmentsMessage } from '../../../features/quotations/attachments';
import { quotationAttachmentResolver, resolveAssetImage } from '../../../features/quotations/assetImages';
import type { QuotationEmailText } from '../../../features/quotations/quotationEmail';
import { QuotationEmailPreview } from './QuotationEmailPreview';

const DEFAULT_SCALE = 0.62;

/** Imagen de la hoja tal como está guardada (en línea o referencia), para resolverla antes de exportar. */
export interface SheetImageSource {
  label: string;
  value: string;
  apply: 'logo' | 'signature' | 'stamp';
}

interface ExportSheet {
  quotation: QuotationSheetData;
  stamp: string | null;
  notice: string | null;
}

export type PreviewView = 'pdf' | 'email';
const VIEWS: { id: PreviewView; label: string; icon: typeof FileText }[] = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'email', label: 'Correo', icon: Mail },
];

/**
 * Vista previa en vivo: «PDF» (la hoja real escalada, una página a la vez) o «Correo» (`QuotationEmailPreview`), y la
 * descarga del PDF en ambas. Para exportar se espera a
 * que lleguen las imágenes (logo, firma y sello), se montan todas las páginas a tamaño real fuera de la vista y se
 * rasterizan con `exportQuotationPdf`, que añade los adjuntos incluidos.
 */
export const QuotationPreview: React.FC<{
  quotation: QuotationSheetData;
  stampImage?: string | null;
  quotationId?: string;
  attachments?: readonly QuotationAttachment[];
  imageSources?: readonly SheetImageSource[];
  /** Vista al abrir (las pruebas dibujan el correo directamente). */
  initialView?: PreviewView;
  /** Lleva al campo «Correo» del cliente; sin él (bloqueada o LECTOR) la vista de correo solo avisa. */
  onGoToClientEmail?: () => void;
}> = ({ quotation, stampImage, quotationId, attachments = [], imageSources = [], initialView = 'pdf', onGoToClientEmail }) => {
  const [view, setView] = useState<PreviewView>(initialView);
  // Texto del correo cambiado para este envío: estado local, se pierde al salir del editor y nunca se guarda.
  const [emailOverrides, setEmailOverrides] = useState<Partial<QuotationEmailText>>({});
  const pageCount = useMemo(() => paginateQuotation(quotation).length, [quotation]);
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [preparing, setPreparing] = useState(false);
  const [exportSheet, setExportSheet] = useState<ExportSheet | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const included = attachments.filter((a) => a.mode === 'include').length;
  const area = useRef<HTMLDivElement>(null);
  const exportRoot = useRef<HTMLDivElement>(null);
  const current = Math.min(page, pageCount - 1);

  useEffect(() => {
    const element = area.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setScale(Math.min(1, Math.max(0.3, width / SHEET_LAYOUT.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  // La exportación corre cuando las páginas a tamaño real ya están montadas; no escribe en el store.
  useEffect(() => {
    if (!exportSheet || !exportRoot.current) return;
    let cancelled = false;
    const list = quotationId ? { list: attachments, resolve: quotationAttachmentResolver(quotationId) } : undefined;
    void exportQuotationPdf(quotationPages(exportRoot.current), quotation.number, list)
      .then(({ skipped }) => { if (!cancelled) setExportNotice([exportSheet.notice, skippedAttachmentsMessage(skipped)].filter(Boolean).join(' ') || null); })
      .catch((error: unknown) => { if (!cancelled) setExportError(error instanceof Error ? error.message : 'No se pudo generar el PDF.'); })
      .finally(() => { if (!cancelled) setExportSheet(null); });
    return () => { cancelled = true; };
  }, [exportSheet]);

  /** Antes de rasterizar espera al logo, la firma y el sello; lo que no llega se avisa en una línea. */
  const startExport = async () => {
    setExportError(null);
    setExportNotice(null);
    setPreparing(true);
    const resolved = await Promise.all(imageSources.map(async (source) => ({ source, image: source.value ? await resolveAssetImage(source.value) : null })));
    const image = (apply: SheetImageSource['apply']) => resolved.find((r) => r.source.apply === apply)?.image ?? null;
    const missing = resolved.filter((r) => r.source.value && !r.image).map((r) => r.source.label);
    setPreparing(false);
    setExportSheet({
      quotation: {
        ...quotation,
        issuer: { ...quotation.issuer, logo: image('logo') ?? quotation.issuer.logo },
        signature: quotation.signature ? { ...quotation.signature, image: image('signature') ?? quotation.signature.image } : quotation.signature,
      },
      stamp: image('stamp') ?? stampImage ?? null,
      notice: missing.length ? `No se pudo cargar ${missing.join(', ')}: el PDF sale sin esa imagen.` : null,
    });
  };
  const busy = preparing || !!exportSheet;

  return (
    <section className="qe-preview-inner" aria-labelledby="qe-preview-title">
      <div className="qe-preview-toolbar">
        <h2 id="qe-preview-title">Vista previa</h2>
        <div className="qe-actions">
          <div className="qe-format-switch" role="tablist" aria-label="Formato de la vista previa">
            {VIEWS.map(({ id: viewId, label, icon: Icon }) => (
              <button key={viewId} type="button" role="tab" id={`qe-view-tab-${viewId}`} aria-selected={view === viewId} aria-controls={view === viewId ? `qe-view-panel-${viewId}` : undefined}
                tabIndex={view === viewId ? 0 : -1} onClick={() => setView(viewId)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const next = view === 'pdf' ? 'email' : 'pdf';
                  setView(next);
                  document.getElementById(`qe-view-tab-${next}`)?.focus();
                }}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          {view === 'pdf' && (
            <div className="qe-pager">
              <button type="button" className="qe-icon-btn" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
              <span aria-live="polite">{sheetPageLabel(current + 1, pageCount)}</span>
              <button type="button" className="qe-icon-btn" aria-label="Página siguiente" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          )}
          <button type="button" className="qe-btn" disabled={busy} aria-busy={busy} onClick={() => void startExport()}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {preparing ? 'Cargando imágenes…' : exportSheet ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
        </div>
      </div>
      {exportError && <p className="qe-field-error" role="alert">{exportError}</p>}
      {exportNotice && <p className="qe-field-hint qe-export-notice" role="status">{exportNotice}</p>}
      {view === 'pdf' ? (
        <div className="qe-view-panel" role="tabpanel" id="qe-view-panel-pdf" aria-labelledby="qe-view-tab-pdf">
          <div ref={area} className="qe-sheet-area">
            <div className="qe-sheet-frame" style={{ width: SHEET_LAYOUT.width * scale, height: SHEET_LAYOUT.height * scale }}>
              <div style={{ width: SHEET_LAYOUT.width, height: SHEET_LAYOUT.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <QuotationSheet quotation={quotation} stampImage={stampImage} onlyPage={current} />
              </div>
            </div>
          </div>
          <p className="qe-field-hint qe-preview-hint">
            El PDF se genera como imagen de cada página.
            {included ? ` ${included === 1 ? 'Se añade 1 adjunto' : `Se añaden ${included} adjuntos`} al final al exportar.` : ''}
          </p>
        </div>
      ) : (
        <div className="qe-view-panel" role="tabpanel" id="qe-view-panel-email" aria-labelledby="qe-view-tab-email">
          <QuotationEmailPreview quotation={quotation} overrides={emailOverrides} onOverridesChange={setEmailOverrides} onGoToClientEmail={onGoToClientEmail} />
        </div>
      )}
      {exportSheet && (
        <div ref={exportRoot} aria-hidden="true" className="qe-export-root">
          <QuotationSheet quotation={exportSheet.quotation} stampImage={exportSheet.stamp} />
        </div>
      )}
    </section>
  );
};
