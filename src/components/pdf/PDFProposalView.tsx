import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../constants/pdfThemes';

// Modular Page Components
import { PDFSidebarControls } from './controls/PDFSidebarControls';
import { PDFCoverPage } from './pages/PDFCoverPage';
import { PDFTableOfContents, TOCItem } from './pages/PDFTableOfContents';
import { PDFAboutUsPage } from './pages/PDFAboutUsPage';
import { PDFSolarBenefitsPage } from './pages/PDFSolarBenefitsPage';
import { PDFTechnicalIntroPage } from './pages/PDFTechnicalIntroPage';
import { PDFProjectDescriptionPage } from './pages/PDFProjectDescriptionPage';
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

  // Document Toggles (Intro & Presentation)
  const [showCover, setShowCover] = useState(true); // Portada Ejecutiva
  const [showTableOfContents, setShowTableOfContents] = useState(true); // Índice de Contenido
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

  // Active Tab in Sidebar ("Secciones" vs "Datos del Documento")
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'edit'>('sections');

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    setIsExporting(true);

    try {
      // 1. Si estamos en Electron, usar el motor nativo Chromium printToPDF (máxima fidelidad vectorial, 0 recortes)
      if (window.electronAPI?.printToPDF) {
        const result = await window.electronAPI.printToPDF();
        if (result?.success || result?.cancelled) {
          setIsExporting(false);
          return;
        }
      }

      // 2. Fallback de navegador web con html2canvas y aislamiento estricto (0,0) por página
      if (!pdfRef.current) return;
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
          width: 850,
          height: 1202,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc, clonedElement) => {
            const clonedPages = clonedDoc.querySelectorAll<HTMLElement>('.pdf-page');
            const targetPage = clonedPages[i] || clonedElement;

            // Limpiar y resetear el body clonado para colocar la página exactamente en (0,0)
            clonedDoc.body.innerHTML = '';
            clonedDoc.body.style.margin = '0';
            clonedDoc.body.style.padding = '0';
            clonedDoc.body.style.background = '#ffffff';
            clonedDoc.body.style.overflow = 'hidden';
            clonedDoc.body.style.width = '850px';
            clonedDoc.body.style.height = '1202px';

            if (targetPage) {
              targetPage.style.position = 'absolute';
              targetPage.style.top = '0';
              targetPage.style.left = '0';
              targetPage.style.margin = '0';
              targetPage.style.width = '850px';
              targetPage.style.height = '1202px';
              targetPage.style.minHeight = '1202px';
              targetPage.style.maxHeight = '1202px';
              targetPage.style.boxSizing = 'border-box';
              targetPage.style.overflow = 'hidden';
              targetPage.style.transform = 'none';
              clonedDoc.body.appendChild(targetPage);
            }
          },
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
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

  // Calculate dynamic page numbers
  const activePagesCount =
    (showCover ? 1 : 0) +
    (showTableOfContents ? 1 : 0) +
    (showAboutUs ? 1 : 0) +
    (showBenefits ? 1 : 0) +
    (showTechIntro ? 1 : 0) +
    (showProjectDescription ? 1 : 0) +
    (showPage1 ? 1 : 0) +
    (showPageQuotation ? 1 : 0) +
    (showPage2 ? 1 : 0) +
    (showPage3 ? 1 : 0) +
    (showPageCostMatrix ? 1 : 0);

  let currentNum = 0;
  let pageCoverNum = 0;
  let pageTocNum = 0;
  let pageAboutUsNum = 0;
  let pageBenefitsNum = 0;
  let pageTechIntroNum = 0;
  let pageProjectDescNum = 0;
  let page1Num = 0;
  let pageQuotNum = 0;
  let page2Num = 0;
  let page3Num = 0;
  let pageCostMatrixNum = 0;

  if (showCover) {
    currentNum++;
    pageCoverNum = currentNum;
  }
  if (showTableOfContents) {
    currentNum++;
    pageTocNum = currentNum;
  }
  if (showAboutUs) {
    currentNum++;
    pageAboutUsNum = currentNum;
  }
  if (showBenefits) {
    currentNum++;
    pageBenefitsNum = currentNum;
  }
  if (showTechIntro) {
    currentNum++;
    pageTechIntroNum = currentNum;
  }
  if (showProjectDescription) {
    currentNum++;
    pageProjectDescNum = currentNum;
  }
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

  // Build dynamic TOC items
  const tocItems: TOCItem[] = [];
  let sectionIndex = 1;

  if (showAboutUs) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Quiénes Somos & Nuestros Servicios',
      subtitle: '1.1 Por Qué Elegirnos y Pilares de Servicio',
      targetPage: pageAboutUsNum,
    });
    sectionIndex++;
  }

  if (showBenefits) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Beneficios de la Energía Solar',
      subtitle: '2.1 Objetivos e Incentivos Fiscales de la Ley 57-07',
      targetPage: pageBenefitsNum,
    });
    sectionIndex++;
  }

  if (showTechIntro) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: '¿Qué es un Sistema Fotovoltaico?',
      subtitle: '3.1 Funcionamiento y Diagrama de Flujo Técnico',
      targetPage: pageTechIntroNum,
    });
    sectionIndex++;
  }

  if (showProjectDescription) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Descripción del Proyecto & Normativa SIE',
      subtitle: 'Criterios de Dimensionamiento y Resolución SIE-007',
      targetPage: pageProjectDescNum,
    });
    sectionIndex++;
  }

  if (showPage1) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Análisis de Energía y Balance',
      subtitle: 'Generación Solar Estimada vs Demanda Mensual',
      targetPage: page1Num,
    });
    sectionIndex++;
  }

  if (showPageQuotation) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Presupuesto y Cotización de Sistema',
      subtitle: 'Equipos Tier-1, Inversión y Términos de Garantías',
      targetPage: pageQuotNum,
    });
    sectionIndex++;
  }

  if (showPage2) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Cálculo de Retorno de Inversión',
      subtitle: 'Payback, VAN, TIR y Ahorro Estimado',
      targetPage: page2Num,
    });
    sectionIndex++;
  }

  if (showPage3) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Flujo de Caja y Proyección a 25 Años',
      subtitle: 'Análisis Financiero Acumulado y Rendimiento Anual',
      targetPage: page3Num,
    });
    sectionIndex++;
  }

  if (showPageCostMatrix) {
    tocItems.push({
      number: `${sectionIndex}`,
      title: 'Matriz de Costos Internos (Confidencial)',
      subtitle: 'Desglose Detallado de Proveedores y Margen Comercial',
      targetPage: pageCostMatrixNum,
    });
    sectionIndex++;
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
        showCover={showCover}
        setShowCover={setShowCover}
        showTableOfContents={showTableOfContents}
        setShowTableOfContents={setShowTableOfContents}
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
      />

      {/* PDF Page Canvas */}
      <main
        className={`flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 transition-colors ${
          isDark ? 'bg-[#0a0a0d]' : 'bg-slate-300/80'
        }`}
      >
        <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
          {/* PORTADA EJECUTIVA */}
          {showCover && (
            <PDFCoverPage
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              currentDateStr={currentDateStr}
            />
          )}

          {/* ÍNDICE DE CONTENIDO */}
          {showTableOfContents && (
            <PDFTableOfContents
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageTocNum}
              totalPages={activePagesCount}
              tocItems={tocItems}
            />
          )}

          {/* 1. ¿QUIÉNES SOMOS? & SERVICIOS */}
          {showAboutUs && (
            <PDFAboutUsPage
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageAboutUsNum}
              totalPages={activePagesCount}
            />
          )}

          {/* 2. BENEFICIOS SOLARES & LEY 57-07 */}
          {showBenefits && (
            <PDFSolarBenefitsPage
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageBenefitsNum}
              totalPages={activePagesCount}
            />
          )}

          {/* 3. ¿QUÉ ES UN SISTEMA FV? & FLUJO TÉCNICO */}
          {showTechIntro && (
            <PDFTechnicalIntroPage
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageTechIntroNum}
              totalPages={activePagesCount}
            />
          )}

          {/* 4. DESCRIPCIÓN DEL PROYECTO & NORMATIVA SIE */}
          {showProjectDescription && (
            <PDFProjectDescriptionPage
              project={project}
              summary={summary}
              activeTheme={activeTheme}
              showHeadersFooters={showHeadersFooters}
              currentDateStr={currentDateStr}
              pageNum={pageProjectDescNum}
              totalPages={activePagesCount}
            />
          )}

          {/* 5. ANÁLISIS DE ENERGÍA Y BALANCE */}
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

          {/* 6. COTIZACIÓN DE SISTEMA FOTOVOLTAICO */}
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

          {/* 7. RETORNO DE INVERSIÓN Y MÉTRICAS */}
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

          {/* 8. FLUJO DE CAJA 25 AÑOS */}
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

          {/* 9. MATRIZ DE COSTOS INTERNOS (CONFIDENCIAL) */}
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
