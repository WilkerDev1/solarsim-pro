import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_ROOF_DETAIL_BASE64, PDF_FLOW_DIAGRAM_BASE64 } from '../../../assets/pdfGraphicAssets';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { InlineEditableText } from '../common/InlineEditableText';

interface PDFTechnicalIntroPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
  isEditMode?: boolean;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFTechnicalIntroPage: React.FC<PDFTechnicalIntroPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
  isEditMode = false,
  updateDocumentCustomization,
}) => {
  const cust = project.customization || {};

  return (
    <div className="pdf-page w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] bg-white shadow-xl flex flex-col shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* Background Watermark */}
      <PDFWatermark
        opacity={project.customization?.watermarkOpacity ?? 0.15}
        customWatermarkBase64={project.customization?.watermarkLogoBase64}
      />

      {/* Header Banner */}
      {showHeadersFooters && (
        <PDFHeaderBanner
          activeTheme={activeTheme}
          projectId={project.client.projectId}
          clientName={project.client.name}
          systemCapacityKWp={summary.systemCapacityKWp}
          location={project.client.province || project.client.location}
          currentDateStr={currentDateStr}
          pageTitle="3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO? Y DESCRIPCIÓN TÉCNICA"
          customization={project.customization}
        />
      )}

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
            3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO?
          </div>
          <InlineEditableText
            value={cust.techIntroWhatIsText}
            defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroWhatIsText}
            onSave={(val) => updateDocumentCustomization?.({ techIntroWhatIsText: val })}
            isEditMode={isEditMode}
            multiline={true}
            label="¿Qué es un Sistema FV? (Párrafo)"
            className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line"
            boldClassName="text-slate-950 font-bold"
            isCustomized={!!cust.techIntroWhatIsText}
            onReset={() => updateDocumentCustomization?.({ techIntroWhatIsText: '' })}
          />

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
            3.1 ¿CÓMO FUNCIONA UN SISTEMA FOTOVOLTAICO?
          </div>
          <InlineEditableText
            value={cust.techIntroHowItWorksParagraph1}
            defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroHowItWorksParagraph1}
            onSave={(val) => updateDocumentCustomization?.({ techIntroHowItWorksParagraph1: val })}
            isEditMode={isEditMode}
            multiline={true}
            label="¿Cómo Funciona? (Párrafo 1)"
            className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line"
            boldClassName="text-slate-950 font-bold"
            isCustomized={!!cust.techIntroHowItWorksParagraph1}
            onReset={() => updateDocumentCustomization?.({ techIntroHowItWorksParagraph1: '' })}
          />
          <InlineEditableText
            value={cust.techIntroHowItWorksParagraph2}
            defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroHowItWorksParagraph2}
            onSave={(val) => updateDocumentCustomization?.({ techIntroHowItWorksParagraph2: val })}
            isEditMode={isEditMode}
            multiline={true}
            label="¿Cómo Funciona? (Párrafo 2)"
            className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line"
            boldClassName="text-slate-950 font-bold"
            isCustomized={!!cust.techIntroHowItWorksParagraph2}
            onReset={() => updateDocumentCustomization?.({ techIntroHowItWorksParagraph2: '' })}
          />
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
            4. DESCRIPCIÓN TÉCNICA
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

      {/* Footer */}
      {showHeadersFooters && (
        <PDFFooter
          pageNum={pageNum}
          totalPages={totalPages}
          customization={project.customization}
        />
      )}
    </div>
  );
};
