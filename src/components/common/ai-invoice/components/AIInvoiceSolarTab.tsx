import React from 'react';
import {
  Sparkles,
  SunMedium,
  Target,
  Layers,
  ChevronDown,
  Zap,
  BatteryCharging,
  Percent,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Info,
} from 'lucide-react';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { SolarEquipmentItem } from '../../../../types/equipment';

interface AIInvoiceSolarTabProps {
  isDark: boolean;
  extractedData: ExtractedInvoiceData;
  selectedPanel: SolarEquipmentItem | null;
  panelCatalog: SolarEquipmentItem[];
  inverterCatalog?: SolarEquipmentItem[];
  batteryCatalog?: SolarEquipmentItem[];
  estimatedRealCoveragePct: number | null;
  handleCoverageChange: (newCoverage: number) => void;
  handlePanelChange: (newPanelId: string) => void;
  handleInverterChange?: (newInverterId: string) => void;
  handleInverterCountChange?: (newCount: number) => void;
  handleBatteryChange?: (newBatteryId: string) => void;
  handleBatteryCountChange?: (newCount: number) => void;
}

export const AIInvoiceSolarTab: React.FC<AIInvoiceSolarTabProps> = ({
  isDark,
  extractedData,
  selectedPanel,
  panelCatalog,
  inverterCatalog = [],
  batteryCatalog = [],
  estimatedRealCoveragePct,
  handleCoverageChange,
  handlePanelChange,
  handleInverterChange,
  handleInverterCountChange,
  handleBatteryChange,
  handleBatteryCountChange,
}) => {
  const isPanelSubstituted = extractedData.equipmentSubstitutions?.some((s) => s.type === 'panel');
  const isInverterSubstituted = extractedData.equipmentSubstitutions?.some((s) => s.type === 'inverter');
  const isBatterySubstituted = extractedData.equipmentSubstitutions?.some((s) => s.type === 'battery');

  return (
    <div className="space-y-4">
      {/* Resumen del Asistente Solar IA */}
      {extractedData.aiReasoningSummary && (
        <div
          className={`p-3.5 rounded-xl border space-y-1.5 ${
            isDark
              ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Síntesis de Requisitos y Grounding con Catálogo:</span>
          </div>
          <p className="text-[11.5px] leading-relaxed opacity-90 font-sans">
            {extractedData.aiReasoningSummary}
          </p>
        </div>
      )}

      {/* 🔄 Equipos Seleccionados por Sustitución Inteligente (si lo solicitado no figuraba en catálogo) */}
      {extractedData.equipmentSubstitutions && extractedData.equipmentSubstitutions.length > 0 && (
        <div
          className={`p-3.5 rounded-xl border space-y-2.5 ${
            isDark
              ? 'bg-amber-950/30 border-amber-600/40 text-amber-200'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs text-amber-700 dark:text-amber-400">
            <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Selección Inteligente por Sustitución (Equipos fuera de base de datos):</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-700 dark:text-amber-200/90">
            El sistema detectó que los siguientes equipos solicitados no figuran en la base de datos local y seleccionó automáticamente la alternativa equivalente más cercana del catálogo:
          </p>

          <div className="grid grid-cols-1 gap-2 pt-0.5">
            {extractedData.equipmentSubstitutions.map((sub, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isDark ? 'bg-black/40 border-amber-700/30' : 'bg-white/90 border-amber-200 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    {sub.type === 'panel' ? 'Módulo' : sub.type === 'inverter' ? 'Inversor' : 'Batería'}
                  </span>
                  <span className="line-through text-slate-500 dark:text-zinc-400 text-[11px]">{sub.requestedModel}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-[11.5px]">{sub.selectedModel}</span>
                </div>
                <span className="text-[10px] text-slate-600 dark:text-zinc-400 italic sm:text-right">{sub.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimensionamiento General */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isDark
            ? 'bg-gradient-to-br from-[#18241e] to-[#14141c] border-emerald-800/50 text-emerald-100'
            : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 text-emerald-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SunMedium className="w-5 h-5 text-amber-400" />
            <h4 className="font-extrabold text-sm">Dimensionamiento Solar Fotovoltaico Calculado</h4>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Meta: {extractedData.targetCoveragePct ?? 95}%
            </span>
            {estimatedRealCoveragePct !== null && (
              <span
                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30"
                title="Cobertura real resultante con la cantidad entera redondeada de módulos solares"
              >
                Real: ~{estimatedRealCoveragePct}%
              </span>
            )}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed opacity-90">
          La IA ha calculado la capacidad recomendada para cubrir la demanda anual del cliente en base a la irradiación de{' '}
          <strong>{extractedData.province || 'Santo Domingo'}</strong>.
        </p>

        {/* Selector / Botones de Cobertura Meta */}
        <div
          className={`p-3 rounded-xl border space-y-2 ${
            isDark ? 'bg-black/30 border-emerald-700/40' : 'bg-white/80 border-emerald-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-90">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Cobertura Meta Deseada:
            </span>
            <span className="text-[10px] text-zinc-400">
              Predeterminado: <strong className="text-emerald-400">95%</strong> (Paneles redondeados al alza)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[80, 90, 95, 100, 105, 110, 120].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleCoverageChange(pct)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  (extractedData.targetCoveragePct ?? 95) === pct
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-900/40 font-black scale-105'
                    : isDark
                    ? 'bg-[#181822] hover:bg-[#252535] text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
              >
                {pct}%{pct === 95 ? ' (Base)' : ''}
              </button>
            ))}

            {/* Input numérico editable personalizado */}
            <div className="flex items-center gap-1 pl-1.5 border-l border-zinc-700/50">
              <input
                type="number"
                min={10}
                max={300}
                step={1}
                value={extractedData.targetCoveragePct ?? 95}
                onChange={(e) => handleCoverageChange(parseFloat(e.target.value) || 95)}
                className={`w-14 px-2 py-1 rounded-lg border text-xs font-mono font-bold text-center outline-none focus:ring-1 focus:ring-emerald-500 ${
                  isDark ? 'bg-[#101016] border-[#38384c] text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
                title="Ingresar cobertura personalizada"
              />
              <span className="text-xs font-mono font-bold opacity-75">%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40 text-emerald-100' : 'bg-white border-emerald-200 text-slate-800'}`}>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400">Potencia Sugerida</span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {extractedData.recommendedCapacityKWp} <span className="text-xs font-normal">kWp</span>
            </p>
          </div>
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40 text-emerald-100' : 'bg-white border-emerald-200 text-slate-800'}`}>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400">Módulos Recomendados</span>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {extractedData.recommendedPanelCount} <span className="text-xs font-normal">Paneles ({selectedPanel?.powerW || 620}W)</span>
            </p>
          </div>
        </div>
      </div>

      {/* ☀️ Selector de Módulos Solares (Catálogo de Equipos) */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
              Módulo Fotovoltaico (Catálogo Oficial)
            </span>
            {isPanelSubstituted && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Sustituto IA
              </span>
            )}
          </div>
          {extractedData.selectedPanelUnitPriceUSD ? (
            <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Compra: ${extractedData.selectedPanelUnitPriceUSD} USD/ud
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Sin precio asignado (Por cotizar)
            </span>
          )}
        </div>

        {/* Desplegable de Paneles */}
        <div className="relative">
          <select
            value={selectedPanel?.id || ''}
            onChange={(e) => handlePanelChange(e.target.value)}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold appearance-none outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer pr-10 ${
              isDark
                ? 'bg-[#101016] border-[#343448] text-zinc-100 hover:border-emerald-500/50'
                : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-emerald-500/50'
            }`}
          >
            {panelCatalog.map((panel) => (
              <option key={panel.id} value={panel.id}>
                {panel.displayName} — {panel.powerW}W ({panel.cellType || 'Bifacial'} • {panel.efficiencyPct || 21.8}%)
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {/* Detalle Técnico Comparativo del Módulo Seleccionado */}
        {selectedPanel && (
          <div
            className={`p-3 rounded-xl border text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2.5 ${
              isDark ? 'bg-[#101016] border-[#252538] text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Potencia Unitaria</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">{selectedPanel.powerW} Wp</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Eficiencia STC</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">{selectedPanel.efficiencyPct || 21.8}%</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Tecnología</span>
              <span className="font-semibold text-cyan-600 dark:text-cyan-400 text-xs truncate block">{selectedPanel.cellType || 'Bifacial TOPCon'}</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Área Requerida</span>
              <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 text-xs">
                ~{((extractedData.recommendedPanelCount || 0) * 2.7).toFixed(1)} m²
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ⚡ Inversor Solar Fotovoltaico Seleccionado */}
      <div
        className={`p-4 rounded-xl border space-y-2.5 ${
          isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
              Inversor Solar (Catálogo Oficial)
            </span>
            {isInverterSubstituted && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Sustituto IA
              </span>
            )}
          </div>
          {extractedData.selectedInverterUnitPriceUSD ? (
            <span className="text-[10px] font-mono font-bold text-cyan-700 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
              Compra: ${extractedData.selectedInverterUnitPriceUSD} USD/ud
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Sin precio asignado (Por cotizar)
            </span>
          )}
        </div>

        {/* Selector Desplegable de Inversor */}
        <div className="relative">
          <select
            value={extractedData.selectedInverterId || ''}
            onChange={(e) => handleInverterChange?.(e.target.value)}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold appearance-none outline-none focus:ring-2 focus:ring-cyan-500/40 cursor-pointer pr-10 ${
              isDark
                ? 'bg-[#101016] border-[#343448] text-zinc-100 hover:border-cyan-500/50'
                : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-cyan-500/50'
            }`}
          >
            {inverterCatalog && inverterCatalog.length > 0 ? (
              inverterCatalog.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.displayName} — {inv.powerKW}kW AC ({inv.category || 'Híbrido Split Phase'})
                </option>
              ))
            ) : (
              <option value="">{extractedData.selectedInverterModel || 'Inversor Solar'}</option>
            )}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {/* Controles de Capacidad y Unidades en Paralelo */}
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? 'bg-[#121218] border-[#262638]' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500 block">Unidades en Paralelo</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => handleInverterCountChange?.(Math.max(1, (extractedData.selectedInverterCount || 1) - 1))}
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                    isDark ? 'border-[#36364a] text-zinc-300 hover:bg-[#20202c]' : 'border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
                  title="Disminuir unidades"
                >
                  -
                </button>
                <span className="w-7 text-center font-mono font-bold text-xs text-slate-900 dark:text-zinc-100">
                  {extractedData.selectedInverterCount || 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleInverterCountChange?.(Math.min(10, (extractedData.selectedInverterCount || 1) + 1))}
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                    isDark ? 'border-[#36364a] text-zinc-300 hover:bg-[#20202c]' : 'border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
                  title="Aumentar unidades"
                >
                  +
                </button>
              </div>
            </div>
            <div className="border-l pl-3 border-slate-300 dark:border-zinc-800">
              <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500 block">Potencia Unitaria</span>
              <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {extractedData.selectedInverterPowerKW || 8.0} kW AC
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs font-mono font-black text-cyan-600 dark:text-cyan-400 block">
              {((extractedData.selectedInverterPowerKW || 8.0) * (extractedData.selectedInverterCount || 1)).toFixed(1)} kW AC
            </span>
            <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500">Capacidad Total</span>
          </div>
        </div>

        {!extractedData.selectedInverterUnitPriceUSD && (
          <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Equipo seleccionado del catálogo sin cotización de distribuidor asignada. Podrás fijar su costo en el simulador.</span>
          </div>
        )}
      </div>

      {/* 🔋 Baterías BESS (Si aplica o fue especificado en los requisitos) */}
      <div
        className={`p-4 rounded-xl border space-y-2.5 ${
          isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
              Banco de Baterías Litio LiFePO4 (BESS)
            </span>
            {isBatterySubstituted && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Sustituto IA
              </span>
            )}
          </div>
          {extractedData.hasBattery ? (
            extractedData.selectedBatteryUnitPriceUSD ? (
              <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Compra: ${extractedData.selectedBatteryUnitPriceUSD} USD/ud
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Sin precio asignado (Por cotizar)
              </span>
            )
          ) : (
            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 bg-slate-500/10 px-2 py-0.5 rounded-md border border-slate-500/20">
              Sin almacenamiento
            </span>
          )}
        </div>

        {/* Selector Desplegable de Batería */}
        <div className="relative">
          <select
            value={extractedData.hasBattery ? (extractedData.selectedBatteryId || '') : 'none'}
            onChange={(e) => handleBatteryChange?.(e.target.value)}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold appearance-none outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer pr-10 ${
              isDark
                ? 'bg-[#101016] border-[#343448] text-zinc-100 hover:border-emerald-500/50'
                : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-emerald-500/50'
            }`}
          >
            <option value="none">Sin almacenamiento (Solo Sistema Fotovoltaico)</option>
            {batteryCatalog && batteryCatalog.map((bat) => (
              <option key={bat.id} value={bat.id}>
                {bat.displayName} — {bat.capacityKWh}kWh ({bat.chemistry || 'LiFePO4'} • {bat.voltageV || 51.2}V)
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {/* Controles de Capacidad y Cantidad de Baterías */}
        {extractedData.hasBattery && (
          <>
            <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? 'bg-[#121218] border-[#262638]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500 block">Cantidad Baterías</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      type="button"
                      onClick={() => handleBatteryCountChange?.(Math.max(1, (extractedData.selectedBatteryCount || 1) - 1))}
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                        isDark ? 'border-[#36364a] text-zinc-300 hover:bg-[#20202c]' : 'border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Disminuir baterías"
                    >
                      -
                    </button>
                    <span className="w-7 text-center font-mono font-bold text-xs text-slate-900 dark:text-zinc-100">
                      {extractedData.selectedBatteryCount || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBatteryCountChange?.(Math.min(16, (extractedData.selectedBatteryCount || 1) + 1))}
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                        isDark ? 'border-[#36364a] text-zinc-300 hover:bg-[#20202c]' : 'border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Aumentar baterías"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="border-l pl-3 border-slate-300 dark:border-zinc-800">
                  <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500 block">Capacidad Unitaria</span>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {extractedData.selectedBatteryCapacityKWh || 16.08} kWh
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 block">
                  {((extractedData.selectedBatteryCapacityKWh || 16.08) * (extractedData.selectedBatteryCount || 1)).toFixed(1)} kWh
                </span>
                <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-zinc-500">Almacenamiento Total</span>
              </div>
            </div>

            {!extractedData.selectedBatteryUnitPriceUSD && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Batería seleccionada del catálogo sin cotización de distribuidor asignada. Podrás fijar su costo en el simulador.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 🏷️ Estrategia Financiera & Margen de Venta Comercial */}
      {extractedData.targetMarginPct && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
            isDark ? 'bg-[#171b26] border-blue-900/40 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold">Margen de Venta Configurado por IA</p>
              <p className="text-[11px] opacity-80">
                Multiplicador comercial aplicado: <strong>{(1 + extractedData.targetMarginPct / 100).toFixed(2)}x</strong> sobre costos de equipos.
              </p>
            </div>
          </div>
          <span className="text-base font-black font-mono text-blue-400 shrink-0">
            {extractedData.targetMarginPct}%
          </span>
        </div>
      )}

      {/* 📝 Notas Técnicas Especiales */}
      {extractedData.specialTechnicalNotes && (
        <div className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-[#14141c] border-[#2a2a38] text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
          <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">Notas Técnicas del Proyecto:</span>
          <p className="text-[11px] leading-relaxed italic opacity-90">
            "{extractedData.specialTechnicalNotes}"
          </p>
        </div>
      )}
    </div>
  );
};
