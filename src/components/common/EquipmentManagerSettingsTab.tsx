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
import { normalizeBrandName } from "../../utils/equipmentBrandUtils";

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
    ["ADMIN", "EDITOR"].includes(syncSettings.currentUser.role);
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
      (!["ADMIN", "EDITOR"].includes(activeUser.role) ||
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

  const handleResetDefaults = () => {
    if (
      window.confirm(
        "¿Deseas restablecer el catálogo a los modelos verificados de las fichas técnicas oficiales? (Se mantendrán solo los equipos oficiales).",
      )
    ) {
      resetEquipmentCatalogToDefaults();
      setFeedbackMessage({
        type: "success",
        text: "Catálogo restablecido a modelos verificados oficiales.",
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const control = `rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isDark ? "bg-[#141619] border-[#363b43] text-zinc-100 placeholder:text-zinc-400" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"}`;
  const button = `inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${isDark ? "border-[#363b43] text-zinc-200 hover:bg-zinc-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3
            className={`text-lg font-semibold ${isDark ? "text-zinc-100" : "text-slate-900"}`}
          >
            Catálogo de equipos
          </h3>
          <p
            className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}
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
        className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3 ${isDark ? "border-[#363b43]" : "border-slate-200"}`}
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
              className={`${button} ${viewMode === mode ? (isDark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-50 text-emerald-800") : ""}`}
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
        <p className={`text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          Tu cuenta puede consultar modelos y ofertas. Un administrador o editor
          puede modificarlos.
        </p>
      )}
      {viewMode === "suppliers" ? (
        <SupplierManagerSection
          isDark={isDark}
          onBackToEquipment={() => setViewMode("equipment")}
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
            className={`overflow-x-auto rounded-xl border ${isDark ? "border-[#363b43] bg-[#1c1f23]" : "border-slate-200 bg-white"}`}
          >
            <table className="w-full min-w-[690px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Modelos del catálogo, parámetros nominales y ofertas de
                proveedores
              </caption>
              <thead
                className={
                  isDark
                    ? "bg-[#141619] text-zinc-400"
                    : "bg-slate-50 text-slate-600"
                }
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
                {filteredItems.map((item) => {
                  const prices = (item.supplierPrices || []).filter(
                    (offer) =>
                      Number.isFinite(offer.priceUSD) &&
                      offer.priceUSD > 0 &&
                      offer.stockStatus !== "out_of_stock",
                  );
                  const nominal =
                    item.type === "panel"
                      ? `${item.powerW ?? "—"} Wp`
                      : item.type === "inverter"
                        ? `${item.powerKW ?? "—"} kW AC`
                        : `${item.capacityKWh ?? "—"} kWh`;
                  const conflict = equipmentConflicts[item.id];
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={
                          isDark ? "hover:bg-zinc-800/50" : "hover:bg-slate-50"
                        }
                      >
                        <td className="max-w-sm px-4 py-3">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className={`text-left font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500 ${isDark ? "text-zinc-100" : "text-slate-900"}`}
                          >
                            {item.displayName}
                          </button>
                          <p
                            className={`mt-1 text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}
                          >
                            {item.brand || "Sin marca"} ·{" "}
                            {item.modelSeries || "Sin modelo"} ·{" "}
                            {item.type === "panel"
                              ? "Panel"
                              : item.type === "inverter"
                                ? "Inversor"
                                : "Batería"}
                          </p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className="font-medium">{nominal}</span>
                          <p
                            className={`mt-1 text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}
                          >
                            {item.type === "panel"
                              ? item.efficiencyPct !== undefined
                                ? `${item.efficiencyPct}% eficiencia`
                                : "Eficiencia sin dato"
                              : item.type === "inverter"
                                ? item.mpptCount !== undefined
                                  ? `${item.mpptCount} MPPT`
                                  : "MPPT sin dato"
                                : item.dodPct !== undefined
                                  ? `${item.dodPct}% DoD`
                                  : "DoD sin dato"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500"
                            onClick={() => openSupplierPriceModal(item)}
                          >
                            {prices.length
                              ? `$${Math.min(...prices.map((p) => p.priceUSD)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "Sin precio disponible"}
                          </button>
                          <p
                            className={`mt-1 text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}
                          >
                            {item.supplierPrices?.length || 0} ofertas
                            registradas
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              className={button}
                              onClick={() => handleOpenEdit(item)}
                            >
                              {canEdit ? "Editar" : "Consultar"}
                            </button>
                            <button
                              className={button}
                              disabled={!canEdit}
                              aria-label={`Eliminar ${item.displayName}`}
                              onClick={() => setItemToDelete(item)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {conflict && (
                        <tr>
                          <td
                            colSpan={4}
                            className={`px-4 py-3 ${isDark ? "bg-amber-950 text-amber-100" : "bg-amber-50 text-amber-950"}`}
                          >
                            <p className="mb-2 text-sm">
                              Cambios de este equipo pendientes de resolver con
                              el servidor.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className={button}
                                disabled={!canEdit || !conflict.serverItem}
                                onClick={() =>
                                  resolveEquipmentConflict(
                                    item.id,
                                    "accept_server",
                                  )
                                }
                              >
                                Usar servidor
                              </button>
                              <button
                                className={button}
                                disabled={!canEdit || !conflict.serverItem}
                                onClick={() =>
                                  resolveEquipmentConflict(
                                    item.id,
                                    "keep_local",
                                  )
                                }
                              >
                                Conservar local
                              </button>
                              <button
                                className={button}
                                disabled={!canEdit}
                                onClick={() =>
                                  resolveEquipmentConflict(item.id, "fork")
                                }
                              >
                                Guardar copia
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!filteredItems.length && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center">
                      <p className="font-medium">No se encontraron equipos</p>
                      <p
                        className={`mt-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}
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
            className={`flex flex-wrap items-center justify-between gap-3 text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}
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
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60">
          <div
            ref={editorRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              isNewItem ? "Agregar equipo" : "Consultar o editar equipo"
            }
            className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isDark
                ? "bg-[#181820] border-[#2e2e38] text-zinc-100"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#282832]" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {isNewItem
                      ? "Agregar Nuevo Equipo al Catálogo"
                      : "Editar Especificaciones del Equipo"}
                  </h4>
                  <p
                    className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}
                  >
                    Define los parámetros técnicos y el nombre con el que
                    aparecerá en el simulador.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditorOpen(false);
                  setEditingItem(null);
                }}
                className={`p-1.5 rounded-lg cursor-pointer ${isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form
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
                  className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
                >
                  Tipo de Equipo
                </label>
                <div
                  className={`flex rounded-xl p-1 border ${isDark ? "bg-[#121216] border-[#282832]" : "bg-slate-100 border-slate-200"}`}
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
                  className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isDark
                      ? "bg-[#121216] border-[#3f3f46] text-zinc-100"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              {/* Marca & Modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border ${
                      isDark
                        ? "bg-[#121216] border-[#3f3f46] text-zinc-100"
                        : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  />
                  <datalist id="equipment-brand-suggestions">
                    {allUniqueBrands.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border ${
                      isDark
                        ? "bg-[#121216] border-[#3f3f46] text-zinc-100"
                        : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              {/* Categoría Tecnológica */}
              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium border ${
                    isDark
                      ? "bg-[#121216] border-[#3f3f46] text-zinc-100"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              {/* Parámetros Específicos para Paneles */}
              {editingItem.type === "panel" && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${isDark ? "bg-[#14141c] border-[#2e2e38]" : "bg-amber-50/40 border-amber-200"}`}
                >
                  <h5
                    className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-amber-400" : "text-amber-900"}`}
                  >
                    <Sun className="w-3.5 h-3.5" /> Parámetros de Rendimiento
                    Fotovoltaico
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-amber-300"
                            : "bg-white border-slate-300 text-amber-900"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parámetros Específicos para Inversores */}
              {editingItem.type === "inverter" && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${isDark ? "bg-[#14141c] border-[#2e2e38]" : "bg-emerald-50/40 border-emerald-200"}`}
                >
                  <h5
                    className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-emerald-400" : "text-emerald-900"}`}
                  >
                    <Cpu className="w-3.5 h-3.5" /> Parámetros del Inversor
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-emerald-300"
                            : "bg-white border-slate-300 text-emerald-900"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parámetros Específicos para Baterías */}
              {editingItem.type === "battery" && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${isDark ? "bg-[#14141c] border-[#2e2e38]" : "bg-cyan-50/40 border-cyan-200"}`}
                >
                  <h5
                    className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-cyan-400" : "text-cyan-900"}`}
                  >
                    <BatteryCharging className="w-3.5 h-3.5" /> Parámetros de
                    Almacenamiento (BESS)
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-cyan-300"
                            : "bg-white border-slate-300 text-cyan-900"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
                      >
                        Eficiencia (%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={editingItem.batteryEfficiencyPct || 95}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            batteryEfficiencyPct:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}
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
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark
                            ? "bg-[#1e1e28] border-[#3f3f46] text-zinc-100"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 🏷️ Sección de Precios y Proveedores en Formulario de Edición */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDark
                    ? "bg-[#15151e] border-[#2c2c3e]"
                    : "bg-amber-50/40 border-amber-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-500" />
                    <h5
                      className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-amber-300" : "text-amber-900"}`}
                    >
                      Precios y Proveedores Registrados
                    </h5>
                  </div>
                  <span
                    className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}
                  >
                    {(editingItem.supplierPrices || []).length} oferta(s)
                  </span>
                </div>

                {!editingItem.supplierPrices ||
                editingItem.supplierPrices.length === 0 ? (
                  <p
                    className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}
                  >
                    No hay proveedores registrados aún. Puedes agregar precios
                    ahora o usar el botón "Precios" en la tabla principal.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {editingItem.supplierPrices.map((sp, sIdx) => (
                      <div
                        key={sp.id || sIdx}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                          isDark
                            ? "bg-[#1a1a26] border-[#36364a]"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div>
                          <strong
                            className={
                              isDark ? "text-zinc-200" : "text-slate-800"
                            }
                          >
                            {sp.supplierName}
                          </strong>
                          {sp.sku && (
                            <span className="text-[10px] text-zinc-500 ml-2">
                              SKU: {sp.sku}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">
                            ${sp.priceUSD.toFixed(2)} USD
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated =
                                editingItem.supplierPrices?.filter(
                                  (_, idx) => idx !== sIdx,
                                ) || [];
                              setEditingItem({
                                ...editingItem,
                                supplierPrices: updated,
                              });
                            }}
                            className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                            title="Quitar oferta"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botones de Footer Modal */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-700/40">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditorOpen(false);
                    setEditingItem(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    isDark
                      ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isNewItem ? "Agregar al Catálogo" : "Guardar Cambios"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
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
            className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
              isDark
                ? "bg-[#181820] border-[#2e2e38] text-zinc-100"
                : "bg-white border-slate-200 text-slate-900"
            }`}
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
                  className={`text-xs mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}
                >
                  Esta acción retirará el modelo de la lista de selección del
                  simulador.
                </p>
              </div>
            </div>

            <div
              className={`mt-4 p-3 rounded-xl border text-xs ${isDark ? "bg-[#121216] border-[#282832]" : "bg-slate-50 border-slate-200"}`}
            >
              <strong className={isDark ? "text-zinc-200" : "text-slate-800"}>
                {itemToDelete.displayName}
              </strong>
              <div
                className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}
              >
                {itemToDelete.brand} • {itemToDelete.type.toUpperCase()}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  isDark
                    ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
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
