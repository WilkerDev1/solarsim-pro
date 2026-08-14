import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { ListOrdered } from 'lucide-react';

export interface TOCItem {
  number: string;
  title: string;
  subtitle?: string;
  targetPage: number;
}

interface PDFTableOfContentsProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
  tocItems: TOCItem[];
}

export const PDFTableOfContents: React.FC<PDFTableOfContentsProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
  tocItems,
}) => {
  return (
    <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
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
          pageTitle="ÍNDICE DE CONTENIDO"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-12 py-10 flex-1 flex flex-col justify-between relative z-10">
        <div>
          <div className="flex items-center gap-3 border-b-2 pb-3 mb-8" style={{ borderColor: activeTheme.primary }}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold uppercase tracking-tight text-slate-900">
                Estructura de la Propuesta
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Guía de navegación del dossier técnico y económico
              </p>
            </div>
          </div>

          {/* Dotted TOC List */}
          <div className="space-y-4">
            {tocItems.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs group">
                  <div className="flex items-baseline gap-2 font-bold text-slate-800 shrink-0">
                    <span
                      className="font-mono text-[13px] font-black w-6 text-right"
                      style={{ color: activeTheme.primary }}
                    >
                      {item.number}.
                    </span>
                    <span className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                      {item.title}
                    </span>
                  </div>

                  {/* Dotted Leader Line */}
                  <div className="flex-1 mx-3 border-b border-dotted border-slate-400/80 mb-1" />

                  {/* Page Number Badge */}
                  <div
                    className="w-7 h-7 rounded-lg text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs"
                    style={{ backgroundColor: activeTheme.primary }}
                  >
                    {item.targetPage}
                  </div>
                </div>

                {item.subtitle && (
                  <div className="flex items-baseline justify-between text-[11px] text-slate-600 pl-8 pr-1">
                    <span className="font-medium text-slate-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                      {item.subtitle}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Informative Footer Note */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 text-[11px] text-slate-600 flex items-center justify-between">
          <span>
            * Todas las secciones técnicas y proyecciones financieras están calculadas bajo normativa dominicana <strong>(Ley 57-07 y SIE)</strong>.
          </span>
          <span className="font-mono font-bold text-slate-800 shrink-0 ml-4">
            Total: {totalPages} Páginas
          </span>
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
