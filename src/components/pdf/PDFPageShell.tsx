import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../types';
import { PDFColorTheme } from '../../constants/pdfThemes';
import { PDFHeaderBanner } from './PDFHeaderBanner';
import { PDFFooter } from './PDFFooter';
import { PDFWatermark } from './PDFWatermark';
import { EnsureDocumentEditor } from './editor/DocumentEditorContext';

export const PDF_PAGE_CLASS =
  'pdf-page w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] bg-white shadow-xl flex flex-col shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen';

interface PDFPageShellProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
  pageTitle: string;
  /** Overrides the A4 container classes (keep the 850×1202 budget). */
  className?: string;
  children: React.ReactNode;
}

/** A4 interior page: watermark, optional 76px header, body, optional 42px footer. */
export const PDFPageShell: React.FC<PDFPageShellProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
  pageTitle,
  className = PDF_PAGE_CLASS,
  children,
}) => (
  <EnsureDocumentEditor project={project} summary={summary} currentDateStr={currentDateStr}>
  <div className={className}>
    <PDFWatermark
      opacity={project.customization?.watermarkOpacity ?? 0.15}
      customWatermarkBase64={project.customization?.watermarkLogoBase64}
    />
    {showHeadersFooters && (
      <PDFHeaderBanner
        activeTheme={activeTheme}
        projectId={project.client.projectId}
        clientName={project.client.name}
        systemCapacityKWp={summary.systemCapacityKWp}
        location={project.client.province || project.client.location}
        currentDateStr={currentDateStr}
        pageTitle={pageTitle}
        customization={project.customization}
      />
    )}
    {children}
    {showHeadersFooters && (
      <PDFFooter pageNum={pageNum} totalPages={totalPages} customization={project.customization} />
    )}
  </div>
  </EnsureDocumentEditor>
);
