import { catalogPanelGroupPatch } from '../../../utils/catalogGroupPatch';
import React from 'react';
import { editEquipmentGroup } from '../../../utils/equipmentGroups';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs, PanelItemSpec, InverterItemSpec, BatteryItemSpec } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SearchableEquipmentSelect } from './SearchableEquipmentSelect';
import { BatteryEquipmentSection } from './BatteryEquipmentSection';
import { SolarEquipmentItem } from '../../../types/equipment';
import { Sun, ChevronDown, Sparkles, Sliders, BatteryCharging, Cpu, Zap, Plus, Trash2 } from 'lucide-react';
import {
  getProjectPanels,
  getProjectInverters,
  getProjectBatteries,
  calculateTotalDCCapacityKWp,
  calculateTotalPanelCount,
  calculateTotalInverterPowerKW,
  calculateTotalInverterCount,
  calculateTotalBatteryCapacityKWh,
  calculateTotalBatteryCount,
} from '../../../utils/equipmentSpecsUtils';

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

  const projectPanels = getProjectPanels(project.specs);
  const extraPanels = projectPanels.slice(1);
  const totalDCKWp = calculateTotalDCCapacityKWp(project.specs);
  const totalPanelCount = calculateTotalPanelCount(project.specs);

  const projectInverters = getProjectInverters(project.specs);
  const extraInverters = projectInverters.slice(1);
  const totalInverterKW = calculateTotalInverterPowerKW(project.specs);
  const totalInverterCount = calculateTotalInverterCount(project.specs);


  // Auto-sanear inconsistencias de potencia unitaria si el modelo seleccionado está en el catálogo verificado
  React.useEffect(() => {
    if (project.specs.inverterBrandModel && project.specs.inverterPowerKW) {
      const match = equipmentCatalog.find(
        (it) => it.type === 'inverter' && it.displayName === project.specs.inverterBrandModel
      );
      if (match && match.powerKW && match.powerKW !== project.specs.inverterPowerKW) {
        updateSpecs({ inverterPowerKW: match.powerKW });
      }
    }
    if (project.specs.panelBrandModel && project.specs.panelPowerW) {
      const match = equipmentCatalog.find(
        (it) => it.type === 'panel' && it.displayName === project.specs.panelBrandModel
      );
      if (match && match.powerW && match.powerW !== project.specs.panelPowerW) {
        updateSpecs({ panelPowerW: match.powerW });
      }
    }
  }, [project.specs.inverterBrandModel, project.specs.panelBrandModel, equipmentCatalog]);

  // --- EQUIPMENT GROUP HANDLERS (lists are the source; editEquipmentGroup keeps the legacy mirror) ---
  const handleAddPanelModel = () => {
    const candidate = equipmentCatalog.find(
      (e) => e.type === 'panel' && e.displayName !== getProjectPanels(project.specs)[0]?.brandModel
    );

    const newPanel: PanelItemSpec = {
      id: `panel-${Date.now()}`,
      brandModel: candidate?.displayName || 'Módulos JA Solar JAM66D45-630/LB (630W)',
      powerW: candidate?.powerW || 630,
      count: 10,
      unitPriceUSD: candidate?.supplierPrices?.[0]?.priceUSD || (candidate?.powerW ? candidate.powerW * 0.17 : 105),
    };

    updateSpecs({ ...editEquipmentGroup(project.specs, 'panel', { type: 'add', item: newPanel }), autoCalculatePanels: false });
  };
  const handleAddInverterModel = () => {
    const candidate = equipmentCatalog.find(
      (e) => e.type === 'inverter' && e.displayName !== getProjectInverters(project.specs)[0]?.brandModel
    );

    const newInv: InverterItemSpec = {
      id: `inv-${Date.now()}`,
      brandModel: candidate?.displayName || 'Inversor Huawei SUN2000-5KTL-M1 (5.0kW)',
      powerKW: candidate?.powerKW || 5.0,
      count: 1,
      unitPriceUSD: candidate?.supplierPrices?.[0]?.priceUSD || (candidate?.powerKW ? candidate.powerKW * 220 : 1100),
    };

    updateSpecs({ ...editEquipmentGroup(project.specs, 'inverter', { type: 'add', item: newInv }) });
  };
  const handleUpdatePanelItem = (index: number, updates: Partial<PanelItemSpec>) =>
    updateSpecs(editEquipmentGroup(project.specs, 'panel', { type: 'update', index, patch: updates }));
  const handleRemovePanelItem = (index: number) =>
    updateSpecs(editEquipmentGroup(project.specs, 'panel', { type: 'remove', index }));
  const handleUpdateInverterItem = (index: number, updates: Partial<InverterItemSpec>) =>
    updateSpecs(editEquipmentGroup(project.specs, 'inverter', { type: 'update', index, patch: updates }));
  const handleRemoveInverterItem = (index: number) =>
    updateSpecs(editEquipmentGroup(project.specs, 'inverter', { type: 'remove', index }));

  const handleSelectPanel = (item: SolarEquipmentItem) => {
    const suppliers = item.supplierPrices || [];
    const newSupplierInfo = { ...(project.specs.selectedSupplierInfo || {}) };
    const specsUpdate: Partial<SystemSpecs> = {
      panelBrandModel: item.displayName,
      panelPowerW: item.powerW || 550,
      panelEfficiency: item.efficiencyPct || 22.0,
      tempCoeff: item.tempCoeff || -0.29,
      annualDegradation: item.annualDegradation || 0.4,
    };

    if (project.specs.autoSupplierPricing && suppliers.length > 0) {
      const bestSp = [...suppliers].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      specsUpdate.panelUnitPriceUSD = bestSp.priceUSD;
      newSupplierInfo.panel = {
        supplierName: bestSp.supplierName,
        priceUSD: bestSp.priceUSD,
        updatedAt: bestSp.updatedAt,
        supplierPriceId: bestSp.id,
      };
    } else {
      const match = suppliers.find(
        (sp) =>
          sp.id === newSupplierInfo.panel?.supplierPriceId ||
          sp.supplierName.toLowerCase().trim() === newSupplierInfo.panel?.supplierName?.toLowerCase().trim()
      );
      if (match) {
        newSupplierInfo.panel = {
          supplierName: match.supplierName,
          priceUSD: match.priceUSD,
          updatedAt: match.updatedAt,
          supplierPriceId: match.id,
        };
      } else {
        delete newSupplierInfo.panel;
      }
    }

    if (project.specs.panels && project.specs.panels.length > 0) {
      const updatedPanels = [...project.specs.panels];
      updatedPanels[0] = {
        ...updatedPanels[0],
        ...catalogPanelGroupPatch(item),
        unitPriceUSD: specsUpdate.panelUnitPriceUSD ?? updatedPanels[0].unitPriceUSD,
      };
      specsUpdate.panels = updatedPanels;
    }

    specsUpdate.selectedSupplierInfo = newSupplierInfo;
    updateSpecs(specsUpdate);
  };

  const handleSelectInverter = (item: SolarEquipmentItem) => {
    const suppliers = item.supplierPrices || [];
    const newSupplierInfo = { ...(project.specs.selectedSupplierInfo || {}) };
    const specsUpdate: Partial<SystemSpecs> = {
      inverterBrandModel: item.displayName,
      inverterPowerKW: item.powerKW || 8.0,
    };

    if (project.specs.autoSupplierPricing && suppliers.length > 0) {
      const bestSp = [...suppliers].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      specsUpdate.inverterUnitPriceUSD = bestSp.priceUSD;
      newSupplierInfo.inverter = {
        supplierName: bestSp.supplierName,
        priceUSD: bestSp.priceUSD,
        updatedAt: bestSp.updatedAt,
        supplierPriceId: bestSp.id,
      };
    } else {
      const match = suppliers.find(
        (sp) =>
          sp.id === newSupplierInfo.inverter?.supplierPriceId ||
          sp.supplierName.toLowerCase().trim() === newSupplierInfo.inverter?.supplierName?.toLowerCase().trim()
      );
      if (match) {
        newSupplierInfo.inverter = {
          supplierName: match.supplierName,
          priceUSD: match.priceUSD,
          updatedAt: match.updatedAt,
          supplierPriceId: match.id,
        };
      } else {
        delete newSupplierInfo.inverter;
      }
    }

    if (project.specs.inverters && project.specs.inverters.length > 0) {
      const updatedInverters = [...project.specs.inverters];
      updatedInverters[0] = {
        ...updatedInverters[0],
        brandModel: item.displayName,
        powerKW: item.powerKW || 8.0,
        unitPriceUSD: specsUpdate.inverterUnitPriceUSD ?? updatedInverters[0].unitPriceUSD,
      };
      specsUpdate.inverters = updatedInverters;
    }

    specsUpdate.selectedSupplierInfo = newSupplierInfo;
    updateSpecs(specsUpdate);
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
        className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors text-slate-800 hover:bg-slate-50 dark:text-zinc-200 dark:hover:bg-[#222230]`}
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
          className={`p-3.5 pt-2 space-y-3.5 border-t border-slate-100 bg-slate-50/50 dark:border-[#27272a] dark:bg-[#14141c]/50`}
        >
          {/* Selector de modo Simple (Catálogo) / Detallado (Manual) */}
          <div
            className={`flex rounded-lg p-1 border bg-slate-200/80 border-slate-300/60 dark:bg-[#121214] dark:border-[#27272a]`}
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
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 bg-emerald-50/70 border-emerald-200/80 dark:bg-[#1c1c24] dark:border-[#3f3f46]`}
          >
            <div>
              <label className={`block text-xs font-bold text-emerald-950 dark:text-emerald-400`}>
                Pérdidas del Sistema (%)
              </label>
              <span className={`text-[10px] block text-slate-600 dark:text-zinc-400`}>
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
                className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-900 dark:bg-[#121214] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
            </div>
          </div>

          {/* MODO SIMPLE: Catálogo Inteligente con Búsqueda en Tiempo Real y Escaneo con IA */}
          {!isDetailed ? (
            <div className="space-y-4">
              {/* 1. SECCIÓN PANELES FOTOVOLTAICOS */}
              <div className="space-y-2.5">
                {/* Selector Inteligente de Paneles (Modelo #1) */}
                <SearchableEquipmentSelect
                  type="panel"
                  items={equipmentCatalog}
                  selectedValue={project.specs.panelBrandModel || ''}
                  selectedPower={project.specs.panelPowerW}
                  onSelect={handleSelectPanel}
                  onOpenScanner={openAIDatasheetModal}
                  label={projectPanels.length > 1 ? "Módulo Fotovoltaico (Modelo #1 Principal)" : "Módulo Solar Fotovoltaico"}
                  placeholder="Buscar o seleccionar panel..."
                  isDark={isDark}
                />

                {/* Toggle Auto-Calcular Paneles */}
                <div
                  className={`p-2 rounded-lg border space-y-1 bg-emerald-50/60 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800/60`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold text-emerald-950 dark:text-emerald-300`}>
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
                    <p className={`text-[10px] leading-tight text-emerald-700 dark:text-emerald-400`}>
                      Calculando automáticamente para cubrir el {project.rates.targetCoveragePct ?? 95}% del consumo (considerando {project.specs.systemLosses ?? 25}% de pérdidas).
                    </p>
                  )}
                </div>

                {/* Cantidad de Paneles (Modelo #1) */}
                <div>
                  <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                    {projectPanels.length > 1 ? "Cantidad de Paneles (Modelo #1)" : "Cantidad de Paneles"}
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    disabled={project.specs.autoCalculatePanels}
                    value={project.specs.panelCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 0;
                      if (project.specs.panels && project.specs.panels.length > 0) {
                        handleUpdatePanelItem(0, { count });
                      } else {
                        updateSpecs({ panelCount: count });
                      }
                    }}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                {/* Paneles Adicionales (Modelo #2, #3, ...) */}
                {extraPanels.map((p, extraIdx) => {
                  const actualIdx = extraIdx + 1;
                  return (
                    <div
                      key={p.id || actualIdx}
                      className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-amber-50/40 border-amber-200 dark:bg-[#181822] dark:border-amber-900/40`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-extrabold flex items-center gap-1 text-amber-800 dark:text-amber-400`}>
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>Módulo Solar (Modelo #{actualIdx + 1})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePanelItem(actualIdx)}
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                          title="Eliminar este modelo de panel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <SearchableEquipmentSelect
                        type="panel"
                        items={equipmentCatalog}
                        selectedValue={p.brandModel}
                        selectedPower={p.powerW}
                        onSelect={(item) => {
                          handleUpdatePanelItem(actualIdx, {
                            ...catalogPanelGroupPatch(item),
                            unitPriceUSD: item.supplierPrices?.[0]?.priceUSD || p.unitPriceUSD,
                          });
                        }}
                        onOpenScanner={openAIDatasheetModal}
                        label={`Modelo Panel #${actualIdx + 1}`}
                        placeholder="Buscar o seleccionar panel..."
                        isDark={isDark}
                      />

                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                          Cantidad de Paneles
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={p.count}
                          onChange={(e) => handleUpdatePanelItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Botón para agregar otro modelo de panel */}
                <button
                  type="button"
                  onClick={handleAddPanelModel}
                  className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-amber-300 hover:border-amber-500 bg-amber-50/60 hover:bg-amber-100 text-amber-800 dark:border-amber-700/50 dark:hover:border-amber-500 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 dark:text-amber-400`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Agregar otro modelo de panel</span>
                </button>

                {/* Resumen Total de Paneles si hay múltiples */}
                {projectPanels.length > 1 && (
                  <div
                    className={`p-2 rounded-lg text-[10.5px] font-bold flex items-center justify-between border bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-300`}
                  >
                    <span>Capacidad Total DC:</span>
                    <span className="font-extrabold font-mono">
                      {totalDCKWp.toFixed(2)} kWp ({totalPanelCount} módulos)
                    </span>
                  </div>
                )}
              </div>

              {/* 2. SECCIÓN INVERSORES FOTOVOLTAICOS */}
              <div className="space-y-2.5 pt-2 border-t border-dashed border-zinc-700/40">
                {/* Selector Inteligente de Inversores (Modelo #1) */}
                <SearchableEquipmentSelect
                  type="inverter"
                  items={equipmentCatalog}
                  selectedValue={project.specs.inverterBrandModel || ''}
                  selectedPower={project.specs.inverterPowerKW}
                  onSelect={handleSelectInverter}
                  onOpenScanner={openAIDatasheetModal}
                  label={projectInverters.length > 1 ? "Inversor Solar (Modelo #1 Principal)" : "Inversor Solar"}
                  placeholder="Buscar o seleccionar inversor..."
                  isDark={isDark}
                />

                {/* Cantidad de Inversores (Modelo #1) */}
                <div>
                  <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                    {projectInverters.length > 1 ? "Cantidad de Inversores (Modelo #1)" : "Cantidad de Inversores"}
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={project.specs.inverterCount || 1}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      if (project.specs.inverters && project.specs.inverters.length > 0) {
                        handleUpdateInverterItem(0, { count });
                      } else {
                        updateSpecs({ inverterCount: count });
                      }
                    }}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                {/* Inversores Adicionales (Modelo #2, #3, ...) */}
                {extraInverters.map((inv, extraIdx) => {
                  const actualIdx = extraIdx + 1;
                  return (
                    <div
                      key={inv.id || actualIdx}
                      className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-emerald-50/40 border-emerald-200 dark:bg-[#181822] dark:border-emerald-900/50`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-extrabold flex items-center gap-1 text-emerald-800 dark:text-emerald-400`}>
                          <Zap className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Inversor (Modelo #{actualIdx + 1})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInverterItem(actualIdx)}
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                          title="Eliminar este modelo de inversor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <SearchableEquipmentSelect
                        type="inverter"
                        items={equipmentCatalog}
                        selectedValue={inv.brandModel}
                        selectedPower={inv.powerKW}
                        onSelect={(item) => {
                          handleUpdateInverterItem(actualIdx, {
                            brandModel: item.displayName,
                            powerKW: item.powerKW || 5.0,
                            unitPriceUSD: item.supplierPrices?.[0]?.priceUSD || inv.unitPriceUSD,
                          });
                        }}
                        onOpenScanner={openAIDatasheetModal}
                        label={`Modelo Inversor #${actualIdx + 1}`}
                        placeholder="Buscar o seleccionar inversor..."
                        isDark={isDark}
                      />

                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                          Cantidad de Inversores
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={inv.count}
                          onChange={(e) => handleUpdateInverterItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Botón para agregar otro modelo de inversor */}
                <button
                  type="button"
                  onClick={handleAddInverterModel}
                  className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-emerald-300 hover:border-emerald-500 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 dark:border-emerald-700/60 dark:hover:border-emerald-500 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 dark:text-emerald-400`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Agregar otro modelo de inversor</span>
                </button>

                {/* Badge de Resumen de Inversores Totales */}
                <div
                  className={`p-2 rounded-lg text-[10.5px] font-bold flex items-center justify-between border bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300`}
                >
                  <span>Potencia Total Inversores:</span>
                  <span className="font-extrabold font-mono">
                    {totalInverterKW} kW ({totalInverterCount} {totalInverterCount === 1 ? 'unidad' : 'unidades'})
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* MODO DETALLADO: Ingreso Manual Libre de Parámetros */
            <div className="space-y-4">
              {/* --- MÓDULOS FOTOVOLTAICOS (MANUAL) --- */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold text-slate-700 dark:text-zinc-200`}>
                    Módulo Solar (Modelo #1 Principal)
                  </span>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                    Modelo / Marca Módulos (Manual)
                  </label>
                  <input
                    type="text"
                    value={project.specs.panelBrandModel || 'Módulos Canadian Solar CS6.1-72TB-600 (600W)'}
                    onChange={(e) => handleUpdatePanelItem(0, { brandModel: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                      Potencia del Panel (W)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={project.specs.panelPowerW}
                      onChange={(e) => handleUpdatePanelItem(0, { powerW: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                      Cantidad de Paneles
                    </label>
                    <input
                      type="number"
                      step="1"
                      disabled={project.specs.autoCalculatePanels}
                      value={project.specs.panelCount}
                      onChange={(e) => handleUpdatePanelItem(0, { count: parseInt(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>
                </div>

                {/* Toggle Auto-Calcular Paneles */}
                <div
                  className={`p-2.5 rounded-lg border space-y-1 bg-emerald-50/60 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800/60`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold text-emerald-950 dark:text-emerald-300`}>
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
                    <p className={`text-[10px] leading-tight text-emerald-700 dark:text-emerald-400`}>
                      Calculando automáticamente para cubrir el {project.rates.targetCoveragePct ?? 95}% del consumo (considerando {project.specs.systemLosses ?? 25}% de pérdidas).
                    </p>
                  )}
                </div>

                {/* Paneles Adicionales en Modo Manual */}
                {extraPanels.map((p, extraIdx) => {
                  const actualIdx = extraIdx + 1;
                  return (
                    <div
                      key={p.id || actualIdx}
                      className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-amber-50/40 border-amber-200 dark:bg-[#181822] dark:border-amber-900/40`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-extrabold flex items-center gap-1 text-amber-800 dark:text-amber-400`}>
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>Módulo Solar (Modelo #{actualIdx + 1})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePanelItem(actualIdx)}
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                          title="Eliminar este modelo de panel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className={`block text-[10px] font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                          Modelo / Marca Panel (Manual)
                        </label>
                        <input
                          type="text"
                          value={p.brandModel}
                          onChange={(e) => handleUpdatePanelItem(actualIdx, { brandModel: e.target.value })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                            Potencia (W)
                          </label>
                          <input
                            type="number"
                            step="5"
                            min="50"
                            value={p.powerW}
                            onChange={(e) => handleUpdatePanelItem(actualIdx, { powerW: parseFloat(e.target.value) || 0 })}
                            className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                            Cantidad
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={p.count}
                            onChange={(e) => handleUpdatePanelItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                            className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Botón para agregar otro modelo de panel en Modo Detallado */}
                <button
                  type="button"
                  onClick={handleAddPanelModel}
                  className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-amber-300 hover:border-amber-500 bg-amber-50/60 hover:bg-amber-100 text-amber-800 dark:border-amber-700/50 dark:hover:border-amber-500 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 dark:text-amber-400`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Agregar otro modelo de panel</span>
                </button>

                {projectPanels.length > 1 && (
                  <div
                    className={`p-2 rounded-lg text-xs flex justify-between items-center ${
                      isDark ? 'bg-amber-950/40 text-amber-300 border border-amber-800/60' : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}
                  >
                    <span>Potencia Total Módulos:</span>
                    <span className="font-extrabold font-mono">
                      {totalDCKWp.toFixed(2)} kWp ({totalPanelCount} unidades)
                    </span>
                  </div>
                )}
              </div>

              {/* --- INVERSORES SOLARES (MANUAL) --- */}
              <div className="space-y-3 pt-3 border-t border-dashed border-zinc-700/50">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold text-slate-700 dark:text-zinc-200`}>
                    Inversor Solar (Modelo #1 Principal)
                  </span>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                    Modelo / Marca Inversor (Manual)
                  </label>
                  <input
                    type="text"
                    value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
                    onChange={(e) => handleUpdateInverterItem(0, { brandModel: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all bg-slate-50 border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                      Potencia Inversor (kW)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={project.specs.inverterPowerKW}
                      onChange={(e) => handleUpdateInverterItem(0, { powerKW: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                      Cantidad Inversores
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={project.specs.inverterCount || 1}
                      onChange={(e) => handleUpdateInverterItem(0, { count: parseInt(e.target.value) || 1 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>
                </div>

                {/* Inversores Adicionales en Modo Manual */}
                {extraInverters.map((inv, extraIdx) => {
                  const actualIdx = extraIdx + 1;
                  return (
                    <div
                      key={inv.id || actualIdx}
                      className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-emerald-50/40 border-emerald-200 dark:bg-[#181822] dark:border-emerald-900/50`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-extrabold flex items-center gap-1 text-emerald-800 dark:text-emerald-400`}>
                          <Zap className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Inversor (Modelo #{actualIdx + 1})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInverterItem(actualIdx)}
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                          title="Eliminar este modelo de inversor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className={`block text-[10px] font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                          Modelo / Marca Inversor (Manual)
                        </label>
                        <input
                          type="text"
                          value={inv.brandModel}
                          onChange={(e) => handleUpdateInverterItem(actualIdx, { brandModel: e.target.value })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                            Potencia (kW)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={inv.powerKW}
                            onChange={(e) => handleUpdateInverterItem(actualIdx, { powerKW: parseFloat(e.target.value) || 0 })}
                            className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                            Cantidad
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={inv.count}
                            onChange={(e) => handleUpdateInverterItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                            className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Botón para agregar otro modelo de inversor en Modo Detallado */}
                <button
                  type="button"
                  onClick={handleAddInverterModel}
                  className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-emerald-300 hover:border-emerald-500 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 dark:border-emerald-700/60 dark:hover:border-emerald-500 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 dark:text-emerald-400`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Agregar otro modelo de inversor</span>
                </button>

                {projectInverters.length > 1 && (
                  <div
                    className={`p-2 rounded-lg text-xs flex justify-between items-center ${
                      isDark ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>Potencia Total Inversores:</span>
                    <span className="font-extrabold font-mono">
                      {totalInverterKW} kW ({totalInverterCount} {totalInverterCount === 1 ? 'unidad' : 'unidades'})
                    </span>
                  </div>
                )}
              </div>

              {/* Subsección de Parámetros Técnicos Avanzados */}
              <div
                className={`space-y-3 p-3 rounded-lg border mt-3 bg-emerald-50/50 border-emerald-200 dark:bg-[#202024] dark:border-[#2e2e34]`}
              >
                <h4
                  className={`text-[11px] font-bold uppercase tracking-wider border-b pb-1 flex items-center gap-1.5 text-emerald-900 border-emerald-200 dark:text-emerald-400 dark:border-[#2e2e34]`}
                >
                  <Sliders className="w-3.5 h-3.5" /> Parámetros Técnicos Avanzados
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                      Eficiencia Panel (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={project.specs.panelEfficiency}
                      onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                      Coef. Temp (%/°C)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={project.specs.tempCoeff}
                      onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-700 dark:text-zinc-300`}>
                      Degradación Anual (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={project.specs.annualDegradation}
                      onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* 🔋 ALMACENAMIENTO (BATERÍA) CON MODO SIMPLE Y DETALLADO */}
          {/* ========================================== */}
          <BatteryEquipmentSection project={project} summary={summary} isDark={isDark} isDetailed={isDetailed} updateSpecs={updateSpecs} />
        </div>
      )}
    </div>
  );
};
