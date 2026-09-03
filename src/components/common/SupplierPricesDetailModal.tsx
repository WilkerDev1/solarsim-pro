import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SolarEquipmentItem, EquipmentSupplierPrice } from '../../types/equipment';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Building2,
  Calendar,
  Sparkles,
  TrendingDown,
  Info,
  DollarSign,
  Sun,
  Zap,
  BatteryCharging,
} from 'lucide-react';

export const SupplierPricesDetailModal: React.FC = () => {
  const {
    supplierPriceModalEquipment,
    closeSupplierPriceModal,
    addOrUpdateSupplierPrice,
    removeSupplierPrice,
    setPreferredSupplier,
    applySupplierPriceToProject,
    openAIPriceCatalogModal,
    sidebarTheme,
    getActiveProject,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const item = supplierPriceModalEquipment;

  // Estado para nuevo proveedor manual
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number | ''>('');
  const [sku, setSku] = useState('');
  const [notes, setNotes] = useState('');
  const [stockStatus, setStockStatus] = useState<EquipmentSupplierPrice['stockStatus']>('in_stock');

  const equipmentCatalog = useSimulationStore((s) => s.equipmentCatalog);
  const existingSupplierNames: string[] = useMemo(() => {
    const setNames = new Set<string>();
    equipmentCatalog.forEach((eq) => {
      (eq.supplierPrices || []).forEach((sp) => {
        if (sp.supplierName) setNames.add(sp.supplierName);
      });
    });
    return Array.from(setNames).sort();
  }, [equipmentCatalog]);

  if (!item) return null;

  const project = getActiveProject();
  const selectedSupplierInfo = project?.specs?.selectedSupplierInfo;
  const currentAppliedSupplierId =
    item.type === 'panel'
      ? selectedSupplierInfo?.panel?.supplierPriceId
      : item.type === 'inverter'
      ? selectedSupplierInfo?.inverter?.supplierPriceId
      : selectedSupplierInfo?.battery?.supplierPriceId;

  const supplierPrices: EquipmentSupplierPrice[] = Array.isArray(item.supplierPrices) ? item.supplierPrices : [];

  // Calcular precio más bajo
  const lowestPrice = supplierPrices.length > 0 ? Math.min(...supplierPrices.map((s) => s.priceUSD)) : null;

  const handleOpenAdd = () => {
    setIsAddingManual(true);
    setEditingPriceId(null);
    setSupplierName('');
    setPriceUSD('');
    setSku('');
    setNotes('');
    setStockStatus('in_stock');
  };

  const handleOpenEdit = (sp: EquipmentSupplierPrice) => {
    setIsAddingManual(true);
    setEditingPriceId(sp.id);
    setSupplierName(sp.supplierName);
    setPriceUSD(sp.priceUSD);
    setSku(sp.sku || '');
    setNotes(sp.notes || '');
    setStockStatus(sp.stockStatus || 'in_stock');
  };

  const handleSaveSupplierPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || typeof priceUSD !== 'number' || priceUSD <= 0) return;

    addOrUpdateSupplierPrice(item.id, {
      id: editingPriceId || undefined,
      supplierName: supplierName.trim(),
      priceUSD,
      sku: sku.trim() || undefined,
      notes: notes.trim() || undefined,
      stockStatus,
      source: 'manual',
    });

    setIsAddingManual(false);
    setEditingPriceId(null);
  };

  const handleApplyToProject = (sp: EquipmentSupplierPrice) => {
    applySupplierPriceToProject(item.type, sp);
  };

  const renderIcon = () => {
    if (item.type === 'panel') return <Sun className="w-5 h-5 text-amber-500 shrink-0" />;
    if (item.type === 'battery') return <BatteryCharging className="w-5 h-5 text-cyan-400 shrink-0" />;
    return <Zap className="w-5 h-5 text-emerald-500 shrink-0" />;
  };

  const formatPower = () => {
    if (item.type === 'panel') return `${item.powerW || 600}W`;
    if (item.type === 'battery') return `${item.capacityKWh || 16.08}kWh`;
    return `${item.powerKW || 8.0}kW`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isDark ? 'bg-[#181822] border-[#2e2e3e] text-zinc-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 border-b flex items-start justify-between gap-3 ${
            isDark ? 'border-[#272736] bg-[#14141c]' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#222230] border-[#38384a]' : 'bg-white border-slate-200 shadow-2xs'}`}>
              {renderIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm leading-tight">{item.displayName}</h3>
                <span
                  className={`text-[10.5px] px-2 py-0.5 rounded font-mono font-bold ${
                    item.type === 'battery'
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {formatPower()}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                {item.brand} • {supplierPrices.length} oferta{supplierPrices.length !== 1 ? 's' : ''} de proveedores registradas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeSupplierPriceModal}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Lista de Distribuidores
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  closeSupplierPriceModal();
                  openAIPriceCatalogModal();
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Escanear Lista con IA</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Proveedor</span>
              </button>
            </div>
          </div>

          {/* Formulario de Alta / Edición Manual */}
          {isAddingManual && (
            <form
              onSubmit={handleSaveSupplierPrice}
              className={`p-4 rounded-xl border space-y-3 animate-in fade-in duration-150 ${
                isDark ? 'bg-[#12121a] border-[#2e2e42]' : 'bg-emerald-50/40 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-500">
                  {editingPriceId ? 'Editar Precio de Proveedor' : 'Nuevo Proveedor & Precio'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingManual(false)}
                  className="text-zinc-400 hover:text-zinc-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Nombre del Proveedor / Suplidor *
                  </label>
                  <input
                    type="text"
                    required
                    list="supplier-names-datalist"
                    placeholder="ej: Enersys RD, RAAS Solar, Fersan..."
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      isDark ? 'bg-[#181822] border-[#383848] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <datalist id="supplier-names-datalist">
                    {existingSupplierNames.map((name: string) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Precio Unitario de Compra (USD) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={priceUSD}
                      onChange={(e) => setPriceUSD(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className={`w-full border rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-mono font-bold ${
                        isDark ? 'bg-[#181822] border-[#383848] text-emerald-300' : 'bg-white border-slate-300 text-emerald-950'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    SKU o Código de Catálogo (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: EN-CS615-TOP"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${
                      isDark ? 'bg-[#181822] border-[#383848] text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Disponibilidad / Stock
                  </label>
                  <select
                    value={stockStatus}
                    onChange={(e) => setStockStatus(e.target.value as any)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      isDark ? 'bg-[#181822] border-[#383848] text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="in_stock">En Stock Local</option>
                    <option value="on_order">Bajo Pedido (Importación)</option>
                    <option value="out_of_stock">Agotado Temporalmente</option>
                    <option value="consult">Consultar con Vendedor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                  Notas u Observaciones Comerciales
                </label>
                <input
                  type="text"
                  placeholder="ej: Precio aplica por compra de contenedor o pallet completo."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${
                    isDark ? 'bg-[#181822] border-[#383848] text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingManual(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                >
                  {editingPriceId ? 'Actualizar Precio' : 'Guardar Precio'}
                </button>
              </div>
            </form>
          )}

          {/* Listado de Ofertas de Proveedores */}
          {supplierPrices.length === 0 ? (
            <div
              className={`p-8 text-center rounded-xl border border-dashed ${
                isDark ? 'border-[#2e2e3e] bg-[#121218]' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <Building2 className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-bold text-zinc-300 mb-1">Aún no hay precios de proveedores registrados</p>
              <p className={`text-[11px] max-w-sm mx-auto mb-4 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                Puedes agregar precios manualmente o usar el escáner con IA para importar la lista de precios de un distribuidor en PDF o imagen.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                >
                  Agregar Proveedor Manual
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {supplierPrices.map((sp) => {
                const isLowest = sp.priceUSD === lowestPrice;
                const isApplied = currentAppliedSupplierId === sp.id;
                const formattedDate = new Date(sp.updatedAt).toLocaleDateString('es-DO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <div
                    key={sp.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isApplied
                        ? isDark
                          ? 'bg-emerald-950/40 border-emerald-700/80 shadow-xs'
                          : 'bg-emerald-50 border-emerald-300 shadow-xs'
                        : isDark
                        ? 'bg-[#1e1e2b] border-[#323246] hover:border-zinc-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs">{sp.supplierName}</span>
                        {isLowest && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            Mejor Precio
                          </span>
                        )}
                        {isApplied && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Activo en Proyecto
                          </span>
                        )}
                        {sp.sku && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-slate-100 text-slate-600'}`}>
                            SKU: {sp.sku}
                          </span>
                        )}
                      </div>

                      <div className={`text-[11px] flex items-center gap-3 mt-1 flex-wrap ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          Actualizado: {formattedDate}
                        </span>
                        {sp.stockStatus && (
                          <span className="capitalize">
                            • {sp.stockStatus === 'in_stock' ? 'En Stock' : sp.stockStatus === 'on_order' ? 'Bajo Pedido' : sp.stockStatus}
                          </span>
                        )}
                        {sp.notes && <span className="italic">• {sp.notes}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="text-right">
                        <span className="text-base font-extrabold text-emerald-500 font-mono">
                          ${sp.priceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[10px] block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>USD/ud</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyToProject(sp)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isApplied
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : isDark
                            ? 'bg-[#272738] hover:bg-emerald-950/60 hover:text-emerald-300 text-zinc-200 border border-[#3f3f56]'
                            : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200'
                        }`}
                        title="Aplicar este precio de compra al cálculo de cotización y margen del proyecto actual"
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Aplicado</span>
                          </>
                        ) : (
                          <span>Usar Precio</span>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(sp)}
                          title="Editar precio"
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-md hover:bg-zinc-800/60 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSupplierPrice(item.id, sp.id)}
                          title="Eliminar este proveedor"
                          className="p-1.5 text-red-400/70 hover:text-red-400 rounded-md hover:bg-red-500/10 cursor-pointer"
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
        </div>

        {/* Footer */}
        <div
          className={`p-3.5 px-5 border-t flex items-center justify-between text-xs ${
            isDark ? 'border-[#272736] bg-[#121218] text-zinc-400' : 'border-slate-100 bg-slate-50 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>Los precios se sincronizan automáticamente con la nube y el equipo de trabajo.</span>
          </div>
          <button
            type="button"
            onClick={closeSupplierPriceModal}
            className="px-4 py-1.5 rounded-lg font-bold text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
