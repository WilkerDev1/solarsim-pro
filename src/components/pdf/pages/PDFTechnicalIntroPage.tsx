import { PDFPageShell } from '../PDFPageShell';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_ROOF_DETAIL_BASE64, PDF_FLOW_DIAGRAM_BASE64 } from '../../../assets/pdfGraphicAssets';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { EditableText } from '../editor/EditableText';

interface PDFTechnicalIntroPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFTechnicalIntroPage: React.FC<PDFTechnicalIntroPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  return (
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="techIntro"
    >

      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* Section 3: ¿Qué es un Sistema Fotovoltaico? */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="techIntro.heading" />
          </div>
          <EditableText k="techIntro.whatIs" className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />

          {/* 3D Roof Tile Solar Array Render (Frontal / Wide View) - Larger & Clearer */}
          <div className="w-full h-52 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/60 shadow-xs flex items-center justify-center p-3">
            <img
              src={PDF_ROOF_DETAIL_BASE64}
              alt="3D Solar array on tile roof frontal perspective"
              className="max-h-[190px] max-w-[95%] w-auto h-auto mx-auto block object-contain"
            />
          </div>
        </div>

        {/* Section 3.1: ¿Cómo Funciona? */}
        <div className="space-y-2">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="techIntro.howItWorksHeading" />
          </div>
          <EditableText k="techIntro.howItWorks1" className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />
          <EditableText k="techIntro.howItWorks2" className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />
        </div>

        {/* Section 4: Descripción Técnica (Flow Diagram) */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="techIntro.technicalHeading" />
          </div>

          {/* High Quality Flow Diagram - Larger & Prominent */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center justify-center h-52">
            <img
              src={PDF_FLOW_DIAGRAM_BASE64}
              alt="Diagrama de flujo del sistema solar fotovoltaico"
              className="max-h-[190px] max-w-[95%] w-auto h-auto mx-auto block object-contain"
            />
          </div>
        </div>
      </div>
    </PDFPageShell>
  );
};
