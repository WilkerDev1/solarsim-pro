import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { Receipt, ChevronDown, ChevronUp, Check, Sparkles, Cloud, RefreshCw, Zap, Coins, DollarSign } from 'lucide-react';
import { UtilityDistributor, getDistributorTariffOptions } from '../../../types/tariffs';

interface TariffPreferencesPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onOpenAIScanner: () => void;
}

/** "Tarifas y Distribuidora" accordion of the simulation preferences: default distributor/tariff and the tariff matrix editor. */
export const TariffPreferencesPanel: React.FC<TariffPreferencesPanelProps> = ({ isOpen, onToggle, onOpenAIScanner }) => {
  const {
    defaultSimulationSettings: defs,
    updateDefaultSimulationSettings,
    tariffMatrix,
    updateDistributorTariff,
    resetToDefaultTariffs,
    syncTariffsWithServer,
    fetchTariffsFromServer,
  } = useSimulationStore();
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

  return (
    <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
      <button
        onClick={() => onToggle()}
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
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
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
                onClick={() => onOpenAIScanner()}
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
  );
};
