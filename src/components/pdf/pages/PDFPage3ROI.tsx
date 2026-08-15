import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';

interface PDFPage3ROIProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFPage3ROI: React.FC<PDFPage3ROIProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const cf25 = summary.cashFlow25Years;
  const initialOutflowUSD = summary.grossInvestmentUSD - summary.itbisSavedUSD;
  const cumulativeChartData = [
    { yearLabel: '0', year: 0, cumulative: -initialOutflowUSD },
    ...cf25.map((c) => ({
      yearLabel: `${c.year}`,
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];

  const paybackYearObj = cf25.find((c) => c.year === Math.ceil(summary.paybackYears)) || cf25[2] || cf25[0];
  const year1Obj = cf25[0];
  const year10Obj = cf25[9] || cf25[0];
  const year25Obj = cf25[cf25.length - 1] || cf25[0];

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
          pageTitle="RETORNO DE INVERSIÓN - RESUMEN"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col gap-2.5 relative z-10 min-h-0">
        {/* Financial Indicators Grid */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            Indicadores Financieros
          </h2>
          <div className="grid grid-cols-5 gap-2.5">
            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Payback</p>
              <p className="text-lg font-bold text-gray-900">
                {summary.paybackYears} <span className="text-[10px] font-medium text-gray-500">Años</span>
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">TIR</p>
              <p className="text-lg font-bold" style={{ color: activeTheme.primary }}>{summary.irrPct}%</p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">VAN (10%)</p>
              <p className="text-sm font-bold text-gray-900">
                ${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Ahorro 25 Años</p>
              <p className="text-sm font-bold text-green-700">
                ${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">ROI</p>
              <p className="text-lg font-bold text-gray-900">{summary.roi25YrPct}%</p>
            </div>
          </div>
        </div>

        {/* Parameters Table */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            Cálculo de Ahorro y Retorno de Inversión
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden text-[11px]">
            <table className="w-full text-left">
              <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 text-gray-800 w-1/2">Cliente</td>
                  <td className="px-4 py-1.5 text-right font-bold uppercase text-gray-900">{project.client.name}</td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-gray-800">Potencia Instalada (kWp)</td>
                  <td className="px-4 py-1.5 text-right font-bold">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                </tr>
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 text-gray-800">Inversión Inicial</td>
                  <td className="px-4 py-1.5 text-right font-bold text-gray-900">
                    ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-gray-800">Incentivo Fiscal Estimado (Ley 57-07)</td>
                  <td className="px-4 py-1.5 text-right font-bold text-green-700">
                    -${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 text-gray-800">Inversión Neta</td>
                  <td className="px-4 py-1.5 text-right font-bold text-gray-900">
                    ${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Milestones Table */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            Resumen de Ahorro Anual y Retorno de Inversión
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden text-[11px]">
            <table className="w-full text-left">
              <thead className="text-white uppercase font-bold text-[10px]" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-4 py-1.5">Año</th>
                  <th className="px-4 py-1.5 text-right">Ahorro Energético (USD)</th>
                  <th className="px-4 py-1.5 text-right">Beneficio Acumulado (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 font-bold">Año 1</td>
                  <td className="px-4 py-1.5 text-right">${year1Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right text-red-600 font-bold">
                    ${year1Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className={`font-bold ${activeTheme.accentLightBg}`}>
                  <td className="px-4 py-1.5" style={{ color: activeTheme.primary }}>Año {paybackYearObj.year} (Payback)</td>
                  <td className="px-4 py-1.5 text-right">${paybackYearObj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right font-bold" style={{ color: activeTheme.primary }}>
                    ${paybackYearObj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 font-bold">Año 10</td>
                  <td className="px-4 py-1.5 text-right">${year10Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right text-green-700 font-bold">
                    ${year10Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td className="px-4 py-1.5 font-bold">Año 25</td>
                  <td className="px-4 py-1.5 text-right">${year25Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right font-bold" style={{ color: activeTheme.primary }}>
                    ${year25Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Accumulated Benefit Chart */}
        <div className="space-y-2 mt-auto">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            Beneficio Acumulado (25 Años)
          </h2>
          <div className="h-[180px] w-full bg-gray-50/70 border border-gray-200 rounded-xl p-2.5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="yearLabel" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} />
                <YAxis
                  tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                  tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                  {cumulativeChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.cumulative < 0 ? '#ef4444' : activeTheme.barColor}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
