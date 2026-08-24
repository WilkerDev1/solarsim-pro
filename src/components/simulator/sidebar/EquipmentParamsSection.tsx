import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { Sun, ChevronDown } from 'lucide-react';

interface EquipmentParamsSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

export const EquipmentParamsSection: React.FC<EquipmentParamsSectionProps> = ({
  project,
  summary,
  isOpen,
  onToggle,
  isDark,
  updateSpecs,
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
          <Sun className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>3. Equipamiento y Sistema</span>
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
          {/* Selector de modo Simple / Detallado */}
          <div
            className={`flex rounded-lg p-1 mb-2 border ${
              isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-200/80 border-slate-300/60'
            }`}
          >
            <button
              type="button"
              onClick={() => updateSpecs({ isDetailed: false })}
              className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer ${
                !project.specs.isDetailed
                  ? isDark
                    ? 'bg-[#27272a] shadow-xs text-white font-bold'
                    : 'bg-white shadow-xs text-slate-900 font-bold'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => updateSpecs({ isDetailed: true })}
              className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer ${
                project.specs.isDetailed
                  ? isDark
                    ? 'bg-[#27272a] shadow-xs text-white font-bold'
                    : 'bg-white shadow-xs text-slate-900 font-bold'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              Detallado
            </button>
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Modelo / Marca Módulos
            </label>
            <input
              type="text"
              value={project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}
              onChange={(e) => updateSpecs({ panelBrandModel: e.target.value })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Potencia del Panel (W)
            </label>
            <input
              type="number"
              step="5"
              value={project.specs.panelPowerW}
              onChange={(e) => updateSpecs({ panelPowerW: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* Toggle Auto-Calcular Paneles */}
          <div
            className={`flex items-center justify-between p-2.5 rounded-lg border ${
              isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/60 border-emerald-200/80'
            }`}
          >
            <span className={`text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-950'}`}>
              Auto-Calcular Paneles
            </span>
            <input
              type="checkbox"
              checked={!!project.specs.autoCalculatePanels}
              onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Cantidad de Paneles
            </label>
            <input
              type="number"
              step="1"
              disabled={project.specs.autoCalculatePanels}
              value={project.specs.panelCount}
              onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Modelo / Marca Inversor
            </label>
            <input
              type="text"
              value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
              onChange={(e) => updateSpecs({ inverterBrandModel: e.target.value })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* CAMPOS MODO DETALLADO */}
          {project.specs.isDetailed && (
            <div
              className={`space-y-3 p-3 rounded-lg border mt-3 ${
                isDark ? 'bg-[#202024] border-[#2e2e34]' : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <h4
                className={`text-[11px] font-bold uppercase tracking-wider border-b pb-1 flex items-center gap-1.5 ${
                  isDark ? 'text-emerald-400 border-[#2e2e34]' : 'text-emerald-900 border-emerald-200'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">tune</span> Parámetros Técnicos Avanzados
              </h4>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Potencia Inversor (kW)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={project.specs.inverterPowerKW}
                    onChange={(e) => updateSpecs({ inverterPowerKW: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Cantidad Inversores
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={project.specs.inverterCount || 1}
                    onChange={(e) => updateSpecs({ inverterCount: parseInt(e.target.value) || 1 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Eficiencia Panel (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={project.specs.panelEfficiency}
                    onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Coef. Temp (%/°C)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={project.specs.tempCoeff}
                    onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Pérdidas Sistema (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={project.specs.systemLosses}
                    onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Degradación Anual (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={project.specs.annualDegradation}
                    onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Almacenamiento (Batería) Toggle & Campos */}
          <div className={`pt-2 border-t space-y-3 ${isDark ? 'border-[#27272a]' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-semibold ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                Almacenamiento (Batería)
              </label>
              <input
                type="checkbox"
                checked={project.specs.hasBattery}
                onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
              />
            </div>

            {project.specs.hasBattery && (
              <div
                className={`space-y-3 p-3 rounded-lg border ${
                  isDark ? 'bg-[#202024] border-[#2e2e34]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Modelo / Marca Batería
                  </label>
                  <input
                    type="text"
                    value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                    onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Cantidad de Baterías
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={project.specs.batteryCount || 1}
                    onChange={(e) => updateSpecs({ batteryCount: parseInt(e.target.value) || 1 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Capacidad Total Batería (kWh)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={project.specs.batteryCapacityKWh}
                    onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                {/* Parámetros Detallados de Batería */}
                <div className={`pt-2 border-t space-y-2 ${isDark ? 'border-[#2e2e34]' : 'border-slate-200'}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                        DoD Descarga (%)
                      </label>
                      <input
                        type="number"
                        step="5"
                        value={project.specs.batteryDOD || 80}
                        onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 80 })}
                        className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                          isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                        Eficiencia Carga (%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={project.specs.batteryEfficiencyPct || 92}
                        onChange={(e) => updateSpecs({ batteryEfficiencyPct: parseFloat(e.target.value) || 92 })}
                        className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                          isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                      Costo Reemplazo Año 10 (USD)
                    </label>
                    <input
                      type="number"
                      step="500"
                      value={project.specs.batteryReplacementCostUSD || 0}
                      onChange={(e) => updateSpecs({ batteryReplacementCostUSD: parseFloat(e.target.value) || 0 })}
                      placeholder="Ej. $3,500 USD"
                      className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                        isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>

                  <div
                    className={`rounded-lg p-2 text-[10px] font-bold space-y-0.5 mt-1 border ${
                      isDark
                        ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-300'
                        : 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>Energía Útil Batería:</span>
                      <span className={`font-extrabold ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>
                        {summary.batteryUsableKWh} kWh
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Autonomía Anti-Apagones:</span>
                      <span className={`font-extrabold ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>
                        ~{summary.batteryBackupAutonomyHours} Horas
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
