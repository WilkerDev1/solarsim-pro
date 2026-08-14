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
          pageTitle="ÍNDICE DE CONTENIDO"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-12 pt-6 pb-14 flex-1 flex flex-col justify-between relative z-10 min-h-0">
        <div>
          <div className="flex items-center gap-3 border-b-2 pb-2.5 mb-5" style={{ borderColor: activeTheme.primary }}>
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
          <div className="space-y-3">
            {tocItems.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs group">
                  <div className="flex items-center gap-2.5 font-bold text-slate-800 shrink-0">
                    <span
                      className="font-mono text-sm font-black w-6 text-right shrink-0"
                      style={{ color: activeTheme.primary }}
                    >
                      {item.number}.
                    </span>
                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {item.title}
                    </span>
                  </div>

                  {/* Dotted Leader Line */}
                  <div className="flex-1 mx-4 border-b-2 border-dotted border-slate-300" />

                  {/* Page Number Badge - Pixel-Perfect SVG Circle & Centered Number */}
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    className="shrink-0 drop-shadow-2xs"
                  >
                    <circle cx="16" cy="16" r="15" fill={activeTheme.primary} />
                    <text
                      x="16"
                      y="16"
                      textAnchor="middle"
                      dominantBaseline="central"
                      alignmentBaseline="central"
                      fill="#ffffff"
                      fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
                      fontSize="12.5"
                      fontWeight="900"
                    >
                      {item.targetPage}
                    </text>
                  </svg>
                </div>

                {item.subtitle && (
                  <div className="flex items-center justify-between text-[11px] text-slate-600 pl-8 pr-12">
                    <span className="font-medium text-slate-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block shrink-0" />
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
