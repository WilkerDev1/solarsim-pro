import React, { useState, useMemo } from 'react';
import { ProjectSimulation } from '../../../types';
import { calculateProjectFinancialSummary } from '../../../engine/financeEngine';
import { PDF_COLOR_THEMES } from '../../../constants/pdfThemes';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Printer,
  Sparkles,
} from 'lucide-react';

// Pages
import { PDFCoverPage } from '../../pdf/pages/PDFCoverPage';
import { PDFExecutiveSummaryPage } from '../../pdf/pages/PDFExecutiveSummaryPage';
import { PDFPage1Energy } from '../../pdf/pages/PDFPage1Energy';
import { PDFPage2Quotation } from '../../pdf/pages/PDFPage2Quotation';
import { PDFPage3ROI } from '../../pdf/pages/PDFPage3ROI';
import { PDFPage4CashFlow } from '../../pdf/pages/PDFPage4CashFlow';
import { PDFAboutUsPage } from '../../pdf/pages/PDFAboutUsPage';
import { PDFSolarBenefitsPage } from '../../pdf/pages/PDFSolarBenefitsPage';
import { PDFTechnicalIntroPage } from '../../pdf/pages/PDFTechnicalIntroPage';
import { PDFProjectDescriptionPage } from '../../pdf/pages/PDFProjectDescriptionPage';

interface HubPDFPreviewTabProps {
  project: ProjectSimulation;
}

export const HubPDFPreviewTab: React.FC<HubPDFPreviewTabProps> = ({ project }) => {
  const { setActiveView } = useSimulationStore();
  const summary = useMemo(() => calculateProjectFinancialSummary(project), [project]);
  const activeTheme = PDF_COLOR_THEMES[0];
  const currentDateStr = useMemo(
    () =>
      new Date().toLocaleDateString('es-DO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(0.75); // 75% default for preview

  const pages = [
    { id: 1, title: '1. Portada Ejecutiva', component: <PDFCoverPage project={project} summary={summary} activeTheme={activeTheme} currentDateStr={currentDateStr} /> },
    { id: 2, title: '2. Cuadro Resumen Ejecutivo', component: <PDFExecutiveSummaryPage project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={2} totalPages={10} /> },
    { id: 3, title: '3. Presentación & Servicios', component: <PDFAboutUsPage project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={3} totalPages={10} /> },
    { id: 4, title: '4. Beneficios Solares & Ley 57-07', component: <PDFSolarBenefitsPage project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={4} totalPages={10} /> },
    { id: 5, title: '5. Introducción Técnica FV', component: <PDFTechnicalIntroPage project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={5} totalPages={10} /> },
    { id: 6, title: '6. Alcance y Normativas', component: <PDFProjectDescriptionPage project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={6} totalPages={10} /> },
    { id: 7, title: '7. Análisis Energético & Balance', component: <PDFPage1Energy project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={7} totalPages={10} /> },
    { id: 8, title: '8. Cotización & Equipamiento', component: <PDFPage2Quotation project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={8} totalPages={10} /> },
    { id: 9, title: '9. Retorno de Inversión (ROI)', component: <PDFPage3ROI project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={9} totalPages={10} /> },
    { id: 10, title: '10. Flujo de Caja 25 Años', component: <PDFPage4CashFlow project={project} summary={summary} activeTheme={activeTheme} showHeadersFooters={true} currentDateStr={currentDateStr} pageNum={10} totalPages={10} /> },
  ];

  const handlePrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage((p) => Math.min(pages.length, p + 1));

  return (
    <div className="flex flex-col gap-4 select-none animate-in fade-in duration-200">
      {/* 🧭 Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#161b22] border border-[#30363d]">
        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <button
            onClick={handleNext}
            disabled={currentPage === pages.length}
            className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            title="Página siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs text-zinc-400 ml-2">
            Página <span className="font-bold text-white">{currentPage}</span> de {pages.length}
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1117] border border-[#30363d]">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="Reducir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.2, Number((z + 0.1).toFixed(2))))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(0.75)}
              className="p-1 text-zinc-400 hover:text-white text-[10px] font-semibold border-l border-[#30363d] pl-1.5"
              title="Ajuste automático"
            >
              Reset
            </button>
          </div>

          {/* Full PDF Editor Button */}
          <button
            onClick={() => setActiveView('pdf-preview')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir en Editor PDF & Exportar</span>
          </button>
        </div>
      </div>

      {/* 📄 PDF Page Canvas Area */}
      <div className="w-full overflow-x-auto flex justify-center py-6 bg-[#0a0d12] rounded-2xl border border-[#21262d] min-h-[600px] shadow-inner">
        <div
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="shadow-2xl rounded-sm overflow-hidden"
        >
          {pages[currentPage - 1].component}
        </div>
      </div>
    </div>
  );
};
