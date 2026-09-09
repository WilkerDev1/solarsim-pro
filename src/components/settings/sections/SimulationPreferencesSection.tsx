import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  Coins,
  Zap,
  User,
  Receipt,
  Sun,
  DollarSign,
  Landmark,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Check,
  Sparkles,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { RD_PROVINCES } from '../../../data/rdProvinces';
import { UtilityDistributor, getDistributorTariffOptions } from '../../../types/tariffs';
import { AITariffResolutionModal } from './AITariffResolutionModal';

export const SimulationPreferencesSection: React.FC = () => {
  const {
    defaultSimulationSettings,
    updateDefaultSimulationSettings,
    equipmentCatalog,
    tariffMatrix,
    updateDistributorTariff,
    resetToDefaultTariffs,
    syncTariffsWithServer,
    fetchTariffsFromServer,
  } = useSimulationStore();
  const defs = defaultSimulationSettings;

  const [isAITariffModalOpen, setIsAITariffModalOpen] = useState(false);
  const [prefDistributorTab, setPrefDistributorTab] = useState<UtilityDistributor>('EDEESTE');
  const [isSyncingTariffs, setIsSyncingTariffs] = useState(false);
  const [tariffCurrencyMode, setTariffCurrencyMode] = useState<'USD' | 'DOP'>('USD');

  const handleSyncTariffsCloud = async () => {
    setIsSyncingTariffs(true);
    try {
      const res = await syncTariffsWithServer();
      alert(res.message);
    } finally {
      setIsSyncingTariffs(false);
    }
  };

  const handleFetchTariffsCloud = async () => {
    setIsSyncingTariffs(true);
    try {
      const res = await fetchTariffsFromServer();
      alert(res.message);
    } finally {
      setIsSyncingTariffs(false);
    }
  };

  // Accordion state (all open by default or toggled individually)

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    cat1: false,
    cat2: false,
    cat3: false,
    cat4: false,
    cat5: false,
  });

  const toggleAccordion = (cat: string) => {
    setOpenAccordions((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const allExpanded = Object.values(openAccordions).every(Boolean);

  const toggleAll = () => {
    const nextState = !allExpanded;
    setOpenAccordions({
      cat1: nextState,
      cat2: nextState,
      cat3: nextState,
      cat4: nextState,
      cat5: nextState,
    });
  };

  const panelOptions = equipmentCatalog.filter((e) => e.type === 'panel');

  return (
    <section id="sec-preferencias" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Preferencias de Simulación</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Configura los valores por defecto para nuevos proyectos solares.
        </p>
      </div>

      {/* Grid 2 Columnas de Tarjetas Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tarjeta 1: Finanzas & Impuestos */}
        <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-[#27272a]">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Finanzas & Impuestos</h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Valores fiscales e incentivos Ley 57-07.</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Moneda Principal
              </label>
              <select
                value={defs.currency}
                onChange={(e) => updateDefaultSimulationSettings({ currency: e.target.value as 'USD' | 'DOP' })}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200 focus:outline-hidden"
              >
                <option value="USD">USD ($) — Dólares Estadounidenses</option>
                <option value="DOP">DOP (RD$) — Pesos Dominicanos</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Tasa de Impuesto (ITBIS) %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defs.taxRatePct}
                  onChange={(e) => updateDefaultSimulationSettings({ taxRatePct: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Tasa Descuento (VAN) %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defs.discountRatePct}
                  onChange={(e) => updateDefaultSimulationSettings({ discountRatePct: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
            </div>

            {/* Switches de Ley 57-07 */}
            <div className="pt-2 flex flex-col gap-2.5">
              <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                <span className="text-xs text-slate-700 dark:text-zinc-300">Exoneración 100% ITBIS (Ley 57-07)</span>
                <input
                  type="checkbox"
                  checked={defs.applyITBISExemption}
                  onChange={(e) => updateDefaultSimulationSettings({ applyITBISExemption: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                <span className="text-xs text-slate-700 dark:text-zinc-300">Crédito Fiscal 40% ISR (Ley 57-07)</span>
                <input
                  type="checkbox"
                  checked={defs.applyLey5707}
                  onChange={(e) => updateDefaultSimulationSettings({ applyLey5707: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Parámetros Técnicos */}
        <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-[#27272a]">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Parámetros Técnicos</h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Valores de generación y dimensionamiento.</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Cobertura Objetivo con Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Cobertura Objetivo (%)
                </label>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  {defs.defaultTargetCoveragePct}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={defs.defaultTargetCoveragePct}
                onChange={(e) => updateDefaultSimulationSettings({ defaultTargetCoveragePct: parseInt(e.target.value) || 95 })}
                className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 dark:bg-[#27272a] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Potencia Panel (W)
                </label>
                <input
                  type="number"
                  min={300}
                  max={900}
                  value={defs.defaultPanelPowerW}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultPanelPowerW: parseInt(e.target.value) || 620 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Pérdidas Sistema %
                </label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  step={0.5}
                  value={defs.defaultSystemLosses}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultSystemLosses: parseFloat(e.target.value) || 25.0 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Degradación Anual %
                </label>
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.05}
                  value={defs.defaultAnnualDegradation}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultAnnualDegradation: parseFloat(e.target.value) || 0.40 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Vida Útil (Años)
                </label>
                <input
                  type="number"
                  min={10}
                  max={40}
                  value={defs.lifespanYears}
                  onChange={(e) => updateDefaultSimulationSettings({ lifespanYears: parseInt(e.target.value) || 25 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📑 ACORDEÓN DE CATEGORÍAS COMPLETAS DE CONFIGURACIÓN */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">Categorías de Configuración</h4>
          <button
            onClick={toggleAll}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            {allExpanded ? 'Colapsar Todo' : 'Expandir Todo'}
          </button>
        </div>

        {/* 1. Proyecto y Cliente */}
        <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
          <button
            onClick={() => toggleAccordion('cat1')}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#222226] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">1. Proyecto y Cliente</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Provincia, distribuidora y validez de cotización</span>
              </div>
            </div>
            {openAccordions.cat1 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openAccordions.cat1 && (
            <div className="p-5 pt-1 border-t border-slate-100 dark:border-[#27272a] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Provincia Predeterminada (HSP Solar)
                </label>
                <select
                  value={defs.defaultProvince}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultProvince: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  {RD_PROVINCES.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.avgHSP} HSP)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Distribuidora Eléctrica por Defecto
                </label>
                <select
                  value={defs.defaultDistributor}
                  onChange={(e) => {
                    const newDist = e.target.value as UtilityDistributor;
                    const mappedCode = newDist === 'CEPM' ? 'RBT-1' : 'BTS2';
                    updateDefaultSimulationSettings({ defaultDistributor: newDist, defaultTariffCode: mappedCode });
                  }}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  <option value="EDEESTE">EDEESTE (Empresa Distribuidora de Electricidad del Este)</option>
                  <option value="EDESUR">EDESUR (Empresa Distribuidora de Electricidad del Sur)</option>
                  <option value="EDENORTE">EDENORTE (Empresa Distribuidora de Electricidad del Norte)</option>
                  <option value="CEPM">CEPM (Consorcio Energético Punta Cana - Macao)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Tarifa Eléctrica Predeterminada ({defs.defaultDistributor})
                </label>
                <select
                  value={defs.defaultTariffCode}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultTariffCode: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  {getDistributorTariffOptions(defs.defaultDistributor).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>


              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Validez de Oferta / Cotización (Días)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={defs.defaultQuoteValidityDays}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultQuoteValidityDays: parseInt(e.target.value) || 7 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. Tarifas y Distribuidora */}
        <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
          <button
            onClick={() => toggleAccordion('cat2')}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#222226] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">2. Tarifas Eléctricas & Pliegos Regulados (SIE / CEPM)</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">
                  Matriz tarifaria oficial para EDEESTE, EDESUR, EDENORTE y CEPM con sincronización en la nube
                </span>
              </div>
            </div>
            {openAccordions.cat2 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openAccordions.cat2 && (
            <div className="p-5 pt-1 border-t border-slate-100 dark:border-[#27272a] flex flex-col gap-5">
              {/* Opciones Generales de Medición y Retención */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/60 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Inyección Cero por Defecto (Zero Export)</span>
                    <input
                      type="checkbox"
                      checked={defs.defaultZeroExport}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultZeroExport: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/60 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Retención Oficial 25% Excedentes (SIE-007)</span>
                    <input
                      type="checkbox"
                      checked={defs.defaultApplySieRetention}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultApplySieRetention: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Tarifa Energía Base (DOP/kWh)
                    </label>
                    <input
                      type="number"
                      step={0.01}
                      value={defs.defaultEstimatedEnergyRateDOP}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultEstimatedEnergyRateDOP: parseFloat(e.target.value) || 10.35 })}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Tarifa Excedente Base (DOP/kWh)
                    </label>
                    <input
                      type="number"
                      step={0.01}
                      value={defs.defaultEstimatedExportRateDOP}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultEstimatedExportRateDOP: parseFloat(e.target.value) || 5.50 })}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                    />
                  </div>
                </div>
              </div>

              {/* Encabezado de Matriz Tarifaria Oficial */}
              <div className="bg-slate-50 dark:bg-[#1f1f23] rounded-2xl p-4 border border-slate-200/80 dark:border-[#2b2b30] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 font-mono">
                      {tariffMatrix?.resolutionCode || 'SIE-079-2026-TF'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Vigencia: {tariffMatrix?.effectiveDate || '2026-07-01'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1">
                    {tariffMatrix?.publishedBy || 'Superintendencia de Electricidad (SIE) & CEPM'}
                  </p>
                </div>

                {/* Acciones de Pliego Tarifario */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsAITariffModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    title="Escanear resolución SIE o tarifario CEPM en PDF/Imagen con IA"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Escanear con IA</span>
                  </button>

                  <button
                    onClick={handleSyncTariffsCloud}
                    disabled={isSyncingTariffs}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                    title="Sincronizar pliego tarifario con la base de datos PostgreSQL en la nube"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>{isSyncingTariffs ? 'Sincronizando...' : 'Subir a la Nube'}</span>
                  </button>

                  <button
                    onClick={handleFetchTariffsCloud}
                    disabled={isSyncingTariffs}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-300 dark:border-[#3f3f46] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#27272a] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Descargar pliego tarifario actualizado desde el servidor"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTariffs ? 'animate-spin' : ''}`} />
                    <span>Descargar</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('¿Restablecer el pliego tarifario a los valores oficiales base?')) {
                        resetToDefaultTariffs();
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-all cursor-pointer"
                    title="Restablecer valores iniciales por defecto"
                  >
                    Restablecer
                  </button>
                </div>
              </div>

              {/* Tabs por Distribuidora & Selector de Moneda de Trabajo */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#27272a] pb-2">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {(['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'] as UtilityDistributor[]).map((dist) => (
                    <button
                      key={dist}
                      onClick={() => setPrefDistributorTab(dist)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        prefDistributorTab === dist
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a]'
                      }`}
                    >
                      {dist}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Modo Moneda:
                  </span>
                  <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-[#1f1f23] border border-slate-200 dark:border-[#2b2b30]">
                    <button
                      type="button"
                      onClick={() => setTariffCurrencyMode('USD')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        tariffCurrencyMode === 'USD'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Editar tarifas directamente en Dólares ($ USD)"
                    >
                      $ USD (Dólares)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTariffCurrencyMode('DOP')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        tariffCurrencyMode === 'DOP'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="Editar tarifas en Pesos Dominicanos (RD$)"
                    >
                      RD$ DOP (Pesos)
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabla Editable de Tarifas de la Distribuidora */}
              {tariffMatrix?.schedules?.[prefDistributorTab] && (
                <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl overflow-hidden bg-white dark:bg-[#121214]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-[#1a1a1e] border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-zinc-400 font-semibold">
                      <tr>
                        <th className="p-3">Tarifa ({prefDistributorTab})</th>
                        <th className="p-3">
                          {tariffCurrencyMode === 'USD' ? 'Energía ($ USD/kWh)' : 'Energía (RD$/kWh)'}
                        </th>
                        <th className="p-3">
                          {tariffCurrencyMode === 'USD' ? 'Cargo Fijo ($ USD)' : 'Cargo Fijo (RD$)'}
                        </th>
                        <th className="p-3">
                          {tariffCurrencyMode === 'USD' ? 'Demanda ($ USD/kW-mes)' : 'Demanda (RD$/kW-mes)'}
                        </th>
                        <th className="p-3">Retención %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#222226] text-slate-700 dark:text-zinc-300">
                      {Object.values(tariffMatrix.schedules[prefDistributorTab].tariffs)
                        .filter((t) => {
                          if (prefDistributorTab === 'CEPM') {
                            return ['RBT-1', 'RBT-2', 'ESTRBT-2', 'RMT-1'].includes(t.code);
                          }
                          return !['RBT-1', 'RBT-2', 'ESTRBT-2', 'RMT-1'].includes(t.code);
                        })
                        .map((tariff) => {
                          const currentUSD = tariff.baseEnergyRateUSD !== undefined && tariff.baseEnergyRateUSD > 0
                            ? tariff.baseEnergyRateUSD
                            : Math.round(((tariff.baseEnergyRateDOP || 0) / 60.0) * 1000) / 1000;
                          const currentFixedUSD = tariff.fixedChargeUSD !== undefined && tariff.fixedChargeUSD > 0
                            ? tariff.fixedChargeUSD
                            : Math.round(((tariff.fixedChargeDOP || 0) / 60.0) * 100) / 100;
                          const currentDemandUSD = tariff.demandChargePerKWUSD !== undefined && tariff.demandChargePerKWUSD > 0
                            ? tariff.demandChargePerKWUSD
                            : Math.round(((tariff.demandChargePerKWDOP || 0) / 60.0) * 100) / 100;

                          return (
                            <tr key={tariff.code} className="hover:bg-slate-50/60 dark:hover:bg-[#1a1a1e]/60">
                              <td className="p-3 font-semibold">
                                <span className="font-mono text-emerald-600 dark:text-emerald-400">{tariff.code}</span>
                                <span className="block text-[10px] text-slate-400 font-normal truncate max-w-[200px]">{tariff.name}</span>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-slate-400 font-mono font-bold">
                                      {tariffCurrencyMode === 'USD' ? '$' : 'RD$'}
                                    </span>
                                    {tariffCurrencyMode === 'USD' ? (
                                      <input
                                        type="number"
                                        step={0.001}
                                        value={currentUSD}
                                        onChange={(e) => {
                                          const usdVal = parseFloat(e.target.value) || 0;
                                          const dopVal = Math.round(usdVal * 60.0 * 100) / 100;
                                          updateDistributorTariff(prefDistributorTab, tariff.code, {
                                            baseEnergyRateUSD: usdVal,
                                            baseEnergyRateDOP: dopVal,
                                          });
                                        }}
                                        className="w-24 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                      />
                                    ) : (
                                      <input
                                        type="number"
                                        step={0.01}
                                        value={tariff.baseEnergyRateDOP || 0}
                                        onChange={(e) => {
                                          const dopVal = parseFloat(e.target.value) || 0;
                                          const usdVal = Math.round((dopVal / 60.0) * 1000) / 1000;
                                          updateDistributorTariff(prefDistributorTab, tariff.code, {
                                            baseEnergyRateDOP: dopVal,
                                            baseEnergyRateUSD: usdVal,
                                          });
                                        }}
                                        className="w-24 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                      />
                                    )}
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {tariffCurrencyMode === 'USD'
                                        ? `(≈ RD$ ${(tariff.baseEnergyRateDOP || currentUSD * 60.0).toFixed(2)})`
                                        : `(≈ $${currentUSD.toFixed(3)} USD)`}
                                    </span>
                                  </div>
                                  {tariff.blocks && tariff.blocks.length > 0 && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                      Bloques SIE: 0-200: {tariff.blocks[0]?.rateDOP} | 201-300: {tariff.blocks[1]?.rateDOP} | 301-700: {tariff.blocks[2]?.rateDOP}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-400 font-mono font-bold">
                                    {tariffCurrencyMode === 'USD' ? '$' : 'RD$'}
                                  </span>
                                  {tariffCurrencyMode === 'USD' ? (
                                    <input
                                      type="number"
                                      step={0.1}
                                      value={currentFixedUSD}
                                      onChange={(e) => {
                                        const usdVal = parseFloat(e.target.value) || 0;
                                        const dopVal = Math.round(usdVal * 60.0 * 100) / 100;
                                        updateDistributorTariff(prefDistributorTab, tariff.code, {
                                          fixedChargeUSD: usdVal,
                                          fixedChargeDOP: dopVal,
                                        });
                                      }}
                                      className="w-20 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      step={1}
                                      value={tariff.fixedChargeDOP || 0}
                                      onChange={(e) => {
                                        const dopVal = parseFloat(e.target.value) || 0;
                                        const usdVal = Math.round((dopVal / 60.0) * 100) / 100;
                                        updateDistributorTariff(prefDistributorTab, tariff.code, {
                                          fixedChargeDOP: dopVal,
                                          fixedChargeUSD: usdVal,
                                        });
                                      }}
                                      className="w-20 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                    />
                                  )}
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {tariffCurrencyMode === 'USD'
                                      ? `(≈ RD$ ${(tariff.fixedChargeDOP || currentFixedUSD * 60.0).toFixed(0)})`
                                      : `(≈ $${currentFixedUSD.toFixed(2)})`}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-400 font-mono font-bold">
                                    {tariffCurrencyMode === 'USD' ? '$' : 'RD$'}
                                  </span>
                                  {tariffCurrencyMode === 'USD' ? (
                                    <input
                                      type="number"
                                      step={0.5}
                                      placeholder="0"
                                      value={currentDemandUSD}
                                      onChange={(e) => {
                                        const usdVal = parseFloat(e.target.value) || 0;
                                        const dopVal = Math.round(usdVal * 60.0 * 100) / 100;
                                        updateDistributorTariff(prefDistributorTab, tariff.code, {
                                          demandChargePerKWUSD: usdVal,
                                          demandChargePerKWDOP: dopVal,
                                        });
                                      }}
                                      className="w-22 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      step={10}
                                      placeholder="0"
                                      value={tariff.demandChargePerKWDOP || 0}
                                      onChange={(e) => {
                                        const dopVal = parseFloat(e.target.value) || 0;
                                        const usdVal = Math.round((dopVal / 60.0) * 100) / 100;
                                        updateDistributorTariff(prefDistributorTab, tariff.code, {
                                          demandChargePerKWDOP: dopVal,
                                          demandChargePerKWUSD: usdVal,
                                        });
                                      }}
                                      className="w-22 px-2 py-1 rounded-lg text-xs font-mono font-semibold border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                    />
                                  )}
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {tariffCurrencyMode === 'USD'
                                      ? (currentDemandUSD > 0 ? `(≈ RD$ ${(tariff.demandChargePerKWDOP || currentDemandUSD * 60.0).toFixed(0)})` : '')
                                      : ((tariff.demandChargePerKWDOP || 0) > 0 ? `(≈ $${currentDemandUSD.toFixed(2)})` : '')}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={tariff.netMeteringRetentionPct ?? 25}
                                  onChange={(e) =>
                                    updateDistributorTariff(prefDistributorTab, tariff.code, {
                                      netMeteringRetentionPct: parseFloat(e.target.value) || 25,
                                    })
                                  }
                                  className="w-16 px-2 py-1 rounded-lg text-xs font-mono border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}
        </div>


        {/* 3. Equipamiento y Sistema */}
        <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
          <button
            onClick={() => toggleAccordion('cat3')}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#222226] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">3. Equipamiento y Sistema</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Paneles solares, inversores, almacenamiento BESS y pérdidas</span>
              </div>
            </div>
            {openAccordions.cat3 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openAccordions.cat3 && (
            <div className="p-5 pt-1 border-t border-slate-100 dark:border-[#27272a] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Modelo de Panel Predeterminado
                </label>
                <select
                  value={defs.defaultPanelModel}
                  onChange={(e) => {
                    const sel = panelOptions.find((p) => p.displayName === e.target.value);
                    updateDefaultSimulationSettings({
                      defaultPanelModel: e.target.value,
                      defaultPanelPowerW: sel?.powerW || defs.defaultPanelPowerW,
                    });
                  }}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  {panelOptions.map((p) => (
                    <option key={p.id} value={p.displayName}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Inversor Predeterminado (kW AC)
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={defs.defaultInverterPowerKW}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultInverterPowerKW: parseFloat(e.target.value) || 8.0 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/60 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Auto-calcular Paneles al Crear</span>
                  <input
                    type="checkbox"
                    checked={defs.defaultAutoCalculatePanels}
                    onChange={(e) => updateDefaultSimulationSettings({ defaultAutoCalculatePanels: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/60 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Incluir Batería BESS por Defecto</span>
                  <input
                    type="checkbox"
                    checked={defs.defaultHasBattery}
                    onChange={(e) => updateDefaultSimulationSettings({ defaultHasBattery: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>
              </div>

              {defs.defaultHasBattery && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Capacidad Batería (kWh)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={defs.defaultBatteryCapacityKWh}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultBatteryCapacityKWh: parseFloat(e.target.value) || 16.08 })}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Descarga (DoD %)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={defs.defaultBatteryDOD}
                      onChange={(e) => updateDefaultSimulationSettings({ defaultBatteryDOD: parseInt(e.target.value) || 90 })}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Costos y Margen de Venta */}
        <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
          <button
            onClick={() => toggleAccordion('cat4')}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#222226] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">4. Costos y Margen de Venta</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Precio directo $/Wp, márgenes brutos y compensación</span>
              </div>
            </div>
            {openAccordions.cat4 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openAccordions.cat4 && (
            <div className="p-5 pt-1 border-t border-slate-100 dark:border-[#27272a] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Modo de Cotización Predeterminado
                </label>
                <select
                  value={defs.defaultPricingMode}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultPricingMode: e.target.value as 'direct' | 'matrix' })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  <option value="direct">Precio Directo ($/Wp Llave en Mano)</option>
                  <option value="matrix">Matriz de Costos Detallada (Equipos + Estructura + Mano de Obra)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Precio Directo Base (USD $/Wp)
                </label>
                <input
                  type="number"
                  step={0.05}
                  value={defs.defaultDirectPriceUSDPerWp}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultDirectPriceUSDPerWp: parseFloat(e.target.value) || 1.05 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Margen Bruto Objetivo (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defs.defaultTargetMarginPct}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultTargetMarginPct: parseFloat(e.target.value) || 28 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Destino de Excedentes de Energía
                </label>
                <select
                  value={defs.defaultExcessEnergyDestiny}
                  onChange={(e) => updateDefaultSimulationSettings({ defaultExcessEnergyDestiny: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                >
                  <option value="net_metering">Medición Neta (Compensación en Factura Eléctrica)</option>
                  <option value="direct_sale">Venta Directa de Energía a Distribuidora</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 5. Finanzas e Incentivos (Ley 57-07) */}
        <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
          <button
            onClick={() => toggleAccordion('cat5')}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#222226] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">5. Finanzas e Incentivos (Ley 57-07)</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Amortización fiscal, escalación de tarifa y vida útil</span>
              </div>
            </div>
            {openAccordions.cat5 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openAccordions.cat5 && (
            <div className="p-5 pt-1 border-t border-slate-100 dark:border-[#27272a] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Amortización Fiscal Ley 57-07 (Años)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={defs.ley5707AmortizationYears}
                  onChange={(e) => updateDefaultSimulationSettings({ ley5707AmortizationYears: parseInt(e.target.value) || 3 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Estándar oficial: 3 años (13.33% anual sobre ISR).</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Escalación Anual Tarifa Eléctrica (%)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={defs.annualEnergyTariffEscalationPct}
                  onChange={(e) => updateDefaultSimulationSettings({ annualEnergyTariffEscalationPct: parseFloat(e.target.value) || 3.5 })}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Incremento promedio de inflación energética.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Escaneo de Resoluciones con IA */}
      <AITariffResolutionModal
        isOpen={isAITariffModalOpen}
        onClose={() => setIsAITariffModalOpen(false)}
      />
    </section>
  );
};

