import { PDFPageShell } from '../PDFPageShell';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { Wrench, Activity, LineChart, Sparkles, Award, Shield, Users } from 'lucide-react';
import { renderFormattedMarkdown } from '../../../utils/textFormatter';

import { EditableText } from '../editor/EditableText';
import { listItems } from '../editor/listItems';

interface PDFAboutUsPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFAboutUsPage: React.FC<PDFAboutUsPageProps> = ({
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
      sectionId="aboutUs"
    >

      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* 1. ¿Quiénes Somos? Section */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            <EditableText k="aboutUs.heading" />
          </div>
          <div className="pt-0.5">
            <EditableText k="aboutUs.intro" className="text-slate-700 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />
          </div>
        </div>

        {/* NUESTROS SERVICIOS Grid */}
        <div className="space-y-2.5">
          <div className="text-center">
            <h3
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: activeTheme.primary }}
            >
              <EditableText k="aboutUs.servicesHeading" />
            </h3>
            <div className="w-16 h-0.5 mx-auto mt-1" style={{ backgroundColor: activeTheme.secondary }} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            {/* Card 1 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-xs hover:border-slate-300">
              <div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Wrench className="w-4 h-4" />
                </div>
                <h4 className="font-black text-xs uppercase tracking-tight text-slate-900 leading-snug mb-1.5">
                  <EditableText k="aboutUs.service1.title" />
                </h4>
                <p className="text-[10px] text-slate-600 leading-normal mb-2.5 font-medium">
                  <EditableText k="aboutUs.service1.text" />
                </p>
              </div>
              <EditableText k="aboutUs.service1.items" as="ul" className="text-[9px] text-slate-600 space-y-1 border-t border-slate-100 pt-2 font-medium">
                {(text) => listItems(text).map((item, idx) => <li key={idx}>• {item}</li>)}
              </EditableText>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-xs hover:border-slate-300">
              <div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Activity className="w-4 h-4" />
                </div>
                <h4 className="font-black text-xs uppercase tracking-tight text-slate-900 leading-snug mb-1.5">
                  <EditableText k="aboutUs.service2.title" />
                </h4>
                <p className="text-[10px] text-slate-600 leading-normal mb-2.5 font-medium">
                  <EditableText k="aboutUs.service2.text" />
                </p>
              </div>
              <EditableText k="aboutUs.service2.items" as="ul" className="text-[9px] text-slate-600 space-y-1 border-t border-slate-100 pt-2 font-medium">
                {(text) => listItems(text).map((item, idx) => <li key={idx}>• {item}</li>)}
              </EditableText>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-xs hover:border-slate-300">
              <div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <LineChart className="w-4 h-4" />
                </div>
                <h4 className="font-black text-xs uppercase tracking-tight text-slate-900 leading-snug mb-1.5">
                  <EditableText k="aboutUs.service3.title" />
                </h4>
                <p className="text-[10px] text-slate-600 leading-normal mb-2.5 font-medium">
                  <EditableText k="aboutUs.service3.text" />
                </p>
              </div>
              <EditableText k="aboutUs.service3.items" as="ul" className="text-[9px] text-slate-600 space-y-1 border-t border-slate-100 pt-2 font-medium">
                {(text) => listItems(text).map((item, idx) => <li key={idx}>• {item}</li>)}
              </EditableText>
            </div>

            {/* Card 4 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-xs hover:border-slate-300">
              <div>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <h4 className="font-black text-xs uppercase tracking-tight text-slate-900 leading-snug mb-1.5">
                  <EditableText k="aboutUs.service4.title" />
                </h4>
                <p className="text-[10px] text-slate-600 leading-normal mb-2.5 font-medium">
                  <EditableText k="aboutUs.service4.text" />
                </p>
              </div>
              <EditableText k="aboutUs.service4.items" as="ul" className="text-[9px] text-slate-600 space-y-1 border-t border-slate-100 pt-2 font-medium">
                {(text) => listItems(text).map((item, idx) => <li key={idx}>• {item}</li>)}
              </EditableText>
            </div>
          </div>
        </div>

        {/* Bloque Inferior: Transición + 1.1 ¿Por Qué Elegirnos? */}
        <div className="space-y-2.5">
          <EditableText k="aboutUs.transition" className="text-slate-700 text-[11.5px] leading-relaxed text-left font-medium block whitespace-pre-line" boldClassName="text-slate-950 font-bold" />

          <div className="space-y-2">
            <div
              className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
              style={{
                backgroundColor: activeTheme.primary,
                color: '#ffffff',
                lineHeight: '1.3',
              }}
            >
              <EditableText k="aboutUs.whyHeading" />
            </div>
            <EditableText k="aboutUs.whyChooseUs" className="text-slate-700 text-[11.5px] leading-relaxed font-medium block whitespace-pre-line pt-0.5" boldClassName="text-slate-950 font-bold" />

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Award className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                  <h5 className="font-extrabold text-xs text-slate-900"><EditableText k="aboutUs.pillar1.title" /></h5>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="aboutUs.pillar1.text" />
                </p>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Shield className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                  <h5 className="font-extrabold text-xs text-slate-900"><EditableText k="aboutUs.pillar2.title" /></h5>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="aboutUs.pillar2.text" />
                </p>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Users className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                  <h5 className="font-extrabold text-xs text-slate-900"><EditableText k="aboutUs.pillar3.title" /></h5>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                  <EditableText k="aboutUs.pillar3.text" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PDFPageShell>
  );
};
