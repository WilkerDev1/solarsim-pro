import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { DollarSign, ChevronDown, Sliders, Tag, Sparkles } from 'lucide-react';

interface PricingParamsSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

export const PricingParamsSection: React.FC<PricingParamsSectionProps> = ({
  project,
  summary,
  isOpen,
  onToggle,
  isDark,
  updateSpecs,
}) => {
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
          <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>4. Costos y Margen de Venta</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`p-3.5 pt-2 space-y-3 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          {/* Selector de Modo de Fijación de Precio */}
          <div
            className={`flex rounded-xl p-1 border shadow-2xs ${
              isDark ? 'bg-[#121216] border-[#2b2b3a]' : 'bg-slate-200/70 border-slate-300'
            }`}
          >
            <button
              type="button"
              onClick={() => updateSpecs({ pricingMode: 'cost_matrix' })}
              className={`flex-1 rounded-lg py-1.5 px-2 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                project.specs.pricingMode !== 'direct_watt'
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'bg-white text-amber-900 border border-amber-300 shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Costos Desglosados</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const autoWp = Math.round(((summary?.costMatrix?.salePricePerWattUSD) || project.specs.pricePerWattUSD || 1.15) * 100) / 100;
                updateSpecs({
                  pricingMode: 'direct_watt',
                  pricePerWattUSD: autoWp,
                  pricePerKWpUSD: Math.round(autoWp * 1000 * 100) / 100,
                });
              }}
              className={`flex-1 rounded-lg py-1.5 px-2 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                project.specs.pricingMode === 'direct_watt'
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'bg-white text-emerald-900 border border-emerald-300 shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Precio Directo ($/W o $/kW)</span>
            </button>
          </div>

          {project.specs.pricingMode === 'direct_watt' ? (
            /* VISTA: FIJACIÓN DIRECTA DE PRECIO POR VATIO / KILOVATIO (MANUAL) */
            <div
              className={`p-3.5 rounded-xl border space-y-3 animate-in fade-in duration-200 ${
                isDark ? 'bg-[#181822] border-emerald-900/50' : 'bg-white border-emerald-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  Precio de Venta Base Manual
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ignora Mano de Obra
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Precio por Vatio ($/Wp)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={project.specs.pricePerWattUSD !== undefined ? project.specs.pricePerWattUSD : 1.15}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateSpecs({
                          pricePerWattUSD: val,
                          pricePerKWpUSD: Math.round(val * 1000 * 100) / 100,
                        });
                      }}
                      className={`w-full border rounded-lg pl-7 pr-10 py-1.5 text-xs font-mono font-bold transition-all ${
                        isDark
                          ? 'bg-[#121216] border-[#383848] text-emerald-300 focus:border-emerald-500'
                          : 'bg-emerald-50/40 border-emerald-300 text-emerald-950 focus:border-emerald-600'
                      }`}
                    />
                    <span className="absolute right-2 top-1.5 text-[10px] text-zinc-400 font-bold">/Wp</span>
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Precio por Kilovatio ($/kWp)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold">$</span>
                    <input
                      type="number"
                      step="10"
                      min="100"
                      value={
                        project.specs.pricePerKWpUSD !== undefined
                          ? project.specs.pricePerKWpUSD
                          : Math.round((project.specs.pricePerWattUSD || 1.15) * 1000 * 100) / 100
                      }
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateSpecs({
                          pricePerKWpUSD: val,
                          pricePerWattUSD: Math.round((val / 1000) * 1000) / 1000,
                        });
                      }}
                      className={`w-full border rounded-lg pl-7 pr-12 py-1.5 text-xs font-mono font-bold transition-all ${
                        isDark
                          ? 'bg-[#121216] border-[#383848] text-emerald-300 focus:border-emerald-500'
                          : 'bg-emerald-50/40 border-emerald-300 text-emerald-950 focus:border-emerald-600'
                      }`}
                    />
                    <span className="absolute right-2 top-1.5 text-[10px] text-zinc-400 font-bold">/kWp</span>
                  </div>
                </div>
              </div>

              {/* Resumen Inversión Total Calculada en Vivo */}
              <div className={`p-2.5 rounded-lg border space-y-1 text-xs ${
                isDark ? 'bg-[#121218] border-[#29293a]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between text-slate-400">
                  <span>Potencia del Sistema:</span>
                  <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{summary.systemCapacityKWp.toFixed(2)} kWp</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Precio Unitario Llave en Mano:</span>
                  <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    ${(project.specs.pricePerWattUSD !== undefined ? project.specs.pricePerWattUSD : 1.15).toFixed(2)} /Wp (${((project.specs.pricePerWattUSD !== undefined ? project.specs.pricePerWattUSD : 1.15) * 1000).toLocaleString('en-US')} /kWp)
                  </span>
                </div>
                {project.specs.hasBattery && (
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Almacenamiento Incluido:</span>
                    <span className="font-semibold text-emerald-500">
                      {project.specs.batteryCount || 1} ud ({((project.specs.batteryCapacityKWh || 5) * (project.specs.batteryCount || 1)).toFixed(1)} kWh)
                    </span>
                  </div>
                )}
                <div className={`flex justify-between font-bold pt-1 border-t ${isDark ? 'text-white border-slate-700' : 'text-slate-900 border-slate-200'}`}>
                  <span>Total Venta Proyecto:</span>
                  <span className="text-emerald-500 font-extrabold text-sm">
                    ${(summary.grossInvestmentUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>

                {/* Sincronización Bidireccional de Margen y Ganancia */}
                <div className={`pt-2 mt-1 border-t space-y-1.5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Destino Excedente:
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => updateSpecs({ directPriceSurplusTarget: 'margin' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          (project.specs.directPriceSurplusTarget || 'margin') === 'margin'
                            ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                            : isDark ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-zinc-200' : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800'
                        }`}
                        title="Asignar el excedente comercial directamente a la ganancia / margen de utilidad"
                      >
                        Ganancia
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSpecs({ directPriceSurplusTarget: 'labor' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          project.specs.directPriceSurplusTarget === 'labor'
                            ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                            : isDark ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-zinc-200' : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800'
                        }`}
                        title="Asignar el excedente a mano de obra, ingeniería e instalación"
                      >
                        Mano de Obra
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Margen Multiplicador:</span>
                    <span className="font-bold text-amber-500">
                      {((summary?.costMatrix?.saleMarginMultiplier) || 1.25).toFixed(2)}x (+{((summary?.costMatrix?.markupOnCostPct) || 0).toFixed(1)}% s/costo)
                    </span>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Ganancia Neta:</span>
                    <span className="font-extrabold text-emerald-500">
                      +${((summary?.costMatrix?.gananciaUSD) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className={`text-[10px] italic leading-tight ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  * Establece directamente el costo llave en mano por Wp/kWp sin desglosar mano de obra por separado.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const autoWp = Math.round(((summary?.costMatrix?.salePricePerWattUSD) || 1.15) * 100) / 100;
                    updateSpecs({
                      pricePerWattUSD: autoWp,
                      pricePerKWpUSD: Math.round(autoWp * 1000 * 100) / 100,
                    });
                  }}
                  className={`px-2 py-1 text-[10px] rounded-md font-bold flex items-center gap-1 border transition-all cursor-pointer shrink-0 ml-2 ${
                    isDark
                      ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  }`}
                  title="Importar el precio sugerido calculado por la matriz de costos y equipos"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Sugerir de Costos</span>
                </button>
              </div>
            </div>
          ) : (
            /* VISTA: MATRIZ DE COSTOS DESGLOSADA */
            <>
              <div
                className={`p-3 rounded-xl border space-y-3 ${
                  isDark ? 'bg-[#1e1c24] border-[#363244]' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                    Parámetros Comerciales
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Multiplicador: {(project.specs.saleMarginMultiplier || 1.25).toFixed(2)}x
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Tasa Cambio DOP/USD
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.5"
                        value={project.specs.dopExchangeRate !== undefined ? project.specs.dopExchangeRate : 60.0}
                        onChange={(e) => updateSpecs({ dopExchangeRate: parseFloat(e.target.value) || 0 })}
                        className={`w-full border rounded-lg pl-9 pr-2.5 py-1.5 text-xs font-bold transition-all ${
                          isDark
                            ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100 focus:border-amber-500'
                            : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Margen de Ganancia (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="500"
                        placeholder="25"
                        value={Math.round(((project.specs.saleMarginMultiplier || 1.25) - 1) * 100 * 10) / 10}
                        onChange={(e) => {
                          const pct = parseFloat(e.target.value);
                          const validPct = isNaN(pct) ? 0 : Math.max(0, pct);
                          const multiplier = Math.round((1 + validPct / 100) * 1000) / 1000;
                          updateSpecs({ saleMarginMultiplier: multiplier });
                        }}
                        className={`w-full border rounded-lg pl-3 pr-7 py-1.5 text-xs font-extrabold transition-all ${
                          isDark
                            ? 'bg-[#18181b] border-[#3f3f46] text-amber-300 focus:border-amber-500'
                            : 'bg-slate-50 border-slate-300 text-amber-700 focus:border-amber-600'
                        }`}
                      />
                      <span className="absolute right-2.5 top-1.5 text-xs text-zinc-400 font-bold">%</span>
                    </div>
                  </div>
                </div>

                {/* Botones de Margen Rápido (1-Clic) + Personalizado Libre */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Márgenes comerciales sugeridos:
                    </span>
                    <span className="text-[10px] text-amber-500 font-mono font-bold">
                      {Math.round(((project.specs.saleMarginMultiplier || 1.25) - 1) * 100 * 10) / 10}% actual
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {[10, 15, 20, 25, 30, 35].map((pct) => {
                      const currentPct = Math.round(((project.specs.saleMarginMultiplier || 1.25) - 1) * 100);
                      const isSelected = currentPct === pct;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const multiplier = 1 + pct / 100;
                            updateSpecs({ saleMarginMultiplier: multiplier });
                          }}
                          className={`py-1 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs scale-102'
                              : isDark
                              ? 'bg-[#262430] border-[#3f3a4e] text-zinc-300 hover:border-amber-500/60 hover:text-white'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-amber-400 hover:bg-amber-50/50'
                          }`}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. GRUPO: Costos Unitarios de Compra */}
              <div
                className={`p-3 rounded-xl border space-y-2.5 ${
                  isDark ? 'bg-[#181822] border-[#2e2e40]' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <span className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Costos Unitarios de Compra (USD)
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Precio Panel ($/ud)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.panelUnitPriceUSD !== undefined ? project.specs.panelUnitPriceUSD : 103.32}
                      onChange={(e) => updateSpecs({ panelUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#121216] border-[#383848] text-zinc-100'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Precio Inversor ($/ud)
                    </label>
                    <input
                      type="number"
                      step="10"
                      value={project.specs.inverterUnitPriceUSD !== undefined ? project.specs.inverterUnitPriceUSD : 2300.0}
                      onChange={(e) => updateSpecs({ inverterUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#121216] border-[#383848] text-zinc-100'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {project.specs.hasBattery ? (
                    <div>
                      <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Precio Batería ($/ud)
                      </label>
                      <input
                        type="number"
                        step="10"
                        value={project.specs.batteryUnitPriceUSD !== undefined ? project.specs.batteryUnitPriceUSD : 1990.0}
                        onChange={(e) => updateSpecs({ batteryUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                        className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          isDark
                            ? 'bg-[#121216] border-[#383848] text-zinc-100'
                            : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  ) : null}

                  <div className={project.specs.hasBattery ? '' : 'col-span-2'}>
                    <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Mano de Obra & Mat. ($/kWp)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={project.specs.installationUnitPriceUSD !== undefined ? project.specs.installationUnitPriceUSD : 170.0}
                      onChange={(e) => updateSpecs({ installationUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#121216] border-[#383848] text-zinc-100'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* 3. GRUPO: Desglose Comercial en Vivo (Costo vs Ganancia vs Precio Venta) */}
              {(() => {
                const autoSaleWp = Math.round(((summary?.costMatrix?.salePricePerWattUSD) || 1.08) * 100) / 100;
                const costWp = Math.round(((summary?.costMatrix?.costPerWattUSD) || 0.86) * 100) / 100;
                const profitWp = Math.max(0, Math.round((autoSaleWp - costWp) * 100) / 100);
                const marginPct = Math.round(((project.specs.saleMarginMultiplier || 1.25) - 1) * 100 * 10) / 10;

                return (
                  <div
                    className={`p-3 rounded-xl border space-y-2.5 ${
                      isDark ? 'bg-[#181822] border-emerald-900/40' : 'bg-emerald-50/50 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>
                        Desglose por Vatio (USD/Wp)
                      </span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        +{marginPct}% ganancia
                      </span>
                    </div>

                    {/* 3 Métricas en Columnas */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#121218] border-[#2b2b3a]' : 'bg-white border-slate-200'}`}>
                        <span className="text-[10px] text-zinc-400 block font-medium">Costo Base</span>
                        <span className={`font-mono font-bold text-xs ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                          ${costWp.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-zinc-500 block">/Wp</span>
                      </div>

                      <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#121218] border-amber-900/30' : 'bg-amber-50 border-amber-200'}`}>
                        <span className="text-[10px] text-amber-500 block font-bold">Tu Ganancia</span>
                        <span className="font-mono font-bold text-xs text-amber-400">
                          +${profitWp.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-amber-500/80 block">/Wp</span>
                      </div>

                      <div className={`p-2 rounded-lg border ${isDark ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-emerald-100/70 border-emerald-300'}`}>
                        <span className="text-[10px] text-emerald-400 block font-extrabold">Precio Venta</span>
                        <span className="font-mono font-extrabold text-xs text-emerald-400">
                          ${(project.specs.pricePerWattUSD || autoSaleWp).toFixed(2)}
                        </span>
                        <span className="text-[9px] text-emerald-400/80 block">/Wp</span>
                      </div>
                    </div>

                    {/* Input de Precio por Vatio con Sincronización Automática */}
                    <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                      isDark ? 'bg-[#13131a] border-[#282838]' : 'bg-white border-slate-200 shadow-2xs'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-bold block ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Precio Aplicado a la Simulación:
                        </span>
                        <span className="text-[10px] text-zinc-400 block font-mono">
                          ${(project.specs.pricePerWattUSD || autoSaleWp).toFixed(2)} USD/Wp • Total: ${(summary.grossInvestmentUSD || 0).toLocaleString()} USD
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          updateSpecs({ pricePerWattUSD: autoSaleWp });
                        }}
                        className={`px-2.5 py-1 text-[10px] rounded-lg font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                          isDark
                            ? 'bg-emerald-900/40 hover:bg-emerald-900/60 border-emerald-700/50 text-emerald-300'
                            : 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-900 shadow-xs'
                        }`}
                        title="Sincronizar automáticamente con el precio calculado por la matriz de costos y margen"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Sincronizar</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
};
