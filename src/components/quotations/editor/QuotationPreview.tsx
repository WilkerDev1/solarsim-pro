import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { sheetPageLabel } from '../../../../shared/quotations';
import { SHEET_LAYOUT, paginateQuotation } from '../../../features/quotations/paginate';
import { exportQuotationPdf, quotationPages } from '../../../features/quotations/exportQuotationPdf';
import { QuotationSheet, type QuotationSheetData } from '../sheet/QuotationSheet';

const DEFAULT_SCALE = 0.62;

/**
 * Vista previa en vivo: la hoja real escalada, una página a la vez, y la descarga del PDF. Para exportar se montan
 * todas las páginas a tamaño real fuera de la vista y se rasterizan con `exportQuotationPdf`.
 */
export const QuotationPreview: React.FC<{ quotation: QuotationSheetData; stampImage?: string | null }> = ({ quotation, stampImage }) => {
  const pageCount = useMemo(() => paginateQuotation(quotation).length, [quotation]);
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
  }, []);

  // La exportación corre cuando las páginas a tamaño real ya están montadas; no escribe en el store.
  useEffect(() => {
    if (!exporting || !exportRoot.current) return;
    let cancelled = false;
    void exportQuotationPdf(quotationPages(exportRoot.current), quotation.number)
      .catch((error: unknown) => { if (!cancelled) setExportError(error instanceof Error ? error.message : 'No se pudo generar el PDF.'); })
      .finally(() => { if (!cancelled) setExporting(false); });
    return () => { cancelled = true; };
  }, [exporting]);

  return (
    <section className="qe-preview-inner" aria-labelledby="qe-preview-title">
      <div className="qe-preview-toolbar">
        <h2 id="qe-preview-title">Vista previa</h2>
        <div className="qe-actions">
          <div className="qe-pager">
            <button type="button" className="qe-icon-btn" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <span aria-live="polite">{sheetPageLabel(current + 1, pageCount)}</span>
            <button type="button" className="qe-icon-btn" aria-label="Página siguiente" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <button type="button" className="qe-btn" disabled={exporting} aria-busy={exporting} onClick={() => { setExportError(null); setExporting(true); }}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
        </div>
      </div>
      {exportError && <p className="qe-field-error" role="alert">{exportError}</p>}
      <div ref={area} className="qe-sheet-area">
        <div className="qe-sheet-frame" style={{ width: SHEET_LAYOUT.width * scale, height: SHEET_LAYOUT.height * scale }}>
          <div style={{ width: SHEET_LAYOUT.width, height: SHEET_LAYOUT.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <QuotationSheet quotation={quotation} stampImage={stampImage} onlyPage={current} />
          </div>
        </div>
      </div>
      <p className="qe-field-hint qe-preview-hint">El PDF se genera como imagen de cada página.</p>
      {exporting && (
        <div ref={exportRoot} aria-hidden="true" className="qe-export-root">
          <QuotationSheet quotation={quotation} stampImage={stampImage} />
        </div>
      )}
    </section>
  );
};
