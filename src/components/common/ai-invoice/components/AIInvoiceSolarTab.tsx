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
} from 'lucide-react';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { SolarEquipmentItem } from '../../../../types/equipment';

interface AIInvoiceSolarTabProps {
  isDark: boolean;
  extractedData: ExtractedInvoiceData;
  selectedPanel: SolarEquipmentItem | null;
  panelCatalog: SolarEquipmentItem[];
  estimatedRealCoveragePct: number | null;
  handleCoverageChange: (newCoverage: number) => void;
  handlePanelChange: (newPanelId: string) => void;
}

export const AIInvoiceSolarTab: React.FC<AIInvoiceSolarTabProps> = ({
  isDark,
  extractedData,
  selectedPanel,
  panelCatalog,
  estimatedRealCoveragePct,
  handleCoverageChange,
  handlePanelChange,
}) => {
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
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40' : 'bg-white border-emerald-200'}`}>
            <span className="text-[10px] uppercase font-bold opacity-80">Potencia Sugerida</span>
            <p className="text-xl font-black text-emerald-400 font-mono">
              {extractedData.recommendedCapacityKWp} <span className="text-xs font-normal">kWp</span>
            </p>
          </div>
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40' : 'bg-white border-emerald-200'}`}>
            <span className="text-[10px] uppercase font-bold opacity-80">Módulos Recomendados</span>
            <p className="text-xl font-black text-amber-400 font-mono">
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
              Módulo Fotovoltaico (Catálogo Oficial)
            </span>
          </div>
          {extractedData.selectedPanelUnitPriceUSD && (
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Compra: ${extractedData.selectedPanelUnitPriceUSD} USD/ud
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
              <span className="font-mono font-bold text-emerald-500 dark:text-emerald-400 text-xs">{selectedPanel.powerW} Wp</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Eficiencia STC</span>
              <span className="font-mono font-bold text-amber-500 dark:text-amber-400 text-xs">{selectedPanel.efficiencyPct || 21.8}%</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 font-bold block text-[9px] uppercase">Tecnología</span>
              <span className="font-semibold text-cyan-500 dark:text-cyan-400 text-xs truncate block">{selectedPanel.cellType || 'Bifacial TOPCon'}</span>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
              Inversor Solar Emparejado
            </span>
          </div>
          {extractedData.selectedInverterUnitPriceUSD && (
            <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
              Compra: ${extractedData.selectedInverterUnitPriceUSD} USD/ud
            </span>
          )}
        </div>

        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? 'bg-[#121218] border-[#262638]' : 'bg-slate-50 border-slate-200'}`}>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-100 truncate">
              {extractedData.selectedInverterModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
            </p>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              {extractedData.selectedInverterPowerKW || 8.0} kW unitario • {extractedData.selectedInverterCount || 1} {((extractedData.selectedInverterCount || 1) > 1) ? 'unidades en paralelo' : 'unidad'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs font-mono font-black text-cyan-400 block">
              {((extractedData.selectedInverterPowerKW || 8.0) * (extractedData.selectedInverterCount || 1)).toFixed(1)} kW AC
            </span>
            <span className="text-[9px] uppercase font-bold text-zinc-500">Capacidad Total</span>
          </div>
        </div>
      </div>

      {/* 🔋 Baterías BESS (Si aplica o fue especificado en los requisitos) */}
      {extractedData.hasBattery && (
        <div
          className={`p-4 rounded-xl border space-y-2.5 ${
            isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                Banco de Baterías Litio LiFePO4 (BESS)
              </span>
            </div>
            {extractedData.selectedBatteryUnitPriceUSD && (
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Compra: ${extractedData.selectedBatteryUnitPriceUSD} USD/ud
              </span>
            )}
          </div>

          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? 'bg-[#121218] border-[#262638]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-100 truncate">
                {extractedData.selectedBatteryModel || 'HinaESS PowerGem Max 16.08kWh'}
              </p>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                {extractedData.selectedBatteryCapacityKWh || 16.08} kWh unitarios • {extractedData.selectedBatteryCount || 1} {((extractedData.selectedBatteryCount || 1) > 1) ? 'baterías' : 'batería'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-mono font-black text-emerald-400 block">
                {((extractedData.selectedBatteryCapacityKWh || 16.08) * (extractedData.selectedBatteryCount || 1)).toFixed(1)} kWh
              </span>
              <span className="text-[9px] uppercase font-bold text-zinc-500">Almacenamiento</span>
            </div>
          </div>
        </div>
      )}

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
