import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface FinancialReturnTabProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
}

export const FinancialReturnTab: React.FC<FinancialReturnTabProps> = ({
  project,
  summary,
}) => {
  const cf25 = summary?.cashFlow25Years || [];
  const year1Savings = cf25[0]?.savingsUSD || 0;
  const year1Tax = cf25[0]?.taxCreditUSD || 0;

  const avg10Savings = cf25[9]?.savingsUSD || 0;
  const avg10Tax = cf25[9]?.taxCreditUSD || 0;

  const avg25Savings = cf25[cf25.length - 1]?.savingsUSD || 0;
  const avg25Tax = cf25[cf25.length - 1]?.taxCreditUSD || 0;

  const cumulativeChartData = cf25.map((row) => ({
    yearLabel: `Año ${row.year}`,
    cumulative: Math.round(row.cumulativeCashFlowUSD || 0),
    netCashFlow: Math.round(row.netCashFlowUSD || 0),
  }));

  return (
    <div className="space-y-6 shrink-0">
      {/* Indicadores Financieros Principales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            PERÍODO DE RETORNO (PAYBACK)
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-800">{summary.paybackYears}</span>
            <span className="text-xs text-slate-600 font-bold">Años</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
            Recuperación de inversión neta
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            TASA INTERNA DE RETORNO (TIR)
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-700">{summary.irrPct}%</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
            Rentabilidad anualizada (IRR)
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            VALOR ACTUAL NETO (VAN)
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            Tasa de descuento: {project.financials.discountRatePct}%
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            AHORRO ACUMULADO 25 AÑOS
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-800">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
            Beneficio neto proyectado
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            RETORNO DE INVERSIÓN (ROI)
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-800">{summary.roi25YrPct}%</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
            ROI a 25 años
          </span>
        </div>
      </div>

      {/* TABLA 1: Inversión Inicial e Incentivos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
          Cálculo de Ahorro y Retorno de Inversión
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4 w-[60%]">CONCEPTO FINANCIERO</th>
              <th className="py-2.5 px-4 text-right w-[40%]">VALOR (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
            <tr className="hover:bg-slate-50">
              <td className="py-2.5 px-4 font-bold text-slate-800">Inversión Bruta Sistema (USD)</td>
              <td className="py-2.5 px-4 font-bold text-slate-900">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
            </tr>
            {summary.itbisSavedUSD > 0 && (
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-bold text-slate-800">Exoneración 18% ITBIS (Ley 57-07) (USD)</td>
                <td className="py-2.5 px-4 font-bold text-emerald-700">-${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
              </tr>
            )}
            {summary.ley5707CreditUSD > 0 && (
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-bold text-slate-800">Crédito Fiscal 40% DGII (Ley 57-07) (USD)</td>
                <td className="py-2.5 px-4 font-bold text-emerald-700">-${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
              </tr>
            )}
            <tr className="hover:bg-slate-50 bg-emerald-50/50 font-bold">
              <td className="py-2.5 px-4 text-slate-900">Inversión Neta Final (USD)</td>
              <td className="py-2.5 px-4 text-emerald-800 text-sm">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* TABLA 2: Resumen de Ahorro Anual y Retorno de Inversión */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
          Resumen de Ahorro Anual y Retorno de Inversión
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4">AÑO</th>
              <th className="py-2.5 px-4 text-right">AHORRO ENERGÉTICO (USD)</th>
              <th className="py-2.5 px-4 text-right">INCENTIVO FISCAL (USD)</th>
              <th className="py-2.5 px-4 text-right">AHORRO TOTAL ANUAL (USD)</th>
              <th className="py-2.5 px-4 text-right font-bold">BENEFICIO ACUMULADO (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
            <tr className="hover:bg-slate-50">
              <td className="py-2.5 px-4 font-bold text-slate-800">Año 1</td>
              <td className="py-2.5 px-4 text-right">${year1Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">${year1Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-semibold">${(year1Savings + year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-bold text-red-600">-${((summary.grossInvestmentUSD - summary.itbisSavedUSD) - year1Savings - year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>

            <tr className="hover:bg-slate-50 bg-emerald-50/60 font-bold">
              <td className="py-2.5 px-4 text-emerald-900">Año {Math.ceil(summary.paybackYears)} (Retorno Payback)</td>
              <td className="py-2.5 px-4 text-right">${(cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">${(cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right">${((cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0) + (cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[Math.ceil(summary.paybackYears) - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>

            <tr className="hover:bg-slate-50">
              <td className="py-2.5 px-4 font-bold text-slate-800">Año 10</td>
              <td className="py-2.5 px-4 text-right">${avg10Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">${avg10Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-semibold">${(avg10Savings + avg10Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(cf25[9]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>

            <tr className="hover:bg-slate-50 font-bold bg-slate-50">
              <td className="py-2.5 px-4 text-slate-900">Año 25 (Final de Vida Útil)</td>
              <td className="py-2.5 px-4 text-right">${avg25Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">${avg25Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-bold text-slate-900">${(avg25Savings + avg25Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[cf25.length - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* GRÁFICA DE BENEFICIO ACUMULADO (25 AÑOS) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 shrink-0">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Beneficio Acumulado (25 Años)
          </h3>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-red-500"></span>
              <span className="text-slate-700">Inversión Neta Negativa</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600"></span>
              <span className="text-slate-700">Beneficio Acumulado Positivo</span>
            </div>
          </div>
        </div>

        <div className="h-[320px] min-h-[320px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="yearLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
              <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                {cumulativeChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.cumulative < 0 ? '#ef4444' : '#16a34a'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA 3: Flujo de Caja y Beneficios Acumulados (25 AÑOS) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
          Flujo de Caja y Beneficios Acumulados (25 Años)
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4 w-[8%] text-center">Año</th>
              <th className="py-2.5 px-4 text-right w-[16%]">Energía Generada (kWh)</th>
              <th className="py-2.5 px-4 text-right w-[16%]">Ahorro Energía (USD)</th>
              <th className="py-2.5 px-4 text-right w-[15%]">Incentivo Fiscal (USD)</th>
              <th className="py-2.5 px-4 text-right w-[15%]">Ahorro Anual Total (USD)</th>
              <th className="py-2.5 px-4 text-right w-[15%]">Cash Flow (USD)</th>
              <th className="py-2.5 px-4 text-right w-[15%]">CF Beneficio Acumulado (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
            <tr className="hover:bg-slate-50 font-bold bg-slate-50/50">
              <td className="py-2.5 px-4 text-center">0</td>
              <td className="py-2.5 px-4 text-right text-slate-400">-</td>
              <td className="py-2.5 px-4 text-right text-slate-400">-</td>
              <td className="py-2.5 px-4 text-right text-slate-400">-</td>
              <td className="py-2.5 px-4 text-right text-slate-400">-</td>
              <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>

            {cf25.map((row) => {
              const totalAnnualSavings = row.savingsUSD + row.taxCreditUSD;
              const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;
              const isCashFlowNegative = row.netCashFlowUSD < 0;

              return (
                <tr key={row.year} className="hover:bg-slate-50">
                  <td className="py-2 px-4 text-center font-bold">{row.year}</td>
                  <td className="py-2 px-4 text-right font-medium">{row.productionKWh.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right font-medium">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 px-4 text-right text-emerald-700 font-semibold">
                    {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00'}
                  </td>
                  <td className="py-2 px-4 text-right font-semibold">${totalAnnualSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className={`py-2 px-4 text-right font-semibold ${isCashFlowNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                    {row.netCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.netCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`py-2 px-4 text-right font-bold ${isCumulativeNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                    {row.cumulativeCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* TABLA 4: Indicadores Financieros del Proyecto */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
          Indicadores Financieros del Proyecto
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4 w-[40%]">Indicador</th>
              <th className="py-2.5 px-4 text-right w-[20%]">Valor</th>
              <th className="py-2.5 px-4 w-[40%]">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">Payback (Periodo de Recuperación)</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.paybackYears}</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Años hasta recuperar la inversión inicial</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">TIR (Tasa Interna de Retorno)</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.irrPct}%</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Rendimiento anual del proyecto</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">VAN a tasa descuento {project.financials.discountRatePct}%</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Valor actual neto — positivo = proyecto viable</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">Ahorro Total 25 Años</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Beneficio acumulado al final del periodo</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">ROI Total del Proyecto</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.roi25YrPct}%</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Retorno sobre inversión total en 25 años</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">Reducción CO2 estimada (25 años)</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{(summary.co2AvoidedTonsPerYear * 25).toFixed(2)} Ton</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Factor emisión red RD: {project.financials.co2FactorKgPerKWh || 0.481} kg CO2/kWh</td>
            </tr>
            <tr>
              <td className="py-2.5 px-4 font-bold text-slate-800">Precio por Watt instalado</td>
              <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(2)} USD/W</td>
              <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Competitividad vs mercado</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
