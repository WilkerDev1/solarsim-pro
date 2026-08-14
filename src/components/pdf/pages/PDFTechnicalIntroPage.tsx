import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_ROOF_DETAIL_BASE64, PDF_FLOW_DIAGRAM_BASE64 } from '../../../assets/pdfGraphicAssets';

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
      <div className="px-10 py-3.5 flex-1 flex flex-col justify-start gap-3 text-xs text-slate-800 relative z-10 min-h-0">
        {/* Section 3: ¿Qué es un Sistema Fotovoltaico? */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO?
          </div>
          <p className="text-slate-700 text-xs leading-relaxed text-justify font-medium">
            Un sistema fotovoltaico es el conjunto integrado de equipos diseñados para capturar la energía proveniente del sol y transformarla en electricidad utilizable. Su funcionamiento se fundamenta en la capacidad de las celdas fotovoltaicas para convertir la radiación solar directamente en energía eléctrica.
          </p>

          {/* 3D Roof Tile Solar Array Render (Frontal / Wide View) */}
          <div className="w-full h-32 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/60 shadow-xs flex items-center justify-center p-1.5">
            <img
              src={PDF_ROOF_DETAIL_BASE64}
              alt="3D Solar array on tile roof frontal perspective"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Section 3.1: ¿Cómo Funciona? */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            3.1 ¿CÓMO FUNCIONA UN SISTEMA FOTOVOLTAICO?
          </div>
          <p className="text-slate-700 text-[11px] leading-relaxed text-justify font-medium">
            La cantidad de energía eléctrica que produce un sistema fotovoltaico está determinada por múltiples factores: las horas de radiación solar disponibles, la cantidad de módulos instalados, su orientación e inclinación, la intensidad de la radiación recibida, la calidad de la instalación y la potencia nominal del sistema.
          </p>
          <p className="text-slate-700 text-[11px] leading-relaxed text-justify font-medium">
            Las celdas fotovoltaicas absorben la energía solar, actuando como convertidores que generan corriente eléctrica continua (CC), la cual luego se transforma en corriente alterna (CA) aprovechable para el consumo diario.
          </p>
        </div>

        {/* Section 4: Descripción Técnica (Flow Diagram) */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            4. DESCRIPCIÓN TÉCNICA
          </div>

          {/* High Quality Flow Diagram */}
          <div className="p-2 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center justify-center">
            <img
              src={PDF_FLOW_DIAGRAM_BASE64}
              alt="Diagrama de flujo del sistema solar fotovoltaico"
              className="w-full h-auto max-h-[135px] object-contain"
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
