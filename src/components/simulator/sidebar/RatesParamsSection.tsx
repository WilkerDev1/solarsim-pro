import React from 'react';
import { ProjectSimulation, UtilityRates } from '../../../types';
import { Receipt, ChevronDown } from 'lucide-react';

interface RatesParamsSectionProps {
  project: ProjectSimulation;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateRates: (rates: Partial<UtilityRates>) => void;
}

export const RatesParamsSection: React.FC<RatesParamsSectionProps> = ({
  project,
  isOpen,
  onToggle,
  isDark,
  updateRates,
}) => {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
          isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>2. Tarifas y Distribuidora</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`p-3.5 pt-2 space-y-3 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Precio por kWh ($ USD)
            </label>
            <input
              type="number"
              step="0.001"
              value={project.rates.energyCostPerKWh}
              onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Empresa Distribuidora
            </label>
            <select
              value={project.rates.distributor || 'EDESUR'}
              onChange={(e) => updateRates({ distributor: e.target.value as any })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="EDEESTE">EDEESTE</option>
              <option value="EDESUR">EDESUR</option>
              <option value="EDENORTE">EDENORTE</option>
              <option value="CEPM">CEPM</option>
            </select>
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Cobertura Objetivo (%)
            </label>
            <input
              type="number"
              step="1"
              value={project.rates.targetCoveragePct ?? 95}
              onChange={(e) => updateRates({ targetCoveragePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Tipo de Tarifa
            </label>
            <select
              value={project.rates.tariffCode || 'BTS2'}
              onChange={(e) => updateRates({ tariffCode: e.target.value as any })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="BTS1">BTS1 (Residencial Monómica &lt;10kW)</option>
              <option value="BTS2">BTS2 (Comercial Simple Monómica &lt;10kW)</option>
              <option value="BTD">BTD (Baja Tensión con Demanda &gt;10kW)</option>
              <option value="MTD">MTD (Media Tensión con Demanda)</option>
            </select>
          </div>

          {/* Casilla Inyección Cero / Antivertido (Zero-Export) */}
          <div
            className={`flex items-center justify-between p-2.5 rounded-lg border ${
              isDark ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50/60 border-amber-200'
            }`}
          >
            <div className="pr-2">
              <span className={`text-xs font-bold block ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                Inyección Cero / Antivertido (Zero-Export)
              </span>
              <span className={`text-[10px] block leading-tight ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Limita la generación al consumo local, evitando inyección a la red y anulando cargos de exportación.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!project.rates.isZeroExport}
              onChange={(e) => updateRates({ isZeroExport: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4 shrink-0"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className={`block text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Cargo Exportación Red (%) (SIE-007-2026-REG)
              </label>
              {(!project.rates.tariffCode || project.rates.tariffCode === 'BTS1' || project.rates.tariffCode === 'BTS2') && !project.rates.isZeroExport ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                  Monómica (~25%)
                </span>
              ) : (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                  0% (Exento / 1:1)
                </span>
              )}
            </div>

            <input
              type="number"
              step="1"
              disabled={project.rates.isZeroExport || (project.rates.tariffCode !== 'BTS1' && project.rates.tariffCode !== 'BTS2' && project.rates.tariffCode !== undefined)}
              value={
                project.rates.isZeroExport || (project.rates.tariffCode !== 'BTS1' && project.rates.tariffCode !== 'BTS2' && project.rates.tariffCode !== undefined)
                  ? 0
                  : project.rates.gridExportFeePct
              }
              onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />

            {/* Nota explicativa regulatoria debajo del parámetro */}
            <div className="mt-1.5">
              {project.rates.isZeroExport ? (
                <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <span>⚡</span>
                  <span>
                    <strong>Inyección Cero activa:</strong> El sistema no vuelca excedentes a la red pública; por lo tanto, no aplica cargo de uso de red.
                  </span>
                </p>
              ) : (project.rates.tariffCode === 'BTD' || project.rates.tariffCode === 'MTD') ? (
                <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  <span>⚡</span>
                  <span>
                    <strong>Tarifa Binómica ({project.rates.tariffCode}):</strong> Compensación 1:1 de energía neta. No aplica cargo por exportación ya que la red se cubre mediante el cargo fijo por potencia/demanda.
                  </span>
                </p>
              ) : (
                <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  <span>⚡</span>
                  <span>
                    <strong>Tarifa Monómica ({project.rates.tariffCode || 'BTS2'}):</strong> Aplica retención por derecho de uso de red bajo Res. SIE-007-2026-REG sobre los kWh excedentes exportados a la red.
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
