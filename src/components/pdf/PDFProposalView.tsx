import React, { useRef, useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useSimulationStore } from '../../store/useSimulationStore';
import { resolveProposalAttachmentBytes } from '../../services/proposalAttachmentResolver';
import { exportProposalPdf } from './export/exportProposalPdf';
import { ProposalAnnexSync } from './annexes/ProposalAnnexSync';
import { PDFSectionId } from '../../constants/pdfSections';
import { buildPdfLayout, normalizeSectionOrder } from '../../utils/pdfLayout';
import { formatProposalDate } from '../../utils/formatDateUtils';
import { DocumentEditorProvider } from './editor/DocumentEditorContext';
import { DocumentEditorToolbar } from './editor/DocumentEditorToolbar';
import { useDocumentLayout } from './useDocumentLayout';
import { flushPendingDesignEdits } from './controls/pendingDesignEdits';
import { canEditDocument, type DocumentEditorMode } from './editor/documentEditorState';

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
    updateSpecs,
    updateDocumentCustomization,
    saveCurrentProjectAsDefaultDocumentTemplate,
    resetDefaultDocumentCustomization,
    sidebarTheme,
    openShareModal,
    restoreProject,
    setDocumentTexts,
    saveDocumentTextsToCompanyTemplate,
  } = useSimulationStore();
  const currentUser = useSimulationStore((s) => s.syncSettings.currentUser);
  const companies = useSimulationStore((s) => s.companies);

  const isDark = sidebarTheme === 'dark';
  const activeProjectId = useSimulationStore((s) => s.activeProjectId);
  const activeProjectFromStore = useSimulationStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId)
  );
  const project = activeProjectFromStore || getActiveProject();
  const summary = getFinancialSummary();
  const pdfRef = useRef<HTMLDivElement>(null);

  // Secciones visibles, tema y cabecera/pie viven en la propuesta (customization.layout).
  const layout = useDocumentLayout(project);
  const { visibility: sectionVisibility, theme: activeTheme, showHeadersFooters } = layout;
  const [isExporting, setIsExporting] = useState(false);


  // Active Tab in Sidebar ("Secciones" vs "Modo Edición")
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'design'>('sections');

  // Live Inline Editing Mode
  const [isEditMode, setIsEditMode] = useState(false);

  const handlePrint = () => {
    // Lo pendiente del dock (p. ej. la opacidad de la marca de agua) se guarda antes de imprimir.
    flushPendingDesignEdits();
    requestAnimationFrame(() => window.print());
  };

  const handleExportPDF = async () => {
    if (!pdfRef.current) return;
    flushPendingDesignEdits();
    // Modo 'export': el editor se desmonta y la hoja queda sin cromo antes de la captura.
    flushSync(() => setIsExporting(true));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    try {
      const pages = Array.from(pdfRef.current.querySelectorAll<HTMLElement>('.pdf-page'));
      const sanitizedClientName = (project.client.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
      // Comprobar si hay documentos externos adjuntos para fusionar (leído fresco del store)
      const currentProj = useSimulationStore.getState().projects.find((p) => p.id === project.id) || project;
      await exportProposalPdf({
        pages,
        fileName: `Propuesta_SolarSim_${sanitizedClientName}.pdf`,
        attachments: currentProj.customization?.attachedPdfs || [],
        resolveAttachmentBytes: resolveProposalAttachmentBytes,
      });
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

  const { pageNumbers, footerTotalPages, tocItems } = buildPdfLayout(
    effectiveSectionOrder,
    sectionVisibility,
    project.customization?.extraTocItems || [],
    project.customization?.attachedPdfs || [],
  );

  // Una propuesta en papelera, con conflicto o de un lector se ve pero no se edita.
  const writable = canEditDocument({ project, user: currentUser });
  const readOnlyReason = writable
    ? null
    : project.isDeleted
      ? 'Propuesta en papelera: solo lectura. Restáurala para editar el documento.'
      : project.syncStatus === 'conflict'
      ? 'Esta propuesta tiene un conflicto de sincronización: resuélvelo antes de editar el documento.'
      : 'Tu cuenta solo puede consultar esta propuesta.';
  const editing = isEditMode && writable;
  const editorMode: DocumentEditorMode = isExporting ? 'export' : editing ? 'edit' : 'view';
  const editorActions = useMemo(() => ({
    setText: (key: string, value: string) => setDocumentTexts({ [key]: value }),
    resetText: (key: string) => setDocumentTexts({ [key]: null }),
    saveToTemplate: (key: string) => saveDocumentTextsToCompanyTemplate([key]).saved.length > 0,
  }), [setDocumentTexts, saveDocumentTextsToCompanyTemplate]);

  const renderSection = (id: PDFSectionId) => {
    const page = { project, summary, activeTheme, showHeadersFooters, currentDateStr, pageNum: pageNumbers[id], totalPages: footerTotalPages };
    switch (id) {
      case 'cover':
        return <PDFCoverPage key={id} project={project} summary={summary} activeTheme={activeTheme} currentDateStr={currentDateStr} />;
      case 'tableOfContents':
        return <PDFTableOfContents key={id} {...page} tocItems={tocItems} />;
      case 'executiveSummary':
        return <PDFExecutiveSummaryPage key={id} {...page} />;
      case 'aboutUs':
        return <PDFAboutUsPage key={id} {...page} />;
      case 'benefits':
        return <PDFSolarBenefitsPage key={id} {...page} />;
      case 'techIntro':
        return <PDFTechnicalIntroPage key={id} {...page} />;
      case 'projectDescription':
        return <PDFProjectDescriptionPage key={id} {...page} />;
      case 'energy':
        return <PDFPage1Energy key={id} {...page} isEditMode={editing} updateDocumentCustomization={updateDocumentCustomization} updateSpecs={updateSpecs} />;
      case 'quotation':
        return <PDFPage2Quotation key={id} {...page} />;
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
        layout={layout}
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
        updateSpecs={updateSpecs}
        updateDocumentCustomization={updateDocumentCustomization}
        saveCurrentProjectAsDefaultDocumentTemplate={saveCurrentProjectAsDefaultDocumentTemplate}
        resetDefaultDocumentCustomization={resetDefaultDocumentCustomization}
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

        <ProposalAnnexSync project={project} />

        <DocumentEditorProvider
          project={project}
          summary={summary}
          currentDateStr={currentDateStr}
          company={companies.find((company) => company.id === project.companyProfileId)}
          mode={editorMode}
          writable={writable}
          actions={editorActions}
        >
          <DocumentEditorToolbar isEditMode={editing} setIsEditMode={setIsEditMode} readOnlyReason={readOnlyReason} />
          <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
            {effectiveSectionOrder.map((sectionId) => (sectionVisibility[sectionId] ? renderSection(sectionId) : null))}
          </div>
        </DocumentEditorProvider>
      </main>
    </div>
  );
};
