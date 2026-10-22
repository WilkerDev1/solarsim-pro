import { isWriterRole } from '../../../shared/permissions';
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSimulationStore } from "../../store/useSimulationStore";
import { SolarEquipmentItem, EquipmentType } from "../../types/equipment";
import { SupplierManagerSection } from "./SupplierManagerSection";
import {
  Sun,
  Cpu,
  BatteryCharging,
  Search,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  Layers,
  Sliders,
  ShieldCheck,
  Cloud,
  Zap,
  Info,
  Building2,
  DollarSign,
  Tag,
  FileText,
} from "lucide-react";
import { EquipmentOffersEditor } from "./equipment/EquipmentOffersEditor";
import { EquipmentAssetsEditor } from "./equipment/EquipmentAssetsEditor";
import { CatalogEquipmentRow } from "./equipment/CatalogEquipmentRow";
import { EquipmentEditorModal } from "./EquipmentEditorModal";
import { normalizeBrandName } from "../../utils/equipmentBrandUtils";
import { confirmAction } from "./confirmAction";

interface EquipmentManagerSettingsTabProps {
  isDark: boolean;
}

export const EquipmentManagerSettingsTab: React.FC<
  EquipmentManagerSettingsTabProps
> = ({ isDark }) => {
  const {
    equipmentCatalog,
    addEquipmentItem,
    updateEquipmentItem,
    removeEquipmentItem,
    resetEquipmentCatalogToDefaults,
    openAIDatasheetModal,
    openAIPriceCatalogModal,
    openSupplierPriceModal,
    syncEquipmentWithServer,
    syncSettings,
    equipmentConflicts,
    resolveEquipmentConflict,
  } = useSimulationStore();

  const canEdit =
    !syncSettings.currentUser ||
    isWriterRole(syncSettings.currentUser.role);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<
    "all" | EquipmentType
  >("all");
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"equipment" | "suppliers">(
    "equipment",
  );
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal State for Edit / Add
  const [assetBusy, setAssetBusy] = useState(false);
  const sessionGeneration = useSimulationStore(s => s.sessionGeneration);
  useEffect(() => { setIsEditorOpen(false); setEditingItem(null); setItemToDelete(null); setAssetBusy(false); }, [sessionGeneration]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] =
    useState<Partial<SolarEquipmentItem> | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  // Delete confirmation
  const editorRef = useRef<HTMLDivElement>(null);
  const [itemToDelete, setItemToDelete] = useState<SolarEquipmentItem | null>(
    null,
  );

  useEffect(() => {
    if (!isEditorOpen && !itemToDelete) return;
    const previous = document.activeElement as HTMLElement | null;
    editorRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorOpen(false);
        setEditingItem(null);
        setItemToDelete(null);
      }
      if (event.key === "Tab") {
        const items = Array.from(
          editorRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      previous?.focus();
    };
  }, [isEditorOpen, itemToDelete]);

  // Stats
  const panelCount = useMemo(
    () => equipmentCatalog.filter((e) => e.type === "panel").length,
    [equipmentCatalog],
  );
  const inverterCount = useMemo(
    () => equipmentCatalog.filter((e) => e.type === "inverter").length,
    [equipmentCatalog],
  );
  const batteryCount = useMemo(
    () => equipmentCatalog.filter((e) => e.type === "battery").length,
    [equipmentCatalog],
  );

  const supplierCount = useMemo(() => {
    const setNames = new Set<string>();
    equipmentCatalog.forEach((e) => {
      (e.supplierPrices || []).forEach((sp) => {
        if (sp.supplierName) setNames.add(sp.supplierName.trim().toLowerCase());
      });
    });
    return setNames.size;
  }, [equipmentCatalog]);

  // Lista global de todas las marcas únicas para el autocompletado en el editor
  const allUniqueBrands = useMemo(() => {
    const setBrands = new Set<string>();
    equipmentCatalog.forEach((item) => {
      const b = item.brand?.trim();
      if (
        b &&
        b.toLowerCase() !== "fabricante" &&
        b.toLowerCase() !== "desconocido"
      ) {
        setBrands.add(b);
      }
    });
    return Array.from(setBrands).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  }, [equipmentCatalog]);

  // Marcas disponibles según el filtro de tipo de equipo activo con sus respectivos conteos
  const brandList = useMemo(() => {
    const brandCounts = new Map<string, number>();
    equipmentCatalog.forEach((item) => {
      if (selectedTypeFilter !== "all" && item.type !== selectedTypeFilter)
        return;
      const b = item.brand?.trim() || "Sin Marca";
      brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    });

    const list = Array.from(brandCounts.entries()).map(([brand, count]) => ({
      brand,
      count,
    }));

    return list.sort((a, b) =>
      a.brand.localeCompare(b.brand, "es", { sensitivity: "base" }),
    );
  }, [equipmentCatalog, selectedTypeFilter]);

  // Filtered list con discriminación simultánea por Tipo, Marca y Búsqueda
  const filteredItems = useMemo(() => {
    return equipmentCatalog.filter((item) => {
      const matchesType =
        selectedTypeFilter === "all" || item.type === selectedTypeFilter;
      if (!matchesType) return false;

      const matchesBrand =
        selectedBrandFilter === "all" ||
        (selectedBrandFilter === "Sin Marca"
          ? !item.brand || item.brand.trim() === ""
          : item.brand === selectedBrandFilter);
      if (!matchesBrand) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.displayName.toLowerCase().includes(q) ||
        (item.brand || "").toLowerCase().includes(q) ||
        (item.modelSeries || "").toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.powerW && `${item.powerW}w`.includes(q)) ||
        (item.powerKW && `${item.powerKW}kw`.includes(q)) ||
        (item.capacityKWh && `${item.capacityKWh}kwh`.includes(q))
      );
    });
  }, [equipmentCatalog, selectedTypeFilter, selectedBrandFilter, searchQuery]);

  const handleOpenAdd = (type: EquipmentType = "panel") => {
    setIsNewItem(true);
    setEditingItem({
      id: `eq-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      brand: "",
      modelSeries: "",
      displayName: "",
      category:
        type === "panel"
          ? "Bifacial N-Type TOPCon"
          : type === "inverter"
            ? "Híbrido Split Phase"
            : "Batería Litio LiFePO4",
      powerW: type === "panel" ? 600 : undefined,
      powerKW: type === "inverter" ? 8.0 : undefined,
      capacityKWh: type === "battery" ? 16.08 : undefined,
      capacityAh: type === "battery" ? 314 : undefined,
      voltageV: type === "battery" ? 51.2 : undefined,
      dodPct: type === "battery" ? 90 : undefined,
      batteryEfficiencyPct: type === "battery" ? 95 : undefined,
      efficiencyPct:
        type === "panel" ? 22.2 : type === "inverter" ? 97.5 : undefined,
      tempCoeff: type === "panel" ? -0.29 : undefined,
      annualDegradation: type === "panel" ? 0.4 : undefined,
      mpptCount: type === "inverter" ? 2 : undefined,
      cycles: type === "battery" ? 8000 : undefined,
      chemistry: type === "battery" ? "LFP (LiFePO4)" : undefined,
      isCustom: true,
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (item: SolarEquipmentItem) => {
    setIsNewItem(false);
    setEditingItem({ ...item });
    setIsEditorOpen(true);
  };

  const handleSaveEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (assetBusy) return;
    if (
      !editingItem ||
      !editingItem.displayName?.trim() ||
      !editingItem.brand?.trim()
    ) {
      setFeedbackMessage({
        type: "error",
        text: "Por favor completa el nombre y la marca del equipo.",
      });
      return;
    }

    const primary =
      editingItem.type === "panel"
        ? editingItem.powerW
        : editingItem.type === "inverter"
          ? editingItem.powerKW
          : editingItem.capacityKWh;
    if (!Number.isFinite(Number(primary)) || Number(primary) <= 0) {
      setFeedbackMessage({
        type: "error",
        text: "La potencia o capacidad nominal debe ser positiva.",
      });
      return;
    }
    if (!canEdit) {
      setFeedbackMessage({
        type: "error",
        text: "Tu cuenta solo puede consultar el catálogo.",
      });
      return;
    }
    if (
      equipmentCatalog.some(
        (item) =>
          item.id !== editingItem.id &&
          item.displayName.trim().toLowerCase() ===
            editingItem.displayName!.trim().toLowerCase(),
      )
    ) {
      setFeedbackMessage({
        type: "error",
        text: "Ese nombre ya pertenece a otro equipo. Usa un nombre de variante diferente.",
      });
      return;
    }
    const live = useSimulationStore.getState();
    const existing = live.equipmentCatalog.find(
      (item) => item.id === editingItem.id,
    );
    const activeUser = live.syncSettings.currentUser;
    if (
      activeUser &&
      (!isWriterRole(activeUser.role) ||
        (existing?.organizationId &&
          existing.organizationId !== activeUser.organizationId) ||
        (existing?.syncServerUrl &&
          existing.syncServerUrl.trim().replace(/\/+$/, "") !==
            live.syncSettings.serverUrl.trim().replace(/\/+$/, "")))
    ) {
      setFeedbackMessage({
        type: "error",
        text: "No puedes modificar este modelo en el ámbito actual.",
      });
      return;
    }
    if ((editingItem.supplierPrices || []).some(price => !price.supplierName.trim() || !Number.isFinite(price.priceUSD) || price.priceUSD < 0)) {
      setFeedbackMessage({ type: "error", text: "Completa el proveedor y un precio válido para cada oferta." }); return;
    }
    const itemToSave: SolarEquipmentItem = {
      ...editingItem,
      id: editingItem.id || `eq-${editingItem.type}-${Date.now()}`,
      type: editingItem.type || "panel",
      brand: normalizeBrandName(editingItem.brand) || editingItem.brand.trim(),
      modelSeries: editingItem.modelSeries?.trim() || "",
      displayName: editingItem.displayName.trim(),
      category: editingItem.category?.trim() || "",
      powerW:
        editingItem.powerW !== undefined
          ? Number(editingItem.powerW)
          : undefined,
      powerKW:
        editingItem.powerKW !== undefined
          ? Number(editingItem.powerKW)
          : undefined,
      capacityKWh:
        editingItem.capacityKWh !== undefined
          ? Number(editingItem.capacityKWh)
          : undefined,
      capacityAh:
        editingItem.capacityAh !== undefined
          ? Number(editingItem.capacityAh)
          : undefined,
      voltageV:
        editingItem.voltageV !== undefined
          ? Number(editingItem.voltageV)
          : undefined,
      chargeVoltageV:
        editingItem.chargeVoltageV !== undefined
          ? Number(editingItem.chargeVoltageV)
          : undefined,
      dodPct:
        editingItem.dodPct !== undefined
          ? Number(editingItem.dodPct)
          : undefined,
      batteryEfficiencyPct:
        editingItem.batteryEfficiencyPct !== undefined
          ? Number(editingItem.batteryEfficiencyPct)
          : undefined,
      efficiencyPct:
        editingItem.efficiencyPct !== undefined
          ? Number(editingItem.efficiencyPct)
          : undefined,
      tempCoeff:
        editingItem.tempCoeff !== undefined
          ? Number(editingItem.tempCoeff)
          : undefined,
      annualDegradation:
        editingItem.annualDegradation !== undefined
          ? Number(editingItem.annualDegradation)
          : undefined,
      mpptCount:
        editingItem.mpptCount !== undefined
          ? Number(editingItem.mpptCount)
          : undefined,
      voltageMPPT: editingItem.voltageMPPT || undefined,
      cycles:
        editingItem.cycles !== undefined
          ? Number(editingItem.cycles)
          : undefined,
      chemistry: editingItem.chemistry || undefined,
      maxChargeCurrentA:
        editingItem.maxChargeCurrentA !== undefined
          ? Number(editingItem.maxChargeCurrentA)
          : undefined,
      maxDischargeCurrentA:
        editingItem.maxDischargeCurrentA !== undefined
          ? Number(editingItem.maxDischargeCurrentA)
          : undefined,
      dimensions: editingItem.dimensions || undefined,
      weightKg:
        editingItem.weightKg !== undefined
          ? Number(editingItem.weightKg)
          : undefined,
      isCustom: true,
      updatedAt: new Date().toISOString(),
      createdAt: editingItem.createdAt || new Date().toISOString(),
    };

    if (isNewItem) {
      addEquipmentItem(itemToSave);
      setFeedbackMessage({
        type: "success",
        text: `¡Equipo "${itemToSave.displayName}" agregado con éxito!`,
      });
    } else {
      updateEquipmentItem(itemToSave.id, itemToSave);
      setFeedbackMessage({
        type: "success",
        text: `¡Equipo "${itemToSave.displayName}" actualizado!`,
      });
    }

    const stored = useSimulationStore
      .getState()
      .equipmentCatalog.find((item) => item.id === itemToSave.id);
    if (
      !stored ||
      stored.displayName !== itemToSave.displayName ||
      stored.brand !== itemToSave.brand
    ) {
      setFeedbackMessage({
        type: "error",
        text:
          useSimulationStore.getState().equipmentSyncFeedback ||
          "No se pudo guardar el equipo.",
      });
      return;
    }
    setIsEditorOpen(false);
    setEditingItem(null);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    removeEquipmentItem(itemToDelete.id);
    if (
      useSimulationStore
        .getState()
        .equipmentCatalog.some((item) => item.id === itemToDelete.id)
    ) {
      setFeedbackMessage({
        type: "error",
        text: "No puedes eliminar este modelo en el ámbito actual.",
      });
      return;
    }
    setFeedbackMessage({
      type: "success",
      text: `Equipo "${itemToDelete.displayName}" eliminado del catálogo.`,
    });
    setItemToDelete(null);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleSyncCloud = async () => {
    setSyncingCloud(true);
    setFeedbackMessage(null);
    try {
      const res = await syncEquipmentWithServer();
      if (res.success) {
        setFeedbackMessage({ type: "success", text: res.message });
      } else {
        setFeedbackMessage({ type: "error", text: res.message });
      }
    } catch (e: any) {
      setFeedbackMessage({
        type: "error",
        text: e.message || "Error de conexión con el servidor",
      });
    } finally {
      setSyncingCloud(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const handleResetDefaults = async () => {
    if (
      await confirmAction({
        title: "Restablecer catálogo",
        message: "¿Deseas restablecer el catálogo a los modelos verificados de las fichas técnicas oficiales? (Se mantendrán solo los equipos oficiales).",
        confirmLabel: "Restablecer",
        tone: "danger",
      })
    ) {
      resetEquipmentCatalogToDefaults();
      setFeedbackMessage({
        type: "success",
        text: "Catálogo restablecido a modelos verificados oficiales.",
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const control = `rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 dark:bg-[#141619] dark:border-[#363b43] dark:text-zinc-100 dark:placeholder:text-zinc-400`;
  const button = `inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-[#363b43] dark:text-zinc-200 dark:hover:bg-zinc-800`;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3
            className={`text-lg font-semibold text-slate-900 dark:text-zinc-100`}
          >
            Catálogo de equipos
          </h3>
          <p
            className={`mt-1 text-sm text-slate-600 dark:text-zinc-400`}
          >
            {equipmentCatalog.length} modelos · {supplierCount} proveedores.
            Especificaciones y ofertas usadas en tus propuestas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            onClick={openAIDatasheetModal}
            disabled={!canEdit}
          >
            <FileText size={16} />
            Importar ficha
          </button>
          <button
            className={button}
            onClick={openAIPriceCatalogModal}
            disabled={!canEdit}
          >
            <DollarSign size={16} />
            Importar precios
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            onClick={() =>
              handleOpenAdd(
                selectedTypeFilter === "all" ? "panel" : selectedTypeFilter,
              )
            }
            disabled={!canEdit}
          >
            <Plus size={16} />
            Nuevo equipo
          </button>
        </div>
      </header>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-slate-200 dark:border-[#363b43]`}
      >
        <div
          className="flex gap-2"
          role="group"
          aria-label="Vista del catálogo"
        >
          {(["equipment", "suppliers"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`${button} ${viewMode === mode ? (isDark ? "!bg-emerald-950 !text-emerald-200" : "!bg-emerald-50 !text-emerald-800") : ""}`}
            >
              {mode === "equipment" ? "Equipos" : "Proveedores"}
            </button>
          ))}
        </div>
        <button
          className={button}
          disabled={syncingCloud || !syncSettings.authToken}
          onClick={handleSyncCloud}
        >
          <RefreshCw size={15} className={syncingCloud ? "animate-spin" : ""} />
          {syncingCloud ? "Sincronizando…" : "Sincronizar catálogo"}
        </button>
      </div>
      {feedbackMessage && (
        <p
          role={feedbackMessage.type === "error" ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm ${feedbackMessage.type === "error" ? (isDark ? "bg-rose-950 text-rose-100" : "bg-rose-50 text-rose-800") : isDark ? "bg-emerald-950 text-emerald-100" : "bg-emerald-50 text-emerald-900"}`}
        >
          {feedbackMessage.text}
        </p>
      )}
      {!canEdit && (
        <p className={`text-sm text-slate-600 dark:text-zinc-400`}>
          Tu cuenta puede consultar modelos y ofertas. Un administrador o editor
          puede modificarlos.
        </p>
      )}
      {viewMode === "suppliers" ? (
        <SupplierManagerSection
          isDark={isDark}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
            <label className="relative">
              <span className="sr-only">Buscar equipos</span>
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-slate-500"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar modelo, marca o potencia"
                className={`${control} w-full pl-9`}
              />
            </label>
            <label>
              <span className="sr-only">Tipo de equipo</span>
              <select
                value={selectedTypeFilter}
                onChange={(event) => {
                  setSelectedTypeFilter(
                    event.target.value as EquipmentType | "all",
                  );
                  setSelectedBrandFilter("all");
                }}
                className={`${control} w-full`}
              >
                <option value="all">Todos los tipos</option>
                <option value="panel">Paneles ({panelCount})</option>
                <option value="inverter">Inversores ({inverterCount})</option>
                <option value="battery">Baterías ({batteryCount})</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Fabricante</span>
              <select
                className={`${control} w-full`}
                value={selectedBrandFilter}
                onChange={(event) => setSelectedBrandFilter(event.target.value)}
              >
                <option value="all">Todas las marcas</option>
                {brandList.map(({ brand, count }) => (
                  <option key={brand} value={brand}>
                    {brand} ({count})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className={`overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-[#363b43] dark:bg-[#1c1f23]`}
          >
            <table className="w-full min-w-[690px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Modelos del catálogo, parámetros nominales y ofertas de
                proveedores
              </caption>
              <thead
                className="bg-slate-50 text-slate-600 dark:bg-[#141619] dark:text-zinc-400"
              >
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Equipo / modelo
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nominal
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Ofertas / USD
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody
                className={
                  isDark
                    ? "divide-y divide-[#363b43]"
                    : "divide-y divide-slate-200"
                }
              >
                {filteredItems.map((item) => (
                  <CatalogEquipmentRow
                    key={item.id}
                    item={item}
                    conflict={equipmentConflicts[item.id]}
                    canEdit={canEdit}
                    button={button}
                    handleOpenEdit={handleOpenEdit}
                    openSupplierPriceModal={openSupplierPriceModal}
                    setItemToDelete={setItemToDelete}
                    resolveEquipmentConflict={resolveEquipmentConflict}
                  />
                ))}
                {!filteredItems.length && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center">
                      <p className="font-medium">No se encontraron equipos</p>
                      <p
                        className={`mt-1 text-slate-600 dark:text-zinc-400`}
                      >
                        Cambia la búsqueda o los filtros; también puedes
                        importar una ficha técnica.
                      </p>
                      <button
                        className={`${button} mt-4`}
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedBrandFilter("all");
                          setSelectedTypeFilter("all");
                        }}
                      >
                        Limpiar filtros
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            className={`flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-zinc-400`}
          >
            <p>
              {filteredItems.length} de {equipmentCatalog.length} modelos. Los
              cambios de catálogo no reescriben propuestas existentes.
            </p>
            <button
              type="button"
              className="underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              disabled={!canEdit}
              onClick={handleResetDefaults}
            >
              Restablecer catálogo
            </button>
          </div>
        </>
      )}

      {/* ========================================== */}
      {/* ✏️ MODAL EDITOR DE EQUIPO (ADD / EDIT) */}
      {/* ========================================== */}
      {isEditorOpen && editingItem && (
        <EquipmentEditorModal
          isDark={isDark}
          canEdit={canEdit}
          isNewItem={isNewItem}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          setIsEditorOpen={setIsEditorOpen}
          handleSaveEditor={handleSaveEditor}
          feedbackMessage={feedbackMessage}
          allUniqueBrands={allUniqueBrands}
          equipmentCatalog={equipmentCatalog}
          assetBusy={assetBusy}
          setAssetBusy={setAssetBusy}
          editorRef={editorRef}
        />
      )}

      {/* ========================================== */}
      {/* 🗑️ MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {/* ========================================== */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            ref={editorRef}
            role="dialog"
            aria-modal="true"
            aria-label="Eliminar equipo"
            className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 duration-150 bg-white border-slate-200 text-slate-900 dark:bg-[#181820] dark:border-[#2e2e38] dark:text-zinc-100`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">
                  ¿Eliminar este equipo del catálogo?
                </h4>
                <p
                  className={`text-xs mt-0.5 text-slate-500 dark:text-zinc-400`}
                >
                  Esta acción retirará el modelo de la lista de selección del
                  simulador.
                </p>
              </div>
            </div>

            <div
              className={`mt-4 p-3 rounded-xl border text-xs bg-slate-50 border-slate-200 dark:bg-[#121216] dark:border-[#282832]`}
            >
              <strong className="text-slate-800 dark:text-zinc-200">
                {itemToDelete.displayName}
              </strong>
              <div
                className={`text-[11px] mt-0.5 text-slate-500 dark:text-zinc-400`}
              >
                {itemToDelete.brand} • {itemToDelete.type.toUpperCase()}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!canEdit}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Eliminar Equipo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
