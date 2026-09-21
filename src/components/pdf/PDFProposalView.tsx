import React, { useRef, useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../constants/pdfThemes';
import { PDFMergeService } from '../../services/pdfMergeService';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { PDFSectionId, DEFAULT_PDF_SECTION_ORDER } from '../../constants/pdfSections';

// Modular Page Components
import { PDFSidebarControls } from './controls/PDFSidebarControls';
import { PDFCoverPage } from './pages/PDFCoverPage';
import { PDFTableOfContents, TOCItem } from './pages/PDFTableOfContents';
import { PDFExecutiveSummaryPage } from './pages/PDFExecutiveSummaryPage';
import { PDFAboutUsPage } from './pages/PDFAboutUsPage';
import { PDFSolarBenefitsPage } from './pages/PDFSolarBenefitsPage';
import { PDFTechnicalIntroPage } from './pages/PDFTechnicalIntroPage';
import { PDFProjectDescriptionPage } from './pages/PDFProjectDescriptionPage';
import { PDFPage1Energy } from './pages/PDFPage1Energy';
import { PDFPage2Quotation } from './pages/PDFPage2Quotation';
import { PDFPage3ROI } from './pages/PDFPage3ROI';
import { PDFPage4CashFlow } from './pages/PDFPage4CashFlow';
import { PDFPage5CostMatrix } from './pages/PDFPage5CostMatrix';

import { Trash2, RotateCcw } from 'lucide-react';

export const PDFProposalView: React.FC = () => {
  const {
    getActiveProject,
    getFinancialSummary,
    updateClient,
    updateSpecs,
    updateDocumentCustomization,
    sidebarTheme,
    openShareModal,
    restoreProject,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const activeProjectId = useSimulationStore((s) => s.activeProjectId);
  const activeProjectFromStore = useSimulationStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId)
  );
  const project = activeProjectFromStore || getActiveProject();
  const summary = getFinancialSummary();
  const pdfRef = useRef<HTMLDivElement>(null);

  // Document Toggles (Intro & Presentation)
  const [showCover, setShowCover] = useState(true); // Portada Ejecutiva
  const [showTableOfContents, setShowTableOfContents] = useState(true); // Índice de Contenido
  const [showExecutiveSummary, setShowExecutiveSummary] = useState(true); // Cuadro Resumen Ejecutivo
  const [showAboutUs, setShowAboutUs] = useState(true); // 1. ¿Quiénes Somos? & Servicios
  const [showBenefits, setShowBenefits] = useState(true); // 2. Beneficios Solares & Ley 57-07
  const [showTechIntro, setShowTechIntro] = useState(true); // 3. ¿Qué es FV? & Flujo Técnico
  const [showProjectDescription, setShowProjectDescription] = useState(true); // 4. Resumen & Normativa SIE

  // Document Toggles (Core Technical & Financial)
  const [showPage1, setShowPage1] = useState(true); // 5. Análisis de Energía y Balance
  const [showPageQuotation, setShowPageQuotation] = useState(true); // 6. Cotización de Sistema Fotovoltaico
  const [showPage2, setShowPage2] = useState(true); // 7. Retorno de Inversión y Métricas
  const [showPage3, setShowPage3] = useState(true); // 8. Flujo de Caja 25 Años
  const [showPageCostMatrix, setShowPageCostMatrix] = useState(false); // 9. Costos Internos (Confidencial)
  const [showHeadersFooters, setShowHeadersFooters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Active Color Theme
  const [activeTheme, setActiveTheme] = useState<PDFColorTheme>(PDF_COLOR_THEMES[0]);

  // Active Tab in Sidebar ("Secciones" vs "Modo Edición")
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'edit'>('sections');

  // Live Inline Editing Mode
  const [isEditMode, setIsEditMode] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!pdfRef.current) return;
    setIsExporting(true);

    try {
      const pageElements = pdfRef.current.querySelectorAll<HTMLElement>('.pdf-page');
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

      // Sandbox contenedor aislado fuera del flujo de scroll e invisible al usuario
      const sandbox = document.createElement('div');
      sandbox.style.position = 'fixed';
      sandbox.style.top = '0px';
      sandbox.style.left = '0px';
      sandbox.style.width = '850px';
      sandbox.style.height = '1202px';
      sandbox.style.overflow = 'hidden';
      sandbox.style.zIndex = '-9999'; // Invisible detrás del UI
      sandbox.style.backgroundColor = '#ffffff';
      sandbox.style.pointerEvents = 'none';
      sandbox.style.boxSizing = 'border-box';
      sandbox.style.margin = '0';
      sandbox.style.padding = '0';
      document.body.appendChild(sandbox);

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        // Clonar la página y montarla en el sandbox limpio
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

        // Delay para estabilización completa de layout, imágenes y fuentes
        await new Promise((resolve) => setTimeout(resolve, 100));

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

        // Explicitly release canvas pixel buffer from memory
        canvas.width = 0;
        canvas.height = 0;
      }

      // Limpiar sandbox del DOM
      if (document.body.contains(sandbox)) {
        document.body.removeChild(sandbox);
      }

      const sanitizedClientName = (project.client.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Propuesta_SolarSim_${sanitizedClientName}.pdf`;

      // Comprobar si hay documentos externos adjuntos para fusionar (leído fresco del store)
      const currentProj = useSimulationStore.getState().projects.find((p) => p.id === project.id) || project;
      const enabledAttachments = currentProj.customization?.attachedPdfs?.filter((att) => att.enabled) || [];

      if (enabledAttachments.length > 0) {
        const proposalBuffer = pdf.output('arraybuffer');
        const attachmentsToMerge: { name: string; buffer: ArrayBuffer }[] = [];

        for (const att of enabledAttachments) {
          const buf = await PDFAttachmentStorage.getAttachment(att.id);
          if (buf) {
            attachmentsToMerge.push({ name: att.fileName, buffer: buf });
          }
        }

        if (attachmentsToMerge.length > 0) {
          const mergedBytes = await PDFMergeService.mergeProposalWithAttachments(proposalBuffer, attachmentsToMerge);
          PDFMergeService.downloadPdfBytes(mergedBytes, filename);
        } else {
          pdf.save(filename);
        }
      } else {
        pdf.save(filename);
      }
    } catch (err) {
      console.error('Error generating multi-page PDF:', err);
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });

  // Effective Section Order
  const effectiveSectionOrder: PDFSectionId[] = useMemo(() => {
    const saved = project?.customization?.sectionOrder;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const validSaved = saved.filter((id): id is PDFSectionId =>
        DEFAULT_PDF_SECTION_ORDER.includes(id as PDFSectionId)
      );
      const missing = DEFAULT_PDF_SECTION_ORDER.filter((id) => !validSaved.includes(id));
      return [...validSaved, ...missing];
    }
    return DEFAULT_PDF_SECTION_ORDER;
  }, [project?.customization?.sectionOrder]);

  const sectionVisibility: Record<PDFSectionId, boolean> = {
    cover: showCover,
    tableOfContents: showTableOfContents,
    executiveSummary: showExecutiveSummary,
    aboutUs: showAboutUs,
    benefits: showBenefits,
    techIntro: showTechIntro,
    projectDescription: showProjectDescription,
    energy: showPage1,
    quotation: showPageQuotation,
    roi: showPage2,
    cashFlow: showPage3,
    costMatrix: showPageCostMatrix,
  };

  // Calculate dynamic page numbers according to effectiveSectionOrder
  const activePagesCount = effectiveSectionOrder.filter((id) => sectionVisibility[id]).length;

  let currentNum = 0;
  const pageNumbers: Record<PDFSectionId, number> = {
    cover: 0,
    tableOfContents: 0,
    executiveSummary: 0,
    aboutUs: 0,
    benefits: 0,
    techIntro: 0,
    projectDescription: 0,
    energy: 0,
    quotation: 0,
    roi: 0,
    cashFlow: 0,
    costMatrix: 0,
  };

  effectiveSectionOrder.forEach((sectionId) => {
    if (sectionVisibility[sectionId]) {
      currentNum++;
      pageNumbers[sectionId] = currentNum;
    }
  });

  const TOC_METADATA: Partial<Record<PDFSectionId, { title: string; subtitle: string }>> = {
    executiveSummary: {
      title: 'Cuadro Resumen de Inversión y Retorno',
      subtitle: 'Pipeline Técnico, Beneficio Ley 57-07 y Payback',
    },
    aboutUs: {
      title: 'Quiénes Somos & Nuestros Servicios',
      subtitle: 'Por Qué Elegirnos y Pilares de Servicio',
    },
    benefits: {
      title: 'Beneficios de la Energía Solar',
      subtitle: 'Objetivos e Incentivos Fiscales de la Ley 57-07',
    },
    techIntro: {
      title: '¿Qué es un Sistema Fotovoltaico?',
      subtitle: 'Funcionamiento y Diagrama de Flujo Técnico',
    },
    projectDescription: {
      title: 'Descripción del Proyecto & Normativa SIE',
      subtitle: 'Criterios de Dimensionamiento y Resolución SIE-007',
    },
    energy: {
      title: 'Análisis de Energía y Balance',
      subtitle: 'Generación Solar Estimada vs Demanda Mensual',
    },
    quotation: {
      title: 'Presupuesto y Cotización de Sistema',
      subtitle: 'Equipos Tier-1, Inversión y Términos de Garantías',
    },
    roi: {
      title: 'Cálculo de Retorno de Inversión',
      subtitle: 'Payback, VAN, TIR y Ahorro Estimado',
    },
    cashFlow: {
      title: 'Flujo de Caja y Proyección a 25 Años',
      subtitle: 'Análisis Financiero Acumulado y Rendimiento Anual',
    },
    costMatrix: {
      title: 'Matriz de Costos Internos (Confidencial)',
      subtitle: 'Desglose Detallado de Proveedores y Margen Comercial',
    },
  };

  // Build dynamic TOC items in effectiveSectionOrder
  const tocItems: TOCItem[] = [];
  let sectionIndex = 1;

  effectiveSectionOrder.forEach((sectionId) => {
    if (sectionVisibility[sectionId]) {
      const meta = TOC_METADATA[sectionId];
      if (meta) {
        tocItems.push({
          number: `${sectionIndex}`,
          title: meta.title,
          subtitle: `${sectionIndex}.1 ${meta.subtitle}`,
          targetPage: pageNumbers[sectionId],
        });
        sectionIndex++;
      }
    }
  });

  // Append Custom Extra Table of Contents Items (Appended Annexes / Extra Pages)
  const extraTocItems = project.customization?.extraTocItems || [];
  let nextExtraPageNum = currentNum + 1;

  extraTocItems.forEach((extra) => {
    if (extra.title && extra.title.trim()) {
      tocItems.push({
        number: `${sectionIndex}`,
        title: extra.title.trim(),
        subtitle: extra.subtitle ? extra.subtitle.trim() : undefined,
        targetPage: nextExtraPageNum,
      });
      sectionIndex++;
      const pCount = typeof extra.pageCount === 'number' && extra.pageCount > 0 ? extra.pageCount : 1;
      nextExtraPageNum += pCount;
    }
  });

  // Append Attached External PDFs to Table of Contents (only if user explicitly enabled it)
  const attachedPdfs = project.customization?.attachedPdfs?.filter((att) => att.enabled !== false && att.addToTableOfContents === true) || [];
  attachedPdfs.forEach((att) => {
    if (att.title && att.title.trim()) {
      tocItems.push({
        number: `${sectionIndex}`,
        title: att.title.trim(),
        subtitle: att.subtitle ? att.subtitle.trim() : `Ficha Técnica / Anexo Oficial (${att.fileName})`,
        targetPage: nextExtraPageNum,
      });
      sectionIndex++;
      const pCount = typeof att.pageCount === 'number' && att.pageCount > 0 ? att.pageCount : 1;
      nextExtraPageNum += pCount;
    }
  });

  const totalCalculatedPages = nextExtraPageNum - 1;

  return (
    <div
      className={`flex-1 flex h-full overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#0d0d10]' : 'bg-slate-200'
      }`}
    >
      {/* Side Controls Toolbar */}
      <PDFSidebarControls
        isDark={isDark}
        project={project}
        activeTheme={activeTheme}
        setActiveTheme={setActiveTheme}
        activePagesCount={activePagesCount}
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        isExporting={isExporting}
        handleExportPDF={handleExportPDF}
        handlePrint={handlePrint}
        onOpenShareModal={openShareModal}
        onRefresh={() => {
          useSimulationStore.setState({ activeProjectId: project.id });
        }}
        showCover={showCover}
        setShowCover={setShowCover}
        showTableOfContents={showTableOfContents}
        setShowTableOfContents={setShowTableOfContents}
        showExecutiveSummary={showExecutiveSummary}
        setShowExecutiveSummary={setShowExecutiveSummary}
        showAboutUs={showAboutUs}
        setShowAboutUs={setShowAboutUs}
        showBenefits={showBenefits}
        setShowBenefits={setShowBenefits}
        showTechIntro={showTechIntro}
        setShowTechIntro={setShowTechIntro}
        showProjectDescription={showProjectDescription}
        setShowProjectDescription={setShowProjectDescription}
        showPage1={showPage1}
        setShowPage1={setShowPage1}
        showPageQuotation={showPageQuotation}
        setShowPageQuotation={setShowPageQuotation}
        showPage2={showPage2}
        setShowPage2={setShowPage2}
        showPage3={showPage3}
        setShowPage3={setShowPage3}
        showPageCostMatrix={showPageCostMatrix}
        setShowPageCostMatrix={setShowPageCostMatrix}
        showHeadersFooters={showHeadersFooters}
        setShowHeadersFooters={setShowHeadersFooters}
        updateClient={updateClient}
        updateSpecs={updateSpecs}
        updateDocumentCustomization={updateDocumentCustomization}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
      />

      {/* PDF Page Canvas */}
      <main
        className={`flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 transition-colors ${
          isDark ? 'bg-[#0a0a0d]' : 'bg-slate-300/80'
        }`}
      >
        {/* Banner de Propuesta en Papelera (Modo Solo Lectura) */}
        {project.isDeleted && (
          <div className="w-[850px] bg-rose-900/95 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-rose-500/50 animate-in fade-in slide-in-from-top-2 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-800 text-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black tracking-wide">
                  PROPUESTA EN PAPELERA (MODO SOLO LECTURA)
                </h4>
                <p className="text-[11px] text-rose-200">
                  Esta propuesta fue eliminada{project.deletedAt ? ` el ${new Date(project.deletedAt).toLocaleDateString('es-DO')}` : ''}. Puedes visualizarla y exportarla a PDF, pero no modificarla.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => restoreProject(project.id)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar</span>
              </button>
            </div>
          </div>
        )}

        {/* Live Edit Mode Floating Banner */}
        {isEditMode && !project.isDeleted && (
          <div className="w-[850px] bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-blue-400/40 animate-in fade-in slide-in-from-top-2 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 shadow-xs">
                <span className="text-sm animate-bounce">✏️</span>
              </div>
              <div>
                <h4 className="text-xs font-black tracking-wide flex items-center gap-2">
                  MODO EDICIÓN EN VIVO ACTIVO
                  <span className="text-[9.5px] bg-amber-400 text-slate-950 font-extrabold px-2 py-0.5 rounded-full">
                    Tiempo Real
                  </span>
                </h4>
                <p className="text-[11px] text-blue-100 font-medium">
                  Haz clic sobre cualquier párrafo o subtítulo para modificarlo. Usa <code className="bg-blue-900/60 px-1 py-0.5 rounded text-[10px] text-amber-200">**texto**</code> o <kbd className="bg-blue-900/60 px-1 py-0.5 rounded text-[10px] text-amber-200">Ctrl+B</kbd> para negritas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="px-4 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-950 font-black text-xs shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
            >
              Listo / Finalizar
            </button>
          </div>
        )}

        <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
          {effectiveSectionOrder.map((sectionId) => {
            if (!sectionVisibility[sectionId]) return null;

            switch (sectionId) {
              case 'cover':
                return (
                  <PDFCoverPage
                    key="cover"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    currentDateStr={currentDateStr}
                  />
                );
              case 'tableOfContents':
                return (
                  <PDFTableOfContents
                    key="tableOfContents"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.tableOfContents}
                    totalPages={totalCalculatedPages > 0 ? totalCalculatedPages : activePagesCount}
                    tocItems={tocItems}
                  />
                );
              case 'executiveSummary':
                return (
                  <PDFExecutiveSummaryPage
                    key="executiveSummary"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.executiveSummary}
                    totalPages={totalCalculatedPages > 0 ? totalCalculatedPages : activePagesCount}
                  />
                );
              case 'aboutUs':
                return (
                  <PDFAboutUsPage
                    key="aboutUs"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.aboutUs}
                    totalPages={activePagesCount}
                    isEditMode={isEditMode}
                    updateDocumentCustomization={updateDocumentCustomization}
                  />
                );
              case 'benefits':
                return (
                  <PDFSolarBenefitsPage
                    key="benefits"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.benefits}
                    totalPages={activePagesCount}
                    isEditMode={isEditMode}
                    updateDocumentCustomization={updateDocumentCustomization}
                  />
                );
              case 'techIntro':
                return (
                  <PDFTechnicalIntroPage
                    key="techIntro"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.techIntro}
                    totalPages={activePagesCount}
                    isEditMode={isEditMode}
                    updateDocumentCustomization={updateDocumentCustomization}
                  />
                );
              case 'projectDescription':
                return (
                  <PDFProjectDescriptionPage
                    key="projectDescription"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.projectDescription}
                    totalPages={activePagesCount}
                    isEditMode={isEditMode}
                    updateDocumentCustomization={updateDocumentCustomization}
                  />
                );
              case 'energy':
                return (
                  <PDFPage1Energy
                    key="energy"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.energy}
                    totalPages={activePagesCount}
                  />
                );
              case 'quotation':
                return (
                  <PDFPage2Quotation
                    key="quotation"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.quotation}
                    totalPages={activePagesCount}
                    isEditMode={isEditMode}
                    updateDocumentCustomization={updateDocumentCustomization}
                  />
                );
              case 'roi':
                return (
                  <PDFPage3ROI
                    key="roi"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.roi}
                    totalPages={activePagesCount}
                  />
                );
              case 'cashFlow':
                return (
                  <PDFPage4CashFlow
                    key="cashFlow"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.cashFlow}
                    totalPages={activePagesCount}
                  />
                );
              case 'costMatrix':
                return (
                  <PDFPage5CostMatrix
                    key="costMatrix"
                    project={project}
                    summary={summary}
                    activeTheme={activeTheme}
                    showHeadersFooters={showHeadersFooters}
                    currentDateStr={currentDateStr}
                    pageNum={pageNumbers.costMatrix}
                    totalPages={activePagesCount}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
      </main>
    </div>
  );
};
