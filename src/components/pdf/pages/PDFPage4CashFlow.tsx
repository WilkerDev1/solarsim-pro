import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';

interface PDFPage4CashFlowProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFPage4CashFlow: React.FC<PDFPage4CashFlowProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const cf25 = summary.cashFlow25Years;

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
          pageTitle="FLUJO DE CAJA Y BENEFICIOS ACUMULADOS (25 AÑOS)"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 pt-2 pb-3 flex-1 flex flex-col justify-between gap-2 relative z-10 min-h-0">
        {/* Detailed Cash Flow Table - 7 Columns */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs text-xs flex-1 flex flex-col">
          <table className="w-full text-left border-collapse flex-1">
            <thead className="text-white font-bold uppercase tracking-wider text-[9px] shrink-0" style={{ backgroundColor: activeTheme.primary }}>
              <tr>
                <th className="px-2 py-1 w-10 text-center">Año</th>
                <th className="px-2 py-1 text-right">Energía Generada (kWh)</th>
                <th className="px-2 py-1 text-right">Ahorro Energía (USD)</th>
                <th className="px-2 py-1 text-right">Incentivo Fiscal (USD)</th>
                <th className="px-2 py-1 text-right">Ahorro Anual Total (USD)</th>
                <th className="px-2 py-1 text-right">Cash Flow (USD)</th>
                <th className="px-2 py-1 text-right font-bold">CF Beneficio Acumulado (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold text-[9px]">
              {/* Year 0 Row */}
              {(() => {
                const initialOutflow = summary.grossInvestmentUSD - summary.itbisSavedUSD;
                return (
                  <tr className="bg-red-50/70 text-red-700 font-bold">
                    <td className="px-2 py-0.5 text-center">0</td>
                    <td className="px-2 py-0.5 text-right text-slate-400">-</td>
                    <td className="px-2 py-0.5 text-right text-slate-400">-</td>
                    <td className="px-2 py-0.5 text-right text-slate-400">-</td>
                    <td className="px-2 py-0.5 text-right text-slate-400">-</td>
                    <td className="px-2 py-0.5 text-right text-red-600">
                      -${initialOutflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-0.5 text-right text-red-600 font-extrabold">
                      -${initialOutflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })()}

              {/* Years 1 to 25 */}
              {cf25.map((row) => {
                const isPaybackYear = row.year === Math.ceil(summary.paybackYears);
                const totalAnnualSavings = row.savingsUSD + row.taxCreditUSD;
                const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;

                return (
                  <tr
                    key={row.year}
                    className={
                      isPaybackYear
                        ? `${activeTheme.accentLightBg} font-bold border-y border-slate-300`
                        : row.year % 2 === 0
                        ? 'bg-slate-50/60'
                        : 'bg-white'
                    }
                  >
                    <td className="px-2 py-[1px] text-center font-bold">{row.year}</td>
                    <td className="px-2 py-[1px] text-right font-medium">{row.productionKWh.toLocaleString()}</td>
                    <td className="px-2 py-[1px] text-right font-medium">
                      ${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-[1px] text-right font-semibold" style={{ color: activeTheme.secondary }}>
                      {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                    </td>
                    <td className="px-2 py-[1px] text-right font-semibold text-slate-900">
                      ${totalAnnualSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-[1px] text-right font-semibold" style={{ color: activeTheme.primary }}>
                      ${row.netCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className="px-2 py-[1px] text-right font-bold"
                      style={{ color: isCumulativeNegative ? '#dc2626' : activeTheme.primary }}
                    >
                      {isCumulativeNegative ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Full Summary Indicators Box */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2 shrink-0">
          <h3 className="text-slate-800 font-bold text-[11px] mb-1 border-b border-slate-200 pb-0.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: activeTheme.primary }} /> Indicadores Financieros del Proyecto
          </h3>
          <div className="grid grid-cols-4 gap-y-1 gap-x-3 text-[10.5px]">
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">Payback</p>
              <p className="font-bold text-slate-900">{summary.paybackYears} años</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">TIR</p>
              <p className="font-bold" style={{ color: activeTheme.primary }}>{summary.irrPct}%</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">VAN (10%)</p>
              <p className="font-bold text-slate-900">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">Ahorro Total 25 Años</p>
              <p className="font-bold" style={{ color: activeTheme.primary }}>${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">ROI Total</p>
              <p className="font-bold" style={{ color: activeTheme.primary }}>{summary.roi25YrPct}%</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">Reducción CO2</p>
              <p className="font-bold text-slate-900">{(summary.co2AvoidedTonsPerYear * 25).toFixed(1)} Ton</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">Precio por Watt</p>
              <p className="font-bold text-slate-900">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(3)} USD/W</p>
            </div>
            <div>
              <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-bold mb-0.5">Capacidad DC</p>
              <p className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)} kWp</p>
            </div>
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
