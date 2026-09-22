import React from 'react';
import { ProjectSimulation, UtilityRates, SystemSpecs } from '../../../types';
import { Receipt, ChevronDown, Sparkles, Check, Home, Building2, Factory, BatteryCharging, Sliders, Sun, Zap } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { getReferenceEnergyRateUSD, DEFAULT_RD_TARIFF_MATRIX } from '../../../data/rdTariffs';
import { getProvinceHSP } from '../../../data/rdProvinces';
import { getRecommendedLoadProfile } from '../../../engine/solarEngine';
import { calculateTotalDCCapacityKWp, calculateTotalBatteryCapacityKWh } from '../../../utils/equipmentSpecsUtils';
import {
  UtilityDistributor,
  getDistributorTariffOptions,
  getTariffDisplayName,
  mapTariffCodeOnDistributorChange,
} from '../../../types/tariffs';

interface RatesParamsSectionProps {
  project: ProjectSimulation;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateSpecs?: (specs: Partial<SystemSpecs>) => void;
}

export const RatesParamsSection: React.FC<RatesParamsSectionProps> = ({
  project,
  isOpen,
  onToggle,
  isDark,
  updateRates,
  updateSpecs,
}) => {
  const { tariffMatrix } = useSimulationStore();

  const avgMonthlyConsumption =
    project.monthlyConsumption && project.monthlyConsumption.length > 0
      ? project.monthlyConsumption.reduce((a, b) => a + b, 0) / project.monthlyConsumption.length
      : 900;

  const activeMatrix = tariffMatrix || DEFAULT_RD_TARIFF_MATRIX;
  const currentDistributor = (project.rates.distributor as UtilityDistributor) || 'EDESUR';
  const currentTariffCode = project.rates.tariffCode || (currentDistributor === 'CEPM' ? 'RBT-1' : 'BTS2');

  const referenceRateUSD = getReferenceEnergyRateUSD(
    activeMatrix,
    currentDistributor,
    currentTariffCode,
    avgMonthlyConsumption,
    project.specs?.dopExchangeRate || 60.0
  );

  const isMatchingReference = Math.abs((project.rates.energyCostPerKWh || 0) - referenceRateUSD) < 0.001;

  const handleDistributorChange = (newDist: UtilityDistributor) => {
    const mappedCode = mapTariffCodeOnDistributorChange(
      currentDistributor,
      newDist,
      currentTariffCode
    );
    const newRef = getReferenceEnergyRateUSD(
      activeMatrix,
      newDist,
      mappedCode,
      avgMonthlyConsumption,
      project.specs?.dopExchangeRate || 60.0
    );
    updateRates({
      distributor: newDist,
      tariffCode: mappedCode,
      energyCostPerKWh: newRef,
    });
    if (updateSpecs && (!project.specs?.loadProfilePreset || project.specs.loadProfilePreset !== 'custom')) {
      const rec = getRecommendedLoadProfile(mappedCode, avgMonthlyConsumption);
      updateSpecs({
        daytimeLoadRatio: rec.daytimeRatio,
        daytimeSelfConsumptionRatio: rec.daytimeRatio,
        loadProfilePreset: rec.preset,
      });
    }
  };

  const handleTariffChange = (newCode: string) => {
    const newRef = getReferenceEnergyRateUSD(
      activeMatrix,
      currentDistributor,
      newCode,
      avgMonthlyConsumption,
      project.specs?.dopExchangeRate || 60.0
    );
    updateRates({
      tariffCode: newCode,
      energyCostPerKWh: newRef,
    });
    if (updateSpecs && (!project.specs?.loadProfilePreset || project.specs.loadProfilePreset !== 'custom')) {
      const rec = getRecommendedLoadProfile(newCode, avgMonthlyConsumption);
      updateSpecs({
        daytimeLoadRatio: rec.daytimeRatio,
        daytimeSelfConsumptionRatio: rec.daytimeRatio,
        loadProfilePreset: rec.preset,
      });
    }
  };


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
          <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>2. Tarifas y Distribuidora</span>
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`block text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Precio por kWh ($ USD)
              </label>
              <button
                type="button"
                onClick={() => updateRates({ energyCostPerKWh: referenceRateUSD })}
                className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  isMatchingReference
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/50'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/50 hover:bg-amber-200'
                }`}
                title="Haz clic para aplicar la tarifa de referencia calculada según la resolución oficial"
              >
                {isMatchingReference ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
                <span>Oficial: ${referenceRateUSD.toFixed(3)}</span>
              </button>
            </div>
            <input
              type="number"
              step="0.001"
              value={project.rates.energyCostPerKWh}
              onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Empresa Distribuidora
            </label>
            <select
              value={project.rates.distributor || 'EDESUR'}
              onChange={(e) => handleDistributorChange(e.target.value as UtilityDistributor)}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="EDEESTE">EDEESTE</option>
              <option value="EDESUR">EDESUR</option>
              <option value="EDENORTE">EDENORTE</option>
              <option value="CEPM">CEPM</option>
            </select>
          </div>


          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Cobertura Objetivo (%)
            </label>
            <input
              type="number"
              step="1"
              value={project.rates.targetCoveragePct ?? 95}
              onChange={(e) => updateRates({ targetCoveragePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Tipo de Tarifa ({currentDistributor})
            </label>
            <select
              value={project.rates.tariffCode || (currentDistributor === 'CEPM' ? 'RBT-1' : 'BTS2')}
              onChange={(e) => handleTariffChange(e.target.value)}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              {getDistributorTariffOptions(currentDistributor).map((opt) => (
                <option key={opt.value} value={opt.value} title={opt.description}>
                  {opt.label}
                </option>
              ))}
              {!getDistributorTariffOptions(currentDistributor).some((opt) => opt.value === project.rates.tariffCode) && project.rates.tariffCode && (
                <option value={project.rates.tariffCode}>
                  {project.rates.tariffCode}
                </option>
              )}
            </select>
          </div>


          {/* Casilla Inyección Cero / Antivertido (Zero-Export) */}
          <div
            className={`flex items-center justify-between p-2.5 rounded-lg border ${
              isDark ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50/60 border-amber-200'
            }`}
          >
            <div className="pr-2">
              <span className={`text-xs font-bold block ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                Inyección Cero / Antivertido (Zero-Export)
              </span>
              <span className={`text-[10px] block leading-tight ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Limita la generación al consumo local, evitando inyección a la red y anulando cargos de exportación.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!project.rates.isZeroExport}
              onChange={(e) => updateRates({ isZeroExport: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4 shrink-0"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className={`block text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Cargo Exportación Red (%) (SIE-007-2026-REG)
              </label>
              {project.rates.isZeroExport ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                  0% (Inyección Cero)
                </span>
              ) : (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                  Medición Neta (~{project.rates.gridExportFeePct ?? 25}%)
                </span>
              )}
            </div>

            <input
              type="number"
              step="1"
              disabled={project.rates.isZeroExport}
              value={
                project.rates.isZeroExport
                  ? 0
                  : (project.rates.gridExportFeePct ?? 25)
              }
              onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />

            {/* Nota explicativa regulatoria debajo del parámetro */}
            <div className="mt-1.5">
              {project.rates.isZeroExport ? (
                <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <span>⚡</span>
                  <span>
                    <strong>Inyección Cero activa:</strong> El sistema no vuelca excedentes a la red pública; por lo tanto, no aplica retención ni cargo por uso de red.
                  </span>
                </p>
              ) : (
                <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  <span>⚡</span>
                  <span>
                    <strong>Medición Neta ({getTariffDisplayName(currentDistributor, project.rates.tariffCode || '')}):</strong> Aplica retención del {project.rates.gridExportFeePct ?? 25}% por derecho de uso de red bajo Res. SIE-007-2026-REG sobre los kWh excedentes exportados a la red de {currentDistributor}.
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Perfil de Carga del Cliente & Partición Diurna vs Nocturna */}
          {(() => {
            const totalBatteryKWh = calculateTotalBatteryCapacityKWh(project.specs);
            const hasBattery = !!(project.specs.hasBattery && totalBatteryKWh > 0);
            const batteryDodPct = project.specs.batteryDOD !== undefined ? project.specs.batteryDOD : 90;
            const batteryEffPct = project.specs.batteryEfficiencyPct !== undefined ? project.specs.batteryEfficiencyPct : 90;
            const dailyUsableBatteryKWh = hasBattery ? totalBatteryKWh * (batteryDodPct / 100) * (batteryEffPct / 100) : 0;

            const recommendedProfile = getRecommendedLoadProfile(currentTariffCode, avgMonthlyConsumption);
            const currentDaytimeRatio = project.specs.daytimeLoadRatio ?? project.specs.daytimeSelfConsumptionRatio ?? recommendedProfile.daytimeRatio;
            const currentPreset = project.specs.loadProfilePreset || (
              currentDaytimeRatio === 35 ? 'residential' :
              currentDaytimeRatio === 75 ? 'commercial' :
              currentDaytimeRatio === 90 ? 'industrial' : 'custom'
            );

            const avgDailyCons = avgMonthlyConsumption / 30;
            const estimatedDayLoad = avgDailyCons * (currentDaytimeRatio / 100);
            const estimatedNightLoad = Math.max(0, avgDailyCons - estimatedDayLoad);

            // Producción solar diaria promedio estimada
            const dcCapacityKWp = calculateTotalDCCapacityKWp(project.specs);
            const provinceData = getProvinceHSP(project.client?.province || 'Santo Domingo');
            const customHspList = project.client?.customMonthlyHSP;
            const provinceHsp = customHspList && customHspList.length > 0
              ? customHspList.reduce((a: number, b: number) => a + b, 0) / customHspList.length
              : provinceData.avgHSP;
            const systemLossesPct = project.specs.systemLosses !== undefined ? project.specs.systemLosses : 25.0;
            const avgDailyProd = dcCapacityKWp * provinceHsp * (1 - systemLossesPct / 100);

            // Flujos físicos de energía diaria
            const solarDirectDaily = Math.min(avgDailyProd, estimatedDayLoad);
            const solarSurplusDaily = Math.max(0, avgDailyProd - solarDirectDaily);

            const dailyBessCycle = hasBattery
              ? Math.min(solarSurplusDaily, Math.min(dailyUsableBatteryKWh, estimatedNightLoad))
              : 0;
            const bessChargeDaily = dailyBessCycle;
            const bessDischargeDaily = dailyBessCycle;

            const totalSelfDaily = solarDirectDaily + bessDischargeDaily;
            const gridImportDaily = Math.max(0, avgDailyCons - totalSelfDaily);
            const gridExportDaily = Math.max(0, solarSurplusDaily - bessChargeDaily);

            // Porcentajes del consumo del cliente
            const solarDirectPct = avgDailyCons > 0 ? (solarDirectDaily / avgDailyCons) * 100 : 0;
            const bessDischargePct = avgDailyCons > 0 ? (bessDischargeDaily / avgDailyCons) * 100 : 0;
            const totalSelfPct = avgDailyCons > 0 ? (totalSelfDaily / avgDailyCons) * 100 : 0;
            const gridImportPct = avgDailyCons > 0 ? (gridImportDaily / avgDailyCons) * 100 : 0;

            // Porcentajes de la generación solar
            const genDirectPct = avgDailyProd > 0 ? Math.round((solarDirectDaily / avgDailyProd) * 100) : 0;
            const genBessPct = avgDailyProd > 0 && hasBattery ? Math.round((bessChargeDaily / avgDailyProd) * 100) : 0;
            const genExportPct = avgDailyProd > 0 ? Math.max(0, 100 - genDirectPct - genBessPct) : 0;

            const showSelfConsumption = project.specs.showSelfConsumptionBreakdown !== false;

            return (
              <div
                className={`p-3 rounded-lg border space-y-2.5 transition-all ${
                  isDark ? 'bg-[#181824] border-[#2e2e42]' : 'bg-blue-50/60 border-blue-200'
                }`}
              >
                {/* Cabecera compacta con porcentaje diurno */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-blue-300' : 'text-blue-950'}`}>
                      Perfil de Carga & Partición Diurna
                    </label>
                    <span className={`text-[10px] block ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Consumo diurno (8am–5pm) vs nocturno (5pm–8am)
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      isDark ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60' : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {currentDaytimeRatio}% Día
                    </span>
                  </div>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min="15"
                  max="95"
                  step="1"
                  value={currentDaytimeRatio}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 35;
                    updateSpecs && updateSpecs({
                      daytimeLoadRatio: val,
                      daytimeSelfConsumptionRatio: val,
                      loadProfilePreset: 'custom',
                    });
                  }}
                  className="w-full h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />

                {/* Presets rápidos */}
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    onClick={() => updateSpecs && updateSpecs({
                      daytimeLoadRatio: 35,
                      daytimeSelfConsumptionRatio: 35,
                      loadProfilePreset: 'residential',
                    })}
                    className={`text-[9.5px] py-1 px-1 rounded-md font-semibold text-center transition-all cursor-pointer border flex flex-col items-center gap-0.5 ${
                      currentPreset === 'residential' || currentDaytimeRatio === 35
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : isDark ? 'bg-[#222230] hover:bg-[#2a2a3c] text-zinc-300 border-[#3a3a4e]' : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                    title="Residencial Típico (35% día / 65% noche)"
                  >
                    <Home className="w-3 h-3 text-blue-400" />
                    <span>Resid. 35%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSpecs && updateSpecs({
                      daytimeLoadRatio: 75,
                      daytimeSelfConsumptionRatio: 75,
                      loadProfilePreset: 'commercial',
                    })}
                    className={`text-[9.5px] py-1 px-1 rounded-md font-semibold text-center transition-all cursor-pointer border flex flex-col items-center gap-0.5 ${
                      currentPreset === 'commercial' || (currentPreset !== 'residential' && currentDaytimeRatio === 75)
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : isDark ? 'bg-[#222230] hover:bg-[#2a2a3c] text-zinc-300 border-[#3a3a4e]' : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                    title="Comercial Diurno (75% día / 25% noche)"
                  >
                    <Building2 className="w-3 h-3 text-emerald-400" />
                    <span>Com. 75%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSpecs && updateSpecs({
                      daytimeLoadRatio: 90,
                      daytimeSelfConsumptionRatio: 90,
                      loadProfilePreset: 'industrial',
                    })}
                    className={`text-[9.5px] py-1 px-1 rounded-md font-semibold text-center transition-all cursor-pointer border flex flex-col items-center gap-0.5 ${
                      currentPreset === 'industrial' || currentDaytimeRatio === 90
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : isDark ? 'bg-[#222230] hover:bg-[#2a2a3c] text-zinc-300 border-[#3a3a4e]' : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                    title="Industrial (90% día / 10% noche)"
                  >
                    <Factory className="w-3 h-3 text-amber-400" />
                    <span>Ind. 90%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSpecs && updateSpecs({
                      loadProfilePreset: 'custom',
                    })}
                    className={`text-[9.5px] py-1 px-1 rounded-md font-semibold text-center transition-all cursor-pointer border flex flex-col items-center gap-0.5 ${
                      currentPreset === 'custom' && currentDaytimeRatio !== 35 && currentDaytimeRatio !== 75 && currentDaytimeRatio !== 90
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : isDark ? 'bg-[#222230] hover:bg-[#2a2a3c] text-zinc-300 border-[#3a3a4e]' : 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                    title="Ajuste manual con slider"
                  >
                    <Sliders className="w-3 h-3 text-cyan-400" />
                    <span>Manual</span>
                  </button>
                </div>

                {/* Barra segmentada proporcional del consumo */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
                    <span>Distribución del Consumo</span>
                    <span className="font-mono">{avgDailyCons.toFixed(1)} kWh/día</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${Math.min(100, solarDirectPct)}%` }}
                      className="bg-amber-500 transition-all duration-300"
                      title={`Solar Directo: ${solarDirectPct.toFixed(1)}% (${solarDirectDaily.toFixed(1)} kWh/d)`}
                    />
                    {hasBattery && bessDischargePct > 0 && (
                      <div
                        style={{ width: `${Math.min(100 - solarDirectPct, bessDischargePct)}%` }}
                        className="bg-cyan-500 transition-all duration-300"
                        title={`Batería BESS: ${bessDischargePct.toFixed(1)}% (${bessDischargeDaily.toFixed(1)} kWh/d)`}
                      />
                    )}
                    <div
                      style={{ width: `${Math.max(0, gridImportPct)}%` }}
                      className="bg-slate-400 dark:bg-zinc-600 transition-all duration-300"
                      title={`Red Eléctrica: ${gridImportPct.toFixed(1)}% (${gridImportDaily.toFixed(1)} kWh/d)`}
                    />
                  </div>
                </div>

                {/* Desglose de Métricas Compactas */}
                {hasBattery ? (
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    <div className={`p-1.5 rounded border text-center ${isDark ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                      <span className="block text-[9px] font-medium text-amber-600 dark:text-amber-400">☀️ Solar Día</span>
                      <span className="text-xs font-bold font-mono block">{solarDirectPct.toFixed(1)}%</span>
                      <span className="text-[8.5px] opacity-75 font-mono">{solarDirectDaily.toFixed(1)} kWh/d</span>
                    </div>
                    <div className={`p-1.5 rounded border text-center ${isDark ? 'bg-cyan-950/20 border-cyan-900/40 text-cyan-300' : 'bg-cyan-50 border-cyan-200 text-cyan-900'}`}>
                      <span className="block text-[9px] font-medium text-cyan-600 dark:text-cyan-400">🔋 BESS Noche</span>
                      <span className="text-xs font-bold font-mono block">+{bessDischargePct.toFixed(1)}%</span>
                      <span className="text-[8.5px] opacity-75 font-mono">{bessDischargeDaily.toFixed(1)} kWh/d</span>
                    </div>
                    <div className={`p-1.5 rounded border text-center ${isDark ? 'bg-zinc-900/50 border-zinc-700/50 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                      <span className="block text-[9px] font-medium text-slate-500">🔌 Red (Noche)</span>
                      <span className="text-xs font-bold font-mono block">{gridImportPct.toFixed(1)}%</span>
                      <span className="text-[8.5px] opacity-75 font-mono">{gridImportDaily.toFixed(1)} kWh/d</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <div className={`p-1.5 rounded border text-center ${isDark ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                      <span className="block text-[9px] font-medium text-amber-600 dark:text-amber-400">☀️ Autoconsumo Solar</span>
                      <span className="text-xs font-bold font-mono block">{solarDirectPct.toFixed(1)}%</span>
                      <span className="text-[8.5px] opacity-75 font-mono">{solarDirectDaily.toFixed(1)} kWh/d (sin peaje)</span>
                    </div>
                    <div className={`p-1.5 rounded border text-center ${isDark ? 'bg-zinc-900/50 border-zinc-700/50 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                      <span className="block text-[9px] font-medium text-slate-500">🔌 Compra Red Eléctrica</span>
                      <span className="text-xs font-bold font-mono block">{gridImportPct.toFixed(1)}%</span>
                      <span className="text-[8.5px] opacity-75 font-mono">{gridImportDaily.toFixed(1)} kWh/d (tarifa EDE)</span>
                    </div>
                  </div>
                )}

                {/* Badge Destacado de Autoconsumo Total */}
                <div
                  className={`px-2.5 py-1.5 rounded-md border flex items-center justify-between text-[10.5px] ${
                    isDark ? 'bg-blue-950/40 border-blue-800/60 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-950'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-bold">Total Autoconsumo en Sitio:</span>
                  </div>
                  <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-300">
                    {totalSelfPct.toFixed(1)}% ({totalSelfDaily.toFixed(1)} kWh/d)
                  </span>
                </div>

                {/* Resumen de Generación (1 sola línea compacta) */}
                <p className={`text-[9.5px] leading-tight truncate ${isDark ? 'text-zinc-400' : 'text-slate-500'}`} title={`Producción FV: ~${avgDailyProd.toFixed(1)} kWh/d (${genDirectPct}% directo${hasBattery ? `, ${genBessPct}% BESS` : ''}, ${genExportPct}% inyección)`}>
                  🌐 <strong>Gen ~{avgDailyProd.toFixed(1)} kWh/d:</strong> {genDirectPct}% directo {hasBattery ? `· ${genBessPct}% BESS ` : ''}· {genExportPct}% iny. red
                </p>

                {/* Botón Switch: Mostrar / Ocultar Autoconsumo en Gráficas y Tablas */}
                <div className="pt-1.5 border-t border-slate-200/60 dark:border-[#2e2e42] flex items-center justify-between">
                  <span className={`text-[10px] font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Autoconsumo en gráficos/tablas:
                  </span>
                  <button
                    type="button"
                    onClick={() => updateSpecs && updateSpecs({ showSelfConsumptionBreakdown: !showSelfConsumption })}
                    className={`text-[9.5px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all border flex items-center gap-1 ${
                      showSelfConsumption
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : isDark ? 'bg-zinc-800 text-zinc-400 border-zinc-700' : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                    title={showSelfConsumption ? 'Mostrando autoconsumo e inyección (Modo Transparente SIE-007)' : 'Modo Clásico (oculta líneas y columnas de autoconsumo)'}
                  >
                    <span>{showSelfConsumption ? 'Visible' : 'Oculto (Clásico)'}</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
