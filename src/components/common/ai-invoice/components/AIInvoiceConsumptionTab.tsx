import React from 'react';
import { TrendingUp, RotateCcw } from 'lucide-react';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { INVOICE_MONTH_NAMES } from '../types';

interface AIInvoiceConsumptionTabProps {
  isDark: boolean;
  extractedData: ExtractedInvoiceData;
  maxConsumptionVal: number;
  isPeakModeActive: boolean;
  peakConsumptionVal: number;
  peakMonthName: string;
  handleTogglePeakMonthMode: () => void;
  handleUpdateMonthlyConsumption: (index: number, val: number) => void;
}

export const AIInvoiceConsumptionTab: React.FC<AIInvoiceConsumptionTabProps> = ({
  isDark,
  extractedData,
  maxConsumptionVal,
  isPeakModeActive,
  peakConsumptionVal,
  peakMonthName,
  handleTogglePeakMonthMode,
  handleUpdateMonthlyConsumption,
}) => {
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div
          className={`p-3 rounded-xl border ${
            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Consumo Anual Total</span>
          <p className="text-base font-extrabold text-emerald-400 font-mono">
            {extractedData.annualConsumptionKWh.toLocaleString()} <span className="text-[10px] font-normal">kWh/a</span>
          </p>
        </div>
        <div
          className={`p-3 rounded-xl border ${
            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Promedio Mensual</span>
          <p className="text-base font-extrabold text-amber-400 font-mono">
            {extractedData.averageMonthlyKWh.toLocaleString()} <span className="text-[10px] font-normal">kWh/m</span>
          </p>
        </div>
        <div
          className={`p-3 rounded-xl border ${
            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Precio Energía</span>
          <p className="text-base font-extrabold text-cyan-400 font-mono">
            {extractedData.energyCostPerKWhDOP ? `RD$ ${extractedData.energyCostPerKWhDOP.toFixed(2)}` : 'N/D'}
          </p>
        </div>
        <div
          className={`p-3 rounded-xl border ${
            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Total Facturado</span>
          <p className="text-base font-extrabold text-rose-400 font-mono">
            {extractedData.totalBilledAmountDOP ? `RD$ ${extractedData.totalBilledAmountDOP.toLocaleString()}` : 'N/D'}
          </p>
        </div>
      </div>

      {/* Financial & Technical Details Pill Banner */}
      {(extractedData.peakDemandKW || extractedData.governmentSubsidyDOP || extractedData.powerFactor) && (
        <div
          className={`p-3 rounded-xl border text-[11px] grid grid-cols-2 sm:grid-cols-3 gap-2 ${
            isDark ? 'bg-[#161622] border-[#2a2a3c] text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-800'
          }`}
        >
          {extractedData.peakDemandKW && (
            <div>
              <span className="text-zinc-500 font-bold block text-[10px]">POTENCIA MÁXIMA (DEMANDA):</span>
              <span className="font-mono font-bold text-emerald-400">{extractedData.peakDemandKW} kW</span>
            </div>
          )}
          {extractedData.powerFactor && (
            <div>
              <span className="text-zinc-500 font-bold block text-[10px]">FACTOR DE POTENCIA / EFIC.:</span>
              <span className="font-mono font-bold text-amber-400">{extractedData.powerFactor}</span>
            </div>
          )}
          {extractedData.governmentSubsidyDOP && (
            <div>
              <span className="text-zinc-500 font-bold block text-[10px]">SUBSIDIO GOBIERNO RD$:</span>
              <span className="font-mono font-bold text-cyan-400">RD$ {extractedData.governmentSubsidyDOP.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Visual Mini Bar Chart */}
      <div
        className={`p-3.5 rounded-xl border space-y-2 ${
          isDark ? 'bg-[#13131a] border-[#2a2a38]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block">
            Histórico de 12 Meses (kWh)
          </span>
          <span className="text-[9px] text-emerald-400 font-mono font-semibold">
            Ene a Dic (Año Natural)
          </span>
        </div>
        <div className="h-24 flex items-end gap-1.5 pt-2">
          {extractedData.monthlyConsumptionKWh.map((val, idx) => {
            const pct = Math.min(100, Math.round((val / maxConsumptionVal) * 100));
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full bg-emerald-500/20 rounded-t h-20 flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t transition-all duration-300"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">
                  {INVOICE_MONTH_NAMES[idx].slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ⚡ Botón y Estado: Dimensionar con Consumo Pico Anual */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
          isPeakModeActive
            ? isDark
              ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
              : 'bg-amber-50/80 border-amber-300 text-amber-900'
            : isDark
            ? 'bg-[#15151f] border-[#2a2a3c] text-zinc-300'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isPeakModeActive
                ? 'bg-amber-500 text-white shadow-xs'
                : isDark
                ? 'bg-[#20202e] text-amber-400'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">
                {isPeakModeActive ? 'Modo Consumo Pico Activo' : 'Dimensionamiento por Mes Más Alto'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {peakConsumptionVal.toLocaleString()} kWh ({peakMonthName})
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isPeakModeActive
                ? `Se está aplicando ${peakConsumptionVal.toLocaleString()} kWh a todos los meses como la media del año para máxima cobertura solar.`
                : `Toma el consumo más alto del año (${peakConsumptionVal.toLocaleString()} kWh en ${peakMonthName}) como la media mensual para recomendar paneles.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTogglePeakMonthMode}
          className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs ${
            isPeakModeActive
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white'
          }`}
        >
          {isPeakModeActive ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer Historial Real</span>
            </>
          ) : (
            <>
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Aplicar Mes Pico a Todo el Año</span>
            </>
          )}
        </button>
      </div>

      {/* 12 Editable Inputs */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase font-bold text-zinc-400">
          Ajuste Manual por Mes (kWh)
        </span>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {INVOICE_MONTH_NAMES.map((m, idx) => (
            <div
              key={m}
              className={`p-2 rounded-xl border ${
                isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
              }`}
            >
              <label className="block text-[9px] font-bold uppercase text-zinc-400 truncate">
                {m}
              </label>
              <input
                type="number"
                min={0}
                value={extractedData.monthlyConsumptionKWh[idx] || 0}
                onChange={(e) => handleUpdateMonthlyConsumption(idx, parseFloat(e.target.value) || 0)}
                className={`w-full mt-1 px-2 py-1 rounded-lg border text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500 ${
                  isDark ? 'bg-[#101016] border-[#343448] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
