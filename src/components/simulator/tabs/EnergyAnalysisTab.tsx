import React, { useState } from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Sparkles, ArrowDownToLine, Copy, Check, Eye, EyeOff } from 'lucide-react';

interface EnergyAnalysisTabProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  openAIInvoiceModal: () => void;
  updateMonthlyConsumption: (index: number, value: number) => void;
  updateAllMonthlyConsumption?: (value: number) => void;
  setMonthlyConsumption?: (monthlyConsumption: number[], lockAutoPanels?: boolean) => void;
  updateSpecs?: (specs: Partial<SystemSpecs>) => void;
}

export const EnergyAnalysisTab: React.FC<EnergyAnalysisTabProps> = ({
  project,
  summary,
  openAIInvoiceModal,
  updateMonthlyConsumption,
  updateAllMonthlyConsumption,
  setMonthlyConsumption,
  updateSpecs,
}) => {
  const showSelfConsumption = project.specs.showSelfConsumptionBreakdown !== false;
  const totalConsumptionKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.consumptionKWh || 0), 0);
  const totalProductionKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.productionKWh || 0), 0);
  const totalSelfConsumedKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.solarSelfConsumedKWh || 0), 0);
  const totalExportedKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.gridExportedKWh || 0), 0);
  const totalNetExportCreditKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.netExportCreditKWh || 0), 0);
  const totalRetainedKWh = (summary?.monthlyBreakdown || []).reduce((sum, m) => sum + (m.retainedExportKWh || 0), 0);
  const totalEffectiveSavedKWh = (summary?.monthlyBreakdown || []).reduce(
    (sum, m) => sum + (m.effectiveSavedKWh || (m.solarSelfConsumedKWh + (m.netExportCreditKWh || 0))),
    0
  );
  const avgCoveragePct = summary?.energyCoveragePct || 0;

  const [isReplicated, setIsReplicated] = useState(false);

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

  const handleReplicateProductionToConsumption = () => {
    if (!summary?.monthlyBreakdown || summary.monthlyBreakdown.length !== 12) return;

    // Extraer la producción estimada de cada uno de los 12 meses redondeada a 1 decimal
    const prodValues = summary.monthlyBreakdown.map((m) =>
      Math.max(0, Math.round((m.productionKWh || 0) * 10) / 10)
    );

    if (setMonthlyConsumption) {
      setMonthlyConsumption(prodValues, true);
    } else {
      for (let i = 0; i < 12; i++) {
        updateMonthlyConsumption(i, prodValues[i]);
      }
    }

    setIsReplicated(true);
    setTimeout(() => setIsReplicated(false), 2200);
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
            <span className="text-xl font-bold text-emerald-700">
              ${summary.year1SavingsUSD.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-slate-500 font-semibold">USD</span>
          </div>
          <div className="text-[10px] text-slate-600 font-medium mt-1 leading-tight flex flex-col gap-0.5">
            {showSelfConsumption ? (
              <>
                <span>
                  🏠 Autoconsumo: <strong className="text-slate-800">{totalSelfConsumedKWh.toFixed(1)} kWh</strong>
                </span>
                <span>
                  ⚡ Iny. Neta: <strong className="text-slate-800">{totalNetExportCreditKWh.toFixed(1)} kWh</strong>
                  {totalRetainedKWh > 0 && <span className="text-amber-700 text-[9.5px]"> (Peaje: {totalRetainedKWh.toFixed(1)} kWh)</span>}
                </span>
              </>
            ) : (
              <span>
                💡 Ahorro Anual Estimado: <strong className="text-slate-800">{totalEffectiveSavedKWh.toFixed(1)} kWh</strong>
              </span>
            )}
          </div>
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

      {/* GRÁFICA DE ENERGÍA: BARRAS (+ LÍNEA DE AUTOCONSUMO SI ESTÁ ACTIVO) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 shrink-0">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Evolución Mensual de Energía
            </h3>
            {/* Botón de alternancia Modo Autoconsumo vs Clásico */}
            <button
              type="button"
              onClick={() => updateSpecs && updateSpecs({ showSelfConsumptionBreakdown: !showSelfConsumption })}
              className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer border flex items-center gap-1 shadow-2xs ${
                showSelfConsumption
                  ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
              }`}
              title="Alternar entre desglose con autoconsumo y vista clásica de barras"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showSelfConsumption ? 'bg-blue-600' : 'bg-slate-400'}`}></span>
              <span>{showSelfConsumption ? 'Autoconsumo Activo' : 'Modo Clásico'}</span>
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#14532d]"></span>
              <span className="text-slate-700">Consumo (kWh)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
              <span className="text-slate-700">Producción Solar (kWh)</span>
            </div>
            {showSelfConsumption && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-[#2563eb] rounded-full inline-block"></span>
                <span className="w-2 h-2 rounded-full bg-[#2563eb] inline-block -ml-2.5"></span>
                <span className="text-blue-700 font-bold ml-1">Autoconsumo en Sitio (kWh)</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-[320px] min-h-[320px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
              <Tooltip
                formatter={(val: number, name: string) => [
                  `${Math.round(val).toLocaleString()} kWh`,
                  name === 'consumptionKWh' ? 'Consumo' : name === 'productionKWh' ? 'Producción FV' : 'Autoconsumo en Sitio'
                ]}
              />
              <Bar dataKey="consumptionKWh" name="Consumo" fill="#14532d" radius={[2, 2, 0, 0]} />
              <Bar dataKey="productionKWh" name="Producción FV" fill="#22c55e" radius={[2, 2, 0, 0]} />
              {showSelfConsumption && (
                <Line
                  type="monotone"
                  dataKey="solarSelfConsumedKWh"
                  name="Autoconsumo en Sitio"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#2563eb', strokeWidth: 1.5, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#1d4ed8' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA DE DETALLE MENSUAL EDITABLE CON INGENIERÍA TRANSPARENTE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
        <div className="bg-[#14532d] text-white px-4 py-2.5 font-bold text-xs uppercase tracking-wider flex justify-between items-center">
          <span>Resumen Mensual de Energía & Balance de Ahorro</span>
          <button
            onClick={openAIInvoiceModal}
            className="bg-white/10 hover:bg-white/20 border border-white/30 text-amber-300 hover:text-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Escanear factura eléctrica EDE con IA para autocompletar consumo y cliente"
          >
            <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
            <span>Autocompletar con Factura EDE (IA)</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">MES</th>
                <th className="py-2.5 px-3 text-center">CONSUMO (KWH)</th>
                <th className="py-2.5 px-3 text-right">
                  {showSelfConsumption ? 'PRODUCCIÓN FV' : 'PRODUCCION (KWH)'}
                </th>
                {showSelfConsumption && (
                  <th className="py-2.5 px-3 text-right">
                    <span className="text-blue-700">AUTOCONSUMO</span>
                    <span className="block text-[9.5px] font-normal text-slate-500">Datos aproximados</span>
                  </th>
                )}
                <th className="py-2.5 px-3 text-right">
                  <span className="text-emerald-800 font-extrabold">
                    {showSelfConsumption ? 'AHORRO FACTURABLE' : 'AHORRO ENERG. (KWH)'}
                  </span>
                  {showSelfConsumption && (
                    <span className="block text-[9.5px] font-normal text-emerald-600">
                      Autoconsumo + Iny. Neta
                    </span>
                  )}
                </th>
                <th className="py-2.5 px-3 text-right">% COBERTURA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
              {summary.monthlyBreakdown.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-bold text-slate-800">{row.month}</td>
                  <td className="py-2 px-3 text-center">
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
                  <td className="py-2 px-3 text-right font-semibold">
                    {idx === 0 ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={handleReplicateProductionToConsumption}
                          className={`px-2 py-1 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer shrink-0 border ${
                            isReplicated
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                          title="Replicar la producción estimada mes a mes en la columna de consumo (para cotizaciones basadas en producción con 100% de cobertura)"
                        >
                          {isReplicated ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>¡Replicado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Replicar a consumo</span>
                            </>
                          )}
                        </button>
                        <span className="tabular-nums">{row.productionKWh.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="tabular-nums">{row.productionKWh.toFixed(1)}</span>
                    )}
                  </td>
                  {showSelfConsumption && (
                    <td className="py-2 px-3 text-right font-semibold text-blue-800">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                  )}
                  <td className="py-2 px-3 text-right font-bold text-emerald-800">
                    <span>{(row.effectiveSavedKWh ?? (row.solarSelfConsumedKWh + (row.netExportCreditKWh || 0))).toFixed(1)}</span>
                    {showSelfConsumption && (
                      <span className="block text-[10px] text-emerald-600 font-semibold">${row.savingsUSD.toFixed(1)}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                    {row.consumptionKWh > 0 ? ((row.productionKWh / row.consumptionKWh) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50/80 font-bold text-slate-900 border-t-2 border-emerald-200">
              <tr>
                <td className="py-3 px-3 uppercase font-extrabold">TOTAL</td>
                <td className="py-3 px-3 text-center font-bold">{totalConsumptionKWh.toLocaleString()} kWh</td>
                <td className="py-3 px-3 text-right font-bold text-emerald-800">{totalProductionKWh.toFixed(1)} kWh</td>
                {showSelfConsumption && (
                  <td className="py-3 px-3 text-right font-bold text-blue-800">{totalSelfConsumedKWh.toFixed(1)} kWh</td>
                )}
                <td className="py-3 px-3 text-right font-extrabold text-emerald-900">
                  <span>{totalEffectiveSavedKWh.toFixed(1)} kWh</span>
                  {showSelfConsumption && (
                    <span className="block text-[10.5px] text-emerald-700">${summary.year1SavingsUSD.toFixed(1)} USD</span>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-extrabold text-emerald-800">{avgCoveragePct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
};
