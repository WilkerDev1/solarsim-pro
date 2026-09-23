import React from 'react';
import { ProjectSimulation, FinancialParams, CustomQuotationItem, CustomQuotationDiscount } from '../../../types';
import { Landmark, ChevronDown, Plus, Trash2, PackagePlus, Tag, Percent, DollarSign } from 'lucide-react';
import { calculateCostMatrixSummary } from '../../../engine/financeEngine';
import { calculateTotalDCCapacityKWp } from '../../../utils/equipmentSpecsUtils';

interface FinancialsParamsSectionProps {
  project: ProjectSimulation;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
}

export const FinancialsParamsSection: React.FC<FinancialsParamsSectionProps> = ({
  project,
  isOpen,
  onToggle,
  isDark,
  updateFinancials,
}) => {
  const customItems = project.financials.customItems || [];
  const customDiscounts = project.financials.customDiscounts || [];

  const handleAddItem = () => {
    const newItem: CustomQuotationItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      description: '',
      quantity: 1,
      unit: 'UD',
      unitPriceUSD: 0,
      exonerateITBIS: true,
      applyITBIS: true,
      applyMargin: true,
    };
    updateFinancials({ customItems: [...customItems, newItem] });
  };

  const handleUpdateItem = (id: string, partial: Partial<CustomQuotationItem>) => {
    const updated = customItems.map((item) => {
      if (item.id === id) {
        return { ...item, ...partial };
      }
      return item;
    });
    updateFinancials({ customItems: updated });
  };

  const handleDeleteItem = (id: string) => {
    const filtered = customItems.filter((item) => item.id !== id);
    updateFinancials({ customItems: filtered });
  };

  const handleAddDiscount = () => {
    const newDiscount: CustomQuotationDiscount = {
      id: 'disc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      description: '',
      type: 'fixed',
      value: 0,
      target: 'general',
    };
    updateFinancials({ customDiscounts: [...customDiscounts, newDiscount] });
  };

  const handleUpdateDiscount = (id: string, partial: Partial<CustomQuotationDiscount>) => {
    const updated = customDiscounts.map((disc) => {
      if (disc.id === id) {
        return { ...disc, ...partial };
      }
      return disc;
    });
    updateFinancials({ customDiscounts: updated });
  };

  const handleDeleteDiscount = (id: string) => {
    const filtered = customDiscounts.filter((disc) => disc.id !== id);
    updateFinancials({ customDiscounts: filtered });
  };

  const matrixSummary = React.useMemo(() => {
    const dcCap = project.specs ? calculateTotalDCCapacityKWp(project.specs) : 1;
    return calculateCostMatrixSummary(project.specs, dcCap, customItems);
  }, [project.specs, customItems]);

  const estimatedListPriceUSD = matrixSummary.listPorcentajeVentaUSD || matrixSummary.porcentajeVentaUSD || 0;

  const getDiscountAmountUSD = (disc: CustomQuotationDiscount) => {
    if (disc.type === 'percentage') {
      const pct = Math.max(0, Math.min(100, disc.value || 0));
      return Math.round((estimatedListPriceUSD * (pct / 100)) * 100) / 100;
    }
    return Math.max(0, disc.value || 0);
  };

  const totalDiscountUSD = customDiscounts.reduce((sum, disc) => sum + getDiscountAmountUSD(disc), 0);
  const equipmentDiscountUSD = customDiscounts
    .filter((disc) => disc.target === 'equipment')
    .reduce((sum, disc) => sum + getDiscountAmountUSD(disc), 0);

  const customItemsSubtotalUSD = customItems.reduce(
    (sum, it) => sum + (it.quantity || 0) * (it.unitPriceUSD || 0),
    0
  );

  const customItemsExoneratedITBISUSD = customItems.reduce((sum, it) => {
    const isExonerated = it.exonerateITBIS !== undefined ? it.exonerateITBIS : (it.applyITBIS ?? true);
    return isExonerated ? sum + ((it.quantity || 0) * (it.unitPriceUSD || 0) * 0.18) : sum;
  }, 0);

  const customItemsNonExoneratedITBISUSD = customItems.reduce((sum, it) => {
    const isExonerated = it.exonerateITBIS !== undefined ? it.exonerateITBIS : (it.applyITBIS ?? true);
    return !isExonerated ? sum + ((it.quantity || 0) * (it.unitPriceUSD || 0) * 0.18) : sum;
  }, 0);

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
          isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>5. Finanzas e Incentivos (Ley 57-07)</span>
          {customItems.length > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold rounded-full">
              +{customItems.length}
            </span>
          )}
          {customDiscounts.length > 0 && (
            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold rounded-full">
              -{customDiscounts.length} desc
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`p-3.5 pt-2 space-y-3.5 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          {/* Toggles Principales */}
          <label className="flex items-center justify-between cursor-pointer group">
            <span
              className={`text-xs font-medium transition-colors ${
                isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
              }`}
            >
              Aplicar Ley 57-07 (Crédito ISR 40%)
            </span>
            <input
              type="checkbox"
              checked={project.financials.applyLey5707}
              onChange={(e) => updateFinancials({ applyLey5707: e.target.checked })}
              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span
              className={`text-xs font-medium transition-colors ${
                isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
              }`}
            >
              Exoneración ITBIS 100% (18%)
            </span>
            <input
              type="checkbox"
              checked={project.financials.applyITBISExemption}
              onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
          </label>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Tasa de Descuento (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={project.financials.discountRatePct}
              onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* Apartado de Otros Ítems y Equipos Personalizados */}
          <div className={`pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <PackagePlus className="w-3.5 h-3.5 text-emerald-500" />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                  Otros Ítems y Materiales
                </span>
                {customItems.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold rounded-full">
                    {customItems.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10.5px] font-bold flex items-center gap-1 transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                title="Agregar un nuevo ítem personalizado a la cotización"
              >
                <Plus className="w-3 h-3" />
                <span>Agregar Ítem</span>
              </button>
            </div>

            {customItems.length === 0 ? (
              <div
                className={`p-2.5 rounded-lg border border-dashed text-center text-[11px] ${
                  isDark ? 'border-zinc-800 bg-[#1e1e28]/40 text-zinc-400' : 'border-slate-200 bg-slate-50/60 text-slate-500'
                }`}
              >
                Sin ítems adicionales. Haz clic en <span className="font-bold text-emerald-600 dark:text-emerald-400">+ Agregar Ítem</span> para añadir equipos, materiales o servicios extra.
              </div>
            ) : (
              <div className="space-y-2.5">
                {customItems.map((item, index) => {
                  const itemTotalUSD = (item.quantity || 0) * (item.unitPriceUSD || 0);
                  const isExonerated = item.exonerateITBIS !== undefined ? item.exonerateITBIS : (item.applyITBIS ?? true);
                  return (
                    <div
                      key={item.id || index}
                      className={`p-2.5 rounded-lg border space-y-2 transition-all ${
                        isDark ? 'border-zinc-800 bg-[#1e1e28] text-zinc-200' : 'border-slate-200 bg-white shadow-2xs text-slate-800'
                      }`}
                    >
                      {/* Fila 1: Descripción y Botón Eliminar */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 w-4 shrink-0">
                          #{index + 1}
                        </span>
                        <input
                          type="text"
                          placeholder="Descripción del ítem (ej. Estructura Tejas, Permisología...)"
                          value={item.description}
                          onChange={(e) => handleUpdateItem(item.id, { description: e.target.value })}
                          className={`flex-1 px-2 py-1 text-xs font-semibold rounded border transition-all ${
                            isDark
                              ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:border-emerald-500'
                              : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer shrink-0"
                          title="Eliminar este ítem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Fila 2: Cantidad, Unidad, Precio Unitario y Total */}
                      <div className="grid grid-cols-12 gap-1.5 items-center text-[11px]">
                        {/* Cantidad */}
                        <div className="col-span-3">
                          <label className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Cant.
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            className={`w-full text-center px-1.5 py-1 font-bold rounded border ${
                              isDark ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        {/* Unidad */}
                        <div className="col-span-2">
                          <label className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Unidad
                          </label>
                          <input
                            type="text"
                            placeholder="UD"
                            value={item.unit || 'UD'}
                            onChange={(e) => handleUpdateItem(item.id, { unit: e.target.value.toUpperCase() })}
                            className={`w-full text-center px-1 py-1 font-semibold rounded border uppercase ${
                              isDark ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        {/* Precio Unitario USD */}
                        <div className="col-span-4">
                          <label className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Precio Unit ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPriceUSD}
                            onChange={(e) => handleUpdateItem(item.id, { unitPriceUSD: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className={`w-full px-1.5 py-1 text-right font-bold rounded border ${
                              isDark ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        {/* Total Ítem */}
                        <div className="col-span-3 text-right">
                          <span className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Total
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] block pt-1">
                            ${itemTotalUSD.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Fila 3: Toggle Exonerar ITBIS (18%) por Ley 57-07 */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isExonerated}
                            onChange={(e) => handleUpdateItem(item.id, { exonerateITBIS: e.target.checked, applyITBIS: e.target.checked })}
                            className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                          />
                          <span className="text-[10.5px] font-medium text-slate-600 dark:text-zinc-300">
                            Exonerar ITBIS (18%)
                          </span>
                        </label>
                        <span className={`text-[10px] font-semibold ${isExonerated ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {isExonerated
                            ? `Exonerado: -$${(itemTotalUSD * 0.18).toFixed(2)} (Ley 57-07)`
                            : `Se cobra ITBIS: +$${(itemTotalUSD * 0.18).toFixed(2)}`}
                        </span>
                      </div>

                      {/* Fila 4: Toggle Margen Comercial de Venta */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.applyMargin !== false}
                            onChange={(e) => handleUpdateItem(item.id, { applyMargin: e.target.checked })}
                            className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                          />
                          <span className="text-[10.5px] font-medium text-slate-600 dark:text-zinc-300">
                            Aplicar margen comercial ({project.specs?.saleMarginMultiplier || 1.25}x)
                          </span>
                        </label>
                        <span className={`text-[10px] font-semibold ${item.applyMargin !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                          {item.applyMargin !== false
                            ? `Con margen: $${(itemTotalUSD * (project.specs?.saleMarginMultiplier || 1.25)).toFixed(2)}`
                            : `Costo directo: $${itemTotalUSD.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Resumen Total de Ítems Adicionales */}
                <div
                  className={`p-2 rounded-lg border flex justify-between items-center text-xs font-bold ${
                    isDark ? 'border-zinc-800 bg-[#181822] text-zinc-200' : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  }`}
                >
                  <span>Subtotal Ítems Extra:</span>
                  <div className="text-right">
                    <span className="font-mono text-emerald-700 dark:text-emerald-400">${customItemsSubtotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                    {customItemsNonExoneratedITBISUSD > 0 && (
                      <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        (+${customItemsNonExoneratedITBISUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ITBIS cobrado al cliente)
                      </span>
                    )}
                    {customItemsExoneratedITBISUSD > 0 && (
                      <span className="block text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        (${customItemsExoneratedITBISUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ITBIS exonerado por Ley 57-07)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Apartado de Descuentos Comerciales */}
          <div className={`pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-rose-500" />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                  Descuentos Comerciales
                </span>
                {customDiscounts.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold rounded-full">
                    {customDiscounts.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddDiscount}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[10.5px] font-bold flex items-center gap-1 transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                title="Agregar un descuento comercial al total general"
              >
                <Plus className="w-3 h-3" />
                <span>Agregar Descuento</span>
              </button>
            </div>

            {customDiscounts.length === 0 ? (
              <div
                className={`p-2.5 rounded-lg border border-dashed text-center text-[11px] ${
                  isDark ? 'border-zinc-800 bg-[#1e1e28]/40 text-zinc-400' : 'border-slate-200 bg-slate-50/60 text-slate-500'
                }`}
              >
                Sin descuentos comerciales. Haz clic en <span className="font-bold text-rose-600 dark:text-rose-400">+ Agregar Descuento</span> para añadir una cortesía comercial, cierre especial o descuento de equipos.
              </div>
            ) : (
              <div className="space-y-2.5">
                {customDiscounts.map((disc, index) => {
                  const discountAmt = getDiscountAmountUSD(disc);
                  const isEquipTarget = disc.target === 'equipment';

                  return (
                    <div
                      key={disc.id || index}
                      className={`p-2.5 rounded-lg border space-y-2 transition-all ${
                        isDark ? 'border-rose-950/40 bg-[#1e161c] text-zinc-200' : 'border-rose-200/70 bg-rose-50/30 text-slate-800'
                      }`}
                    >
                      {/* Fila 1: Descripción / Motivo y Botón Eliminar */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-rose-400 dark:text-rose-500 w-4 shrink-0">
                          #{index + 1}
                        </span>
                        <input
                          type="text"
                          placeholder="Motivo / Nota (ej. Cierre especial, Cortesía comercial...)"
                          value={disc.description}
                          onChange={(e) => handleUpdateDiscount(disc.id, { description: e.target.value })}
                          className={`flex-1 px-2 py-1 text-xs font-semibold rounded border transition-all ${
                            isDark
                              ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:border-rose-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-rose-600'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(disc.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer shrink-0"
                          title="Eliminar este descuento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Fila 2: Selector Tipo ($ vs %), Input Valor y Descuento Calculado */}
                      <div className="grid grid-cols-12 gap-1.5 items-center text-[11px]">
                        {/* Selector Tipo */}
                        <div className="col-span-5">
                          <label className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Tipo de Descuento
                          </label>
                          <div className="flex rounded-md border border-slate-300 dark:border-[#3f3f46] overflow-hidden p-0.5 bg-slate-100 dark:bg-[#27272a]">
                            <button
                              type="button"
                              onClick={() => handleUpdateDiscount(disc.id, { type: 'fixed' })}
                              className={`flex-1 py-0.5 text-[10px] font-bold rounded flex items-center justify-center gap-0.5 transition-all cursor-pointer ${
                                disc.type === 'fixed'
                                  ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-2xs'
                                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Fijo ($)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDiscount(disc.id, { type: 'percentage' })}
                              className={`flex-1 py-0.5 text-[10px] font-bold rounded flex items-center justify-center gap-0.5 transition-all cursor-pointer ${
                                disc.type === 'percentage'
                                  ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-2xs'
                                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              <Percent className="w-3 h-3" />
                              <span>Porc. (%)</span>
                            </button>
                          </div>
                        </div>

                        {/* Input Valor */}
                        <div className="col-span-4">
                          <label className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            {disc.type === 'percentage' ? 'Porcentaje (%)' : 'Monto (USD)'}
                          </label>
                          <input
                            type="number"
                            step={disc.type === 'percentage' ? '0.5' : '50'}
                            min="0"
                            max={disc.type === 'percentage' ? '100' : undefined}
                            value={disc.value}
                            onChange={(e) => handleUpdateDiscount(disc.id, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className={`w-full px-2 py-1 text-right font-bold rounded border ${
                              isDark ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        {/* Total Descontado USD */}
                        <div className="col-span-3 text-right">
                          <span className="text-[9.5px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                            Deducción
                          </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400 font-mono text-[11px] block pt-1">
                            -${discountAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Fila 3: Imputación / Destino Ley 57-07 */}
                      <div className="pt-1.5 border-t border-rose-100 dark:border-rose-950/60">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                            <span>Destino de Deducción:</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                              <input
                                type="radio"
                                name={`target_${disc.id}`}
                                checked={!isEquipTarget}
                                onChange={() => handleUpdateDiscount(disc.id, { target: 'general' })}
                                className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                              />
                              <span className={!isEquipTarget ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}>
                                Global / Cortesía
                              </span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                              <input
                                type="radio"
                                name={`target_${disc.id}`}
                                checked={isEquipTarget}
                                onChange={() => handleUpdateDiscount(disc.id, { target: 'equipment' })}
                                className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                              />
                              <span className={isEquipTarget ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-zinc-400'}>
                                Descuento Equipos (DGII)
                              </span>
                            </label>
                          </div>
                        </div>

                        <div className="mt-1 text-[9.5px]">
                          {isEquipTarget ? (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              ⚠️ Reduce la base elegible del 40% ISR Ley 57-07 en -${discountAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (DGII no admite crédito fiscal sobre montos que no se facturen).
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              ✓ Descuento comercial general; la base de equipos renovables ante DGII se mantiene al 100%.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Resumen Total de Descuentos Comerciales */}
                <div
                  className={`p-2.5 rounded-lg border flex justify-between items-center text-xs font-bold ${
                    isDark ? 'border-rose-950/60 bg-[#20151c] text-zinc-200' : 'border-rose-200 bg-rose-50/80 text-rose-950'
                  }`}
                >
                  <div>
                    <span className="block">Total Descuentos Comerciales:</span>
                    <span className="text-[10px] font-normal text-slate-500 dark:text-zinc-400">
                      Lista: ${estimatedListPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → Final: ${(Math.max(0, estimatedListPriceUSD - totalDiscountUSD)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-rose-600 dark:text-rose-400 text-sm font-black">
                      -${totalDiscountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                    {equipmentDiscountUSD > 0 && (
                      <span className="block text-[9.5px] font-semibold text-amber-700 dark:text-amber-400">
                        (-${equipmentDiscountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} imputado a equipos Ley 57-07)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
