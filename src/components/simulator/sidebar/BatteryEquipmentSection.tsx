import React from 'react';
import { editEquipmentGroup, selectCatalogEquipment } from '../../../utils/equipmentGroups';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs, BatteryItemSpec } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SearchableEquipmentSelect } from './SearchableEquipmentSelect';
import { SolarEquipmentItem } from '../../../types/equipment';
import { BatteryCharging, Plus, Trash2 } from 'lucide-react';
import { getProjectBatteries, calculateTotalBatteryCapacityKWh, calculateTotalBatteryCount } from '../../../utils/equipmentSpecsUtils';

interface BatteryEquipmentSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isDark: boolean;
  isDetailed: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

/** Storage (BESS) block of the equipment sidebar: battery groups in simple and detailed mode. */
export const BatteryEquipmentSection: React.FC<BatteryEquipmentSectionProps> = ({ project, summary, isDark, isDetailed, updateSpecs }) => {
  const { equipmentCatalog, openAIDatasheetModal } = useSimulationStore();
  const projectBatteries = getProjectBatteries(project.specs);
  const extraBatteries = projectBatteries.slice(1);
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(project.specs);
  const totalBatteryCount = calculateTotalBatteryCount(project.specs);

  const handleAddBatteryModel = () => {
    const candidate = equipmentCatalog.find(
      (e) => e.type === 'battery' && e.displayName !== getProjectBatteries(project.specs)[0]?.brandModel
    );

    const newBattery: BatteryItemSpec = {
      id: `battery-${Date.now()}`,
      catalogItemId: candidate?.id,
      brandModel: candidate?.displayName || 'Batería Dyness A48100 (5.12 kWh)',
      capacityKWh: candidate?.capacityKWh || 5.12,
      count: 1,
      unitPriceUSD: candidate?.supplierPrices?.[0]?.priceUSD || (candidate?.capacityKWh ? candidate.capacityKWh * 160 : 850),
    };

    updateSpecs({ ...editEquipmentGroup(project.specs, 'battery', { type: 'add', item: newBattery }), hasBattery: true });
  };
  const handleUpdateBatteryItem = (index: number, updates: Partial<BatteryItemSpec>) =>
    updateSpecs(editEquipmentGroup(project.specs, 'battery', { type: 'update', index, patch: updates }));
  const handleRemoveBatteryItem = (index: number) =>
    updateSpecs(editEquipmentGroup(project.specs, 'battery', { type: 'remove', index }));

  const handleSelectBattery = (item: SolarEquipmentItem) => {
    const suppliers = item.supplierPrices || [];
    const newSupplierInfo = { ...(project.specs.selectedSupplierInfo || {}) };
    const specsUpdate: Partial<SystemSpecs> = {
      batteryBrandModel: item.displayName,
      batteryCapacityKWh: item.capacityKWh || 16.08,
      batteryDOD: item.dodPct || 90,
      batteryEfficiencyPct: item.batteryEfficiencyPct || 95,
    };

    if (project.specs.autoSupplierPricing && suppliers.length > 0) {
      const bestSp = [...suppliers].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      specsUpdate.batteryUnitPriceUSD = bestSp.priceUSD;
      newSupplierInfo.battery = {
        supplierName: bestSp.supplierName,
        priceUSD: bestSp.priceUSD,
        updatedAt: bestSp.updatedAt,
        supplierPriceId: bestSp.id,
      };
    } else {
      const match = suppliers.find(
        (sp) =>
          sp.id === newSupplierInfo.battery?.supplierPriceId ||
          sp.supplierName.toLowerCase().trim() === newSupplierInfo.battery?.supplierName?.toLowerCase().trim()
      );
      if (match) {
        newSupplierInfo.battery = {
          supplierName: match.supplierName,
          priceUSD: match.priceUSD,
          updatedAt: match.updatedAt,
          supplierPriceId: match.id,
        };
      } else {
        delete newSupplierInfo.battery;
      }
    }

    specsUpdate.selectedSupplierInfo = newSupplierInfo;
    // The primary group takes the catalog identity (catalogItemId for datasheets); the mirror follows it.
    updateSpecs({
      ...specsUpdate,
      ...selectCatalogEquipment(project.specs, 'battery', 0, item, {
        capacityKWh: item.capacityKWh || 16.08,
        dodPct: item.dodPct || 90,
        selectedSupplierInfo: newSupplierInfo.battery,
        ...(specsUpdate.batteryUnitPriceUSD !== undefined ? { unitPriceUSD: specsUpdate.batteryUnitPriceUSD } : {}),
      }),
    });
  };

  return (
  <div className={`pt-2 border-t space-y-3 border-slate-200 dark:border-[#27272a]`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <BatteryCharging className="w-4 h-4 text-cyan-400" />
        <label className={`text-xs font-semibold text-slate-700 dark:text-zinc-200`}>
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
        className={`space-y-3 p-3 rounded-lg border bg-cyan-50/40 border-cyan-200 dark:bg-[#202024] dark:border-[#2e2e34]`}
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
              label={projectBatteries.length > 1 ? "Batería / Banco (Modelo #1 Principal)" : "Batería / Banco de Almacenamiento"}
              placeholder="Buscar o seleccionar batería..."
              isDark={isDark}
            />

            {/* Cantidad de Baterías (Modelo #1) */}
            <div>
              <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                {projectBatteries.length > 1 ? "Cantidad de Baterías (Modelo #1)" : "Cantidad de Baterías"}
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={project.specs.batteryCount ?? 0}
                onChange={(e) => {
                  const count = parseInt(e.target.value) || 1;
                  if (project.specs.batteries && project.specs.batteries.length > 0) {
                    handleUpdateBatteryItem(0, { count });
                  } else {
                    updateSpecs({ batteryCount: count });
                  }
                }}
                className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
            </div>

            {/* Baterías Adicionales */}
            {extraBatteries.map((bat, extraIdx) => {
              const actualIdx = extraIdx + 1;
              return (
                <div
                  key={bat.id || actualIdx}
                  className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-cyan-50/40 border-cyan-200 dark:bg-[#181822] dark:border-cyan-900/40`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-extrabold flex items-center gap-1 text-cyan-800 dark:text-cyan-400`}>
                      <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Batería BESS (Modelo #{actualIdx + 1})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBatteryItem(actualIdx)}
                      className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      title="Eliminar este modelo de batería"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <SearchableEquipmentSelect
                    type="battery"
                    items={equipmentCatalog}
                    selectedValue={bat.brandModel}
                    selectedPower={bat.capacityKWh}
                    onSelect={(item) => {
                      updateSpecs(selectCatalogEquipment(project.specs, 'battery', actualIdx, item, {
                        capacityKWh: item.capacityKWh || 5.12,
                        unitPriceUSD: item.supplierPrices?.[0]?.priceUSD || bat.unitPriceUSD,
                      }));
                    }}
                    onOpenScanner={openAIDatasheetModal}
                    label={`Modelo Batería #${actualIdx + 1}`}
                    placeholder="Buscar o seleccionar batería..."
                    isDark={isDark}
                  />

                  <div>
                    <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                      Cantidad de Baterías
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={bat.count}
                      onChange={(e) => handleUpdateBatteryItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>
                </div>
              );
            })}

            {/* Botón para agregar otro modelo de batería */}
            <button
              type="button"
              onClick={handleAddBatteryModel}
              className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-cyan-300 hover:border-cyan-500 bg-cyan-50/60 hover:bg-cyan-100 text-cyan-800 dark:border-cyan-700/50 dark:hover:border-cyan-500 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/40 dark:text-cyan-400`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Agregar otro modelo de batería</span>
            </button>
          </div>
        ) : (
          /* MODO DETALLADO PARA BATERÍAS (Manual) */
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                Modelo / Marca Batería (Manual)
              </label>
              <input
                type="text"
                value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                  Cantidad Baterías
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={project.specs.batteryCount ?? 0}
                  onChange={(e) => updateSpecs({ batteryCount: parseInt(e.target.value) || 1 })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                  Capacidad Unit. (kWh)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={project.specs.batteryCapacityKWh}
                  onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                />
              </div>
            </div>

            {/* Baterías Adicionales en Modo Manual */}
            {extraBatteries.map((bat, extraIdx) => {
              const actualIdx = extraIdx + 1;
              return (
                <div
                  key={bat.id || actualIdx}
                  className={`p-2.5 rounded-xl border space-y-2 relative transition-all bg-cyan-50/40 border-cyan-200 dark:bg-[#181822] dark:border-cyan-900/40`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-extrabold flex items-center gap-1 text-cyan-800 dark:text-cyan-400`}>
                      <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Batería BESS (Modelo #{actualIdx + 1})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBatteryItem(actualIdx)}
                      className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      title="Eliminar este modelo de batería"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className={`block text-[10px] font-medium mb-1 text-slate-600 dark:text-zinc-300`}>
                      Modelo / Marca Batería (Manual)
                    </label>
                    <input
                      type="text"
                      value={bat.brandModel}
                      onChange={(e) => handleUpdateBatteryItem(actualIdx, { brandModel: e.target.value })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                        Capacidad (kWh)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={bat.capacityKWh}
                        onChange={(e) => handleUpdateBatteryItem(actualIdx, { capacityKWh: parseFloat(e.target.value) || 0 })}
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
                        value={bat.count}
                        onChange={(e) => handleUpdateBatteryItem(actualIdx, { count: parseInt(e.target.value) || 1 })}
                        className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold text-center bg-white border-slate-300 text-slate-800 dark:bg-[#27272a] dark:border-[#3f3f46] dark:text-zinc-100`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Botón para agregar otro modelo de batería en modo detallado */}
            <button
              type="button"
              onClick={handleAddBatteryModel}
              className={`w-full py-1.5 px-3 rounded-lg border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer border-cyan-300 hover:border-cyan-500 bg-cyan-50/60 hover:bg-cyan-100 text-cyan-800 dark:border-cyan-700/50 dark:hover:border-cyan-500 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/40 dark:text-cyan-400`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Agregar otro modelo de batería</span>
            </button>

            {projectBatteries.length > 1 && (
              <div
                className={`p-2 rounded-lg text-xs flex justify-between items-center ${
                  isDark ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/60' : 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                }`}
              >
                <span>Capacidad Total Baterías:</span>
                <span className="font-extrabold font-mono">
                  {totalBatteryKWh.toFixed(2)} kWh ({totalBatteryCount} {totalBatteryCount === 1 ? 'unidad' : 'unidades'})
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                  DoD Descarga (%)
                </label>
                <input
                  type="number"
                  step="5"
                  value={project.specs.batteryDOD || 90}
                  onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 90 })}
                  className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                />
              </div>
              <div>
                <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                  Eficiencia Carga (%)
                </label>
                <input
                  type="number"
                  step="1"
                  value={project.specs.batteryEfficiencyPct || 95}
                  onChange={(e) => updateSpecs({ batteryEfficiencyPct: parseFloat(e.target.value) || 95 })}
                  className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-semibold mb-0.5 text-slate-600 dark:text-zinc-300`}>
                Costo Reemplazo Año 10 (USD)
              </label>
              <input
                type="number"
                step="500"
                value={project.specs.batteryReplacementCostUSD || 0}
                onChange={(e) => updateSpecs({ batteryReplacementCostUSD: parseFloat(e.target.value) || 0 })}
                placeholder="Ej. $3,500 USD"
                className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#18181b] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
            </div>
          </div>
        )}

        {/* Resumen de Autonomía y Energía Útil */}
        <div
          className={`rounded-lg p-2.5 text-[10px] font-bold space-y-1 mt-2 border bg-cyan-100/90 border-cyan-300 text-cyan-950 dark:bg-cyan-950/70 dark:border-cyan-800/80 dark:text-cyan-200`}
        >
          <div className="flex justify-between">
            <span>Energía Útil Batería:</span>
            <span className={`font-extrabold font-mono text-cyan-900 dark:text-cyan-100`}>
              {summary.batteryUsableKWh} kWh ({projectBatteries.length > 1 ? `${totalBatteryKWh.toFixed(1)} kWh total en ${totalBatteryCount} unidades` : `${project.specs.batteryCount || 1} x ${project.specs.batteryCapacityKWh || 16.08} kWh`})
            </span>
          </div>
          <div className="flex justify-between">
            <span>Autonomía Anti-Apagones:</span>
            <span className={`font-extrabold font-mono text-cyan-900 dark:text-cyan-100`}>
              ~{summary.batteryBackupAutonomyHours} Horas
            </span>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};
