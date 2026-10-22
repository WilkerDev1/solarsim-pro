import React from 'react';
import { EditableText } from '../../editor/EditableText';
import { RichText } from '../../editor/RichText';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../../types';
import type { PDFColorTheme } from '../../../../constants/pdfThemes';
import { formatShortEquipmentLabel, type ExecutiveSummaryModel } from './executiveSummaryModel';

interface RowsProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  model: ExecutiveSummaryModel;
}

export const SummaryPaybackRow: React.FC<RowsProps> = ({ project, summary, activeTheme, model }) => {
  const { totalPaybackMonths, paybackText, paybackPct, freePct, freeYears } = model;
  return (
    <>
          {/* FILA 06: RETORNO DE INVERSIÓN (PAYBACK) */}
          <article className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-amber-500 text-white flex items-center justify-center font-mono font-black text-sm shrink-0">
                06
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row6.title" />
                </h3>
              </div>
            </div>

            <div className="flex-1 border-l border-slate-200 pl-4 flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-600 tracking-tight font-mono leading-none">
                    {paybackText}
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    ({totalPaybackMonths} meses)
                  </span>
                </div>

                {/* Barra de amortización lineal */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <div className="w-64 h-3 bg-slate-200 overflow-hidden flex border border-slate-300">
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${paybackPct}%` }}
                      title={`Retorno de inversión: ${paybackText}`}
                    ></div>
                    <div
                      className="bg-emerald-600 h-full transition-all"
                      style={{ width: `${freePct}%` }}
                      title={`Generación neta libre de costo: ${freeYears} años`}
                    ></div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 font-bold">
                    {paybackPct}% inversión / {freePct}% libre
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-none text-xs font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 bg-amber-500 shrink-0"></span>
                <EditableText k="executiveSummary.row6.lifespan" boldClassName="text-slate-950 font-bold">
                  {(text) => <RichText text={text.replace('{freeYears}', String(freeYears))} boldClassName="text-slate-950 font-bold" />}
                </EditableText>
              </div>
            </div>
          </article>
    </>
  );
};
