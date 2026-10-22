import React from 'react';
import { EditableText } from '../../editor/EditableText';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../../types';
import type { PDFColorTheme } from '../../../../constants/pdfThemes';
import { formatShortEquipmentLabel, type ExecutiveSummaryModel } from './executiveSummaryModel';

interface RowsProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  model: ExecutiveSummaryModel;
}

export const SummaryInvestmentRows: React.FC<RowsProps> = ({ project, summary, activeTheme, model }) => {
  const { grossInvestmentUSD, totalBeforeLeyUSD, costPerWattUSD, exchangeRate, tariffDOP, tariffCode, isLeyEligible, leyCreditUSD, equipmentPct, netInvestmentUSD } = model;
  return (
    <>
          {/* FILA 03: INVERSIÓN BRUTA Y PARÁMETROS COMERCIALES (DARK CARD) */}
          <article className="bg-slate-900 border border-slate-800 border-l-4 border-l-amber-500 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 text-white">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-amber-500 text-slate-950 flex items-center justify-center font-mono font-black text-sm shrink-0">
                03
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row3.title" />
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 flex-1 border-l border-slate-800 pl-4">
              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block"><EditableText k="executiveSummary.row3.pricePerWatt" /></span>
                <span className="text-sm font-black text-amber-400 font-mono block mt-0.5">
                  ${costPerWattUSD.toFixed(2)} USD
                </span>
                <span className="text-[10px] text-slate-400 block"><EditableText k="executiveSummary.row3.pricePerWattNote" /></span>
              </div>

              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block"><EditableText k="executiveSummary.row3.exchangeRate" /></span>
                <span className="text-sm font-black text-white font-mono block mt-0.5">
                  {exchangeRate.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block"><EditableText k="executiveSummary.row3.exchangeRateNote" /></span>
              </div>

              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block"><EditableText k="executiveSummary.row3.tariff" /></span>
                <span className="text-sm font-black text-white font-mono block mt-0.5">
                  RD$ {tariffDOP.toFixed(2)}
                </span>
                <span className="text-[10px] text-emerald-400 block font-semibold">Tarifa {tariffCode}</span>
              </div>

              <div className="bg-amber-500 p-2.5 border border-amber-400 flex flex-col justify-center text-slate-950">
                <span className="text-[10.5px] text-amber-950 font-bold block"><EditableText k="executiveSummary.row3.gross" /></span>
                <span className="text-base font-black text-slate-950 font-mono leading-tight mt-0.5">
                  ${totalBeforeLeyUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9.5px] text-amber-950 font-semibold block mt-0.5 whitespace-nowrap">
                  {(summary.totalDiscountUSD || 0) > 0
                    ? `Desc: -$${summary.totalDiscountUSD?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                    : 'Total antes de ley'}
                </span>
              </div>
            </div>
          </article>

          {/* FILA 04: INCENTIVOS FISCALES LEY 57-07 */}
          <article className="bg-emerald-50/30 border border-slate-200 border-l-4 border-l-emerald-600 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center font-mono font-black text-sm shrink-0">
                04
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row4.title" />
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 flex-1 border-l border-slate-200 pl-4">
              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block"><EditableText k="executiveSummary.row4.eligible" /></span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2.5 h-2.5 rounded-none bg-emerald-600"></span>
                  <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wide">
                    {isLeyEligible ? 'SÍ (ELEGIBLE 100%)' : 'NO APLICADO'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium block mt-0.5"><EditableText k="executiveSummary.row4.eligibleNote" /></span>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block"><EditableText k="executiveSummary.row4.equipmentShare" /></span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {equipmentPct}%
                </span>
                <span className="text-[10px] text-slate-500 font-medium block"><EditableText k="executiveSummary.row4.equipmentShareNote" /></span>
              </div>

              <div className="bg-emerald-100/90 p-2.5 border border-emerald-300 flex flex-col justify-center">
                <span className="text-[10.5px] text-emerald-950 font-bold block"><EditableText k="executiveSummary.row4.credit" /></span>
                <span className="text-base font-black text-emerald-800 font-mono leading-tight mt-0.5">
                  -${leyCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
                <span className="text-[9.5px] text-emerald-700 font-bold block mt-0.5"><EditableText k="executiveSummary.row4.creditNote" /></span>
              </div>
            </div>
          </article>

          {/* FILA 05: INVERSIÓN NETA FINAL (DIFERENCIA) */}
          <article
            className="text-white rounded-none p-5 shadow-md border-l-4 border-slate-800 flex items-center justify-between gap-4"
            style={{
              backgroundColor: activeTheme.primary,
              borderLeftColor: activeTheme.secondary || '#38bdf8',
            }}
          >
            <div className="flex items-center gap-3.5 min-w-[240px]">
              <div className="w-11 h-11 rounded-none bg-black/25 text-white flex items-center justify-center font-mono font-black text-base shrink-0 shadow-2xs">
                05
              </div>
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row5.title" />
                </h2>
                <p className="text-xs font-mono text-blue-100 mt-1">
                  ${netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Neta tras -$
                  {leyCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Beneficio Ley 57-07
                </p>
              </div>
            </div>

            <div className="flex-1 border-l border-white/25 pl-6 flex items-center justify-end gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl lg:text-5xl font-black tracking-tight font-mono text-white">
                  ${grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-lg font-bold font-mono text-white/90">USD</span>
              </div>
            </div>
          </article>
    </>
  );
};
