import { PDFPageShell } from '../PDFPageShell';
import { EditableText } from '../editor/EditableText';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { ListOrdered } from 'lucide-react';

import type { TOCItem } from '../../../utils/pdfLayout';
export type { TOCItem };

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
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="tableOfContents"
    >

      {/* Body */}
      <div className="px-12 pt-6 pb-3 flex-1 flex flex-col justify-between relative z-10 min-h-0">
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
                <EditableText k="toc.heading" />
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                <EditableText k="toc.subheading" />
              </p>
            </div>
          </div>

          {/* Dotted TOC List */}
          <div className={tocItems.length > 10 ? 'space-y-1.5' : tocItems.length > 8 ? 'space-y-2' : 'space-y-3'}>
            {tocItems.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs group">
                  <div className="flex items-center gap-2.5 font-bold text-slate-800 shrink-0">
                    <span
                      className={`font-mono font-black w-6 text-right shrink-0 ${tocItems.length > 10 ? 'text-xs' : 'text-sm'}`}
                      style={{ color: activeTheme.primary }}
                    >
                      {item.number}.
                    </span>
                    <span className={`font-black text-slate-900 uppercase tracking-tight ${tocItems.length > 10 ? 'text-xs' : 'text-sm'}`}>
                      {item.sectionId ? <EditableText k={`toc.${item.sectionId}.title`} /> : item.title}
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
                      {item.sectionId ? <span>{item.number}.1 <EditableText k={`toc.${item.sectionId}.subtitle`} /></span> : item.subtitle}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Informative Footer Note */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 text-[11px] text-slate-600 flex items-center justify-between">
          <EditableText k="toc.footnote" boldClassName="font-bold" />
          <EditableText k="toc.totalPages" className="font-mono font-bold text-slate-800 shrink-0 ml-4">
            {(text) => text.replace('{total}', String(totalPages))}
          </EditableText>
        </div>
      </div>
    </PDFPageShell>
  );
};
