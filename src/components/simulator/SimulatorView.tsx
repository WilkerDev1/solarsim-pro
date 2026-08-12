import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { RD_PROVINCES } from '../../data/rdProvinces';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import {
  Leaf,
  TrendingUp,
  BarChart2,
  Table as TableIcon,
  Sparkles,
} from 'lucide-react';

export const SimulatorView: React.FC = () => {
  const {
    getActiveProject,
    getFinancialSummary,
    updateClient,
    updateSpecs,
    updateRates,
    updateFinancials,
    updateMonthlyConsumption,
    setProjectStatus,
  } = useSimulationStore();

  const project = getActiveProject();
  const summary = getFinancialSummary();

  const [activeTab, setActiveTab] = useState<'chart-monthly' | 'chart-cashflow' | 'table-monthly'>('chart-monthly');

  // Auto-calculate panels logic when autoCalculatePanels is ON
  useEffect(() => {
    if (project.specs.autoCalculatePanels) {
      const annualConsumption = project.monthlyConsumption.reduce((a, b) => a + b, 0);
      const targetCoverage = project.rates.targetCoveragePct || 95;
      const targetAnnualKWh = annualConsumption * (targetCoverage / 100);
      
      // Estimated annual output per panel W based on province HSP
      const provinceObj = RD_PROVINCES.find(p => p.name === project.client.province) || RD_PROVINCES[0];
      const avgHsp = provinceObj.avgHSP || 5.25;
      const annualOutputPerWatt = avgHsp * 365 * (1 - (project.specs.systemLosses / 100));
      const neededTotalW = targetAnnualKWh / (annualOutputPerWatt / 1000);
      const calculatedPanels = Math.max(1, Math.ceil(neededTotalW / (project.specs.panelPowerW || 450)));

      if (calculatedPanels !== project.specs.panelCount) {
        updateSpecs({ panelCount: calculatedPanels });
      }
    }
  }, [
    project.specs.autoCalculatePanels,
    project.specs.panelPowerW,
    project.specs.systemLosses,
    project.rates.targetCoveragePct,
    project.client.province,
    project.monthlyConsumption,
  ]);

  return (
    <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-64px)] bg-surface">
      {/* Left Sidebar: Parameters */}
      <aside className="w-[340px] bg-white border-r border-outline-variant/60 flex flex-col shrink-0 h-full overflow-y-auto shadow-sm z-10">
        <div className="p-6 border-b border-outline-variant/40 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-0.5">Parámetros</h2>
            <p className="font-body-sm text-body-sm text-secondary">Configurar restricciones del sistema</p>
          </div>
          <select
            value={project.status}
            onChange={(e) => setProjectStatus(project.id, e.target.value as any)}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white border border-outline-variant text-on-surface focus:ring-1 focus:ring-primary shadow-xs cursor-pointer"
          >
            <option value="Draft">Borrador</option>
            <option value="Final">Finalizado</option>
            <option value="Archived">Archivado</option>
          </select>
        </div>

        <div className="p-6 space-y-6">
          {/* SECCIÓN 1: Proyecto y Cliente (Imagen 1) */}
          <section className="space-y-3">
            <h3 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">person</span> Proyecto y Cliente
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  value={project.client.name}
                  onChange={(e) => updateClient({ name: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-body-base text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Ubicación / Provincia</label>
                <input
                  type="text"
                  value={project.client.location}
                  onChange={(e) => updateClient({ location: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-body-base text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Coordenadas (Lat, Lng)</label>
                <input
                  type="text"
                  value={project.client.coordinates || ''}
                  placeholder="18.4861, -69.9312"
                  onChange={(e) => updateClient({ coordinates: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">ID del Proyecto</label>
                <input
                  type="text"
                  value={project.client.projectId}
                  onChange={(e) => updateClient({ projectId: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 2: Tarifas y Distribuidora (Imagen 2) */}
          <section className="space-y-3 pt-2 border-t border-outline-variant/30">
            <h3 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">payments</span> Tarifas y Distribuidora
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Precio por kWh ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={project.rates.energyCostPerKWh}
                  onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Empresa Distribuidora</label>
                <select
                  value={project.rates.distributor || 'EDEESTE'}
                  onChange={(e) => updateRates({ distributor: e.target.value as any })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-body-base text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs cursor-pointer"
                >
                  <option value="EDEESTE">EDEESTE</option>
                  <option value="EDESUR">EDESUR</option>
                  <option value="EDENORTE">EDENORTE</option>
                  <option value="CEPM">CEPM</option>
                </select>
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Cobertura Objetivo (%)</label>
                <input
                  type="number"
                  step="1"
                  value={project.rates.targetCoveragePct ?? 95}
                  onChange={(e) => updateRates({ targetCoveragePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Tipo de Tarifa</label>
                <select
                  value={project.rates.tariffCode || 'BTS1'}
                  onChange={(e) => updateRates({ tariffCode: e.target.value as any })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-body-base text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs cursor-pointer"
                >
                  <option value="BTS1">BTS1</option>
                  <option value="BTS2">BTS2</option>
                  <option value="MTD">MTD</option>
                  <option value="BTD">BTD</option>
                </select>
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Cargo Exportación Red (%) (SIE-007-2026-REG)</label>
                <input
                  type="number"
                  step="1"
                  value={project.rates.gridExportFeePct}
                  onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 3: Equipamiento (Imagen 3) */}
          <section className="space-y-3 pt-2 border-t border-outline-variant/30">
            <h3 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">solar_power</span> Equipamiento
            </h3>

            {/* Selector de modo Simple / Detallado */}
            <div className="flex bg-surface-container rounded-lg p-1 mb-4 border border-outline-variant/40">
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: false })}
                className={`flex-1 rounded-md py-1.5 font-title-sm text-[12px] transition-all text-center ${
                  !project.specs.isDetailed
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-semibold'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: true })}
                className={`flex-1 rounded-md py-1.5 font-title-sm text-[12px] transition-all text-center ${
                  project.specs.isDetailed
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-semibold'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                Detallado
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Potencia del Panel (W)</label>
                <input
                  type="number"
                  step="5"
                  value={project.specs.panelPowerW}
                  onChange={(e) => updateSpecs({ panelPowerW: parseInt(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              {/* CAMPOS ADICIONALES MODO DETALLADO (AVANZADO) */}
              {project.specs.isDetailed && (
                <>
                  <div>
                    <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Eficiencia del Panel (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={project.specs.panelEfficiency || 21.8}
                      onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Coeficiente de Temp. (%/°C)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={project.specs.tempCoeff || -0.35}
                      onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Potencia del Inversor (kW AC)</label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.inverterPowerKW}
                      onChange={(e) => updateSpecs({ inverterPowerKW: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                    />
                  </div>
                </>
              )}

              {/* Auto-Calcular Paneles Toggle */}
              <div className="pb-1">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Auto-Calcular Paneles
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.specs.autoCalculatePanels ?? false}
                      onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">
                  {project.specs.autoCalculatePanels ? 'Cantidad de Paneles (Auto-calculada)' : 'Cantidad de Paneles'}
                </label>
                <input
                  type="number"
                  step="1"
                  readOnly={project.specs.autoCalculatePanels}
                  value={project.specs.panelCount}
                  onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
                  className={`w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs ${
                    project.specs.autoCalculatePanels ? 'opacity-80 bg-slate-100 cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Precio del Sistema por Vatio ($ USD/Wp)</label>
                <input
                  type="number"
                  step="0.01"
                  value={project.specs.pricePerWattUSD || project.financials.pricePerWattUSD}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    updateSpecs({ pricePerWattUSD: val });
                    updateFinancials({ pricePerWattUSD: val, customCostUSD: undefined });
                  }}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              {/* Almacenamiento (Batería) Toggle */}
              <div className="pt-1">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Almacenamiento (Batería)
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.specs.hasBattery}
                      onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </label>
              </div>

              {/* CAMPOS DE BATERÍA (CAPACIDAD kWh + PRECIO $ USD) */}
              {project.specs.hasBattery && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Capacidad de Batería (kWh)</label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.batteryCapacityKWh}
                      onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Precio de Batería ($ USD)</label>
                    <input
                      type="number"
                      step="50"
                      value={project.specs.batteryCostUSD || 0}
                      onChange={(e) => updateSpecs({ batteryCostUSD: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                    />
                  </div>

                  {project.specs.isDetailed && (
                    <div>
                      <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Profundidad de Descarga (DOD %)</label>
                      <input
                        type="number"
                        step="1"
                        value={project.specs.batteryDOD || 80}
                        onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tarjeta de Vista Previa en Vivo (Imagen 3 Bottom) */}
              <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-medium text-secondary">Potencia Total DC:</span>
                  <span className="text-[12px] font-bold text-primary">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
                </div>
                {project.specs.hasBattery && summary.batteryInvestmentUSD > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-medium text-secondary">Costo Batería:</span>
                    <span className="text-[12px] font-semibold text-emerald-700">
                      +${summary.batteryInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-primary/10 pt-1">
                  <span className="text-[11px] font-medium text-secondary">Inversión Estimada:</span>
                  <span className="text-[12px] font-bold text-primary">
                    ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECCIÓN 4: Finanzas e Incentivos (Imagen 4 Top) */}
          <section className="space-y-3 pt-2 border-t border-outline-variant/30">
            <h3 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">account_balance</span> Finanzas e Incentivos
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                  Aplicar Ley 57-07 (Crédito ISR 40%)
                </span>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.financials.applyLey5707}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      updateFinancials({
                        applyLey5707: checked,
                        applyITBISExemption: checked ? true : project.financials.applyITBISExemption,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                  Exoneración de ITBIS (18%)
                </span>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.financials.applyITBISExemption}
                    onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </div>
              </label>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Años de Proyección</label>
                <input
                  type="number"
                  step="1"
                  value={project.financials.projectLifespanYears}
                  onChange={(e) => updateFinancials({ projectLifespanYears: parseInt(e.target.value) || 25 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Tasa de Descuento (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={project.financials.discountRatePct}
                  onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 5: Parámetros Técnicos y Pérdidas (Imagen 4 Bottom) */}
          <section className="space-y-3 pt-2 border-t border-outline-variant/30">
            <h3 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">settings_suggest</span> Parámetros Técnicos y Pérdidas
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Pérdidas del Sistema (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={project.specs.systemLosses}
                  onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Degradación Anual (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={project.specs.annualDegradation}
                  onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1">Factor CO₂ (kg/kWh)</label>
                <input
                  type="number"
                  step="0.001"
                  value={project.financials.co2FactorKgPerKWh}
                  onChange={(e) => updateFinancials({ co2FactorKgPerKWh: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 font-data-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all text-xs"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-auto p-6 border-t border-outline-variant/40 bg-surface-container-low/50">
          <button
            onClick={() => {
              useSimulationStore.setState({ activeProjectId: project.id });
            }}
            className="w-full bg-surface-container-lowest border border-primary text-primary hover:bg-surface-container transition-colors py-2 rounded-lg font-title-sm text-title-sm flex items-center justify-center gap-2 font-semibold shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Actualizar Simulación
          </button>
        </div>
      </aside>

      {/* Right Main Interactive Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6">
        {/* KPI Metrics Dashboard Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Card 1: Capacity */}
          <div className="bg-white border border-outline-variant/60 rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block mb-1">
              Capacidad DC
            </span>
            <span className="font-mono text-lg font-bold text-primary block">
              {summary.systemCapacityKWp} <span className="text-xs text-secondary">kWp</span>
            </span>
            <span className="text-[11px] text-secondary">
              {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
            </span>
          </div>

          {/* Card 2: Annual Production & Coverage */}
          <div className="bg-white border border-outline-variant/60 rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block mb-1">
              Generación Anual
            </span>
            <span className="font-mono text-lg font-bold text-on-surface block">
              {summary.annualProductionKWh.toLocaleString()} <span className="text-xs text-secondary">kWh</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-700">
              {summary.energyCoveragePct}% Cobertura
            </span>
          </div>

          {/* Card 3: Investment after Ley 57-07 */}
          <div className="bg-white border border-outline-variant/60 rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block mb-1">
              Inversión Total (Neta)
            </span>
            <span className="font-mono text-lg font-bold text-primary block">
              ${summary.netInvestmentUSD.toLocaleString()} <span className="text-xs text-secondary">USD</span>
            </span>
            <span className="text-[11px] text-amber-700 font-medium">
              Ley 57-07: -${summary.ley5707CreditUSD.toLocaleString()}
            </span>
          </div>

          {/* Card 4: Payback & TIR */}
          <div className="bg-white border border-outline-variant/60 rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block mb-1">
              Retorno (Payback / TIR)
            </span>
            <span className="font-mono text-lg font-bold text-emerald-700 block">
              {summary.paybackYears} <span className="text-xs text-secondary">años</span>
            </span>
            <span className="text-[11px] font-bold text-primary">
              TIR: {summary.irrPct}%
            </span>
          </div>

          {/* Card 5: VAN & CO2 */}
          <div className="bg-white border border-outline-variant/60 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block mb-1">
              VAN (10%) & CO₂
            </span>
            <span className="font-mono text-lg font-bold text-on-surface block">
              ${summary.npvUSD.toLocaleString()} <span className="text-xs text-secondary">USD</span>
            </span>
            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              <Leaf className="w-3 h-3" /> -{summary.co2AvoidedTonsPerYear} Tons CO₂/año
            </span>
          </div>
        </div>

        {/* Tabbed Visualizations Canvas */}
        <div className="flex-1 bg-white border border-outline-variant/60 rounded-xl shadow-sm flex flex-col overflow-hidden">
          {/* Tab Bar Header */}
          <div className="flex justify-between items-center px-6 py-3 border-b border-outline-variant/40 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('chart-monthly')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'chart-monthly'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-secondary hover:text-on-surface hover:bg-slate-200/60'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Balance Energético Mensual
              </button>

              <button
                onClick={() => setActiveTab('chart-cashflow')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'chart-cashflow'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-secondary hover:text-on-surface hover:bg-slate-200/60'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Flujo de Caja (25 Años)
              </button>

              <button
                onClick={() => setActiveTab('table-monthly')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'table-monthly'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-secondary hover:text-on-surface hover:bg-slate-200/60'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                Tabla Detallada
              </button>
            </div>

            <div className="text-xs text-secondary flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium">Cálculos en tiempo real ({'<30ms'})</span>
            </div>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 p-6 overflow-hidden">
            {activeTab === 'chart-monthly' && (
              <div className="w-full h-full flex flex-col">
                <div className="mb-2 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-on-surface">Comparativa Mensual: Consumo vs. Producción Fotovoltaica</h3>
                  <div className="text-xs text-secondary">Valores representados en kWh</div>
                </div>
                <div className="flex-1 w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val: number) => [`${val.toLocaleString()} kWh`, '']}
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="consumptionKWh" name="Consumo Red (kWh)" fill="#64748b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="solarSelfConsumedKWh" name="Autoconsumo Solar (kWh)" fill="#006c49" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="gridExportedKWh" name="Excedente Exportado (kWh)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeTab === 'chart-cashflow' && (
              <div className="w-full h-full flex flex-col">
                <div className="mb-2 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-on-surface">Evolución del Retorno Financiero Acumulado (25 Años)</h3>
                  <div className="text-xs text-emerald-700 font-semibold">Punto de Payback alcanzado en Año {summary.paybackYears}</div>
                </div>
                <div className="flex-1 w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={summary.cashFlow25Years} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                      <defs>
                        <linearGradient id="colorCashflow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: 'Años de Operación', position: 'insideBottom', offset: -15 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Retorno Acumulado']} />
                      <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Inversión Recuperada ($0)', fill: '#ef4444', fontSize: 11 }} />
                      <Area type="monotone" dataKey="cumulativeCashFlowUSD" name="Retorno Acumulado ($ USD)" stroke="#006c49" strokeWidth={2} fillOpacity={1} fill="url(#colorCashflow)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeTab === 'table-monthly' && (
              <div className="w-full h-full overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 font-bold text-on-surface border-b border-outline-variant">
                    <tr>
                      <th className="py-2.5 px-3">Mes</th>
                      <th className="py-2.5 px-3 text-right">Consumo (kWh)</th>
                      <th className="py-2.5 px-3 text-right">Producción (kWh)</th>
                      <th className="py-2.5 px-3 text-right">Autoconsumo (kWh)</th>
                      <th className="py-2.5 px-3 text-right">Exportado (kWh)</th>
                      <th className="py-2.5 px-3 text-right">Ahorro ($ USD)</th>
                      <th className="py-2.5 px-3 text-right">Factura Neta ($ USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/40">
                    {summary.monthlyBreakdown.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold">{row.month}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          <input
                            type="number"
                            value={project.monthlyConsumption[idx]}
                            onChange={(e) => updateMonthlyConsumption(idx, parseInt(e.target.value) || 0)}
                            className="w-20 text-right bg-surface border border-outline-variant rounded px-1.5 py-0.5 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{row.productionKWh.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono">{row.solarSelfConsumedKWh.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">{row.gridExportedKWh.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono text-primary font-bold">${row.savingsUSD.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">${row.netBillUSD.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
