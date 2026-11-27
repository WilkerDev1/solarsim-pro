import React, { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../types';
import { buildPdfLayout, normalizeSectionOrder } from '../../../utils/pdfLayout';
import { formatProposalDate } from '../../../utils/formatDateUtils';
import { DocumentEditorProvider } from '../../pdf/editor/DocumentEditorContext';
import { renderProposalSection } from '../../pdf/ProposalDocumentPages';
import { documentLayoutView } from '../../pdf/documentLayoutView';

const PAGE_WIDTH = 850;

/**
 * Pestaña «Documento» del visor de la propuesta: las páginas del PDF de esa propuesta, a escala del panel y
 * desplazables, en modo `view` y sin acciones de edición. Se carga en diferido (`React.lazy` en `ProposalViewer`): las
 * páginas y sus gráficos pesan y el editor no las necesita hasta abrir esta pestaña. Solo estado local: nunca escribe.
 */
export const ProposalViewerDocument: React.FC<{ project: ProjectSimulation; summary: FinancialSummaryResult }> = React.memo(({ project, summary }) => {
  const company = useSimulationStore((s) => s.companies.find((c) => c.id === project.companyProfileId));
  const area = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState<number | null>(null);
  // Solo estado local de la vista: escala según el ancho del panel y alto real de las páginas.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const width = area.current?.clientWidth ?? 0;
      if (width > 0) setScale(Math.min(1, Math.max(0.25, (width - 2) / PAGE_WIDTH)));
      if (inner.current) setHeight(inner.current.offsetHeight);
    });
    if (area.current) observer.observe(area.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  const layout = documentLayoutView(project);
  const order = normalizeSectionOrder(project.customization?.sectionOrder);
  const { pageNumbers, footerTotalPages, tocItems } = buildPdfLayout(order, layout.visibility, project.customization?.extraTocItems || [], project.customization?.attachedPdfs || []);
  const currentDateStr = formatProposalDate(project.client?.quoteDate || project.customization?.quoteDate);
  const annexes = (project.customization?.attachedPdfs ?? []).filter((a) => a.enabled).length;
  return (
    <>
      <p className="qe-field-hint pv-doc-hint">
        Vista de solo lectura del documento{annexes ? `; ${annexes === 1 ? 'su anexo se añade' : `sus ${annexes} anexos se añaden`} al exportarlo desde la propuesta` : ''}.
      </p>
      <div ref={area} className="pv-doc-area">
        <div className="pv-doc-frame" style={{ width: PAGE_WIDTH * scale, height: height === null ? undefined : height * scale }}>
          <div ref={inner} className="pv-doc-pages" style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <DocumentEditorProvider project={project} summary={summary} currentDateStr={currentDateStr} company={company} mode="view" writable={false}>
              {order.map((id) => (layout.visibility[id]
                ? renderProposalSection(id, { project, summary, activeTheme: layout.theme, showHeadersFooters: layout.showHeadersFooters, currentDateStr, pageNumbers, totalPages: footerTotalPages, tocItems })
                : null))}
            </DocumentEditorProvider>
          </div>
        </div>
      </div>
    </>
  );
});
ProposalViewerDocument.displayName = 'ProposalViewerDocument';

export default ProposalViewerDocument;
