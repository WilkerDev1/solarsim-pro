import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SolarEquipmentItem, EquipmentType } from '../../types/equipment';
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
} from 'lucide-react';

interface EquipmentManagerSettingsTabProps {
  isDark: boolean;
}

export const EquipmentManagerSettingsTab: React.FC<EquipmentManagerSettingsTabProps> = ({ isDark }) => {
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
  } = useSimulationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | EquipmentType>('all');
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State for Edit / Add
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<SolarEquipmentItem> | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  // Delete confirmation
  const [itemToDelete, setItemToDelete] = useState<SolarEquipmentItem | null>(null);

  // Stats
  const panelCount = useMemo(() => equipmentCatalog.filter((e) => e.type === 'panel').length, [equipmentCatalog]);
  const inverterCount = useMemo(() => equipmentCatalog.filter((e) => e.type === 'inverter').length, [equipmentCatalog]);
  const batteryCount = useMemo(() => equipmentCatalog.filter((e) => e.type === 'battery').length, [equipmentCatalog]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return equipmentCatalog.filter((item) => {
      const matchesType = selectedTypeFilter === 'all' || item.type === selectedTypeFilter;
      if (!matchesType) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.displayName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.modelSeries.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.powerW && `${item.powerW}w`.includes(q)) ||
        (item.powerKW && `${item.powerKW}kw`.includes(q)) ||
        (item.capacityKWh && `${item.capacityKWh}kwh`.includes(q))
      );
    });
  }, [equipmentCatalog, selectedTypeFilter, searchQuery]);

  const handleOpenAdd = (type: EquipmentType = 'panel') => {
    setIsNewItem(true);
    setEditingItem({
      id: `eq-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      brand: '',
      modelSeries: '',
      displayName: '',
      category: type === 'panel' ? 'Bifacial N-Type TOPCon' : type === 'inverter' ? 'Híbrido Split Phase' : 'Batería Litio LiFePO4',
      powerW: type === 'panel' ? 600 : undefined,
      powerKW: type === 'inverter' ? 8.0 : undefined,
      capacityKWh: type === 'battery' ? 16.08 : undefined,
      capacityAh: type === 'battery' ? 314 : undefined,
      voltageV: type === 'battery' ? 51.2 : undefined,
      dodPct: type === 'battery' ? 90 : undefined,
      batteryEfficiencyPct: type === 'battery' ? 95 : undefined,
      efficiencyPct: type === 'panel' ? 22.2 : type === 'inverter' ? 97.5 : undefined,
      tempCoeff: type === 'panel' ? -0.29 : undefined,
      annualDegradation: type === 'panel' ? 0.4 : undefined,
      mpptCount: type === 'inverter' ? 2 : undefined,
      cycles: type === 'battery' ? 8000 : undefined,
      chemistry: type === 'battery' ? 'LFP (LiFePO4)' : undefined,
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
    if (!editingItem || !editingItem.displayName?.trim() || !editingItem.brand?.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Por favor completa el nombre y la marca del equipo.' });
      return;
    }

    const itemToSave: SolarEquipmentItem = {
      id: editingItem.id || `eq-${editingItem.type}-${Date.now()}`,
      type: editingItem.type || 'panel',
      brand: editingItem.brand.trim(),
      modelSeries: editingItem.modelSeries?.trim() || '',
      displayName: editingItem.displayName.trim(),
      category: editingItem.category?.trim() || '',
      powerW: editingItem.powerW ? Number(editingItem.powerW) : undefined,
      powerKW: editingItem.powerKW ? Number(editingItem.powerKW) : undefined,
      capacityKWh: editingItem.capacityKWh ? Number(editingItem.capacityKWh) : undefined,
      capacityAh: editingItem.capacityAh ? Number(editingItem.capacityAh) : undefined,
      voltageV: editingItem.voltageV ? Number(editingItem.voltageV) : undefined,
      chargeVoltageV: editingItem.chargeVoltageV ? Number(editingItem.chargeVoltageV) : undefined,
      dodPct: editingItem.dodPct ? Number(editingItem.dodPct) : undefined,
      batteryEfficiencyPct: editingItem.batteryEfficiencyPct ? Number(editingItem.batteryEfficiencyPct) : undefined,
      efficiencyPct: editingItem.efficiencyPct ? Number(editingItem.efficiencyPct) : undefined,
      tempCoeff: editingItem.tempCoeff ? Number(editingItem.tempCoeff) : undefined,
      annualDegradation: editingItem.annualDegradation ? Number(editingItem.annualDegradation) : undefined,
      mpptCount: editingItem.mpptCount ? Number(editingItem.mpptCount) : undefined,
      voltageMPPT: editingItem.voltageMPPT || undefined,
      cycles: editingItem.cycles ? Number(editingItem.cycles) : undefined,
      chemistry: editingItem.chemistry || undefined,
      maxChargeCurrentA: editingItem.maxChargeCurrentA ? Number(editingItem.maxChargeCurrentA) : undefined,
      maxDischargeCurrentA: editingItem.maxDischargeCurrentA ? Number(editingItem.maxDischargeCurrentA) : undefined,
      dimensions: editingItem.dimensions || undefined,
      weightKg: editingItem.weightKg ? Number(editingItem.weightKg) : undefined,
      isCustom: true,
      updatedAt: new Date().toISOString(),
      createdAt: editingItem.createdAt || new Date().toISOString(),
    };

    if (isNewItem) {
      addEquipmentItem(itemToSave);
      setFeedbackMessage({ type: 'success', text: `¡Equipo "${itemToSave.displayName}" agregado con éxito!` });
    } else {
      updateEquipmentItem(itemToSave.id, itemToSave);
      setFeedbackMessage({ type: 'success', text: `¡Equipo "${itemToSave.displayName}" actualizado!` });
    }

    setIsEditorOpen(false);
    setEditingItem(null);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    removeEquipmentItem(itemToDelete.id);
    setFeedbackMessage({ type: 'success', text: `Equipo "${itemToDelete.displayName}" eliminado del catálogo.` });
    setItemToDelete(null);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleSyncCloud = async () => {
    setSyncingCloud(true);
    setFeedbackMessage(null);
    try {
      const res = await syncEquipmentWithServer();
      if (res.success) {
        setFeedbackMessage({ type: 'success', text: res.message });
      } else {
        setFeedbackMessage({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'Error de conexión con el servidor' });
    } finally {
      setSyncingCloud(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('¿Deseas restablecer el catálogo a los modelos verificados de las fichas técnicas oficiales? (Se mantendrán solo los equipos oficiales).')) {
      resetEquipmentCatalogToDefaults();
      setFeedbackMessage({ type: 'success', text: 'Catálogo restablecido a modelos verificados oficiales.' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera & Métricas de Catálogo */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? 'bg-gradient-to-br from-[#1c1c24] to-[#14141c] border-[#2e2e38]'
            : 'bg-gradient-to-br from-slate-50 to-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                  Catálogo de Equipos Fotovoltaicos & BESS
                </h3>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Administra, edita o elimina los paneles, inversores y baterías disponibles en el simulador.
                </p>
              </div>
            </div>
          </div>

          {/* Botones de Acción Primarios */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAIDatasheetModal}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 hover:shadow-purple-600/30 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Escanear Datasheet (IA)</span>
            </button>

            <button
              type="button"
              onClick={openAIPriceCatalogModal}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Escanear Precios (IA)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAdd('panel')}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Equipo</span>
            </button>

            {syncSettings.authToken && (
              <button
                type="button"
                onClick={handleSyncCloud}
                disabled={syncingCloud}
                className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'border-indigo-800/80 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                    : 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                }`}
              >
                <Cloud className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                <span>{syncingCloud ? 'Sincronizando...' : 'Sincronizar Nube'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetDefaults}
              title="Restablecer catálogo a modelos verificados"
              className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                isDark
                  ? 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Badges de Conteo Rápido */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-dashed border-zinc-700/40">
          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#181820] border-[#282832]' : 'bg-slate-50 border-slate-200'}`}>
            <span className={`text-[10px] font-medium block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Total Equipos</span>
            <span className={`text-lg font-black ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>{equipmentCatalog.length}</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-amber-950/20 border-amber-900/40' : 'bg-amber-50/80 border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Paneles Solares</span>
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <span className={`text-lg font-black ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>{panelCount}</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-emerald-950/20 border-emerald-900/40' : 'bg-emerald-50/80 border-emerald-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>Inversores</span>
              <Cpu className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <span className={`text-lg font-black ${isDark ? 'text-emerald-200' : 'text-emerald-900'}`}>{inverterCount}</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-cyan-950/20 border-cyan-900/40' : 'bg-cyan-50/80 border-cyan-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold ${isDark ? 'text-cyan-300' : 'text-cyan-800'}`}>Baterías BESS</span>
              <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <span className={`text-lg font-black ${isDark ? 'text-cyan-200' : 'text-cyan-900'}`}>{batteryCount}</span>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            feedbackMessage.type === 'success'
              ? isDark
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isDark
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{feedbackMessage.text}</span>
          </div>
          <button type="button" onClick={() => setFeedbackMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4 opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Barra de Filtros & Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Buscador */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar equipo por marca, modelo, potencia, capacidad o química..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs font-medium border transition-all ${
              isDark
                ? 'bg-[#181820] border-[#2e2e38] text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Píldoras de Filtro por Tipo */}
        <div className={`flex rounded-xl p-1 border shrink-0 ${isDark ? 'bg-[#181820] border-[#2e2e38]' : 'bg-slate-100 border-slate-200'}`}>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTypeFilter === 'all'
                ? isDark
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-900 shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({equipmentCatalog.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('panel')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedTypeFilter === 'panel'
                ? isDark
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-500 text-white shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-amber-400'
                : 'text-slate-600 hover:text-amber-700'
            }`}
          >
            <Sun className="w-3 h-3" />
            <span>Paneles ({panelCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('inverter')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedTypeFilter === 'inverter'
                ? isDark
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-600 text-white shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-emerald-400'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span>Inversores ({inverterCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('battery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedTypeFilter === 'battery'
                ? isDark
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'bg-cyan-600 text-white shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-cyan-400'
                : 'text-slate-600 hover:text-cyan-700'
            }`}
          >
            <BatteryCharging className="w-3 h-3" />
            <span>Baterías ({batteryCount})</span>
          </button>
        </div>
      </div>

      {/* Lista de Equipos */}
      {filteredItems.length === 0 ? (
        <div
          className={`py-12 px-4 rounded-2xl border text-center ${
            isDark ? 'bg-[#181820]/50 border-[#282832]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <Sliders className={`w-8 h-8 mx-auto mb-2 opacity-40 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`} />
          <h4 className={`text-sm font-bold ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
            No se encontraron equipos
          </h4>
          <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            {searchQuery
              ? `No hay coincidencias para "${searchQuery}". Intenta con otros términos.`
              : 'El catálogo está vacío. Puedes agregar un nuevo equipo o escanear una ficha técnica con IA.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={openAIDatasheetModal}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Escanear Datasheet</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenAdd('panel')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Nuevo Manual
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isPanel = item.type === 'panel';
            const isInverter = item.type === 'inverter';
            const isBattery = item.type === 'battery';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-all hover:border-emerald-500/50 ${
                  isDark
                    ? 'bg-[#181820] border-[#282832] hover:bg-[#1e1e28]'
                    : 'bg-white border-slate-200 hover:bg-slate-50/80 shadow-xs'
                }`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  {/* Icono + Identidad */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isPanel
                          ? isDark
                            ? 'bg-amber-950/50 border-amber-800 text-amber-400'
                            : 'bg-amber-50 border-amber-200 text-amber-600'
                          : isInverter
                          ? isDark
                            ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                          : isDark
                          ? 'bg-cyan-950/50 border-cyan-800 text-cyan-400'
                          : 'bg-cyan-50 border-cyan-200 text-cyan-600'
                      }`}
                    >
                      {isPanel && <Sun className="w-4 h-4" />}
                      {isInverter && <Cpu className="w-4 h-4" />}
                      {isBattery && <BatteryCharging className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-extrabold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                          {item.displayName}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isPanel
                              ? isDark
                                ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                              : isInverter
                              ? isDark
                                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : isDark
                              ? 'bg-cyan-950/60 border-cyan-800 text-cyan-300'
                              : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                          }`}
                        >
                          {isPanel ? 'MÓDULO SOLAR' : isInverter ? 'INVERSOR' : 'BATERÍA BESS'}
                        </span>

                        {item.category && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                              isDark ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {item.category}
                          </span>
                        )}
                      </div>

                      <div className={`text-[11px] mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <span>
                          Fabricante: <strong className={isDark ? 'text-zinc-200' : 'text-slate-700'}>{item.brand}</strong>
                        </span>
                        {item.modelSeries && (
                          <span>
                            Modelo: <span className="font-mono">{item.modelSeries}</span>
                          </span>
                        )}
                      </div>

                      {/* Especificaciones Técnicas */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {isPanel && item.powerW && (
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-amber-950/40 text-amber-300 border border-amber-800/50' : 'bg-amber-50 text-amber-900 border border-amber-200'
                          }`}>
                            {item.powerW} Wp
                          </span>
                        )}

                        {isPanel && item.efficiencyPct && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.efficiencyPct}% Eficiencia
                          </span>
                        )}

                        {isPanel && item.tempCoeff && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.tempCoeff}%/°C
                          </span>
                        )}

                        {isPanel && item.annualDegradation && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            Degr: {item.annualDegradation}%/año
                          </span>
                        )}

                        {isInverter && item.powerKW && (
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          }`}>
                            {item.powerKW} kW AC
                          </span>
                        )}

                        {isInverter && item.maxPvPowerKW && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            Máx DC: {item.maxPvPowerKW} kW
                          </span>
                        )}

                        {isInverter && item.mpptCount && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.mpptCount} MPPTs
                          </span>
                        )}

                        {isBattery && item.capacityKWh && (
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/50' : 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                          }`}>
                            {item.capacityKWh} kWh
                          </span>
                        )}

                        {isBattery && item.voltageV && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.voltageV}V {item.capacityAh ? `(${item.capacityAh}Ah)` : ''}
                          </span>
                        )}

                        {isBattery && item.dodPct && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.dodPct}% DoD
                          </span>
                        )}

                        {isBattery && item.cycles && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.cycles.toLocaleString()} Ciclos
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones Editar / Proveedores / Eliminar */}
                  <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => openSupplierPriceModal(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        (item.supplierPrices?.length || 0) > 0
                          ? isDark
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                            : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          : isDark
                          ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                          : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Administrar ofertas de proveedores y precios para este modelo"
                    >
                      <Building2 className="w-3 h-3 text-amber-500" />
                      <span>
                        {(item.supplierPrices?.length || 0) > 0
                          ? `${item.supplierPrices!.length} prov. ($${Math.min(...item.supplierPrices!.map((s) => s.priceUSD)).toFixed(2)})`
                          : '+ Precio'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isDark
                          ? 'border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:text-white'
                          : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      <Edit2 className="w-3 h-3 text-emerald-400" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemToDelete(item)}
                      className={`p-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isDark
                          ? 'border-rose-900/60 bg-rose-950/30 text-rose-400 hover:bg-rose-900/50'
                          : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                      }`}
                      title="Eliminar equipo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================== */}
      {/* ✏️ MODAL EDITOR DE EQUIPO (ADD / EDIT) */}
      {/* ========================================== */}
      {isEditorOpen && editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isDark ? 'bg-[#181820] border-[#2e2e38] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-[#282832]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {isNewItem ? 'Agregar Nuevo Equipo al Catálogo' : 'Editar Especificaciones del Equipo'}
                  </h4>
                  <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Define los parámetros técnicos y el nombre con el que aparecerá en el simulador.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditorOpen(false);
                  setEditingItem(null);
                }}
                className={`p-1.5 rounded-lg cursor-pointer ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEditor} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Tipo de Equipo */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Tipo de Equipo
                </label>
                <div className={`flex rounded-xl p-1 border ${isDark ? 'bg-[#121216] border-[#282832]' : 'bg-slate-100 border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, type: 'panel' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editingItem.type === 'panel'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Módulo Solar (Panel)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, type: 'inverter' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editingItem.type === 'inverter'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Inversor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, type: 'battery' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editingItem.type === 'battery'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BatteryCharging className="w-3.5 h-3.5" />
                    <span>Batería BESS</span>
                  </button>
                </div>
              </div>

              {/* Nombre Display */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Nombre Mostrado en el Selector (Display Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    editingItem.type === 'panel'
                      ? 'Ej. Módulos Canadian Solar CS6.1-72TB-600 (600W)'
                      : editingItem.type === 'inverter'
                      ? 'Ej. Inversor Lux Power LXP-LB-US 8K (8.0Kw)'
                      : 'Ej. Batería HinaESS PowerGem Max (16.08kWh)'
                  }
                  value={editingItem.displayName || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, displayName: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isDark ? 'bg-[#121216] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Marca & Modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Fabricante / Marca *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Canadian Solar, LuxpowerTek, HinaESS"
                    value={editingItem.brand || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, brand: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border ${
                      isDark ? 'bg-[#121216] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Serie / Modelo
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. CS6.1-72TB-600, LXP-LB-US 8k"
                    value={editingItem.modelSeries || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, modelSeries: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border ${
                      isDark ? 'bg-[#121216] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Categoría Tecnológica */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Categoría Tecnológica
                </label>
                <input
                  type="text"
                  placeholder="Ej. Bifacial N-Type TOPCon, Híbrido Split Phase 120/240V, Batería Litio LiFePO4"
                  value={editingItem.category || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium border ${
                    isDark ? 'bg-[#121216] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Parámetros Específicos para Paneles */}
              {editingItem.type === 'panel' && (
                <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#14141c] border-[#2e2e38]' : 'bg-amber-50/40 border-amber-200'}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>
                    <Sun className="w-3.5 h-3.5" /> Parámetros de Rendimiento Fotovoltaico
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Potencia (Wp) *
                      </label>
                      <input
                        type="number"
                        step="5"
                        value={editingItem.powerW || 600}
                        onChange={(e) => setEditingItem({ ...editingItem, powerW: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-amber-300' : 'bg-white border-slate-300 text-amber-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Eficiencia (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingItem.efficiencyPct || 22.2}
                        onChange={(e) => setEditingItem({ ...editingItem, efficiencyPct: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Coef. Temp (%/°C)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem.tempCoeff || -0.29}
                        onChange={(e) => setEditingItem({ ...editingItem, tempCoeff: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Degradación (%/año)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={editingItem.annualDegradation || 0.4}
                        onChange={(e) => setEditingItem({ ...editingItem, annualDegradation: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parámetros Específicos para Inversores */}
              {editingItem.type === 'inverter' && (
                <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#14141c] border-[#2e2e38]' : 'bg-emerald-50/40 border-emerald-200'}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>
                    <Cpu className="w-3.5 h-3.5" /> Parámetros del Inversor
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Potencia AC (kW) *
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={editingItem.powerKW || 8.0}
                        onChange={(e) => setEditingItem({ ...editingItem, powerKW: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-emerald-300' : 'bg-white border-slate-300 text-emerald-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Máx DC PV (kW)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={editingItem.maxPvPowerKW || 12.0}
                        onChange={(e) => setEditingItem({ ...editingItem, maxPvPowerKW: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Eficiencia (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingItem.maxEfficiencyPct || 97.5}
                        onChange={(e) => setEditingItem({ ...editingItem, maxEfficiencyPct: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Cantidad MPPTs
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={editingItem.mpptCount || 2}
                        onChange={(e) => setEditingItem({ ...editingItem, mpptCount: parseInt(e.target.value) || 1 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parámetros Específicos para Baterías */}
              {editingItem.type === 'battery' && (
                <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#14141c] border-[#2e2e38]' : 'bg-cyan-50/40 border-cyan-200'}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-cyan-400' : 'text-cyan-900'}`}>
                    <BatteryCharging className="w-3.5 h-3.5" /> Parámetros de Almacenamiento (BESS)
                  </h5>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Capacidad (kWh) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingItem.capacityKWh || 16.08}
                        onChange={(e) => setEditingItem({ ...editingItem, capacityKWh: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-cyan-300' : 'bg-white border-slate-300 text-cyan-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Voltaje Nominal (V)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingItem.voltageV || 51.2}
                        onChange={(e) => setEditingItem({ ...editingItem, voltageV: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Capacidad (Ah)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={editingItem.capacityAh || 314}
                        onChange={(e) => setEditingItem({ ...editingItem, capacityAh: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        DoD Descarga (%)
                      </label>
                      <input
                        type="number"
                        step="5"
                        value={editingItem.dodPct || 90}
                        onChange={(e) => setEditingItem({ ...editingItem, dodPct: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Eficiencia (%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={editingItem.batteryEfficiencyPct || 95}
                        onChange={(e) => setEditingItem({ ...editingItem, batteryEfficiencyPct: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Ciclos de Vida
                      </label>
                      <input
                        type="number"
                        step="500"
                        value={editingItem.cycles || 8000}
                        onChange={(e) => setEditingItem({ ...editingItem, cycles: parseInt(e.target.value) || 0 })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[10px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Química Celdas
                      </label>
                      <input
                        type="text"
                        value={editingItem.chemistry || 'LFP (LiFePO4)'}
                        onChange={(e) => setEditingItem({ ...editingItem, chemistry: e.target.value })}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-[#1e1e28] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 🏷️ Sección de Precios y Proveedores en Formulario de Edición */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDark ? 'bg-[#15151e] border-[#2c2c3e]' : 'bg-amber-50/40 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-500" />
                    <h5 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                      Precios y Proveedores Registrados
                    </h5>
                  </div>
                  <span className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    {(editingItem.supplierPrices || []).length} oferta(s)
                  </span>
                </div>

                {(!editingItem.supplierPrices || editingItem.supplierPrices.length === 0) ? (
                  <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                    No hay proveedores registrados aún. Puedes agregar precios ahora o usar el botón "Precios" en la tabla principal.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {editingItem.supplierPrices.map((sp, sIdx) => (
                      <div
                        key={sp.id || sIdx}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                          isDark ? 'bg-[#1a1a26] border-[#36364a]' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>{sp.supplierName}</strong>
                          {sp.sku && <span className="text-[10px] text-zinc-500 ml-2">SKU: {sp.sku}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">${sp.priceUSD.toFixed(2)} USD</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingItem.supplierPrices?.filter((_, idx) => idx !== sIdx) || [];
                              setEditingItem({ ...editingItem, supplierPrices: updated });
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
                    isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isNewItem ? 'Agregar al Catálogo' : 'Guardar Cambios'}</span>
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
            className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
              isDark ? 'bg-[#181820] border-[#2e2e38] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">¿Eliminar este equipo del catálogo?</h4>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Esta acción retirará el modelo de la lista de selección del simulador.
                </p>
              </div>
            </div>

            <div className={`mt-4 p-3 rounded-xl border text-xs ${isDark ? 'bg-[#121216] border-[#282832]' : 'bg-slate-50 border-slate-200'}`}>
              <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>{itemToDelete.displayName}</strong>
              <div className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                {itemToDelete.brand} • {itemToDelete.type.toUpperCase()}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
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
