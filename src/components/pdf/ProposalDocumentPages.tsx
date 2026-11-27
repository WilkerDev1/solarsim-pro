import React from 'react';
import type { PDFSectionId } from '../../constants/pdfSections';
import type { PDFColorTheme } from '../../constants/pdfThemes';
import type { DocumentCustomization, FinancialSummaryResult, ProjectSimulation } from '../../types';
import type { TOCItem } from '../../utils/pdfLayout';
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

export interface ProposalSectionContext {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNumbers: Record<PDFSectionId, number>;
  totalPages: number;
  tocItems: TOCItem[];
  /** Solo la vista del documento de la propuesta edita (página de energía); el visor de la cotización no pasa nada. */
  editing?: {
    isEditMode: boolean;
    updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
    updateSpecs: (specs: Partial<ProjectSimulation['specs']>) => void;
  };
}

/** Una página (sección) del documento de la propuesta; la comparten `PDFProposalView` y el visor de la cotización. */
export function renderProposalSection(id: PDFSectionId, ctx: ProposalSectionContext): React.ReactNode {
  const { project, summary, activeTheme, showHeadersFooters, currentDateStr, pageNumbers, totalPages, tocItems, editing } = ctx;
  const page = { project, summary, activeTheme, showHeadersFooters, currentDateStr, pageNum: pageNumbers[id], totalPages };
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
      return editing
        ? <PDFPage1Energy key={id} {...page} isEditMode={editing.isEditMode} updateDocumentCustomization={editing.updateDocumentCustomization} updateSpecs={editing.updateSpecs} />
        : <PDFPage1Energy key={id} {...page} />;
    case 'quotation':
      return <PDFPage2Quotation key={id} {...page} />;
    case 'roi':
      return <PDFPage3ROI key={id} {...page} />;
    case 'cashFlow':
      return <PDFPage4CashFlow key={id} {...page} />;
    case 'costMatrix':
      return <PDFPage5CostMatrix key={id} {...page} />;
  }
}
