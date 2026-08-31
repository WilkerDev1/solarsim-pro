import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SearchableEquipmentSelect } from './SearchableEquipmentSelect';
import { SolarEquipmentItem } from '../../../types/equipment';
import { Sun, ChevronDown, Sparkles, Sliders, BatteryCharging, Cpu, Zap } from 'lucide-react';

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
  const { equipmentCatalog, openAIDatasheetModal } = useSimulationStore();

  const handleSelectPanel = (item: SolarEquipmentItem) => {
    updateSpecs({
      panelBrandModel: item.displayName,
      panelPowerW: item.powerW || 550,
      panelEfficiency: item.efficiencyPct || 22.0,
      tempCoeff: item.tempCoeff || -0.29,
      annualDegradation: item.annualDegradation || 0.4,
    });
  };

  const handleSelectInverter = (item: SolarEquipmentItem) => {
    updateSpecs({
      inverterBrandModel: item.displayName,
      inverterPowerKW: item.powerKW || 8.0,
    });
  };

  const handleSelectBattery = (item: SolarEquipmentItem) => {
    updateSpecs({
      batteryBrandModel: item.displayName,
      batteryCapacityKWh: item.capacityKWh || 16.08,
      batteryDOD: item.dodPct || 90,
      batteryEfficiencyPct: item.batteryEfficiencyPct || 95,
    });
  };

  const isDetailed = !!project.specs.isDetailed;

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
          className={`p-3.5 pt-2 space-y-3.5 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          {/* Selector de modo Simple (Catálogo) / Detallado (Manual) */}
          <div
            className={`flex rounded-lg p-1 border ${
              isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-200/80 border-slate-300/60'
            }`}
          >
            <button
              type="button"
              onClick={() => updateSpecs({ isDetailed: false })}
              className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                !isDetailed
                  ? isDark
                    ? 'bg-[#27272a] shadow-xs text-white font-bold'
                    : 'bg-white shadow-xs text-slate-900 font-bold'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simple (Catálogo IA)</span>
            </button>
            <button
              type="button"
              onClick={() => updateSpecs({ isDetailed: true })}
              className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                isDetailed
                  ? isDark
                    ? 'bg-[#27272a] shadow-xs text-white font-bold'
                    : 'bg-white shadow-xs text-slate-900 font-bold'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Detallado (Manual)</span>
            </button>
          </div>

          {/* PARÁMETRO DESTACADO VISIBLE: Pérdidas del Sistema (%) */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
              isDark ? 'bg-[#1c1c24] border-[#3f3f46]' : 'bg-emerald-50/70 border-emerald-200/80'
            }`}
          >
            <div>
              <label className={`block text-xs font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-950'}`}>
                Pérdidas del Sistema (%)
              </label>
              <span className={`text-[10px] block ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Rendimiento fotovoltaico global (default: 25.0%)
              </span>
            </div>

            <div className="w-24 shrink-0">
              <input
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={project.specs.systemLosses !== undefined ? project.specs.systemLosses : 25}
                onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center ${
                  isDark ? 'bg-[#121214] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          {/* MODO SIMPLE: Catálogo Inteligente con Búsqueda en Tiempo Real y Escaneo con IA */}
          {!isDetailed ? (
            <div className="space-y-3">
              {/* 1. Selector Inteligente de Paneles */}
              <SearchableEquipmentSelect
                type="panel"
                items={equipmentCatalog}
                selectedValue={project.specs.panelBrandModel || ''}
                selectedPower={project.specs.panelPowerW}
                onSelect={handleSelectPanel}
                onOpenScanner={openAIDatasheetModal}
                label="Módulo Solar Fotovoltaico"
                placeholder="Buscar o seleccionar panel..."
                isDark={isDark}
              />

              {/* Toggle Auto-Calcular Paneles */}
              <div
                className={`p-2 rounded-lg border space-y-1 ${
                  isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/60 border-emerald-200/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-950'}`}>
                    Auto-Calcular Paneles
                  </span>
                  <input
                    type="checkbox"
                    checked={!!project.specs.autoCalculatePanels}
                    onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer h-4 w-4"
                  />
                </div>
                {project.specs.autoCalculatePanels && (
                  <p className={`text-[10px] leading-tight ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Calculando automáticamente para cubrir el {project.rates.targetCoveragePct ?? 95}% del consumo (considerando {project.specs.systemLosses ?? 25}% de pérdidas).
                  </p>
                )}
              </div>

              {/* Cantidad de Paneles */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                  Cantidad de Paneles
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
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

              {/* 2. Selector Inteligente de Inversores */}
              <SearchableEquipmentSelect
                type="inverter"
                items={equipmentCatalog}
                selectedValue={project.specs.inverterBrandModel || ''}
                selectedPower={project.specs.inverterPowerKW}
                onSelect={handleSelectInverter}
                onOpenScanner={openAIDatasheetModal}
                label="Inversor Solar"
                placeholder="Buscar o seleccionar inversor..."
                isDark={isDark}
              />

              {/* Cantidad de Inversores */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                  Cantidad de Inversores
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={project.specs.inverterCount || 1}
                  onChange={(e) => updateSpecs({ inverterCount: parseInt(e.target.value) || 1 })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    isDark
                      ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              {/* Botón Destacado: Escanear Ficha Técnica (IA) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={openAIDatasheetModal}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>Escanear Ficha Técnica con IA</span>
                </button>
              </div>
            </div>
          ) : (
            /* MODO DETALLADO: Ingreso Manual Libre de Parámetros */
            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                  Modelo / Marca Módulos (Manual)
                </label>
                <input
                  type="text"
                  value={project.specs.panelBrandModel || 'Módulos Canadian Solar CS6.1-72TB-600 (600W)'}
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
                className={`p-2.5 rounded-lg border space-y-1 ${
                  isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/60 border-emerald-200/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-950'}`}>
                    Auto-Calcular Paneles
                  </span>
                  <input
                    type="checkbox"
                    checked={!!project.specs.autoCalculatePanels}
                    onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer h-4 w-4"
                  />
                </div>
                {project.specs.autoCalculatePanels && (
                  <p className={`text-[10px] leading-tight ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Calculando automáticamente para cubrir el {project.rates.targetCoveragePct ?? 95}% del consumo (considerando {project.specs.systemLosses ?? 25}% de pérdidas).
                  </p>
                )}
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
                  Modelo / Marca Inversor (Manual)
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

              {/* Subsección de Parámetros Técnicos Avanzados */}
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
                  <Sliders className="w-3.5 h-3.5" /> Parámetros Técnicos Avanzados
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
            </div>
          )}

          {/* ========================================== */}
          {/* 🔋 ALMACENAMIENTO (BATERÍA) CON MODO SIMPLE Y DETALLADO */}
          {/* ========================================== */}
          <div className={`pt-2 border-t space-y-3 ${isDark ? 'border-[#27272a]' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BatteryCharging className="w-4 h-4 text-cyan-400" />
                <label className={`text-xs font-semibold ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                  Almacenamiento (Batería BESS)
                </label>
              </div>
              <input
                type="checkbox"
                checked={project.specs.hasBattery}
                onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer h-4 w-4"
              />
            </div>

            {project.specs.hasBattery && (
              <div
                className={`space-y-3 p-3 rounded-lg border ${
                  isDark ? 'bg-[#202024] border-[#2e2e34]' : 'bg-cyan-50/40 border-cyan-200'
                }`}
              >
                {!isDetailed ? (
                  /* MODO SIMPLE PARA BATERÍAS (Catálogo Inteligente con Búsqueda en Tiempo Real) */
                  <div className="space-y-3">
                    <SearchableEquipmentSelect
                      type="battery"
                      items={equipmentCatalog}
                      selectedValue={project.specs.batteryBrandModel || ''}
                      selectedPower={project.specs.batteryCapacityKWh}
                      onSelect={handleSelectBattery}
                      onOpenScanner={openAIDatasheetModal}
                      label="Batería / Banco de Almacenamiento"
                      placeholder="Buscar o seleccionar batería..."
                      isDark={isDark}
                    />

                    {/* Cantidad de Baterías */}
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
                  </div>
                ) : (
                  /* MODO DETALLADO PARA BATERÍAS (Manual) */
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                        Modelo / Marca Batería (Manual)
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

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Cantidad Baterías
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
                          Capacidad Unit. (kWh)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={project.specs.batteryCapacityKWh}
                          onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          DoD Descarga (%)
                        </label>
                        <input
                          type="number"
                          step="5"
                          value={project.specs.batteryDOD || 90}
                          onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 90 })}
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
                          value={project.specs.batteryEfficiencyPct || 95}
                          onChange={(e) => updateSpecs({ batteryEfficiencyPct: parseFloat(e.target.value) || 95 })}
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
                  </div>
                )}

                {/* Resumen de Autonomía y Energía Útil */}
                <div
                  className={`rounded-lg p-2.5 text-[10px] font-bold space-y-1 mt-2 border ${
                    isDark
                      ? 'bg-cyan-950/70 border-cyan-800/80 text-cyan-200'
                      : 'bg-cyan-100/90 border-cyan-300 text-cyan-950'
                  }`}
                >
                  <div className="flex justify-between">
                    <span>Energía Útil Batería:</span>
                    <span className={`font-extrabold font-mono ${isDark ? 'text-cyan-100' : 'text-cyan-900'}`}>
                      {summary.batteryUsableKWh} kWh ({project.specs.batteryCount || 1} x {project.specs.batteryCapacityKWh || 16.08} kWh)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Autonomía Anti-Apagones:</span>
                    <span className={`font-extrabold font-mono ${isDark ? 'text-cyan-100' : 'text-cyan-900'}`}>
                      ~{summary.batteryBackupAutonomyHours} Horas
                    </span>
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
