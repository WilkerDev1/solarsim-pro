import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SolarEquipmentItem, EquipmentType } from '../../../types/equipment';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { EquipmentPreviewThumb } from '../../common/equipment/EquipmentPreviewThumb';
import { isInsideEquipmentPreview } from '../../common/equipment/EquipmentPreviewDialog';
import { Search, ChevronDown, Check, Sparkles, X, Layers, Building2, DollarSign } from 'lucide-react';

interface SearchableEquipmentSelectProps {
  type: EquipmentType;
  items: SolarEquipmentItem[];
  selectedValue: string;
  selectedPower?: number; // Para panel (W), inversor (kW) o batería (kWh)
  onSelect: (item: SolarEquipmentItem) => void;
  onOpenScanner: () => void;
  placeholder?: string;
  /** Ya no se usa: los colores salen de los tokens pd-* y cambian con la clase dark. */
  isDark?: boolean;
  /** Nombre accesible del selector; no se dibuja. */
  label: string;
  /** Contenido junto al disparador (contador); el menú abierto sigue ocupando todo el ancho. */
  trailing?: React.ReactNode;
  /** Solo para pruebas de marcado. */
  defaultOpen?: boolean;
}

export const SearchableEquipmentSelect: React.FC<SearchableEquipmentSelectProps> = ({
  type,
  items,
  selectedValue,
  selectedPower,
  onSelect,
  onOpenScanner,
  placeholder,
  label,
  trailing,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Marcas únicas disponibles para este tipo de equipo
  const availableBrands = useMemo(() => {
    const brandCounts = new Map<string, number>();
    (items || []).forEach((it) => {
      if (it.type !== type) return;
      const b = it.brand?.trim() || 'Sin Marca';
      brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    });
    return Array.from(brandCounts.entries())
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand, 'es', { sensitivity: 'base' }));
  }, [items, type]);

  // Filtrar y ordenar alfabéticamente
  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (items || [])
      .filter((item) => {
        if (!item || item.type !== type) return false;

        if (selectedBrandFilter !== 'all') {
          const itemBrand = item.brand?.trim() || 'Sin Marca';
          if (itemBrand !== selectedBrandFilter) return false;
        }

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
  }, [items, type, selectedBrandFilter, searchQuery]);

  // Manejar clic afuera para cerrar dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // The preview dialog opened from an option lives in a body portal: it is not an outside click.
      if (isInsideEquipmentPreview(event.target)) return;
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

  const unitText = isPanel ? 'W' : isBattery ? 'kWh' : 'kW';
  const triggerId = React.useId();
  const listId = `${triggerId}-list`;
  const chipClass = 'inline-flex h-[22px] flex-none items-center gap-1 rounded border border-pd-field-border bg-pd-field px-1.5 text-[11px] font-semibold text-pd-text';

  return (
    <div className="relative min-w-0" ref={containerRef}>
      {/* Selector: lupa, nombre del modelo y potencia en mono */}
      <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${label}: ${selectedValue || 'sin seleccionar'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`flex h-[34px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border bg-pd-field px-2.5 text-left ${
          isOpen ? 'border-pd-accent' : 'border-pd-field-border hover:border-pd-outline'
        }`}
      >
        <Search size={14} strokeWidth={2} aria-hidden="true" className="flex-none text-pd-muted" />
        <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${selectedValue ? 'text-pd-text' : 'font-normal text-pd-subtle'}`}>
          {selectedValue || getPlaceholderText()}
        </span>
        {effectivePower ? <span className="flex-none font-mono text-xs text-pd-muted">{`${effectivePower} ${unitText}`}</span> : null}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`flex-none text-pd-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {trailing}
      </div>

      {/* Menú con buscador en tiempo real, en flujo normal para expandir la sección */}
      {isOpen && (
        <div className="mt-1.5 w-full overflow-hidden rounded-md border border-pd-field-border bg-pd-panel text-pd-text shadow-lg">
          <div className="flex items-center gap-2 border-b border-pd-border px-2.5 py-2">
            <Search size={14} strokeWidth={2} aria-hidden="true" className="flex-none text-pd-muted" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              aria-label="Buscar en el catálogo"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getSearchPlaceholderText()}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-pd-text outline-none placeholder:text-pd-subtle"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setSearchQuery('');
                  inputRef.current?.focus();
                }}
                className="flex-none cursor-pointer border-0 bg-transparent p-0.5 text-pd-muted hover:text-pd-text"
              >
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : (
              <span className="flex-none font-mono text-[11px] text-pd-muted">{filteredAndSortedItems.length}</span>
            )}
          </div>

          {/* Filtro rápido por marca */}
          {availableBrands.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-pd-border px-2 py-1.5 scrollbar-none">
              <button
                type="button"
                aria-pressed={selectedBrandFilter === 'all'}
                onClick={() => setSelectedBrandFilter('all')}
                className={`flex-none cursor-pointer rounded border-0 px-2 py-0.5 text-[11px] font-medium ${
                  selectedBrandFilter === 'all' ? 'bg-pd-accent text-pd-on-accent' : 'bg-pd-field text-pd-muted'
                }`}
              >
                Todas ({(items || []).filter((i) => i.type === type).length})
              </button>
              {availableBrands.map(({ brand, count }) => (
                <button
                  key={brand}
                  type="button"
                  aria-pressed={selectedBrandFilter === brand}
                  onClick={() => setSelectedBrandFilter(selectedBrandFilter === brand ? 'all' : brand)}
                  className={`flex flex-none cursor-pointer items-center gap-1 rounded border-0 px-2 py-0.5 text-[11px] font-medium ${
                    selectedBrandFilter === brand ? 'bg-pd-accent text-pd-on-accent' : 'bg-pd-field text-pd-muted'
                  }`}
                >
                  <span>{brand}</span>
                  <span className="font-mono text-[10px] opacity-80">({count})</span>
                </button>
              ))}
            </div>
          )}

          <div id={listId} role="listbox" aria-label={label} className="max-h-[440px] overflow-y-auto p-1">
            {filteredAndSortedItems.length === 0 ? (
              <div className="p-4 text-center">
                <p className="m-0 text-xs text-pd-muted">
                  No se encontraron {isPanel ? 'paneles' : isBattery ? 'baterías' : 'inversores'}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenScanner();
                  }}
                  className="mx-auto mt-2 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs font-semibold text-pd-accent hover:underline"
                >
                  <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
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
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => handleSelect(item)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(item);
                      }
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-md px-2 py-2 text-xs hover:bg-pd-field ${
                      isSelected ? 'bg-pd-item' : ''
                    }`}
                  >
                    <EquipmentPreviewThumb item={item} size={32} />
                    <div className="min-w-0 flex-1 pr-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`break-words text-[13px] leading-snug ${isSelected ? 'font-semibold' : 'font-medium'} text-pd-text`} title={item.displayName}>
                          {item.displayName}
                        </span>
                        {item.isCustom && <span className="flex-none rounded bg-pd-chip-bg px-1.5 text-[10px] font-semibold text-pd-chip-text">IA</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-pd-muted">
                        <span className="font-medium">{item.brand}</span>
                        {item.type === 'battery' && (
                          <>
                            {item.voltageV && <span>· {item.voltageV}V</span>}
                            {item.capacityAh && <span>· {item.capacityAh}Ah</span>}
                            {item.dodPct && <span>· {item.dodPct}% DoD</span>}
                            {item.chemistry && <span>· {item.chemistry}</span>}
                          </>
                        )}
                        {item.type === 'panel' && (
                          <>
                            {item.category && <span>· {item.category}</span>}
                            {item.efficiencyPct && <span>· {item.efficiencyPct}% η</span>}
                            {item.tempCoeff && <span>· {item.tempCoeff}%/°C</span>}
                          </>
                        )}
                        {item.type === 'inverter' && (
                          <>
                            {item.category && <span>· {item.category}</span>}
                            {item.voltageMPPT && <span>· MPPT: {item.voltageMPPT}</span>}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-none items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          useSimulationStore.getState().openSupplierPriceModal(item);
                        }}
                        className={`${chipClass} cursor-pointer ${suppliersCount > 0 ? '' : 'font-normal text-pd-muted'}`}
                        title={
                          suppliersCount > 0
                            ? `${suppliersCount} proveedores cotizan este equipo. Mejor precio: $${bestPrice?.toFixed(2)} USD. Clic para ver detalles.`
                            : 'Agregar precio de proveedor para este equipo'
                        }
                      >
                        <Building2 size={12} strokeWidth={2} aria-hidden="true" className="flex-none" />
                        <span>{suppliersCount > 0 ? `${suppliersCount} prov.` : '+ Prov.'}</span>
                      </button>
                      <span className="font-mono text-[11px] font-semibold text-pd-text">{formatPowerBadge(item)}</span>
                      {isSelected && <Check size={14} strokeWidth={2.5} aria-hidden="true" className="flex-none text-pd-accent" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pie: escáner de fichas con IA, precios con IA y administrar catálogo */}
          <div className="flex items-center gap-1.5 border-t border-pd-border p-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenScanner();
              }}
              className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 bg-pd-accent px-2 text-xs font-semibold text-pd-on-accent"
            >
              <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
              <span>Escanear ficha</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                useSimulationStore.getState().openAIPriceCatalogModal();
              }}
              title="Escanear listas de precios comerciales de proveedores con IA"
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-pd-outline bg-transparent px-2.5 text-xs font-medium text-pd-strong"
            >
              <DollarSign size={14} strokeWidth={2} aria-hidden="true" />
              <span>Precios IA</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                useSimulationStore.getState().openSettingsModal('equipment');
              }}
              title="Administrar catálogo en Ajustes"
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-pd-outline bg-transparent px-2.5 text-xs font-medium text-pd-strong"
            >
              <Layers size={14} strokeWidth={2} aria-hidden="true" />
              <span>Catálogo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
