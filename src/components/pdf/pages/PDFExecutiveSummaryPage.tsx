import { PDFPageShell } from '../PDFPageShell';
import { EditableText } from '../editor/EditableText';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { executiveSummaryModel } from './executiveSummary/executiveSummaryModel';
import { SummaryEquipmentRows } from './executiveSummary/SummaryEquipmentRows';
import { SummaryInvestmentRows } from './executiveSummary/SummaryInvestmentRows';
import { SummaryPaybackRow } from './executiveSummary/SummaryPaybackRow';

interface PDFExecutiveSummaryPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFExecutiveSummaryPage: React.FC<PDFExecutiveSummaryPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const model = executiveSummaryModel(project, summary);

  return (
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="executiveSummary"
    >

      {/* Contenido Principal de la Página */}
      <div className="px-9 py-6 flex-1 flex flex-col justify-between relative z-10 min-h-0">
        {/* Cabecera del Cuadro Ejecutivo */}
        <div className="border-b border-slate-200 pb-3">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            <EditableText k="executiveSummary.heading" />
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            <EditableText k="executiveSummary.subheading" />
          </p>
        </div>

        {/* 6 FILAS DE PIPELINE HORIZONTAL STREAMLINE */}
        <div className="space-y-4 flex-1 flex flex-col justify-center py-3">
          <SummaryEquipmentRows project={project} summary={summary} activeTheme={activeTheme} model={model} />
          <SummaryInvestmentRows project={project} summary={summary} activeTheme={activeTheme} model={model} />
          <SummaryPaybackRow project={project} summary={summary} activeTheme={activeTheme} model={model} />
        </div>

        {/* Nota Institucional Inferior */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[9.5px] text-slate-500 font-mono">
          <span>
            <EditableText k="executiveSummary.footnote" />
          </span>
          <span className="font-semibold text-slate-600">
            <EditableText k="executiveSummary.footnoteRight" />
          </span>
        </div>
      </div>
    </PDFPageShell>
  );
};
