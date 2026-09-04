import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SolarEquipmentItem, EquipmentSupplierPrice, EquipmentType } from '../../types/equipment';
import {
  Building2,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Sun,
  Zap,
  BatteryCharging,
  ArrowLeft,
  DollarSign,
  PackageCheck,
  AlertTriangle,
  Layers,
  Calendar,
  ExternalLink,
  Tag,
} from 'lucide-react';

interface SupplierManagerSectionProps {
  isDark: boolean;
  onBackToEquipment: () => void;
}

interface SupplierGroup {
  supplierName: string;
  totalEquipments: number;
  panelCount: number;
  inverterCount: number;
  batteryCount: number;
  minPrice: number;
  maxPrice: number;
  lastUpdated: string;
  items: {
    equipment: SolarEquipmentItem;
    priceInfo: EquipmentSupplierPrice;
  }[];
}

export const SupplierManagerSection: React.FC<SupplierManagerSectionProps> = ({
  isDark,
  onBackToEquipment,
}) => {
  const {
    equipmentCatalog,
    renameSupplier,
    deleteSupplier,
    addOrUpdateSupplierPrice,
    removeSupplierPrice,
    openAIPriceCatalogModal,
  } = useSimulationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('all');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Estados para renombrar proveedor
  const [renamingSupplier, setRenamingSupplier] = useState<string | null>(null);
  const [newSupplierNameInput, setNewSupplierNameInput] = useState('');

  // Estados para eliminar proveedor
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

  // Estados para dar de alta nuevo proveedor
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierInitialEqId, setNewSupplierInitialEqId] = useState('');
  const [newSupplierInitialPrice, setNewSupplierInitialPrice] = useState<number | ''>('');
  const [newSupplierInitialSku, setNewSupplierInitialSku] = useState('');

  // Estados para agregar equipo a un proveedor existente
  const [addingEquipmentToSupplier, setAddingEquipmentToSupplier] = useState<string | null>(null);
  const [selectedEqIdToAdd, setSelectedEqIdToAdd] = useState('');
  const [priceUSDToAdd, setPriceUSDToAdd] = useState<number | ''>('');
  const [skuToAdd, setSkuToAdd] = useState('');
  const [stockStatusToAdd, setStockStatusToAdd] = useState<EquipmentSupplierPrice['stockStatus']>('in_stock');
  const [notesToAdd, setNotesToAdd] = useState('');

  // Estados para edición in-situ de una oferta
  const [editingOffer, setEditingOffer] = useState<{
    equipmentId: string;
    supplierPriceId: string;
    supplierName: string;
    priceUSD: number;
    sku: string;
    stockStatus: EquipmentSupplierPrice['stockStatus'];
    notes: string;
  } | null>(null);

  // 1. Agrupar todas las ofertas del catálogo por proveedor
  const supplierGroups: SupplierGroup[] = useMemo(() => {
    const map = new Map<string, SupplierGroup>();

    equipmentCatalog.forEach((eq) => {
      (eq.supplierPrices || []).forEach((sp) => {
        const key = sp.supplierName.trim();
        if (!key) return;

        let group = map.get(key);
        if (!group) {
          group = {
            supplierName: key,
            totalEquipments: 0,
            panelCount: 0,
            inverterCount: 0,
            batteryCount: 0,
            minPrice: sp.priceUSD,
            maxPrice: sp.priceUSD,
            lastUpdated: sp.updatedAt || '',
            items: [],
          };
          map.set(key, group);
        }

        group.totalEquipments++;
        if (eq.type === 'panel') group.panelCount++;
        else if (eq.type === 'inverter') group.inverterCount++;
        else if (eq.type === 'battery') group.batteryCount++;

        group.minPrice = Math.min(group.minPrice, sp.priceUSD);
        group.maxPrice = Math.max(group.maxPrice, sp.priceUSD);

        if (!group.lastUpdated || (sp.updatedAt && new Date(sp.updatedAt) > new Date(group.lastUpdated))) {
          group.lastUpdated = sp.updatedAt;
        }

        group.items.push({
          equipment: eq,
          priceInfo: sp,
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [equipmentCatalog]);

  // Lista de marcas presentes en las ofertas comerciales de los distribuidores
  const quotedBrands = useMemo(() => {
    const brandCounts = new Map<string, number>();
    supplierGroups.forEach((group) => {
      const groupBrands = new Set<string>();
      group.items.forEach((it) => {
        const b = it.equipment.brand?.trim() || 'Sin Marca';
        groupBrands.add(b);
      });
      groupBrands.forEach((b) => {
        brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
      });
    });

    return Array.from(brandCounts.entries())
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand, 'es', { sensitivity: 'base' }));
  }, [supplierGroups]);

  // 2. Filtrado por marca y búsqueda
  const filteredSuppliers = useMemo(() => {
    let list = supplierGroups;

    if (selectedBrandFilter !== 'all') {
      list = list.filter((group) =>
        group.items.some((it) => (it.equipment.brand || 'Sin Marca') === selectedBrandFilter)
      );
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();

    return list.filter((group) => {
      const matchesSupplier = group.supplierName.toLowerCase().includes(q);
      const matchesEquipment = group.items.some(
        (it) =>
          it.equipment.displayName.toLowerCase().includes(q) ||
          (it.equipment.brand && it.equipment.brand.toLowerCase().includes(q)) ||
          (it.priceInfo.sku && it.priceInfo.sku.toLowerCase().includes(q))
      );
      return matchesSupplier || matchesEquipment;
    });
  }, [supplierGroups, selectedBrandFilter, searchQuery]);

  // 3. Manejadores de acciones
  const handleStartRename = (supplierName: string) => {
    setRenamingSupplier(supplierName);
    setNewSupplierNameInput(supplierName);
  };

  const handleConfirmRename = () => {
    if (!renamingSupplier || !newSupplierNameInput.trim()) return;
    renameSupplier(renamingSupplier, newSupplierNameInput.trim());
    if (expandedSupplier === renamingSupplier) {
      setExpandedSupplier(newSupplierNameInput.trim());
    }
    setRenamingSupplier(null);
    setNewSupplierNameInput('');
  };

  const handleConfirmDeleteSupplier = () => {
    if (!supplierToDelete) return;
    deleteSupplier(supplierToDelete);
    if (expandedSupplier === supplierToDelete) {
      setExpandedSupplier(null);
    }
    setSupplierToDelete(null);
  };

  const handleCreateNewSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    if (newSupplierInitialEqId && typeof newSupplierInitialPrice === 'number' && newSupplierInitialPrice > 0) {
      addOrUpdateSupplierPrice(newSupplierInitialEqId, {
        supplierName: newSupplierName.trim(),
        priceUSD: newSupplierInitialPrice,
        sku: newSupplierInitialSku.trim() || undefined,
        stockStatus: 'in_stock',
        source: 'manual',
      });
    }

    setExpandedSupplier(newSupplierName.trim());
    setIsCreatingSupplier(false);
    setNewSupplierName('');
    setNewSupplierInitialEqId('');
    setNewSupplierInitialPrice('');
    setNewSupplierInitialSku('');
  };

  const handleOpenAddEquipment = (supplierName: string) => {
    setAddingEquipmentToSupplier(supplierName);
    setSelectedEqIdToAdd('');
    setPriceUSDToAdd('');
    setSkuToAdd('');
    setStockStatusToAdd('in_stock');
    setNotesToAdd('');
  };

  const handleSaveEquipmentToSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingEquipmentToSupplier || !selectedEqIdToAdd || typeof priceUSDToAdd !== 'number' || priceUSDToAdd <= 0) return;

    addOrUpdateSupplierPrice(selectedEqIdToAdd, {
      supplierName: addingEquipmentToSupplier,
      priceUSD: priceUSDToAdd,
      sku: skuToAdd.trim() || undefined,
      stockStatus: stockStatusToAdd,
      notes: notesToAdd.trim() || undefined,
      source: 'manual',
    });

    setAddingEquipmentToSupplier(null);
    setSelectedEqIdToAdd('');
    setPriceUSDToAdd('');
  };

  const handleSaveEditedOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOffer || editingOffer.priceUSD <= 0) return;

    addOrUpdateSupplierPrice(editingOffer.equipmentId, {
      id: editingOffer.supplierPriceId,
      supplierName: editingOffer.supplierName,
      priceUSD: editingOffer.priceUSD,
      sku: editingOffer.sku.trim() || undefined,
      stockStatus: editingOffer.stockStatus,
      notes: editingOffer.notes.trim() || undefined,
      source: 'manual',
    });

    setEditingOffer(null);
  };

  const renderTypeIcon = (type: EquipmentType) => {
    if (type === 'panel') return <Sun className="w-3.5 h-3.5 text-amber-500" />;
    if (type === 'battery') return <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />;
    return <Zap className="w-3.5 h-3.5 text-emerald-500" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cabecera de la Sección de Proveedores */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? 'bg-gradient-to-br from-[#1c1c28] to-[#13131c] border-[#2e2e42]'
            : 'bg-gradient-to-br from-blue-50/70 to-white border-blue-200/80 shadow-xs'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToEquipment}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-2xs'
              }`}
              title="Volver a lista de equipos"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className={`text-base font-extrabold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                  Gestión Integral de Distribuidores & Precios de Proveedor
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Administra los proveedores de compra, renombra o elimina distribuidores enteros y ajusta los precios unitarios por equipo.
              </p>
            </div>
          </div>

          {/* Acciones de Cabecera */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openAIPriceCatalogModal}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Escanear Precios (IA)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreatingSupplier(true)}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Proveedor</span>
            </button>

            <button
              type="button"
              onClick={onBackToEquipment}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isDark
                  ? 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              Ver Equipos
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas de Proveedores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-dashed border-zinc-700/40">
          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#181822] border-[#292938]' : 'bg-white border-blue-100 shadow-2xs'}`}>
            <span className={`text-[10px] font-semibold block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Distribuidores Registrados
            </span>
            <span className={`text-lg font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {supplierGroups.length}
            </span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#181822] border-[#292938]' : 'bg-white border-blue-100 shadow-2xs'}`}>
            <span className={`text-[10px] font-semibold block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Ofertas Comerciales
            </span>
            <span className={`text-lg font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              {supplierGroups.reduce((acc, g) => acc + g.totalEquipments, 0)}
            </span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#181822] border-[#292938]' : 'bg-white border-blue-100 shadow-2xs'}`}>
            <span className={`text-[10px] font-semibold block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Equipos con Precio Asignado
            </span>
            <span className={`text-lg font-black ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
              {equipmentCatalog.filter((e) => (e.supplierPrices || []).length > 0).length} de {equipmentCatalog.length}
            </span>
          </div>

          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#181822] border-[#292938]' : 'bg-white border-blue-100 shadow-2xs'}`}>
            <span className={`text-[10px] font-semibold block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Cobertura de Mercado
            </span>
            <span className={`text-lg font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              {equipmentCatalog.length > 0
                ? Math.round((equipmentCatalog.filter((e) => (e.supplierPrices || []).length > 0).length / equipmentCatalog.length) * 100)
                : 0}
              %
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar distribuidor por nombre o por modelo de equipo cotizado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs font-semibold outline-none transition-all ${
              isDark
                ? 'bg-[#14141c] border-[#2e2e40] text-zinc-200 focus:border-blue-500'
                : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-2xs'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Píldoras de Filtro por Marca Cotizada */}
      {quotedBrands.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-zinc-700/40">
          <div className={`flex items-center gap-1 text-[11px] font-bold shrink-0 mr-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            <Tag className="w-3.5 h-3.5 text-blue-400" />
            <span>Marca Cotizada:</span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedBrandFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedBrandFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : isDark
                ? 'bg-[#181820] text-zinc-400 hover:text-zinc-200 border border-[#2e2e38]'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            Todas ({supplierGroups.length})
          </button>

          {quotedBrands.map(({ brand, count }) => {
            const isSelected = selectedBrandFilter === brand;
            return (
              <button
                key={brand}
                type="button"
                onClick={() => setSelectedBrandFilter(isSelected ? 'all' : brand)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                    : isDark
                    ? 'bg-[#181820] text-zinc-300 hover:text-blue-300 hover:border-blue-500/50 border border-[#2e2e38]'
                    : 'bg-white text-slate-700 hover:text-blue-700 hover:border-blue-300 border border-slate-200 shadow-2xs'
                }`}
              >
                <span>{brand}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected
                      ? 'bg-blue-800 text-blue-100'
                      : isDark
                      ? 'bg-zinc-800 text-zinc-400'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count} {count === 1 ? 'prov.' : 'provs.'}
                </span>
              </button>
            );
          })}

          {selectedBrandFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedBrandFilter('all')}
              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                isDark
                  ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-950/40'
                  : 'text-blue-700 hover:text-blue-900 hover:bg-blue-50'
              }`}
            >
              <X className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
      )}

      {/* Modal / Formulario de Nuevo Proveedor */}
      {isCreatingSupplier && (
        <form
          onSubmit={handleCreateNewSupplier}
          className={`p-4 rounded-xl border space-y-3 animate-in fade-in duration-150 ${
            isDark ? 'bg-[#161622] border-emerald-800/50' : 'bg-emerald-50/60 border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              Alta de Nuevo Distribuidor / Proveedor
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingSupplier(false)}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                Nombre de la Empresa o Proveedor *
              </label>
              <input
                type="text"
                required
                placeholder="ej: Enersys Dominicana, RAAS Solar, Fersan..."
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  isDark ? 'bg-[#1b1b28] border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                Cotizar un Primer Equipo Inicial (Opcional)
              </label>
              <select
                value={newSupplierInitialEqId}
                onChange={(e) => setNewSupplierInitialEqId(e.target.value)}
                className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  isDark ? 'bg-[#1b1b28] border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="">-- Sin equipo inicial (solo registrar proveedor) --</option>
                {equipmentCatalog.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    [{eq.type.toUpperCase()}] {eq.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {newSupplierInitialEqId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  Precio Unitario USD *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={newSupplierInitialPrice}
                  onChange={(e) => setNewSupplierInitialPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    isDark ? 'bg-[#1b1b28] border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  SKU del Distribuidor (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Código de artículo..."
                  value={newSupplierInitialSku}
                  onChange={(e) => setNewSupplierInitialSku(e.target.value)}
                  className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    isDark ? 'bg-[#1b1b28] border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreatingSupplier(false)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
            >
              Registrar Proveedor
            </button>
          </div>
        </form>
      )}

      {/* Listado de Proveedores */}
      {filteredSuppliers.length === 0 ? (
        <div
          className={`p-10 text-center rounded-2xl border border-dashed ${
            isDark ? 'border-zinc-800 bg-[#121218]' : 'border-slate-300 bg-slate-50'
          }`}
        >
          <Building2 className="w-10 h-10 text-zinc-500 mx-auto mb-3 opacity-60" />
          <h4 className="text-sm font-extrabold text-zinc-200 mb-1">No se encontraron proveedores</h4>
          <p className={`text-xs max-w-md mx-auto mb-4 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            {searchQuery
              ? 'No hay ningún distribuidor que coincida con tu búsqueda. Intenta con otro término.'
              : 'Aún no hay proveedores registrados en el catálogo. Puedes escanear una lista de precios con IA o dar de alta tu primer distribuidor.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setIsCreatingSupplier(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
            >
              + Dar de Alta Proveedor
            </button>
            <button
              type="button"
              onClick={openAIPriceCatalogModal}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-xs"
            >
              Escanear Precios (IA)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSuppliers.map((group) => {
            const isExpanded = expandedSupplier === group.supplierName;
            const isRenaming = renamingSupplier === group.supplierName;

            return (
              <div
                key={group.supplierName}
                className={`border rounded-2xl overflow-hidden transition-all ${
                  isDark ? 'border-[#28283a] bg-[#15151f]' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                {/* Cabecera del Proveedor (Resumen & Acciones) */}
                <div
                  className={`p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                    isExpanded
                      ? isDark
                        ? 'bg-[#1c1c28] border-b border-zinc-800/80'
                        : 'bg-blue-50/40 border-b border-slate-200'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isDark ? 'bg-blue-950/40 text-blue-400 border border-blue-800/50' : 'bg-blue-50 text-blue-600 border border-blue-200'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-2 max-w-md">
                          <input
                            type="text"
                            value={newSupplierNameInput}
                            onChange={(e) => setNewSupplierNameInput(e.target.value)}
                            className={`w-full px-2.5 py-1 text-xs font-extrabold rounded-lg border outline-none ${
                              isDark ? 'bg-zinc-900 border-blue-500 text-white' : 'bg-white border-blue-500 text-slate-900'
                            }`}
                            autoFocus
                            placeholder="Nuevo nombre del proveedor..."
                          />
                          <button
                            type="button"
                            onClick={handleConfirmRename}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer"
                            title="Guardar nombre"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingSupplier(null)}
                            className="p-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm text-zinc-100 dark:text-zinc-100 text-slate-900">
                            {group.supplierName}
                          </h4>
                          <button
                            type="button"
                            onClick={() => handleStartRename(group.supplierName)}
                            className="text-zinc-400 hover:text-blue-400 transition-colors p-1"
                            title="Renombrar proveedor en todo el catálogo"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Badges de desglose */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
                        <span className="font-bold text-zinc-400">
                          {group.totalEquipments} equipo{group.totalEquipments !== 1 ? 's' : ''} cotizado{group.totalEquipments !== 1 ? 's' : ''}:
                        </span>
                        {group.panelCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-bold text-[10px]">
                            {group.panelCount} paneles
                          </span>
                        )}
                        {group.inverterCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold text-[10px]">
                            {group.inverterCount} inversores
                          </span>
                        )}
                        {group.batteryCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-bold text-[10px]">
                            {group.batteryCount} baterías
                          </span>
                        )}
                        <span className="text-zinc-500">•</span>
                        <span className="text-emerald-500 font-mono font-bold text-[11px]">
                          Rango: ${group.minPrice.toFixed(2)} - ${group.maxPrice.toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones de Acción de este Proveedor */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => handleOpenAddEquipment(group.supplierName)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-600/30 transition-all flex items-center gap-1 cursor-pointer"
                      title="Agregar un equipo a este proveedor"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cotizar Equipo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierToDelete(group.supplierName)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar este proveedor y todas sus ofertas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedSupplier(isExpanded ? null : group.supplierName)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                        isExpanded
                          ? isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                            : 'bg-slate-200 border-slate-300 text-slate-800'
                          : isDark
                          ? 'bg-[#1c1c28] border-[#34344c] text-zinc-300 hover:bg-[#242434]'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{isExpanded ? 'Ocultar' : `Ver Equipos (${group.totalEquipments})`}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Formulario in-situ para agregar equipo a este proveedor */}
                {addingEquipmentToSupplier === group.supplierName && (
                  <form
                    onSubmit={handleSaveEquipmentToSupplier}
                    className={`p-4 border-b space-y-3 animate-in fade-in duration-150 ${
                      isDark ? 'bg-[#181826] border-emerald-900/50' : 'bg-emerald-50/50 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Agregar Cotización de Equipo para "{group.supplierName}"
                      </span>
                      <button
                        type="button"
                        onClick={() => setAddingEquipmentToSupplier(null)}
                        className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Seleccionar Equipo del Catálogo *
                        </label>
                        <select
                          required
                          value={selectedEqIdToAdd}
                          onChange={(e) => setSelectedEqIdToAdd(e.target.value)}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="">-- Elige el modelo de equipo --</option>
                          {equipmentCatalog.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              [{eq.type.toUpperCase()}] {eq.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Precio Unitario USD *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={priceUSDToAdd}
                          onChange={(e) => setPriceUSDToAdd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          SKU del Distribuidor
                        </label>
                        <input
                          type="text"
                          placeholder="Código de artículo..."
                          value={skuToAdd}
                          onChange={(e) => setSkuToAdd(e.target.value)}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Estado de Stock
                        </label>
                        <select
                          value={stockStatusToAdd}
                          onChange={(e) => setStockStatusToAdd(e.target.value as any)}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="in_stock">En Stock Local</option>
                          <option value="on_order">Bajo Pedido (Importación)</option>
                          <option value="out_of_stock">Agotado Temporalmente</option>
                          <option value="consult">Consultar con Vendedor</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Notas u Observaciones
                        </label>
                        <input
                          type="text"
                          placeholder="ej: Precio por pallet..."
                          value={notesToAdd}
                          onChange={(e) => setNotesToAdd(e.target.value)}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddingEquipmentToSupplier(null)}
                        className="px-3 py-1 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                      >
                        Guardar Oferta
                      </button>
                    </div>
                  </form>
                )}

                {/* Formulario de Edición de Oferta Existente */}
                {editingOffer && editingOffer.supplierName === group.supplierName && (
                  <form
                    onSubmit={handleSaveEditedOffer}
                    className={`p-4 border-b space-y-3 animate-in fade-in duration-150 ${
                      isDark ? 'bg-[#1a1a2c] border-blue-900/50' : 'bg-blue-50/60 border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-blue-400 flex items-center gap-1.5">
                        <Edit2 className="w-3.5 h-3.5" />
                        Modificar Precio y Condiciones Comerciales
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingOffer(null)}
                        className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Precio Unitario (USD) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={editingOffer.priceUSD}
                          onChange={(e) =>
                            setEditingOffer({ ...editingOffer, priceUSD: parseFloat(e.target.value) || 0 })
                          }
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          SKU del Distribuidor
                        </label>
                        <input
                          type="text"
                          value={editingOffer.sku}
                          onChange={(e) => setEditingOffer({ ...editingOffer, sku: e.target.value })}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Estado de Stock
                        </label>
                        <select
                          value={editingOffer.stockStatus}
                          onChange={(e) => setEditingOffer({ ...editingOffer, stockStatus: e.target.value as any })}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="in_stock">En Stock Local</option>
                          <option value="on_order">Bajo Pedido (Importación)</option>
                          <option value="out_of_stock">Agotado Temporalmente</option>
                          <option value="consult">Consultar con Vendedor</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Notas
                        </label>
                        <input
                          type="text"
                          value={editingOffer.notes}
                          onChange={(e) => setEditingOffer({ ...editingOffer, notes: e.target.value })}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingOffer(null)}
                        className="px-3 py-1 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-xs"
                      >
                        Actualizar Oferta
                      </button>
                    </div>
                  </form>
                )}

                {/* Vista Expandida: Tabla de Equipos Cotizados por este Proveedor */}
                {isExpanded && (
                  <div className="divide-y divide-zinc-800/40 dark:divide-[#242434]">
                    {group.items.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-400">
                        Este proveedor no tiene equipos cotizados actualmente.
                      </div>
                    ) : (
                      group.items.map(({ equipment, priceInfo }) => {
                        const formattedDate = priceInfo.updatedAt
                          ? new Date(priceInfo.updatedAt).toLocaleDateString('es-DO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Reciente';

                        return (
                          <div
                            key={priceInfo.id}
                            className={`p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-zinc-800/20 transition-colors`}
                          >
                            {/* Información del Equipo */}
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <div className="mt-0.5 shrink-0">{renderTypeIcon(equipment.type)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-xs text-zinc-100 dark:text-zinc-100 text-slate-900">
                                    {equipment.displayName}
                                  </span>
                                  <span
                                    className={`text-[9.5px] px-1.5 py-0.2 rounded uppercase font-mono font-bold ${
                                      equipment.type === 'panel'
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        : equipment.type === 'inverter'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                    }`}
                                  >
                                    {equipment.type}
                                  </span>
                                </div>
                                <div className={`text-[10.5px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                                  {equipment.brand} • {priceInfo.sku ? `SKU: ${priceInfo.sku}` : 'Sin SKU'}
                                  {priceInfo.notes && ` • ${priceInfo.notes}`}
                                </div>
                              </div>
                            </div>

                            {/* Disponibilidad y Fecha */}
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                              <div className="text-right">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    priceInfo.stockStatus === 'in_stock'
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : priceInfo.stockStatus === 'on_order'
                                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                      : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                                  }`}
                                >
                                  {priceInfo.stockStatus === 'in_stock'
                                    ? 'En Stock'
                                    : priceInfo.stockStatus === 'on_order'
                                    ? 'Bajo Pedido'
                                    : 'Agotado'}
                                </span>
                                <span className={`text-[10px] block mt-0.5 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                                  {formattedDate}
                                </span>
                              </div>

                              {/* Precio Unitario */}
                              <div className="text-right min-w-[90px]">
                                <span className="text-sm font-extrabold font-mono text-emerald-500 block">
                                  ${priceInfo.priceUSD.toFixed(2)}
                                </span>
                                <span className={`text-[9.5px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                                  USD/ud
                                </span>
                              </div>

                              {/* Botones de Modificación / Eliminación Individual */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingOffer({
                                      equipmentId: equipment.id,
                                      supplierPriceId: priceInfo.id,
                                      supplierName: group.supplierName,
                                      priceUSD: priceInfo.priceUSD,
                                      sku: priceInfo.sku || '',
                                      stockStatus: priceInfo.stockStatus || 'in_stock',
                                      notes: priceInfo.notes || '',
                                    })
                                  }
                                  className="p-1.5 text-zinc-400 hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
                                  title="Editar precio y datos de este equipo"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => removeSupplierPrice(equipment.id, priceInfo.id)}
                                  className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                  title="Quitar este equipo de la lista de este proveedor"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmación para Eliminar Proveedor */}
      {supplierToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
              isDark ? 'bg-[#181822] border-red-900/50 text-white' : 'bg-white border-red-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 text-red-500">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-base leading-tight">¿Eliminar distribuidor?</h4>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Esta acción es irreversible y se sincronizará con la nube.
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed">
              ¿Estás seguro de que deseas eliminar por completo al proveedor{' '}
              <strong className="text-red-400">"{supplierToDelete}"</strong>? Todas las ofertas y cotizaciones comerciales registradas para este proveedor en los equipos del catálogo serán eliminadas.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSupplierToDelete(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSupplier}
                className="px-4 py-2 text-xs font-extrabold rounded-xl bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-md transition-all"
              >
                Sí, Eliminar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
