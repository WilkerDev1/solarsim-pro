import { PDFPageShell } from '../PDFPageShell';
import { EditableText } from '../editor/EditableText';
import { cleanClientName } from '../../../../shared/proposalPresentation';
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
  const initialOutflowUSD = summary.contractPriceUSD ?? summary.initialOutflowUSD ?? summary.grossInvestmentUSD;
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
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="roi"
    >

      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col gap-2.5 relative z-10 min-h-0">
        {/* Financial Indicators Grid */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            <EditableText k="roi.indicatorsHeading" />
          </h2>
          <div className="grid grid-cols-5 gap-2.5">
            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5"><EditableText k="roi.indicator.payback" /></p>
              <p className="text-lg font-bold text-gray-900">
                {summary.paybackYears} <span className="text-[10px] font-medium text-gray-500"><EditableText k="roi.indicator.paybackUnit" /></span>
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5"><EditableText k="roi.indicator.irr" /></p>
              <p className="text-lg font-bold" style={{ color: activeTheme.primary }}>{summary.irrPct}%</p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5"><EditableText k="roi.indicator.npv" /></p>
              <p className="text-sm font-bold text-gray-900">
                ${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5"><EditableText k="roi.indicator.savings25" /></p>
              <p className="text-sm font-bold text-green-700">
                ${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-2.5 text-center">
              <p className="text-[9.5px] text-gray-500 uppercase font-bold tracking-wider mb-0.5"><EditableText k="roi.indicator.roi" /></p>
              <p className="text-lg font-bold text-gray-900">{summary.roi25YrPct}%</p>
            </div>
          </div>
        </div>

        {/* Parameters Table */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1 uppercase tracking-wider">
            <EditableText k="roi.calcHeading" />
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden text-[11px]">
            <table className="w-full text-left">
              <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 text-gray-800 w-1/2"><EditableText k="roi.calc.client" /></td>
                  <td className="px-4 py-1.5 text-right font-bold uppercase text-gray-900">{cleanClientName(project.client.name || 'Cliente')}</td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-gray-800"><EditableText k="roi.calc.capacity" /></td>
                  <td className="px-4 py-1.5 text-right font-bold">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                </tr>
                {summary.itbisSavedUSD > 0 && (
                  <>
                    <tr className="bg-gray-50/60">
                      <td className="px-4 py-1.5 text-gray-800"><EditableText k="roi.calc.listPrice" /></td>
                      <td className="px-4 py-1.5 text-right font-bold text-gray-500 font-mono">
                        ${(summary.grossInvestmentUSD + summary.itbisSavedUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-1.5 text-gray-800"><EditableText k="roi.calc.itbis" /></td>
                      <td className="px-4 py-1.5 text-right font-bold text-green-700 font-mono">
                        -${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="bg-gray-50/60 font-bold">
                  <td className="px-4 py-1.5 text-gray-900"><EditableText k="roi.calc.contract" /></td>
                  <td className="px-4 py-1.5 text-right font-bold text-gray-900 font-mono">
                    ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-1.5 text-gray-800"><EditableText k="roi.calc.credit" /></td>
                  <td className="px-4 py-1.5 text-right font-bold text-green-700 font-mono">
                    -${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-emerald-50/80 font-bold text-emerald-950 border-t border-emerald-200">
                  <td className="px-4 py-1.5 text-emerald-950"><EditableText k="roi.calc.net" /></td>
                  <td className="px-4 py-1.5 text-right font-black text-emerald-800 font-mono">
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
            <EditableText k="roi.tableHeading" />
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden text-[11px]">
            <table className="w-full text-left">
              <thead className="text-white uppercase font-bold text-[10px]" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-4 py-1.5"><EditableText k="roi.table.year" /></th>
                  <th className="px-4 py-1.5 text-right"><EditableText k="roi.table.savings" /></th>
                  <th className="px-4 py-1.5 text-right"><EditableText k="roi.table.cumulative" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 font-bold"><EditableText k="roi.table.year1" /></td>
                  <td className="px-4 py-1.5 text-right">${year1Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right text-red-600 font-bold">
                    ${year1Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className={`font-bold ${activeTheme.accentLightBg}`}>
                  <td className="px-4 py-1.5" style={{ color: activeTheme.primary }}>Año {paybackYearObj.year} (Retorno: {summary.paybackYears} años)</td>
                  <td className="px-4 py-1.5 text-right">${paybackYearObj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right font-bold" style={{ color: activeTheme.primary }}>
                    ${paybackYearObj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-1.5 font-bold"><EditableText k="roi.table.year10" /></td>
                  <td className="px-4 py-1.5 text-right">${year10Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-1.5 text-right text-green-700 font-bold">
                    ${year10Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td className="px-4 py-1.5 font-bold"><EditableText k="roi.table.year25" /></td>
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
            <EditableText k="roi.table.total25" />
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
    </PDFPageShell>
  );
};
