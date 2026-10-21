import React, { useRef, useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../constants/pdfThemes';
import { PDFMergeService } from '../../services/pdfMergeService';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { PDFSectionId } from '../../constants/pdfSections';
import { buildPdfLayout, normalizeSectionOrder } from '../../utils/pdfLayout';
import { formatProposalDate } from '../../utils/formatDateUtils';

// Modular Page Components
import { PDFSidebarControls } from './controls/PDFSidebarControls';
import { PDFCoverPage } from './pages/PDFCoverPage';
import { PDFTableOfContents } from './pages/PDFTableOfContents';
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
    updateDefaultDocumentCustomization,
    saveCurrentProjectAsDefaultDocumentTemplate,
    resetDefaultDocumentCustomization,
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

  const currentDateStr = useMemo(() => {
    return formatProposalDate(project?.client?.quoteDate || project?.customization?.quoteDate);
  }, [project?.client?.quoteDate, project?.customization?.quoteDate]);

  const effectiveSectionOrder = useMemo(
    () => normalizeSectionOrder(project?.customization?.sectionOrder),
    [project?.customization?.sectionOrder]
  );

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

  const { pageNumbers, footerTotalPages, tocItems } = buildPdfLayout(
    effectiveSectionOrder,
    sectionVisibility,
    project.customization?.extraTocItems || [],
    project.customization?.attachedPdfs || [],
  );

  const renderSection = (id: PDFSectionId) => {
    const page = { project, summary, activeTheme, showHeadersFooters, currentDateStr, pageNum: pageNumbers[id], totalPages: footerTotalPages };
    const editable = { isEditMode, updateDocumentCustomization, updateDefaultDocumentCustomization };
    switch (id) {
      case 'cover':
        return <PDFCoverPage key={id} project={project} summary={summary} activeTheme={activeTheme} currentDateStr={currentDateStr} isEditMode={isEditMode} updateClient={updateClient} />;
      case 'tableOfContents':
        return <PDFTableOfContents key={id} {...page} tocItems={tocItems} />;
      case 'executiveSummary':
        return <PDFExecutiveSummaryPage key={id} {...page} />;
      case 'aboutUs':
        return <PDFAboutUsPage key={id} {...page} {...editable} />;
      case 'benefits':
        return <PDFSolarBenefitsPage key={id} {...page} {...editable} />;
      case 'techIntro':
        return <PDFTechnicalIntroPage key={id} {...page} {...editable} />;
      case 'projectDescription':
        return <PDFProjectDescriptionPage key={id} {...page} {...editable} />;
      case 'energy':
        return <PDFPage1Energy key={id} {...page} isEditMode={isEditMode} updateDocumentCustomization={updateDocumentCustomization} updateSpecs={updateSpecs} />;
      case 'quotation':
        return <PDFPage2Quotation key={id} {...page} {...editable} updateClient={updateClient} />;
      case 'roi':
        return <PDFPage3ROI key={id} {...page} />;
      case 'cashFlow':
        return <PDFPage4CashFlow key={id} {...page} />;
      case 'costMatrix':
        return <PDFPage5CostMatrix key={id} {...page} />;
    }
  };

  return (
    <div
      className={`flex-1 flex h-full overflow-hidden transition-colors duration-200 bg-slate-200 dark:bg-[#0d0d10]`}
    >
      {/* Side Controls Toolbar */}
      <PDFSidebarControls
        isDark={isDark}
        project={project}
        activeTheme={activeTheme}
        setActiveTheme={setActiveTheme}
        activePagesCount={footerTotalPages}
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
        updateDefaultDocumentCustomization={updateDefaultDocumentCustomization}
        saveCurrentProjectAsDefaultDocumentTemplate={saveCurrentProjectAsDefaultDocumentTemplate}
        resetDefaultDocumentCustomization={resetDefaultDocumentCustomization}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
      />

      {/* PDF Page Canvas */}
      <main
        className={`flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 transition-colors bg-slate-300/80 dark:bg-[#0a0a0d]`}
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
                  Haz clic sobre cualquier párrafo o subtítulo para modificarlo. Usa <code className="bg-blue-900/60 px-1 py-0.5 rounded text-[10px] text-amber-200">**texto**</code> o <kbd className="bg-blue-900/60 px-1 py-0.5 rounded text-[10px] text-amber-200">Ctrl+B</kbd> para negritas, o <strong>Hacer Permanente</strong> para fijar plantillas futuras.
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
          {effectiveSectionOrder.map((sectionId) => (sectionVisibility[sectionId] ? renderSection(sectionId) : null))}
        </div>
      </main>
    </div>
  );
};
