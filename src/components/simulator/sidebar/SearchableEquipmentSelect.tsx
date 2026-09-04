import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SolarEquipmentItem, EquipmentType } from '../../../types/equipment';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { Search, ChevronDown, Check, Sparkles, Sun, Zap, BatteryCharging, X, Layers, Building2, DollarSign } from 'lucide-react';

interface SearchableEquipmentSelectProps {
  type: EquipmentType;
  items: SolarEquipmentItem[];
  selectedValue: string;
  selectedPower?: number; // Para panel (W), inversor (kW) o batería (kWh)
  onSelect: (item: SolarEquipmentItem) => void;
  onOpenScanner: () => void;
  placeholder?: string;
  isDark: boolean;
  label: string;
}

export const SearchableEquipmentSelect: React.FC<SearchableEquipmentSelectProps> = ({
  type,
  items,
  selectedValue,
  selectedPower,
  onSelect,
  onOpenScanner,
  placeholder,
  isDark,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtrar y ordenar alfabéticamente
  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (items || [])
      .filter((item) => {
        if (!item || item.type !== type) return false;
        if (!q) return true;
        return (
          (item.displayName && item.displayName.toLowerCase().includes(q)) ||
          (item.brand && item.brand.toLowerCase().includes(q)) ||
          (item.modelSeries && item.modelSeries.toLowerCase().includes(q)) ||
          (item.powerW && item.powerW.toString().includes(q)) ||
          (item.powerKW && item.powerKW.toString().includes(q)) ||
          (item.capacityKWh && item.capacityKWh.toString().includes(q)) ||
          (item.capacityAh && item.capacityAh.toString().includes(q)) ||
          (item.voltageV && item.voltageV.toString().includes(q)) ||
          (item.chemistry && item.chemistry.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'es', { sensitivity: 'base' }));
  }, [items, type, searchQuery]);

  // Manejar clic afuera para cerrar dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Asegurar que el selector expandido sea visible en el dock lateral
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const timer = setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelect = (item: SolarEquipmentItem) => {
    onSelect(item);
    setIsOpen(false);
    setSearchQuery('');
  };

  const isPanel = type === 'panel';
  const isBattery = type === 'battery';
  const isInverter = type === 'inverter';

  const renderIcon = () => {
    if (isPanel) return <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    if (isBattery) return <BatteryCharging className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    return <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  };

  const getPlaceholderText = () => {
    if (placeholder) return placeholder;
    if (isPanel) return 'Seleccionar módulo solar...';
    if (isBattery) return 'Seleccionar batería de almacenamiento...';
    return 'Seleccionar inversor...';
  };

  const getSearchPlaceholderText = () => {
    if (isPanel) return 'Buscar por marca, modelo o vatios (W)...';
    if (isBattery) return 'Buscar por marca, kWh, Ah, voltaje (V)...';
    return 'Buscar por marca, modelo o kilovatios (kW)...';
  };

  const matchingItem = useMemo(() => {
    if (!selectedValue) return null;
    const exact = (items || []).find((item) => item.type === type && item.displayName === selectedValue);
    if (exact) return exact;

    const norm = selectedValue.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byNorm = (items || []).find((item) => {
      if (item.type !== type) return false;
      const normItem = item.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normItem === norm || normItem.includes(norm) || norm.includes(normItem);
    });
    if (byNorm) return byNorm;

    if (type === 'battery' && (norm.includes('hina') || norm.includes('powergem'))) {
      const hina = (items || []).find(
        (item) => item.type === 'battery' && (item.brand.toLowerCase().includes('hina') || item.displayName.toLowerCase().includes('hina'))
      );
      if (hina) return hina;
    }

    if (selectedPower && selectedPower > 0) {
      if (type === 'battery') {
        const byCap = (items || []).find((item) => item.type === 'battery' && item.capacityKWh && Math.abs(item.capacityKWh - selectedPower) <= 0.5);
        if (byCap) return byCap;
      } else if (type === 'panel') {
        const byW = (items || []).find((item) => item.type === 'panel' && item.powerW && Math.abs(item.powerW - selectedPower) <= 5);
        if (byW) return byW;
      } else if (type === 'inverter') {
        const byKW = (items || []).find((item) => item.type === 'inverter' && item.powerKW && Math.abs(item.powerKW - selectedPower) <= 0.5);
        if (byKW) return byKW;
      }
    }

    return null;
  }, [items, type, selectedValue, selectedPower]);

  const effectivePower = useMemo(() => {
    if (matchingItem) {
      if (isPanel) return matchingItem.powerW;
      if (isBattery) return matchingItem.capacityKWh;
      return matchingItem.powerKW;
    }
    return selectedPower;
  }, [matchingItem, isPanel, isBattery, selectedPower]);

  const formatPowerBadge = (item: SolarEquipmentItem) => {
    if (item.type === 'panel') return `${item.powerW}W`;
    if (item.type === 'battery') return `${item.capacityKWh}kWh`;
    return `${item.powerKW}kW`;
  };

  return (
    <div className="relative space-y-1" ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className={`block text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
          {label}
        </label>
        <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          {filteredAndSortedItems.length} en catálogo
        </span>
      </div>

      {/* Botón / Selector Principal */}
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`w-full border rounded-lg px-3 py-2 text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
          isOpen
            ? isDark
              ? 'border-emerald-500 bg-[#22222a] ring-1 ring-emerald-500/30'
              : 'border-emerald-600 bg-white ring-1 ring-emerald-600/30'
            : isDark
            ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 hover:border-zinc-500'
            : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1">
          {renderIcon()}
          <span className="truncate font-semibold">
            {selectedValue || getPlaceholderText()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {effectivePower ? (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                isBattery
                  ? isDark
                    ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/50'
                    : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                  : isDark
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isPanel ? `${effectivePower}W` : isBattery ? `${effectivePower}kWh` : `${effectivePower}kW`}
            </span>
          ) : null}
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-500' : ''
            }`}
          />
        </div>
      </div>

      {/* Menú Desplegable con Buscador en Tiempo Real - En flujo normal para expandir la categoría */}
      {isOpen && (
        <div
          className={`mt-2 w-full rounded-xl border shadow-lg overflow-hidden transition-all duration-200 animate-in fade-in ${
            isDark ? 'bg-[#1c1c24] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-900 shadow-slate-200'
          }`}
        >
          {/* Input de Búsqueda y Filtrado en Tiempo Real */}
          <div
            className={`p-2.5 border-b flex items-center gap-2 ${
              isDark ? 'bg-[#14141c] border-[#27272a]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getSearchPlaceholderText()}
              className={`w-full bg-transparent border-none outline-none text-xs ${
                isDark ? 'text-zinc-100 placeholder-zinc-500' : 'text-slate-900 placeholder-slate-400'
              }`}
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  inputRef.current?.focus();
                }}
                className="text-zinc-400 hover:text-zinc-200 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Lista de Resultados con altura expandida (5 a 10 equipos visibles a la vez) */}
          <div className="max-h-[440px] overflow-y-auto p-1.5 space-y-1">
            {filteredAndSortedItems.length === 0 ? (
              <div className="p-4 text-center">
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  No se encontraron {isPanel ? 'paneles' : isBattery ? 'baterías' : 'inversores'} coincidentes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenScanner();
                  }}
                  className="mt-2 text-xs font-bold text-purple-400 hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Escanear ficha técnica con IA</span>
                </button>
              </div>
            ) : (
              filteredAndSortedItems.map((item) => {
                const isSelected = selectedValue === item.displayName;
                const suppliersCount = item.supplierPrices?.length || 0;
                const bestPrice = suppliersCount > 0 ? Math.min(...item.supplierPrices!.map((s) => s.priceUSD)) : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? isDark
                          ? 'bg-emerald-950/50 text-emerald-300 font-bold border border-emerald-800/60'
                          : 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200'
                        : isDark
                        ? 'hover:bg-[#272732] text-zinc-200'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="font-bold text-xs leading-snug break-words"
                          title={item.displayName}
                        >
                          {item.displayName}
                        </span>
                        {item.isCustom && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0 font-medium">
                            IA
                          </span>
                        )}
                      </div>
                      <div className={`text-[10.5px] flex items-center gap-1.5 flex-wrap mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <span className="font-semibold">{item.brand}</span>
                        {item.type === 'battery' && (
                          <>
                            {item.voltageV && <span>• {item.voltageV}V</span>}
                            {item.capacityAh && <span>• {item.capacityAh}Ah</span>}
                            {item.dodPct && <span>• {item.dodPct}% DoD</span>}
                            {item.chemistry && <span>• {item.chemistry}</span>}
                          </>
                        )}
                        {item.type === 'panel' && (
                          <>
                            {item.category && <span>• {item.category}</span>}
                            {item.efficiencyPct && <span>• {item.efficiencyPct}% η</span>}
                            {item.tempCoeff && <span>• {item.tempCoeff}%/°C</span>}
                          </>
                        )}
                        {item.type === 'inverter' && (
                          <>
                            {item.category && <span>• {item.category}</span>}
                            {item.voltageMPPT && <span>• MPPT: {item.voltageMPPT}</span>}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Botón / Pill de Proveedores */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          useSimulationStore.getState().openSupplierPriceModal(item);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                          suppliersCount > 0
                            ? isDark
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                              : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                            : isDark
                            ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800'
                        }`}
                        title={
                          suppliersCount > 0
                            ? `${suppliersCount} proveedores cotizan este equipo. Mejor precio: $${bestPrice?.toFixed(2)} USD. Clic para ver detalles.`
                            : 'Agregar precio de proveedor para este equipo'
                        }
                      >
                        <Building2 className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>{suppliersCount > 0 ? `${suppliersCount} prov.` : '+ Prov.'}</span>
                      </button>

                      <span className={`font-mono text-[11px] font-bold ${isBattery ? 'text-cyan-400' : 'text-emerald-500'}`}>
                        {formatPowerBadge(item)}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer del Dropdown con botón de Escanear Datasheet con IA, Precios IA y Administrar Catálogo */}
          <div
            className={`p-2 border-t flex items-center gap-1.5 ${
              isDark ? 'bg-[#14141c] border-[#27272a]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenScanner();
              }}
              className="flex-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-purple-600/20 to-indigo-600/20 hover:from-purple-600/30 hover:to-indigo-600/30 text-purple-400 border border-purple-500/30 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Escanear Ficha</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                useSimulationStore.getState().openAIPriceCatalogModal();
              }}
              title="Escanear listas de precios comerciales de proveedores con IA"
              className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px]">Precios IA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                useSimulationStore.getState().openSettingsModal('equipment');
              }}
              title="Administrar catálogo en Ajustes"
              className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center gap-1 ${
                isDark
                  ? 'border-[#3f3f46] hover:bg-[#272732] text-zinc-300'
                  : 'border-slate-300 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold">Catálogo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
