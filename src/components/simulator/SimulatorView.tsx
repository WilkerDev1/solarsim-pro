import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { RD_PROVINCES } from '../../data/rdProvinces';
import { fetchSolarRadiationByCoordinates } from '../../services/solarRadiationApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Globe, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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

  const [activeMainTab, setActiveMainTab] = useState<'energia' | 'retorno'>('energia');
  const [isFetchingSolar, setIsFetchingSolar] = useState<boolean>(false);
  const [solarApiStatus, setSolarApiStatus] = useState<string | null>(null);

  // Auto-calculate panels logic when autoCalculatePanels is ON
  useEffect(() => {
    if (project.specs.autoCalculatePanels) {
      const annualConsumption = project.monthlyConsumption.reduce((a, b) => a + b, 0);
      const targetCoverage = project.rates.targetCoveragePct || 95;
      const targetAnnualKWh = annualConsumption * (targetCoverage / 100);
      
      // Estimated annual output per panel W based on province HSP
      const provinceObj = RD_PROVINCES.find(p => p.name === project.client.province) || RD_PROVINCES[0];
      const avgHsp = provinceObj.avgHSP || 4.91;
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

  // Handler to fetch real-time solar radiation from GPS coordinates via API
  const handleFetchSolarApi = async () => {
    const coords = project.client.coordinates || '18.4861, -69.9312';
    const parts = coords.split(',').map((s) => parseFloat(s.trim()));
    
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      setSolarApiStatus('Error: Ingresa coordenadas válidas ej: 18.4861, -69.9312');
      return;
    }

    setIsFetchingSolar(true);
    setSolarApiStatus(null);

    const res = await fetchSolarRadiationByCoordinates(parts[0], parts[1]);
    setIsFetchingSolar(false);

    if (res.success) {
      setSolarApiStatus(` Radiación solar obtenida vía API NASA/GPS (${res.avgHSP} kWh/m²/día promedio)`);
      updateClient({ customMonthlyHSP: res.monthlyHSP });
    } else {
      setSolarApiStatus(`⚠️ ${res.error}`);
    }
  };

  // Averages for Resumen de Ahorro Anual table
  const cf25 = summary.cashFlow25Years;
  const year1Savings = cf25[0]?.savingsUSD || 0;
  const avg5Savings = cf25.slice(0, 5).reduce((s, c) => s + c.savingsUSD, 0) / 5;
  const avg10Savings = cf25.slice(0, 10).reduce((s, c) => s + c.savingsUSD, 0) / 10;
  const avg25Savings = cf25.reduce((s, c) => s + c.savingsUSD, 0) / 25;

  const year1Tax = cf25[0]?.taxCreditUSD || 0;
  const avg5Tax = cf25.slice(0, 5).reduce((s, c) => s + c.taxCreditUSD, 0) / 5;
  const avg10Tax = cf25.slice(0, 10).reduce((s, c) => s + c.taxCreditUSD, 0) / 10;
  const avg25Tax = cf25.reduce((s, c) => s + c.taxCreditUSD, 0) / 25;

  // Prepare data for Beneficio Acumulado chart (including Year 0)
  const cumulativeChartData = [
    { yearLabel: '0', year: 0, cumulative: -summary.grossInvestmentUSD },
    ...cf25.map((c) => ({
      yearLabel: `${c.year}`,
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];

  // Totals for monthly energy table
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSavingsKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);
  const avgCoveragePct = summary.energyCoveragePct;

  return (
    <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-64px)] bg-slate-100">
      {/* Left Sidebar: Parameters */}
      <aside className="w-[340px] bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-y-auto shadow-sm z-10">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-slate-800 text-base mb-0.5">Parámetros</h2>
            <p className="text-xs text-slate-500">Configurar restricciones del sistema</p>
          </div>
          <select
            value={project.status}
            onChange={(e) => setProjectStatus(project.id, e.target.value as any)}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-700 focus:ring-1 focus:ring-emerald-600 shadow-xs cursor-pointer"
          >
            <option value="Draft">Borrador</option>
            <option value="Final">Finalizado</option>
            <option value="Archived">Archivado</option>
          </select>
        </div>

        <div className="p-5 space-y-6">
          {/* SECCIÓN 1: Proyecto y Cliente */}
          <section className="space-y-3">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">person</span> Proyecto y Cliente
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  value={project.client.name}
                  onChange={(e) => updateClient({ name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ubicación (Ciudad / Proyecto)</label>
                <input
                  type="text"
                  value={project.client.location}
                  onChange={(e) => updateClient({ location: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fuente de Radiación Solar</label>
                <div className="flex bg-slate-200/80 rounded-lg p-1 border border-slate-300/60 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      updateClient({
                        solarSourceMode: 'province',
                        customMonthlyHSP: undefined,
                      });
                      setSolarApiStatus(null);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                      (project.client.solarSourceMode || 'province') === 'province'
                        ? 'bg-white shadow-xs text-emerald-800 font-bold border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">map</span>
                    Provincia (Offline)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateClient({ solarSourceMode: 'gps' });
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                      project.client.solarSourceMode === 'gps'
                        ? 'bg-white shadow-xs text-emerald-800 font-bold border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    GPS Satelital (Online)
                  </button>
                </div>
              </div>

              {/* MODO 1: POR PROVINCIA (OFFLINE) */}
              {(project.client.solarSourceMode || 'province') === 'province' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Seleccionar Provincia</label>
                  <select
                    value={project.client.province}
                    onChange={(e) => {
                      const selected = e.target.value;
                      updateClient({
                        province: selected,
                        customMonthlyHSP: undefined,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer font-semibold"
                  >
                    {RD_PROVINCES.map((prov) => (
                      <option key={prov.code} value={prov.name}>
                        {prov.name} ({prov.avgHSP} HSP/día)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* MODO 2: GPS SATELITAL (ONLINE) */}
              {project.client.solarSourceMode === 'gps' && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-600">Coordenadas (Lat, Lng)</label>
                  </div>
                  <input
                    type="text"
                    value={project.client.coordinates || ''}
                    placeholder="18.4861, -69.9312"
                    onChange={(e) => updateClient({ coordinates: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleFetchSolarApi}
                    disabled={isFetchingSolar}
                    className="mt-2 w-full text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200/80 border border-emerald-300 rounded-md py-1.5 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    {isFetchingSolar ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando Satélites NASA/GPS...
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" /> Obtener Radiación Satelital Online
                      </>
                    )}
                  </button>
                  {solarApiStatus && (
                    <p className="text-[10px] font-medium text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> {solarApiStatus}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ID del Proyecto</label>
                <input
                  type="text"
                  value={project.client.projectId}
                  onChange={(e) => updateClient({ projectId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 2: Tarifas y Distribuidora */}
          <section className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">payments</span> Tarifas y Distribuidora
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Precio por kWh ($ USD)</label>
                <input
                  type="number"
                  step="0.001"
                  value={project.rates.energyCostPerKWh}
                  onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Empresa Distribuidora</label>
                <select
                  value={project.rates.distributor || 'EDESUR'}
                  onChange={(e) => updateRates({ distributor: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer"
                >
                  <option value="EDEESTE">EDEESTE</option>
                  <option value="EDESUR">EDESUR</option>
                  <option value="EDENORTE">EDENORTE</option>
                  <option value="CEPM">CEPM</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cobertura Objetivo (%)</label>
                <input
                  type="number"
                  step="1"
                  value={project.rates.targetCoveragePct ?? 95}
                  onChange={(e) => updateRates({ targetCoveragePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Tarifa</label>
                <select
                  value={project.rates.tariffCode || 'BTS2'}
                  onChange={(e) => updateRates({ tariffCode: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer"
                >
                  <option value="BTS1">BTS1</option>
                  <option value="BTS2">BTS2</option>
                  <option value="MTD">MTD</option>
                  <option value="BTD">BTD</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cargo Exportación Red (%) (SIE-007-2026-REG)</label>
                <input
                  type="number"
                  step="1"
                  value={project.rates.gridExportFeePct}
                  onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 3: Equipamiento */}
          <section className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">solar_power</span> Equipamiento
            </h3>

            {/* Selector de modo Simple / Detallado */}
            <div className="flex bg-slate-200/80 rounded-lg p-1 mb-4 border border-slate-300/60">
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: false })}
                className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center ${
                  !project.specs.isDetailed
                    ? 'bg-white shadow-xs text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: true })}
                className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center ${
                  project.specs.isDetailed
                    ? 'bg-white shadow-xs text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Detallado
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Potencia del Panel (W)</label>
                <input
                  type="number"
                  step="5"
                  value={project.specs.panelPowerW}
                  onChange={(e) => updateSpecs({ panelPowerW: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              {/* MODO DETALLADO (AVANZADO) */}
              {project.specs.isDetailed && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Eficiencia del Panel (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={project.specs.panelEfficiency || 21.8}
                      onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Coeficiente de Temp. (%/°C)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={project.specs.tempCoeff || -0.35}
                      onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Potencia del Inversor (kW AC)</label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.inverterPowerKW}
                      onChange={(e) => updateSpecs({ inverterPowerKW: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>
                </>
              )}

              {/* Auto-Calcular Paneles Toggle */}
              <div className="pb-1">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                    Auto-Calcular Paneles
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.specs.autoCalculatePanels ?? false}
                      onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {project.specs.autoCalculatePanels ? 'Cantidad de Paneles (Auto-calculada)' : 'Cantidad de Paneles'}
                </label>
                <input
                  type="number"
                  step="1"
                  readOnly={project.specs.autoCalculatePanels}
                  value={project.specs.panelCount}
                  onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
                  className={`w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all ${
                    project.specs.autoCalculatePanels ? 'opacity-80 bg-slate-100 cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Precio del Sistema por Vatio ($ USD/Wp)</label>
                <input
                  type="number"
                  step="0.01"
                  value={project.specs.pricePerWattUSD || project.financials.pricePerWattUSD}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    updateSpecs({ pricePerWattUSD: val });
                    updateFinancials({ pricePerWattUSD: val, customCostUSD: undefined });
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Almacenamiento (Batería) Toggle */}
              <div className="pt-1">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                    Almacenamiento (Batería)
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.specs.hasBattery}
                      onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
                  </div>
                </label>
              </div>

              {/* BATERÍA DETAILS */}
              {project.specs.hasBattery && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad de Baterías</label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.batteryCount || 3}
                      onChange={(e) => updateSpecs({ batteryCount: parseInt(e.target.value) || 1 })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Capacidad Total Batería (kWh)</label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.batteryCapacityKWh}
                      onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Precio de Batería ($ USD)</label>
                    <input
                      type="number"
                      step="50"
                      value={project.specs.batteryCostUSD || 0}
                      onChange={(e) => updateSpecs({ batteryCostUSD: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                    />
                  </div>

                  {project.specs.isDetailed && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Profundidad de Descarga (DOD %)</label>
                      <input
                        type="number"
                        step="1"
                        value={project.specs.batteryDOD || 80}
                        onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tarjeta de Vista Previa en Vivo */}
              <div className="mt-4 p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-medium text-slate-600">Potencia Total DC:</span>
                  <span className="text-[12px] font-bold text-emerald-800">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
                </div>
                {project.specs.hasBattery && summary.batteryInvestmentUSD > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-medium text-slate-600">Costo Batería:</span>
                    <span className="text-[12px] font-semibold text-emerald-700">
                      +${summary.batteryInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-emerald-200/60 pt-1">
                  <span className="text-[11px] font-medium text-slate-600">Inversión Estimada:</span>
                  <span className="text-[12px] font-bold text-emerald-800">
                    ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECCIÓN 4: Finanzas e Incentivos */}
          <section className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">account_balance</span> Finanzas e Incentivos
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
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
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
                </div>
              </label>

              {project.financials.applyLey5707 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monto Crédito Ley 57-07 ($ USD)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder={`Calculado: $${summary.ley5707CreditUSD}`}
                    value={project.financials.customLey5707CreditUSD ?? ''}
                    onChange={(e) => updateFinancials({ customLey5707CreditUSD: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                </div>
              )}

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                  Exoneración de ITBIS (18%)
                </span>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.financials.applyITBISExemption}
                    onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
                </div>
              </label>

              {project.financials.applyITBISExemption && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monto ITBIS Exonerado ($ USD)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder={`Calculado: $${summary.itbisSavedUSD}`}
                    value={project.financials.customITBISSavedUSD ?? ''}
                    onChange={(e) => updateFinancials({ customITBISSavedUSD: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Años de Proyección</label>
                <input
                  type="number"
                  step="1"
                  value={project.financials.projectLifespanYears}
                  onChange={(e) => updateFinancials({ projectLifespanYears: parseInt(e.target.value) || 25 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tasa de Descuento (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={project.financials.discountRatePct}
                  onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 5: Parámetros Técnicos y Pérdidas */}
          <section className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">settings_suggest</span> Parámetros Técnicos y Pérdidas
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pérdidas del Sistema (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={project.specs.systemLosses}
                  onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Degradación Anual (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={project.specs.annualDegradation}
                  onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Factor CO₂ (kg/kWh)</label>
                <input
                  type="number"
                  step="0.001"
                  value={project.financials.co2FactorKgPerKWh}
                  onChange={(e) => updateFinancials({ co2FactorKgPerKWh: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-auto p-5 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => {
              useSimulationStore.setState({ activeProjectId: project.id });
            }}
            className="w-full bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 transition-colors py-2 rounded-lg text-xs flex items-center justify-center gap-2 font-semibold shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Actualizar Simulación
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6">
        {/* Top View Selector Tabs (Análisis de Energía | Retorno de Inversión) */}
        <div className="bg-white border-b border-slate-200 -mx-6 -mt-6 px-6 pt-3 pb-0 sticky top-0 z-20 shadow-xs flex justify-between items-center">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveMainTab('energia')}
              className={`pb-3 text-sm font-bold transition-all relative ${
                activeMainTab === 'energia'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Análisis de Energía
            </button>

            <button
              onClick={() => setActiveMainTab('retorno')}
              className={`pb-3 text-sm font-bold transition-all relative ${
                activeMainTab === 'retorno'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Retorno de Inversión
            </button>
          </div>

          <div className="pb-3 text-xs text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Simulador Interactivo Pro</span>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* DEDICATED HEADER 1: ANÁLISIS DE ENERGÍA (ENERGY METRICS) */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'energia' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Card 1: CAPACIDAD INSTALADA */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                CAPACIDAD INSTALADA
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
                <span className="text-xs text-slate-500 font-semibold">kWp</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
              </span>
            </div>

            {/* Card 2: GENERACIÓN ANUAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                GENERACIÓN ANUAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">kWh</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                {summary.energyCoveragePct}% Cobertura Solar
              </span>
            </div>

            {/* Card 3: CONSUMO ANUAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                CONSUMO ANUAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-slate-900">{summary.annualConsumptionKWh.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">kWh</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                Prom: {Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh/mes
              </span>
            </div>

            {/* Card 4: AHORRO ENERGÉTICO ANUAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                AHORRO ENERGÉTICO ANUAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-700">${summary.year1SavingsUSD.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">USD</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                Autoconsumo solar en factura
              </span>
            </div>

            {/* Card 5: IMPACTO AMBIENTAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                IMPACTO AMBIENTAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-800">-{summary.co2AvoidedTonsPerYear}</span>
                <span className="text-xs text-slate-500 font-semibold">Tons CO₂</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                🌱 Reducción CO₂ por año
              </span>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* DEDICATED HEADER 2: RETORNO DE INVERSIÓN (FINANCIAL & INCENTIVES) */}
        {/* Exact Match to Imagen 1 format requested by user */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'retorno' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Card 1: CAPACIDAD DC */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                CAPACIDAD DC
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
                <span className="text-xs text-slate-500 font-semibold">kWp</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
              </span>
            </div>

            {/* Card 2: GENERACIÓN ANUAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                GENERACIÓN ANUAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">kWh</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                {summary.energyCoveragePct}% Cobertura
              </span>
            </div>

            {/* Card 3: INVERSIÓN TOTAL (NETA) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                INVERSIÓN TOTAL (NETA)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-700">${summary.netInvestmentUSD.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">USD</span>
              </div>
              <span className="text-[11px] text-amber-700 font-bold block mt-0.5">
                Ley 57-07: -${summary.ley5707CreditUSD.toLocaleString()} USD
              </span>
            </div>

            {/* Card 4: RETORNO (PAYBACK / TIR) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                RETORNO (PAYBACK / TIR)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-emerald-700">{summary.paybackYears}</span>
                <span className="text-xs text-slate-500 font-semibold">años</span>
              </div>
              <span className="text-[11px] text-emerald-800 font-bold block mt-0.5">
                TIR: {summary.irrPct}%
              </span>
            </div>

            {/* Card 5: VAN (10%) & CO2 */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                VAN ({project.financials.discountRatePct}%) & CO₂
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold text-slate-900">${summary.npvUSD.toLocaleString()}</span>
                <span className="text-xs text-slate-500 font-semibold">USD</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                🌱 -{summary.co2AvoidedTonsPerYear} Tons CO₂/año
              </span>
            </div>
          </div>
        )}

        {/* VISTA 1: ANÁLISIS DE ENERGÍA */}
        {activeMainTab === 'energia' && (
          <div className="space-y-6 pb-12">
            {/* Chart Container: Evolución Mensual de Energía */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Evolución Mensual de Energía</h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#2d5f47]"></span>
                    <span className="text-slate-600 font-medium">Consumo</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#38a169]"></span>
                    <span className="text-slate-600 font-medium">Producción</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#a7f3d0]"></span>
                    <span className="text-slate-600 font-medium">Ahorro</span>
                  </div>
                </div>
              </div>

              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(val: number) => [`${val.toLocaleString()} kWh`, '']}
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                    <Bar dataKey="consumptionKWh" name="Consumo" fill="#2d5f47" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="productionKWh" name="Producción" fill="#38a169" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="solarSelfConsumedKWh" name="Ahorro" fill="#a7f3d0" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Table Container: Tabla Mensual de Energía (Editable) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#2d5f47] text-white font-bold tracking-wider uppercase">
                  <tr>
                    <th className="py-3 px-4 w-[20%]">MES</th>
                    <th className="py-3 px-4 text-right w-[20%]">CONSUMO kWh/mes</th>
                    <th className="py-3 px-4 text-right w-[20%]">PRODUCCIÓN kWh/mes</th>
                    <th className="py-3 px-4 text-right w-[20%]">AHORRO ENERG. (kWh)</th>
                    <th className="py-3 px-4 text-right w-[20%]">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-slate-700">
                  {summary.monthlyBreakdown.map((row, idx) => {
                    const monthCoverage = row.consumptionKWh > 0
                      ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100)
                      : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">{row.month}</td>
                        <td className="py-2.5 px-4 text-right">
                          <input
                            type="number"
                            value={project.monthlyConsumption[idx]}
                            onChange={(e) => updateMonthlyConsumption(idx, parseInt(e.target.value) || 0)}
                            className="w-24 text-right bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium">{row.productionKWh.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right font-medium">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                        <td className={`py-2.5 px-4 text-right font-bold ${monthCoverage >= 100 ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {monthCoverage.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-[#dbeafe] text-slate-900 font-bold border-t-2 border-slate-300 text-xs font-mono">
                  <tr>
                    <td className="py-3 px-4 font-sans">TOTAL</td>
                    <td className="py-3 px-4 text-right">{totalConsumptionKWh.toLocaleString()} kWh</td>
                    <td className="py-3 px-4 text-right">{totalProductionKWh.toLocaleString()} kWh</td>
                    <td className="py-3 px-4 text-right">{totalSavingsKWh.toLocaleString()} kWh</td>
                    <td className="py-3 px-4 text-right text-emerald-800">{avgCoveragePct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* VISTA 2: RETORNO DE INVERSIÓN */}
        {activeMainTab === 'retorno' && (
          <div className="space-y-6 pb-12">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Proyección Financiera (25 Años)</h2>

            {/* TABLA 1: Cálculo de Ahorro y Retorno de Inversión */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Cálculo de Ahorro y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[35%]">Parámetro</th>
                    <th className="py-2.5 px-4 text-right w-[25%]">Valor</th>
                    <th className="py-2.5 px-4 w-[40%]">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Cliente</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold uppercase">{project.client.name}</td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono">{project.client.projectId} | {project.client.location}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Potencia instalada (DC)</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                    <td className="py-2.5 px-4 text-slate-500">{project.specs.panelCount} paneles {project.specs.panelPowerW}W</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Producción Est. Anual</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{summary.annualProductionKWh.toLocaleString()} kWh/año</td>
                    <td className="py-2.5 px-4 text-slate-500">Irradiación promedio RD ({project.client.province})</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Cobertura del consumo</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">{summary.energyCoveragePct.toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-slate-500">Sistema cubre {summary.energyCoveragePct}% del consumo mensual</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Consumo mensual cliente</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh/mes</td>
                    <td className="py-2.5 px-4 text-slate-500">Fuente: Historial de facturación</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Vida útil del sistema</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{project.financials.projectLifespanYears} años</td>
                    <td className="py-2.5 px-4 text-slate-500">Garantía productiva de paneles</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Degradación anual paneles</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{project.specs.annualDegradation || 0.5}%</td>
                    <td className="py-2.5 px-4 text-slate-500">Tasa estándar fabricante</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Precio actual kWh ({project.rates.distributor || 'EDESUR'})</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">${project.rates.energyCostPerKWh} USD/kWh</td>
                    <td className="py-2.5 px-4 text-slate-500">Estimado según tarifa cliente</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Inversión total del sistema</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</td>
                    <td className="py-2.5 px-4 text-slate-500">Precio con Ley 57-07 aplicada</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">ITBIS descontado Ley 57-07</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</td>
                    <td className="py-2.5 px-4 text-slate-500">Exoneración ITBIS 18%</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Incentivo fiscal DGII (40%)</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</td>
                    <td className="py-2.5 px-4 text-slate-500">Crédito fiscal 3 años</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">Precio por Watt instalado</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">${project.specs.pricePerWattUSD || project.financials.pricePerWattUSD} USD/W</td>
                    <td className="py-2.5 px-4 text-slate-500">Competitividad de precio</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLA 2: Resumen de Ahorro Anual y Retorno de Inversión */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Resumen de Ahorro Anual y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[30%]">Descripción</th>
                    <th className="py-2.5 px-4 text-right w-[14%]">Año 1</th>
                    <th className="py-2.5 px-4 text-right w-[14%]">Promedio 5 Años</th>
                    <th className="py-2.5 px-4 text-right w-[14%]">Promedio 10 Años</th>
                    <th className="py-2.5 px-4 text-right w-[14%]">Promedio 25 Años</th>
                    <th className="py-2.5 px-4 w-[14%]">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Energía Generada x Tarifa (USD/año)</td>
                    <td className="py-2.5 px-4 text-right">${year1Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right">${avg5Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right">${avg10Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right">${avg25Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Producción año N x tarifa USD/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Incentivo Fiscal DGII Ley 57-07 (USD/año)</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${year1Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${avg5Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">$0.00</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">$0.00</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Crédito DGII aplicable primeros 3 años</td>
                  </tr>
                </tbody>
                <tfoot className="bg-[#dbeafe] text-slate-900 font-bold border-t-2 border-slate-300 text-xs font-mono">
                  <tr>
                    <td className="py-3 px-4 font-sans">AHORRO TOTAL ANUAL (USD)</td>
                    <td className="py-3 px-4 text-right">${(year1Savings + year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-right">${(avg5Savings + avg5Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-right">${(avg10Savings + avg10Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-right">${(avg25Savings + avg25Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 font-sans text-[11px]">Energía + incentivo fiscal</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* GRÁFICA: Beneficio Acumulado (USD) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Beneficio Acumulado (USD)</h3>
              </div>

              <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="yearLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                    <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                      {cumulativeChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.cumulative < 0 ? '#e53e3e' : '#006c49'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABLA 3: Flujo de Caja y Beneficios Acumulados (25 Años) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Flujo de Caja y Beneficios Acumulados (25 Años)
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[8%] text-center">Año</th>
                    <th className="py-2.5 px-4 text-right w-[16%]">Energía Generada (kWh)</th>
                    <th className="py-2.5 px-4 text-right w-[16%]">Ahorro Energía (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Incentivo Fiscal (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Ahorro Anual Total (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Cash Flow (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Beneficio Acumulado (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-mono">
                  {/* Fila Año 0 */}
                  <tr className="hover:bg-slate-50 font-bold bg-slate-50/50">
                    <td className="py-2.5 px-4 text-center font-sans">0</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>

                  {/* Filas Año 1 a 25 */}
                  {cf25.map((row) => {
                    const totalAnnualSavings = row.savingsUSD + row.taxCreditUSD;
                    const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;
                    const isCashFlowNegative = row.netCashFlowUSD < 0;

                    return (
                      <tr key={row.year} className="hover:bg-slate-50">
                        <td className="py-2 px-4 text-center font-sans font-semibold">{row.year}</td>
                        <td className="py-2 px-4 text-right">{row.productionKWh.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-4 text-right text-emerald-700">
                          {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00'}
                        </td>
                        <td className="py-2 px-4 text-right font-semibold">${totalAnnualSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className={`py-2 px-4 text-right font-semibold ${isCashFlowNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                          {row.netCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.netCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-2 px-4 text-right font-bold ${isCumulativeNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                          {row.cumulativeCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TABLA 4: Indicadores Financieros del Proyecto */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Indicadores Financieros del Proyecto
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[40%]">Indicador</th>
                    <th className="py-2.5 px-4 text-right w-[20%]">Valor</th>
                    <th className="py-2.5 px-4 w-[40%]">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Payback (Periodo de Recuperación)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.paybackYears}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Años hasta recuperar la inversión inicial</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">TIR (Tasa Interna de Retorno)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.irrPct}%</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Rendimiento anual del proyecto</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">VAN a tasa descuento {project.financials.discountRatePct}%</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Valor actual neto — positivo = proyecto viable</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Ahorro Total 25 Años</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Beneficio acumulado al final del periodo</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">ROI Total del Proyecto</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.roi25YrPct}%</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Retorno sobre inversión total en 25 años</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Reducción CO2 estimada (25 años)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{(summary.co2AvoidedTonsPerYear * 25).toFixed(2)} Ton</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Factor emisión red RD: {project.financials.co2FactorKgPerKWh || 0.481} kg CO2/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">Precio por Watt instalado</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(2)} USD/W</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px]">Competitividad vs mercado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
