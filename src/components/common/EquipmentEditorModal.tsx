import React from "react";
import { SolarEquipmentItem } from "../../types/equipment";
import { Sun, Cpu, BatteryCharging, Edit2, Check, X } from "lucide-react";
import { DEFAULT_BATTERY_EFFICIENCY_PCT } from "../../../shared/projectDefaults";
import { EquipmentOffersEditor } from "./equipment/EquipmentOffersEditor";
import { EquipmentAssetsEditor } from "./equipment/EquipmentAssetsEditor";

interface EquipmentEditorModalProps {
  isDark: boolean;
  canEdit: boolean;
  isNewItem: boolean;
  editingItem: Partial<SolarEquipmentItem>;
  setEditingItem: React.Dispatch<React.SetStateAction<Partial<SolarEquipmentItem> | null>>;
  setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveEditor: (e: React.FormEvent) => void;
  feedbackMessage: { type: "success" | "error"; text: string } | null;
  allUniqueBrands: string[];
  equipmentCatalog: SolarEquipmentItem[];
  assetBusy: boolean;
  setAssetBusy: React.Dispatch<React.SetStateAction<boolean>>;
  editorRef: React.RefObject<HTMLDivElement>;
}

/** Add/edit dialog of the equipment catalog manager. */
export const EquipmentEditorModal: React.FC<EquipmentEditorModalProps> = ({
  isDark,
  canEdit,
  isNewItem,
  editingItem,
  setEditingItem,
  setIsEditorOpen,
  handleSaveEditor,
  feedbackMessage,
  allUniqueBrands,
  equipmentCatalog,
  assetBusy,
  setAssetBusy,
  editorRef,
}) => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60">
      <div
        ref={editorRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          isNewItem ? "Agregar equipo" : "Consultar o editar equipo"
        }
        className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 bg-white border-slate-200 text-slate-900 dark:bg-[#181820] dark:border-[#2e2e38] dark:text-zinc-100`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 border-b flex items-center justify-between border-slate-200 dark:border-[#282832]`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold">
                {isNewItem
                  ? "Agregar Nuevo Equipo al Catálogo"
                  : "Editar equipo"}
              </h4>
              <p
                className={`text-[11px] text-slate-500 dark:text-zinc-400`}
              >
                Administra especificaciones, precios de compra y documentos del modelo.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar editor"
            onClick={() => {
              setIsEditorOpen(false);
              setEditingItem(null);
            }}
            className={`p-1.5 rounded-lg cursor-pointer hover:bg-slate-100 text-slate-500 dark:hover:bg-zinc-800 dark:text-zinc-400`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form
          id="equipment-editor-form"
          onSubmit={handleSaveEditor}
          className="p-5 overflow-y-auto space-y-4 flex-1"
        >
          {feedbackMessage?.type === "error" && (
            <p
              role="alert"
              className={
                isDark
                  ? "rounded-lg bg-rose-950 p-3 text-sm text-rose-100"
                  : "rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
              }
            >
              {feedbackMessage.text}
            </p>
          )}
          {/* Tipo de Equipo */}
          <div>
            <label
              className={`block text-xs font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
            >
              Tipo de Equipo
            </label>
            <div
              className={`flex rounded-xl p-1 border bg-slate-100 border-slate-200 dark:bg-[#121216] dark:border-[#282832]`}
            >
              <button
                type="button"
                onClick={() =>
                  setEditingItem({ ...editingItem, type: "panel" })
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  editingItem.type === "panel"
                    ? "bg-amber-600 text-white shadow-xs"
                    : isDark
                      ? "text-zinc-400 hover:text-zinc-200"
                      : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Módulo Solar (Panel)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditingItem({ ...editingItem, type: "inverter" })
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  editingItem.type === "inverter"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : isDark
                      ? "text-zinc-400 hover:text-zinc-200"
                      : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Inversor</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditingItem({ ...editingItem, type: "battery" })
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  editingItem.type === "battery"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : isDark
                      ? "text-zinc-400 hover:text-zinc-200"
                      : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BatteryCharging className="w-3.5 h-3.5" />
                <span>Batería BESS</span>
              </button>
            </div>
          </div>

          {/* Nombre Display */}
          <div>
            <label
              className={`block text-xs font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
            >
              Nombre Mostrado en el Selector (Display Name) *
            </label>
            <input
              type="text"
              required
              placeholder={
                editingItem.type === "panel"
                  ? "Ej. Módulos Canadian Solar CS6.1-72TB-600 (600W)"
                  : editingItem.type === "inverter"
                    ? "Ej. Inversor Lux Power LXP-LB-US 8K (8.0Kw)"
                    : "Ej. Batería HinaESS PowerGem Max (16.08kWh)"
              }
              value={editingItem.displayName || ""}
              onChange={(e) =>
                setEditingItem({
                  ...editingItem,
                  displayName: e.target.value,
                })
              }
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 border-slate-300 text-slate-900 dark:bg-[#121216] dark:border-[#3f3f46] dark:text-zinc-100`}
            />
          </div>

          {/* Marca & Modelo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-xs font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
              >
                Fabricante / Marca *
              </label>
              <input
                type="text"
                required
                list="equipment-brand-suggestions"
                placeholder="Ej. Canadian Solar, LuxpowerTek, WeCo, HinaESS..."
                value={editingItem.brand || ""}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, brand: e.target.value })
                }
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border bg-slate-50 border-slate-300 text-slate-900 dark:bg-[#121216] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
              <datalist id="equipment-brand-suggestions">
                {allUniqueBrands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                className={`block text-xs font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
              >
                Serie / Modelo
              </label>
              <input
                type="text"
                placeholder="Ej. CS6.1-72TB-600, LXP-LB-US 8k"
                value={editingItem.modelSeries || ""}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    modelSeries: e.target.value,
                  })
                }
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border bg-slate-50 border-slate-300 text-slate-900 dark:bg-[#121216] dark:border-[#3f3f46] dark:text-zinc-100`}
              />
            </div>
          </div>

          {/* Categoría Tecnológica */}
          <div>
            <label
              className={`block text-xs font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
            >
              Categoría Tecnológica
            </label>
            <input
              type="text"
              placeholder="Ej. Bifacial N-Type TOPCon, Híbrido Split Phase 120/240V, Batería Litio LiFePO4"
              value={editingItem.category || ""}
              onChange={(e) =>
                setEditingItem({ ...editingItem, category: e.target.value })
              }
              className={`w-full px-3 py-2 rounded-xl text-xs font-medium border bg-slate-50 border-slate-300 text-slate-900 dark:bg-[#121216] dark:border-[#3f3f46] dark:text-zinc-100`}
            />
          </div>

          {/* Parámetros Específicos para Paneles */}
          {editingItem.type === "panel" && (
            <div
              className={`p-4 rounded-xl border space-y-3 bg-amber-50/40 border-amber-200 dark:bg-[#14141c] dark:border-[#2e2e38]`}
            >
              <h5
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-900 dark:text-amber-400`}
              >
                <Sun className="w-3.5 h-3.5" /> Parámetros de Rendimiento
                Fotovoltaico
              </h5>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Potencia (Wp) *
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={editingItem.powerW || 600}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        powerW: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border-slate-300 text-amber-900 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-amber-300`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Eficiencia (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingItem.efficiencyPct || 22.2}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        efficiencyPct: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Coef. Temp (%/°C)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.tempCoeff || -0.29}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        tempCoeff: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Degradación (%/año)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={editingItem.annualDegradation || 0.4}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        annualDegradation: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Parámetros Específicos para Inversores */}
          {editingItem.type === "inverter" && (
            <div
              className={`p-4 rounded-xl border space-y-3 bg-emerald-50/40 border-emerald-200 dark:bg-[#14141c] dark:border-[#2e2e38]`}
            >
              <h5
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-emerald-900 dark:text-emerald-400`}
              >
                <Cpu className="w-3.5 h-3.5" /> Parámetros del Inversor
              </h5>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Potencia AC (kW) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingItem.powerKW || 8.0}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        powerKW: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border-slate-300 text-emerald-900 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-emerald-300`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Máx DC PV (kW)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingItem.maxPvPowerKW || 12.0}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        maxPvPowerKW: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Eficiencia (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingItem.maxEfficiencyPct || 97.5}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        maxEfficiencyPct: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Cantidad MPPTs
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={editingItem.mpptCount || 2}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        mpptCount: parseInt(e.target.value) || 1,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Parámetros Específicos para Baterías */}
          {editingItem.type === "battery" && (
            <div
              className={`p-4 rounded-xl border space-y-3 bg-cyan-50/40 border-cyan-200 dark:bg-[#14141c] dark:border-[#2e2e38]`}
            >
              <h5
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-cyan-900 dark:text-cyan-400`}
              >
                <BatteryCharging className="w-3.5 h-3.5" /> Parámetros de
                Almacenamiento (BESS)
              </h5>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Capacidad (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingItem.capacityKWh || 16.08}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        capacityKWh: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border-slate-300 text-cyan-900 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-cyan-300`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Voltaje Nominal (V)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingItem.voltageV || 51.2}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        voltageV: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Capacidad (Ah)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={editingItem.capacityAh || 314}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        capacityAh: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    DoD Descarga (%)
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={editingItem.dodPct || 90}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        dodPct: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Eficiencia (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={editingItem.batteryEfficiencyPct || ""}
                    placeholder={String(DEFAULT_BATTERY_EFFICIENCY_PCT)}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        batteryEfficiencyPct:
                          parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Ciclos de Vida
                  </label>
                  <input
                    type="number"
                    step="500"
                    value={editingItem.cycles || 8000}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        cycles: parseInt(e.target.value) || 0,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[10px] font-semibold mb-1 text-slate-700 dark:text-zinc-300`}
                  >
                    Química Celdas
                  </label>
                  <input
                    type="text"
                    value={editingItem.chemistry || "LFP (LiFePO4)"}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        chemistry: e.target.value,
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border-slate-300 text-slate-800 dark:bg-[#1e1e28] dark:border-[#3f3f46] dark:text-zinc-100`}
                  />
                </div>
              </div>
            </div>
          )}

          <EquipmentOffersEditor prices={editingItem.supplierPrices || []} onChange={prices => setEditingItem({ ...editingItem, supplierPrices: prices, preferredSupplierId: prices.some(p => p.id === editingItem.preferredSupplierId) ? editingItem.preferredSupplierId : undefined })} dark={isDark} disabled={!canEdit || assetBusy} suppliers={Array.from(new Set(equipmentCatalog.flatMap(item => (item.supplierPrices || []).map(price => price.supplierName))))}/>
          <EquipmentAssetsEditor item={editingItem} onChange={patch => setEditingItem(previous => previous ? { ...previous, ...patch } : previous)} dark={isDark} disabled={!canEdit} onBusy={setAssetBusy}/>

        </form>
          {/* Botones de Footer Modal */}
          <div className={`shrink-0 p-4 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-zinc-700`}>
            <button
              type="button"
              onClick={() => {
                setIsEditorOpen(false);
                setEditingItem(null);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="equipment-editor-form"
              disabled={!canEdit || assetBusy}
              className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {isNewItem ? "Agregar al Catálogo" : "Guardar Cambios"}
              </span>
            </button>
          </div>
      </div>
    </div>
);
