import { PDFPageShell } from '../PDFPageShell';
import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { FileText, ShieldAlert, Sparkles, Zap, BatteryCharging, Sun } from 'lucide-react';

import { EditableText } from '../editor/EditableText';
import { OptionalTextRow } from '../editor/OptionalTextRow';
import { calculateTotalBatteryCapacityKWh } from '../../../utils/equipmentSpecsUtils';

interface PDFProjectDescriptionPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFProjectDescriptionPage: React.FC<PDFProjectDescriptionPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const totalBESSKWh = calculateTotalBatteryCapacityKWh(project.specs);

  return (
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="projectDescription"
    >

      {/* Body */}
      <div className="px-10 pt-3.5 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* Top Section: Technical Proposal Narrative */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 border-b pb-2.5" style={{ borderColor: activeTheme.primary }}>
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-2xs"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h2 className="text-xs font-black uppercase tracking-tight text-slate-900">
                <EditableText k="projectDescription.heading" />
              </h2>
              <EditableText k="projectDescription.subtitle" className="text-[10px] text-slate-500 font-semibold block" boldClassName="text-slate-800 font-bold" />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 leading-relaxed text-justify">
            <EditableText k="projectDescription.paragraph1" className="text-slate-700 text-[11.5px] font-medium block whitespace-pre-line leading-relaxed text-justify" boldClassName="text-slate-950 font-bold" />

            <EditableText k="projectDescription.paragraph2" className="text-slate-700 text-[11.5px] font-medium block whitespace-pre-line leading-relaxed text-justify" boldClassName="text-slate-950 font-bold" />
            <OptionalTextRow k="projectDescription.engineeringScope" editOnly>
              <p className="text-[10px] text-slate-500 font-semibold">Alcance de ingeniería (se inserta en el párrafo 2):</p>
              <EditableText k="projectDescription.engineeringScope" className="text-slate-600 text-[10.5px] block" boldClassName="font-bold" />
            </OptionalTextRow>
          </div>

          {/* Quick Metrics Cards (4 indicators when system has battery, 3 otherwise) */}
          <div className={`grid ${project.specs.hasBattery && totalBESSKWh > 0 ? 'grid-cols-4 gap-2.5' : 'grid-cols-3 gap-3'}`}>
            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-2.5 shadow-xs">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-black text-slate-400 block"><EditableText k="projectDescription.metric.power" /></span>
                <span className="text-sm font-black font-mono text-slate-900 block">
                  {summary.systemCapacityKWp.toFixed(2)} kWp
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-2.5 shadow-xs">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-600 text-white shadow-2xs shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-black text-slate-400 block"><EditableText k="projectDescription.metric.coverage" /></span>
                <span className="text-sm font-black font-mono text-sky-700 block">
                  {summary.energyCoveragePct.toFixed(1)}% Anual
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-2.5 shadow-xs">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-800 text-white shadow-2xs shrink-0">
                <Sun className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-black text-slate-400 block"><EditableText k="projectDescription.metric.production" /></span>
                <span className="text-sm font-black font-mono text-slate-900 block">
                  {Math.round(summary.annualProductionKWh).toLocaleString()} kWh
                </span>
              </div>
            </div>

            {project.specs.hasBattery && totalBESSKWh > 0 && (
              <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 flex items-center gap-2.5 shadow-xs">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-600 text-white shadow-2xs shrink-0">
                  <BatteryCharging className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[9.5px] uppercase font-black text-emerald-800 block"><EditableText k="projectDescription.metric.storage" /></span>
                  <span className="text-sm font-black font-mono text-emerald-950 block">
                    {totalBESSKWh.toFixed(1)} kWh
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Regulatory & Net Metering Callout Box (Yellow Background) */}
        <div className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/80 p-4 shadow-xs space-y-2.5 relative overflow-hidden">
          <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-600" />
            <span><EditableText k="projectDescription.regulatoryHeading" /></span>
          </div>

          <div className="space-y-2 text-amber-950/90 text-[11.5px] leading-relaxed text-justify font-medium">
            <EditableText k="projectDescription.regulatoryNote" className="text-amber-950/90 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line" boldClassName="font-bold text-amber-950" />
          </div>
        </div>
      </div>
    </PDFPageShell>
  );
};
