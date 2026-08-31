import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Sparkles, ArrowDownToLine } from 'lucide-react';

interface EnergyAnalysisTabProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  openAIInvoiceModal: () => void;
  updateMonthlyConsumption: (index: number, value: number) => void;
  updateAllMonthlyConsumption?: (value: number) => void;
}

export const EnergyAnalysisTab: React.FC<EnergyAnalysisTabProps> = ({
  project,
  summary,
  openAIInvoiceModal,
  updateMonthlyConsumption,
  updateAllMonthlyConsumption,
}) => {
  const totalConsumptionKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.consumptionKWh || 0), 0);
  const totalProductionKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.productionKWh || 0), 0);
  const totalSavingsKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.solarSelfConsumedKWh || 0), 0);
  const avgCoveragePct = summary?.energyCoveragePct || 0;

  const handleApplyToAllMonths = () => {
    const val = project.monthlyConsumption[0] || 0;
    if (updateAllMonthlyConsumption) {
      updateAllMonthlyConsumption(val);
    } else {
      for (let i = 0; i < 12; i++) {
        updateMonthlyConsumption(i, val);
      }
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        {/* Card 1: CAPACIDAD INSTALADA */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            CAPACIDAD INSTALADA
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
            <span className="text-xs text-slate-500 font-semibold">kWp</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
          </span>
        </div>

        {/* Card 2: GENERACIÓN ANUAL */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            GENERACIÓN ANUAL
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-semibold">kWh</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
            {summary.energyCoveragePct}% Cobertura Solar
          </span>
        </div>

        {/* Card 3: CONSUMO ANUAL */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            CONSUMO ANUAL
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900">{summary.annualConsumptionKWh.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-semibold">kWh</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            Prom: {Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh/mes
          </span>
        </div>

        {/* Card 4: AHORRO ENERGÉTICO ANUAL */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            AHORRO ENERGÉTICO ANUAL
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-700">${summary.year1SavingsUSD.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-semibold">USD</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
            Autoconsumo solar en factura
          </span>
        </div>

        {/* Card 5: IMPACTO AMBIENTAL */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            IMPACTO AMBIENTAL
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-800">-{summary.co2AvoidedTonsPerYear}</span>
            <span className="text-xs text-slate-500 font-semibold">Tons CO₂</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
            🌱 Reducción CO₂ por año
          </span>
        </div>
      </div>

      {/* GRÁFICA DE ENERGÍA */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 shrink-0">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Evolución Mensual de Energía
          </h3>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#14532d]"></span>
              <span className="text-slate-700">Consumo (kWh)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
              <span className="text-slate-700">Producción Solar (kWh)</span>
            </div>
          </div>
        </div>

        <div className="h-[320px] min-h-[320px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
              <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />
              <Bar dataKey="consumptionKWh" name="Consumo" fill="#14532d" radius={[2, 2, 0, 0]} />
              <Bar dataKey="productionKWh" name="Producción" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA DE DETALLE MENSUAL EDITABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#14532d] text-white px-4 py-2.5 font-bold text-xs uppercase tracking-wider flex justify-between items-center">
          <span>Resumen Mensual de Energía</span>
          <button
            onClick={openAIInvoiceModal}
            className="bg-white/10 hover:bg-white/20 border border-white/30 text-amber-300 hover:text-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Escanear factura eléctrica EDE con IA para autocompletar consumo y cliente"
          >
            <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
            <span>Autocompletar con Factura EDE (IA)</span>
          </button>
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4">MES</th>
              <th className="py-2.5 px-4 text-center">CONSUMO KWH/MES</th>
              <th className="py-2.5 px-4 text-right">PRODUCCIÓN KWH/MES</th>
              <th className="py-2.5 px-4 text-right">AHORRO ENERG. (KWH)</th>
              <th className="py-2.5 px-4 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
            {summary.monthlyBreakdown.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2 px-4 font-bold text-slate-800">{row.month}</td>
                <td className="py-2 px-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <input
                      type="number"
                      value={project.monthlyConsumption[idx]}
                      onChange={(e) => updateMonthlyConsumption(idx, parseFloat(e.target.value) || 0)}
                      className="w-24 text-center bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 transition-all shadow-2xs"
                    />
                    {idx === 0 ? (
                      <button
                        type="button"
                        onClick={handleApplyToAllMonths}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer shrink-0"
                        title="Aplicar este consumo de Enero a los 12 meses (Consumo promedio uniforme)"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>A todos</span>
                      </button>
                    ) : (
                      <div className="w-[74px] hidden sm:block pointer-events-none" />
                    )}
                  </div>
                </td>
                <td className="py-2 px-4 text-right font-semibold">{row.productionKWh.toFixed(1)}</td>
                <td className="py-2 px-4 text-right font-semibold">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                <td className="py-2 px-4 text-right text-emerald-700 font-bold">
                  {row.consumptionKWh > 0 ? ((row.productionKWh / row.consumptionKWh) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-emerald-50/80 font-bold text-slate-900 border-t-2 border-emerald-200">
            <tr>
              <td className="py-3 px-4 uppercase font-extrabold">TOTAL</td>
              <td className="py-3 px-4 text-center font-bold">{totalConsumptionKWh.toLocaleString()} kWh</td>
              <td className="py-3 px-4 text-right font-bold text-emerald-800">{totalProductionKWh.toFixed(1)} kWh</td>
              <td className="py-3 px-4 text-right font-bold">{totalSavingsKWh.toFixed(1)} kWh</td>
              <td className="py-3 px-4 text-right font-extrabold text-emerald-800">{avgCoveragePct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};
