import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../constants/pdfThemes';

// Modular Page Components
import { PDFSidebarControls } from './controls/PDFSidebarControls';
import { PDFPage1Energy } from './pages/PDFPage1Energy';
import { PDFPage2Quotation } from './pages/PDFPage2Quotation';
import { PDFPage3ROI } from './pages/PDFPage3ROI';
import { PDFPage4CashFlow } from './pages/PDFPage4CashFlow';
import { PDFPage5CostMatrix } from './pages/PDFPage5CostMatrix';

export const PDFProposalView: React.FC = () => {
  const {
    getActiveProject,
    getFinancialSummary,
    updateClient,
    updateSpecs,
    updateDocumentCustomization,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const project = getActiveProject();
  const summary = getFinancialSummary();
  const pdfRef = useRef<HTMLDivElement>(null);

  // Document Toggles (5 pages)
  const [showPage1, setShowPage1] = useState(true); // Pág 1: Análisis de Energía
  const [showPageQuotation, setShowPageQuotation] = useState(true); // Pág 2: Cotización de Sistema Fotovoltaico
  const [showPage2, setShowPage2] = useState(true); // Pág 3: Retorno de Inversión - Resumen
  const [showPage3, setShowPage3] = useState(true); // Pág 4: Flujo de Caja 25 Años
  const [showPageCostMatrix, setShowPageCostMatrix] = useState(false); // Pág 5: Costos Internos (Confidencial)
  const [showHeadersFooters, setShowHeadersFooters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Active Color Theme
  const [activeTheme, setActiveTheme] = useState<PDFColorTheme>(PDF_COLOR_THEMES[0]);

  // Active Tab in Sidebar ("Secciones" vs "Datos del Documento")
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'edit'>('sections');

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

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight));
      }

      const sanitizedClientName = (project.client.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Propuesta_SolarSim_${sanitizedClientName}.pdf`);
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

  // Calculate dynamic page numbers for footers
  const activePagesCount =
    (showPage1 ? 1 : 0) +
    (showPageQuotation ? 1 : 0) +
    (showPage2 ? 1 : 0) +
    (showPage3 ? 1 : 0) +
    (showPageCostMatrix ? 1 : 0);

  let page1Num = 0;
  let pageQuotNum = 0;
  let page2Num = 0;
  let page3Num = 0;
  let pageCostMatrixNum = 0;
  let currentNum = 0;

  if (showPage1) {
    currentNum++;
    page1Num = currentNum;
  }
  if (showPageQuotation) {
    currentNum++;
    pageQuotNum = currentNum;
  }
  if (showPage2) {
    currentNum++;
    page2Num = currentNum;
  }
  if (showPage3) {
    currentNum++;
    page3Num = currentNum;
  }
  if (showPageCostMatrix) {
    currentNum++;
    pageCostMatrixNum = currentNum;
  }

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
        onRefresh={() => {
          useSimulationStore.setState({ activeProjectId: project.id });
        }}
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
      />

      {/* PDF Page Canvas */}
      <main
        className={`flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 transition-colors ${
          isDark ? 'bg-[#0a0a0d]' : 'bg-slate-300/80'
        }`}
      >
        <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
          {/* PÁGINA 1: ANÁLISIS DE ENERGÍA */}
          {showPage1 && (
            <PDFPage1Energy
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={page1Num}
              totalPages={activePagesCount}
            />
          )}

          {/* PÁGINA 2: COTIZACIÓN DE SISTEMA FOTOVOLTAICO */}
          {showPageQuotation && (
            <PDFPage2Quotation
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageQuotNum}
              totalPages={activePagesCount}
            />
          )}

          {/* PÁGINA 3: RETORNO DE INVERSIÓN - RESUMEN */}
          {showPage2 && (
            <PDFPage3ROI
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={page2Num}
              totalPages={activePagesCount}
            />
          )}

          {/* PÁGINA 4: FLUJO DE CAJA 25 AÑOS */}
          {showPage3 && (
            <PDFPage4CashFlow
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={page3Num}
              totalPages={activePagesCount}
            />
          )}

          {/* PÁGINA 5: MATRIZ DE COSTOS INTERNOS (CONFIDENCIAL) */}
          {showPageCostMatrix && (
            <PDFPage5CostMatrix
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageCostMatrixNum}
              totalPages={activePagesCount}
            />
          )}
        </div>
      </main>
    </div>
  );
};
