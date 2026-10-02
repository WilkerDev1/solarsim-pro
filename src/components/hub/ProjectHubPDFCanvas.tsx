import React, { useState, useRef, useMemo } from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../types';
import { PDF_COLOR_THEMES, PDFColorTheme } from '../../constants/pdfThemes';
import { useSimulationStore } from '../../store/useSimulationStore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFMergeService } from '../../services/pdfMergeService';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { formatProposalDate } from '../../utils/formatDateUtils';

import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Printer,
  Download,
  FileEdit,
  Sliders,
  ChevronDown,
  Loader2,
  Sparkles,
} from 'lucide-react';

// Modular PDF Pages
import { PDFCoverPage } from '../pdf/pages/PDFCoverPage';
import { PDFTableOfContents, TOCItem } from '../pdf/pages/PDFTableOfContents';
import { PDFExecutiveSummaryPage } from '../pdf/pages/PDFExecutiveSummaryPage';
import { PDFAboutUsPage } from '../pdf/pages/PDFAboutUsPage';
import { PDFSolarBenefitsPage } from '../pdf/pages/PDFSolarBenefitsPage';
import { PDFTechnicalIntroPage } from '../pdf/pages/PDFTechnicalIntroPage';
import { PDFProjectDescriptionPage } from '../pdf/pages/PDFProjectDescriptionPage';
import { PDFPage1Energy } from '../pdf/pages/PDFPage1Energy';
import { PDFPage2Quotation } from '../pdf/pages/PDFPage2Quotation';
import { PDFPage3ROI } from '../pdf/pages/PDFPage3ROI';
import { PDFPage4CashFlow } from '../pdf/pages/PDFPage4CashFlow';

interface ProjectHubPDFCanvasProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isDark: boolean;
}

export const ProjectHubPDFCanvas: React.FC<ProjectHubPDFCanvasProps> = ({
  project,
  summary,
  isDark,
}) => {
  const { setActiveView } = useSimulationStore();
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(0.85); // 85% default fits nicely
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  const activeTheme: PDFColorTheme = PDF_COLOR_THEMES[0];

  const currentDateStr = useMemo(() => {
    return formatProposalDate(project?.client?.quoteDate || project?.customization?.quoteDate);
  }, [project?.client?.quoteDate, project?.customization?.quoteDate]);

  const totalPages = 11;

  // Table of Contents Items
  const tocItems: TOCItem[] = useMemo(
    () => [
      {
        number: '1',
        title: 'Cuadro Resumen de Inversión y Retorno',
        subtitle: '1.1 Pipeline Técnico, Beneficio Ley 57-07 y Payback',
        targetPage: 3,
      },
      {
        number: '2',
        title: 'Quiénes Somos & Nuestros Servicios',
        subtitle: '2.1 Por Qué Elegirnos y Pilares de Servicio',
        targetPage: 4,
      },
      {
        number: '3',
        title: 'Beneficios de la Energía Solar',
        subtitle: '3.1 Objetivos e Incentivos Fiscales de la Ley 57-07',
        targetPage: 5,
      },
      {
        number: '4',
        title: '¿Qué es un Sistema Fotovoltaico?',
        subtitle: '4.1 Funcionamiento y Diagrama de Flujo Técnico',
        targetPage: 6,
      },
      {
        number: '5',
        title: 'Descripción del Proyecto & Normativa SIE',
        subtitle: '5.1 Criterios de Dimensionamiento y Resolución SIE-007',
        targetPage: 7,
      },
      {
        number: '6',
        title: 'Análisis de Energía y Balance',
        subtitle: '6.1 Generación Solar Estimada vs Demanda Mensual',
        targetPage: 8,
      },
      {
        number: '7',
        title: 'Presupuesto y Cotización de Sistema',
        subtitle: '7.1 Equipos Tier-1, Inversión y Términos de Garantías',
        targetPage: 9,
      },
      {
        number: '8',
        title: 'Retorno de Inversión y Métricas',
        subtitle: '8.1 Indicadores Financieros VAN, TIR y Payback',
        targetPage: 10,
      },
      {
        number: '9',
        title: 'Flujo de Caja Proyectado a 25 Años',
        subtitle: '9.1 Proyección Anual con Compensación SIE y Ahorro',
        targetPage: 11,
      },
    ],
    []
  );

  // Definition of the 11 sequential pages
  const proposalPages = [
    {
      id: 1,
      title: 'Portada Ejecutiva',
      component: (
        <PDFCoverPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          currentDateStr={currentDateStr}
        />
      ),
    },
    {
      id: 2,
      title: 'Índice de Contenido',
      component: (
        <PDFTableOfContents
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={2}
          totalPages={totalPages}
          tocItems={tocItems}
        />
      ),
    },
    {
      id: 3,
      title: 'Cuadro Resumen Ejecutivo',
      component: (
        <PDFExecutiveSummaryPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={3}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 4,
      title: 'Quiénes Somos & Servicios',
      component: (
        <PDFAboutUsPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={4}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 5,
      title: 'Beneficios Solares & Ley 57-07',
      component: (
        <PDFSolarBenefitsPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={5}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 6,
      title: 'Introducción Técnica FV',
      component: (
        <PDFTechnicalIntroPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={6}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 7,
      title: 'Descripción del Proyecto & Normativa SIE',
      component: (
        <PDFProjectDescriptionPage
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={7}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 8,
      title: 'Análisis de Energía y Balance',
      component: (
        <PDFPage1Energy
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={8}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 9,
      title: 'Presupuesto y Cotización',
      component: (
        <PDFPage2Quotation
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={9}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 10,
      title: 'Retorno de Inversión (ROI)',
      component: (
        <PDFPage3ROI
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={10}
          totalPages={totalPages}
        />
      ),
    },
    {
      id: 11,
      title: 'Flujo de Caja a 25 Años',
      component: (
        <PDFPage4CashFlow
          project={project}
          summary={summary}
          activeTheme={activeTheme}
          showHeadersFooters={true}
          currentDateStr={currentDateStr}
          pageNum={11}
          totalPages={totalPages}
        />
      ),
    },
  ];

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))));
  const handleZoomReset = () => setZoomLevel(0.85);
  const handleFitWidth = () => setZoomLevel(1.0);

  // Jump to specific page
  const handleJumpToPage = (pageNum: number) => {
    const el = document.getElementById(`pdf-page-wrapper-${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Direct High-Resolution Multi-page PDF Export
  const handleExportPDF = async () => {
    if (!pdfContainerRef.current) return;
    setIsExporting(true);
    setExportProgress('Preparando páginas...');

    try {
      const pageElements = pdfContainerRef.current.querySelectorAll<HTMLElement>('.pdf-page');
      if (!pageElements || pageElements.length === 0) {
        setIsExporting(false);
        return;
      }

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = 210;
      const pdfHeight = 297;

      // Sandbox contenedor aislado fuera del flujo de scroll e invisible
      const sandbox = document.createElement('div');
      sandbox.style.position = 'fixed';
      sandbox.style.top = '0px';
      sandbox.style.left = '0px';
      sandbox.style.width = '850px';
      sandbox.style.height = '1202px';
      sandbox.style.overflow = 'hidden';
      sandbox.style.zIndex = '-9999';
      sandbox.style.backgroundColor = '#ffffff';
      sandbox.style.pointerEvents = 'none';
      sandbox.style.boxSizing = 'border-box';
      sandbox.style.margin = '0';
      sandbox.style.padding = '0';
      document.body.appendChild(sandbox);

      for (let i = 0; i < pageElements.length; i++) {
        setExportProgress(`Renderizando página ${i + 1} de ${pageElements.length}...`);
        const pageEl = pageElements[i];

        const clone = pageEl.cloneNode(true) as HTMLElement;
        clone.style.width = '850px';
        clone.style.height = '1202px';
        clone.style.minHeight = '1202px';
        clone.style.maxHeight = '1202px';
        clone.style.margin = '0';
        clone.style.padding = '0';
        clone.style.boxSizing = 'border-box';
        clone.style.overflow = 'hidden';
        clone.style.transform = 'none';
        clone.style.boxShadow = 'none';
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.justifyContent = 'space-between';

        sandbox.innerHTML = '';
        sandbox.appendChild(clone);

        await new Promise((resolve) => setTimeout(resolve, 80));

        const canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 850,
          height: 1202,
          windowWidth: 850,
          windowHeight: 1202,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        canvas.width = 0;
        canvas.height = 0;
      }

      if (document.body.contains(sandbox)) {
        document.body.removeChild(sandbox);
      }

      setExportProgress('Guardando documento...');
      const sanitizedName = (project.client.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Propuesta_${project.client.projectId || 'SP'}_${sanitizedName}.pdf`;

      // Check for attached documents to merge
      const attached = project.customization?.attachedPdfs?.filter((a) => a.enabled) || [];
      if (attached.length > 0) {
        const proposalBuf = pdf.output('arraybuffer');
        const toMerge: { name: string; buffer: ArrayBuffer }[] = [];
        for (const att of attached) {
          const buf = await PDFAttachmentStorage.getAttachment(att.id);
          if (buf) toMerge.push({ name: att.fileName, buffer: buf });
        }
        if (toMerge.length > 0) {
          const merged = await PDFMergeService.mergeProposalWithAttachments(proposalBuf, toMerge);
          PDFMergeService.downloadPdfBytes(merged, filename);
        } else {
          pdf.save(filename);
        }
      } else {
        pdf.save(filename);
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
      window.print();
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const a4Width = 850;
  const a4Height = 1202;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* 🧭 Sticky Document Bar (Zoom & Page Jumper) */}
      <div
        className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 ${
          isDark
            ? 'bg-[#10141f]/95 border-slate-800 text-slate-200'
            : 'bg-white/95 border-slate-200 text-slate-800 shadow-xs'
        } backdrop-blur-md`}
      >
        {/* Left: Page Count & Jump Selector */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-500">Documento:</span>
          <div className="relative">
            <select
              onChange={(e) => handleJumpToPage(Number(e.target.value))}
              className={`text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg border appearance-none cursor-pointer transition-colors ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
              }`}
              defaultValue={1}
            >
              {proposalPages.map((p) => (
                <option key={p.id} value={p.id}>
                  Pág. {p.id}: {p.title}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          <span className="text-xs font-mono font-medium text-slate-400">
            ({totalPages} Páginas A4)
          </span>
        </div>

        {/* Center: Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomOut}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Reducir Zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleZoomReset}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Restablecer Zoom (85%)"
          >
            {Math.round(zoomLevel * 100)}%
          </button>

          <button
            onClick={handleZoomIn}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleFitWidth}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer hidden sm:flex items-center gap-1 ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Ajustar al 100%"
          >
            <Maximize2 className="w-3 h-3" />
            <span>100%</span>
          </button>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Print */}
          <button
            onClick={() => window.print()}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
            }`}
            title="Imprimir propuesta"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>

          {/* Export PDF */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Descargar propuesta completa en PDF"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{exportProgress || 'Exportando...'}</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Descargar PDF</span>
              </>
            )}
          </button>

          {/* Open Full PDF Editor */}
          <button
            onClick={() => setActiveView('pdf-preview')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-amber-400'
                : 'bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-800'
            }`}
            title="Abrir editor completo de propuesta PDF con personalización de textos e imágenes"
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Personalizar PDF</span>
          </button>
        </div>
      </div>

      {/* 📄 Scrollable Paper Canvas */}
      <main
        ref={pdfContainerRef}
        className={`flex-1 overflow-y-auto p-6 md:p-10 flex flex-col items-center gap-10 transition-colors duration-200 ${
          isDark ? 'bg-[#080b11]' : 'bg-slate-200/75'
        }`}
      >
        {proposalPages.map((page) => (
          <div
            key={page.id}
            id={`pdf-page-wrapper-${page.id}`}
            className="flex flex-col items-center transition-all duration-150 shrink-0"
            style={{
              width: `${a4Width * zoomLevel}px`,
              height: `${a4Height * zoomLevel + 36}px`,
            }}
          >
            {/* Page Header Indicator */}
            <div className="mb-2 px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-2 bg-slate-900/10 dark:bg-white/10 text-slate-600 dark:text-slate-400 backdrop-blur-xs select-none">
              <span className="font-mono text-amber-500 font-black">Pág. {page.id}</span>
              <span>•</span>
              <span className="truncate max-w-[300px]">{page.title}</span>
            </div>

            {/* Scaled A4 Document Page */}
            <div
              style={{
                width: `${a4Width}px`,
                height: `${a4Height}px`,
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
              }}
              className="bg-white text-slate-900 shadow-[0_16px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-1 ring-slate-900/10 rounded-xs overflow-hidden shrink-0 select-text"
            >
              {page.component}
            </div>
          </div>
        ))}

        {/* Footer padding */}
        <div className="h-16 shrink-0" />
      </main>
    </div>
  );
};
