import { PDFPageShell } from '../PDFPageShell';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_BENEFITS_HOUSE_BASE64 } from '../../../assets/pdfGraphicAssets';
import { Sun, DollarSign, Leaf, Globe2, ShieldCheck, CheckCircle2, TrendingUp, Zap } from 'lucide-react';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { EditableText } from '../editor/EditableText';

interface PDFSolarBenefitsPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFSolarBenefitsPage: React.FC<PDFSolarBenefitsPageProps> = ({
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
      sectionId="benefits"
    >
      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* Section 2: Beneficios de la Energía Solar */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="benefits.heading" />
          </div>

          {/* Visual House Illustration with Full Width and 4 Feature Pills */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white relative shadow-sm">
            <div className="h-64 w-full relative overflow-hidden">
              <img
                src={PDF_BENEFITS_HOUSE_BASE64}
                alt="Modern luxury home with rooftop solar panels"
                className="w-full h-full object-cover object-center block"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3.5 left-4 text-white">
                <span className="text-[11px] font-black uppercase tracking-wider bg-emerald-600/90 backdrop-blur-xs px-3 py-1.5 rounded-md shadow-xs">
                  <EditableText k="benefits.imageCaption" />
                </span>
              </div>
            </div>

            {/* 4 Pillars Grid inside card - Enchanced & Spacious */}
            <div className="p-3.5 bg-white grid grid-cols-4 gap-3 border-t border-slate-100">
              <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <DollarSign className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-emerald-950"><EditableText k="benefits.pillar1.title" /></h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  <EditableText k="benefits.pillar1.text" />
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/90 border border-blue-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-blue-950"><EditableText k="benefits.pillar2.title" /></h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  <EditableText k="benefits.pillar2.text" />
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Zap className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-amber-950"><EditableText k="benefits.pillar3.title" /></h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  <EditableText k="benefits.pillar3.text" />
                </p>
              </div>

              <div className="p-3 rounded-xl bg-teal-50/90 border border-teal-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Leaf className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-teal-950"><EditableText k="benefits.pillar4.title" /></h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  <EditableText k="benefits.pillar4.text" />
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2.1: Objetivos de la Ley 57-07 */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="benefits.objectivesHeading" />
          </div>

          <EditableText k="benefits.ley5707Intro" className="text-slate-700 text-[11.5px] leading-relaxed font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />

          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1"><EditableText k="benefits.objective1.title" /></h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="benefits.objective1.text" />
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1"><EditableText k="benefits.objective2.title" /></h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="benefits.objective2.text" />
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1"><EditableText k="benefits.objective3.title" /></h5>
                <EditableText k="benefits.objective3.text" as="p" className="text-[10.5px] text-slate-600 leading-relaxed font-medium" boldClassName="font-bold" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1"><EditableText k="benefits.objective4.title" /></h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="benefits.objective4.text" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PDFPageShell>
  );
};
