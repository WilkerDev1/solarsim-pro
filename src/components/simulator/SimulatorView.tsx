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
import { Globe, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Check, Package, FileText } from 'lucide-react';

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

  const [activeMainTab, setActiveMainTab] = useState<'energia' | 'cotizacion' | 'retorno'>('energia');
  const [isFetchingSolar, setIsFetchingSolar] = useState<boolean>(false);
  const [solarApiStatus, setSolarApiStatus] = useState<string | null>(null);

  // Auto-calculate panels logic when autoCalculatePanels is ON
  useEffect(() => {
    if (project.specs.autoCalculatePanels) {
      const annualConsumption = project.monthlyConsumption.reduce((a, b) => a + b, 0);
      const targetCoverage = project.rates.targetCoveragePct || 95;
      const targetAnnualKWh = annualConsumption * (targetCoverage / 100);
      
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

  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-64px)] bg-slate-100 font-sans">
      {/* Left Sidebar: Parameters */}
      <aside className="w-[340px] bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-y-auto shadow-sm z-10">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">Parámetros</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Configurar restricciones del sistema</p>
          </div>
          <select
            value={project.status}
            onChange={(e) => setProjectStatus(project.id, e.target.value as any)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer shadow-xs"
          >
            <option value="Draft">Borrador</option>
            <option value="Final">Finalizado</option>
            <option value="Archived">Archivado</option>
          </select>
        </div>

        <div className="p-5 space-y-6 flex-1">
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all font-semibold"
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección del Cliente</label>
                <input
                  type="text"
                  value={project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}
                  onChange={(e) => updateClient({ address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Selector de Fuente de Radiación Solar: Provincia vs GPS Satelital */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fuente de Radiación Solar</label>
                <div className="flex bg-slate-200/80 rounded-lg p-1 border border-slate-300/60">
                  <button
                    type="button"
                    onClick={() => updateClient({ solarSourceMode: 'province' })}
                    className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      (project.client.solarSourceMode || 'province') === 'province'
                        ? 'bg-white shadow-xs text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">map</span> Provincia (Offline)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateClient({ solarSourceMode: 'gps' })}
                    className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      project.client.solarSourceMode === 'gps'
                        ? 'bg-white shadow-xs text-emerald-800 font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> GPS Satelital (Online)
                  </button>
                </div>
              </div>

              {/* Opción 1: Selección por Provincia */}
              {(project.client.solarSourceMode || 'province') === 'province' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Seleccionar Provincia</label>
                  <select
                    value={project.client.province}
                    onChange={(e) => {
                      updateClient({
                        province: e.target.value,
                        customMonthlyHSP: undefined,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer font-semibold"
                  >
                    {RD_PROVINCES.map((prov) => (
                      <option key={prov.code} value={prov.name}>
                        {prov.name} ({prov.avgHSP} HSP)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Opción 2: Obtener por GPS / Coordenadas */}
              {project.client.solarSourceMode === 'gps' && (
                <div className="space-y-2 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                  <label className="block text-xs font-semibold text-emerald-900">Coordenadas GPS (Latitud, Longitud)</label>
                  <input
                    type="text"
                    value={project.client.coordinates || '18.4861, -69.9312'}
                    onChange={(e) => updateClient({ coordinates: e.target.value })}
                    placeholder="18.4861, -69.9312"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleFetchSolarApi}
                    disabled={isFetchingSolar}
                    className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {isFetchingSolar ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Obteniendo de NASA...
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ID del Proyecto</label>
                  <input
                    type="text"
                    value={project.client.projectId}
                    onChange={(e) => updateClient({ projectId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">N° Cotización</label>
                  <input
                    type="text"
                    value={project.client.quoteNumber || 'C-0030'}
                    onChange={(e) => updateClient({ quoteNumber: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                  />
                </div>
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Empresa Distribuidora</label>
                <select
                  value={project.rates.distributor || 'EDESUR'}
                  onChange={(e) => updateRates({ distributor: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer font-semibold"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Tarifa</label>
                <select
                  value={project.rates.tariffCode || 'BTS2'}
                  onChange={(e) => updateRates({ tariffCode: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all cursor-pointer font-semibold"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>
            </div>
          </section>

          {/* SECCIÓN 3: Equipamiento */}
          <section className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-emerald-700 flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">solar_power</span> Equipamiento y Marcas
            </h3>

            {/* Selector de modo Simple / Detallado */}
            <div className="flex bg-slate-200/80 rounded-lg p-1 mb-4 border border-slate-300/60">
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: false })}
                className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center ${
                  !project.specs.isDetailed
                    ? 'bg-white shadow-xs text-slate-900 font-bold'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => updateSpecs({ isDetailed: true })}
                className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center ${
                  project.specs.isDetailed
                    ? 'bg-white shadow-xs text-slate-900 font-bold'
                    : 'text-slate-600 hover:text-slate-900 font-semibold'
                }`}
              >
                Detallado
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Modelo / Marca Módulos</label>
                <input
                  type="text"
                  value={project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}
                  onChange={(e) => updateSpecs({ panelBrandModel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Potencia del Panel (W)</label>
                <input
                  type="number"
                  step="5"
                  value={project.specs.panelPowerW}
                  onChange={(e) => updateSpecs({ panelPowerW: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Toggle Auto-Calcular Paneles */}
              <div className="flex items-center justify-between p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-lg">
                <span className="text-xs font-semibold text-emerald-950">Auto-Calcular Paneles</span>
                <input
                  type="checkbox"
                  checked={!!project.specs.autoCalculatePanels}
                  onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                  className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad de Paneles</label>
                <input
                  type="number"
                  step="1"
                  disabled={project.specs.autoCalculatePanels}
                  value={project.specs.panelCount}
                  onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Modelo / Marca Inversor</label>
                <input
                  type="text"
                  value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
                  onChange={(e) => updateSpecs({ inverterBrandModel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Precio Sistema por Vatio ($ USD/Wp)</label>
                <input
                  type="number"
                  step="0.01"
                  value={project.specs.pricePerWattUSD}
                  onChange={(e) => updateSpecs({ pricePerWattUSD: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Almacenamiento (Batería) Toggle & Campos */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Almacenamiento (Batería)</label>
                  <input
                    type="checkbox"
                    checked={project.specs.hasBattery}
                    onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                  />
                </div>

                {project.specs.hasBattery && (
                  <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Modelo / Marca Batería</label>
                      <input
                        type="text"
                        value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                        onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad de Baterías</label>
                      <input
                        type="number"
                        step="1"
                        value={project.specs.batteryCount || 3}
                        onChange={(e) => updateSpecs({ batteryCount: parseInt(e.target.value) || 1 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Capacidad Total Batería (kWh)</label>
                      <input
                        type="number"
                        step="1"
                        value={project.specs.batteryCapacityKWh}
                        onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
                      />
                    </div>
                  </div>
                )}
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
                <input
                  type="checkbox"
                  checked={project.financials.applyLey5707}
                  onChange={(e) => updateFinancials({ applyLey5707: e.target.checked })}
                  className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Tasa de Descuento (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={project.financials.discountRatePct}
                  onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
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
        {/* Top View Selector Tabs (3 VISTAS: Análisis de Energía | Cotización y Equipos | Retorno de Inversión) */}
        <div className="bg-white border-b border-slate-200 -mx-6 -mt-6 px-6 pt-3 pb-0 sticky top-0 z-20 shadow-xs flex justify-between items-center">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveMainTab('energia')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'energia'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Análisis de Energía
            </button>

            <button
              onClick={() => setActiveMainTab('cotizacion')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'cotizacion'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cotización y Equipos
            </button>

            <button
              onClick={() => setActiveMainTab('retorno')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'retorno'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Retorno de Inversión
            </button>
          </div>

          <div className="pb-3 text-xs text-slate-500 flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Simulador Interactivo Pro</span>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* VISTA 1: ANÁLISIS DE ENERGÍA */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'energia' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Card 1: CAPACIDAD INSTALADA */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  CAPACIDAD INSTALADA
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
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
                  <span className="text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
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
                  <span className="text-xl font-bold text-slate-900">{summary.annualConsumptionKWh.toLocaleString()}</span>
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
                  <span className="text-xl font-bold text-emerald-700">${summary.year1SavingsUSD.toLocaleString()}</span>
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
                  <span className="text-xl font-bold text-emerald-800">-{summary.co2AvoidedTonsPerYear}</span>
                  <span className="text-xs text-slate-500 font-semibold">Tons CO₂</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                  🌱 Reducción CO₂ por año
                </span>
              </div>
            </div>

            {/* GRÁFICA DE ENERGÍA */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Evolución Mensual de Energía
                </h3>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#14532d]"></span>
                    <span className="text-slate-700">Consumo (kWh)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
                    <span className="text-slate-700">Producción Solar (kWh)</span>
                  </div>
                </div>
              </div>

              <div className="h-[300px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
                    <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />
                    <Bar dataKey="consumptionKWh" name="Consumo" fill="#14532d" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="productionKWh" name="Producción" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABLA DE DETALLE MENSUAL EDITABLE */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#14532d] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Resumen Mensual de Energía
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">MES</th>
                    <th className="py-2.5 px-4 text-center">CONSUMO KWH/MES</th>
                    <th className="py-2.5 px-4 text-right">PRODUCCIÓN KWH/MES</th>
                    <th className="py-2.5 px-4 text-right">AHORRO ENERG. (KWH)</th>
                    <th className="py-2.5 px-4 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  {summary.monthlyBreakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-bold text-slate-800">{row.month}</td>
                      <td className="py-2 px-4 text-center">
                        <input
                          type="number"
                          value={project.monthlyConsumption[idx]}
                          onChange={(e) => updateMonthlyConsumption(idx, parseFloat(e.target.value) || 0)}
                          className="w-24 text-center bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 transition-all"
                        />
                      </td>
                      <td className="py-2 px-4 text-right font-semibold">{row.productionKWh.toFixed(1)}</td>
                      <td className="py-2 px-4 text-right font-semibold">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                      <td className="py-2 px-4 text-right text-emerald-700 font-bold">
                        {row.consumptionKWh > 0 ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-50/80 font-bold text-slate-900 border-t-2 border-emerald-200">
                  <tr>
                    <td className="py-3 px-4 uppercase font-extrabold">TOTAL</td>
                    <td className="py-3 px-4 text-center font-bold">{totalConsumptionKWh.toLocaleString()} kWh</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-800">{totalProductionKWh.toFixed(1)} kWh</td>
                    <td className="py-3 px-4 text-right font-bold">{totalSavingsKWh.toFixed(1)} kWh</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-800">{avgCoveragePct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ---------------------------------------------------- */}
        {/* VISTA 2: COTIZACIÓN Y EQUIPOS */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'cotizacion' && (
          <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">N° COTIZACIÓN</span>
                <span className="text-lg font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">POTENCIA FOTOVOLTAICA</span>
                <span className="text-lg font-bold text-emerald-800">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">INVERSIÓN NETA (LEY 57-07)</span>
                <span className="text-lg font-bold text-emerald-700">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">VALIDEZ OFERTA</span>
                <span className="text-lg font-bold text-amber-700">{project.client.quoteValidityDays || 7} Días</span>
              </div>
            </div>

            {/* Complete Interactive Invoice Proposal View */}
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans">
              {/* Header Electsun Dark Green Banner */}
              <div className="bg-[#14532d] text-white px-8 py-5 flex justify-between items-center">
                <div>
                  <h2 className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                    PROPUESTA TÉCNICA Y ECONÓMICA • ID: {project.client.projectId || 'SP-2024-089'}
                  </h2>
                  <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-0.5">
                    {project.client.name} — {summary.systemCapacityKWp.toFixed(2)}kWp
                  </h1>
                  <p className="text-[11px] text-emerald-200 mt-0.5">
                    Ubicación: <span className="font-semibold text-white">{project.client.province || project.client.location}</span> | Fecha: <span className="font-semibold text-white">{currentDateStr}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5 justify-end">
                    <span className="w-3.5 h-3.5 bg-emerald-400 rounded-full inline-block"></span> electsun
                  </div>
                  <p className="text-[10px] text-emerald-200 tracking-wider font-semibold">EL SOL A TU FAVOR</p>
                </div>
              </div>

              <div className="bg-[#1e6a3b] text-center text-white py-1.5 font-bold text-xs uppercase tracking-wider">
                COTIZACIÓN DE SISTEMA FOTOVOLTAICO
              </div>

              <div className="p-8 space-y-6 text-xs text-slate-800">
                {/* DATOS DEL CLIENTE */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-xs font-bold text-[#14532d] uppercase border-l-4 border-[#14532d] mb-2">
                    DATOS DEL CLIENTE :
                  </h3>
                  <div className="grid grid-cols-2 gap-4 px-2 text-xs">
                    <div className="space-y-1.5">
                      <div><span className="font-bold text-slate-600">Cliente:</span> <span className="font-bold text-slate-900">{project.client.name}</span></div>
                      <div><span className="font-bold text-slate-600">Contacto:</span> {project.client.company || project.client.name}</div>
                      <div><span className="font-bold text-slate-600">Teléfono:</span> {project.client.contactPhone || '809-555-0199'}</div>
                      <div><span className="font-bold text-slate-600">Dirección:</span> {project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}</div>
                    </div>
                    <div className="space-y-1.5 text-right">
                      <div><span className="font-bold text-slate-600">N° Cotización:</span> <span className="font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span></div>
                      <div><span className="font-bold text-slate-600">Fecha:</span> <span className="font-semibold text-slate-800">{currentDateStr}</span></div>
                      <div><span className="font-bold text-slate-600">Válido por:</span> <span className="font-bold text-emerald-700">{project.client.quoteValidityDays || 7} Días</span></div>
                    </div>
                  </div>
                </div>

                {/* ESPECIFICACIONES DEL SISTEMA */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-xs font-bold text-[#14532d] uppercase border-l-4 border-[#14532d] mb-2">
                    ESPECIFICACIONES DEL SISTEMA
                  </h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                    <div className="space-y-1">
                      <div><span className="font-bold text-slate-700">Potencia (kW-dc):</span> <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)}</span></div>
                      <div><span className="font-bold text-slate-700">Tipo de instalación:</span> Fotovoltaica</div>
                    </div>
                    <div className="text-right space-y-1">
                      <div><span className="font-bold text-slate-700">Consumo mensual estimado (kWh):</span> <span className="font-bold text-slate-900">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()}</span></div>
                      <div><span className="font-bold text-slate-700">EDES / Distribuidor:</span> <span className="font-bold text-[#14532d]">{project.client.distributor || 'EDEESTE'}</span></div>
                    </div>
                  </div>
                </div>

                {/* EQUIPOS Y MATERIALES */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-xs font-bold text-[#14532d] uppercase border-l-4 border-[#14532d] mb-2">
                    EQUIPOS Y MATERIALES
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#14532d] text-white font-bold text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2.5">DESCRIPCION</th>
                          <th className="px-4 py-2.5 text-center w-24">CANT.</th>
                          <th className="px-4 py-2.5 text-center w-24">UNIDAD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs text-slate-800 font-semibold">
                        <tr className="bg-white">
                          <td className="px-4 py-2.5">{project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}</td>
                          <td className="px-4 py-2.5 text-center font-bold">{project.specs.panelCount}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-4 py-2.5">{project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}</td>
                          <td className="px-4 py-2.5 text-center font-bold">{project.specs.inverterCount || 2}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                        {project.specs.hasBattery && (
                          <tr className="bg-white">
                            <td className="px-4 py-2.5">{project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}</td>
                            <td className="px-4 py-2.5 text-center font-bold">{project.specs.batteryCount || 3}</td>
                            <td className="px-4 py-2.5 text-center text-slate-500 font-normal">UD</td>
                          </tr>
                        )}
                        <tr className="bg-slate-50/60">
                          <td className="px-4 py-2.5">{project.specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'}</td>
                          <td className="px-4 py-2.5 text-center font-bold">1</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DESGLOSE FINANCIERO */}
                <div className="flex justify-end">
                  <div className="w-[420px] bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-700 font-semibold">
                      <span>SUB-TOTAL (USD) SIN ITBIS :</span>
                      <span className="font-bold">${(summary.grossInvestmentUSD / 1.18).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 bg-slate-200/80 px-3 py-1.5 rounded-md font-bold text-sm">
                      <span>TOTAL GENERAL (USD) :</span>
                      <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>ITBIS A DESCONTAR LEY 57-07 US$ :</span>
                      <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-white bg-[#14532d] px-3 py-1.5 rounded-md font-bold text-sm">
                      <span>TOTAL GENERAL LEY 57-07 :</span>
                      <span>${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-800 pt-1.5 border-t border-slate-300">
                      <span className="font-bold">PRECIO POR WATT (USD/W):</span>
                      <span className="font-bold text-[#14532d]">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || 1.13).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* INCENTIVOS DE LEY 57-07 */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-xs font-bold text-[#14532d] uppercase border-l-4 border-[#14532d] mb-1">
                    INCENTIVOS DE LEY 57-07
                  </h3>
                  <p className="text-xs text-amber-800 font-bold bg-amber-50 border border-amber-200 px-3 py-1 rounded-md mb-2">
                    (Descuento de 40% para equipos energía renovables: Paneles solares, inversores y baterías)
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#14532d] text-white font-bold text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2.5">CONCEPTO</th>
                          <th className="px-4 py-2.5 text-right">VALOR US $</th>
                          <th className="px-4 py-2.5 text-right w-24">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs text-slate-800 font-semibold">
                        <tr className="bg-white font-bold">
                          <td className="px-4 py-2">TOTAL EQUIPOS ENERGIAS RENOVABLES (PANELES-INVERSORES-BATERIAS)</td>
                          <td className="px-4 py-2 text-right">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right">100%</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-4 py-2">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 1ER AÑO</td>
                          <td className="px-4 py-2 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 2DO AÑO</td>
                          <td className="px-4 py-2 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-4 py-2">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 3ER AÑO</td>
                          <td className="px-4 py-2 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-emerald-50 text-[#14532d] font-bold">
                          <td className="px-4 py-2">TOTAL A DESCONTAR POR LA LEY 57-07 (40% DEL TOTAL)</td>
                          <td className="px-4 py-2 text-right text-emerald-800">${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-emerald-800">40.00%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs">
                    <h4 className="font-bold text-[#14532d] border-b border-slate-200 pb-1.5 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> GARANTÍAS
                    </h4>
                    <div>• <span className="font-bold">Paneles Solares:</span> 25 años (80.7% potencia mínima garantizada)</div>
                    <div>• <span className="font-bold">Inversor:</span> 5 años</div>
                    <div>• <span className="font-bold">Estructura de montaje:</span> 10 años</div>
                    <div>• <span className="font-bold">Batería:</span> 10 años</div>
                    <div>• <span className="font-bold">Mano de obra:</span> 1 año</div>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-1.5 text-xs text-emerald-950">
                    <h4 className="font-bold text-[#14532d] border-b border-emerald-200 pb-1.5 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" /> NOS ENCARGAMOS DE GESTIONAR
                    </h4>
                    <div className="flex items-start gap-1.5"><Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> <span>Instalación del contador bidireccional en las EDES</span></div>
                    <div className="flex items-start gap-1.5"><Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> <span>Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda</span></div>
                    <div className="flex items-start gap-1.5"><Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> <span>Trámites completos ante organismos reguladores</span></div>
                  </div>
                </div>

                {/* LEGAL SUBTEXT */}
                <div className="text-center text-xs text-slate-500 font-semibold italic pt-1">
                  * Equipos según disponibilidad de inventario | * Propuesta válida por {project.client.quoteValidityDays || 7} días | * Precios en USD *
                </div>
              </div>

              {/* Footer Electsun */}
              <div className="px-8 py-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600 font-semibold">
                <div>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</div>
                <div className="font-bold text-slate-800">ELECTSUN - EL SOL A TU FAVOR</div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* VISTA 3: RETORNO DE INVERSIÓN */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'retorno' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Card 1: CAPACIDAD DC */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  CAPACIDAD DC
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
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
                  <span className="text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 font-semibold">kWh</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                  {summary.energyCoveragePct}% Cobertura Solar
                </span>
              </div>

              {/* Card 3: INVERSIÓN NETA LEY 57-07 */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  INVERSIÓN NETA (LEY 57-07)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-700">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Bruta: ${summary.grossInvestmentUSD.toLocaleString()}
                </span>
              </div>

              {/* Card 4: PERÍODO DE PAYBACK */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  RETORNO DE INVERSIÓN (PAYBACK)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">{summary.paybackYears}</span>
                  <span className="text-xs text-slate-500 font-semibold">Años</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                  TIR (IRR): {summary.irrPct}%
                </span>
              </div>

              {/* Card 5: VALOR ACTUAL NETO (VAN) */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  VALOR ACTUAL NETO (VAN @ 10%)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-900">${summary.npvUSD.toLocaleString()}</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                  ROI 25 Años: {summary.roi25YrPct}%
                </span>
              </div>
            </div>

            {/* TABLA 1: Parámetros del Sistema e Inversión Neta */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Cálculo de Ahorro y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800 w-[40%]">Cliente / Proyecto</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{project.client.name}</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Potencia Instalada (kWp)</td>
                    <td className="py-2.5 px-4 font-bold text-emerald-800">{summary.systemCapacityKWp} kWp</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Inversión Inicial Sistema (USD)</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Incentivo Fiscal Estimado (Ley 57-07) (USD)</td>
                    <td className="py-2.5 px-4 font-bold text-emerald-700">-${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                  </tr>
                  <tr className="hover:bg-slate-50 bg-emerald-50/50 font-bold">
                    <td className="py-2.5 px-4 text-slate-900">Inversión Neta Final (USD)</td>
                    <td className="py-2.5 px-4 text-emerald-800 text-sm">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLA 2: Resumen de Ahorro Anual y Retorno de Inversión (Años 1, Payback, 10, 25) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Resumen de Ahorro Anual y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">AÑO</th>
                    <th className="py-2.5 px-4 text-right">AHORRO ENERGÉTICO (USD)</th>
                    <th className="py-2.5 px-4 text-right">INCENTIVO FISCAL (USD)</th>
                    <th className="py-2.5 px-4 text-right">AHORRO TOTAL ANUAL (USD)</th>
                    <th className="py-2.5 px-4 text-right font-bold">BENEFICIO ACUMULADO (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Año 1</td>
                    <td className="py-2.5 px-4 text-right">${year1Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${year1Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">${(year1Savings + year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-red-600">-${(summary.grossInvestmentUSD - year1Savings - year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50 bg-emerald-50/60 font-bold">
                    <td className="py-2.5 px-4 text-emerald-900">Año {Math.ceil(summary.paybackYears)} (Retorno Payback)</td>
                    <td className="py-2.5 px-4 text-right">${(cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${(cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right">${((cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0) + (cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[Math.ceil(summary.paybackYears) - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Año 10</td>
                    <td className="py-2.5 px-4 text-right">${avg10Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${avg10Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">${(avg10Savings + avg10Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(cf25[9]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50 font-bold bg-slate-50">
                    <td className="py-2.5 px-4 text-slate-900">Año 25 (Final de Vida Útil)</td>
                    <td className="py-2.5 px-4 text-right">${avg25Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${avg25Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">${(avg25Savings + avg25Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[cf25.length - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* GRÁFICA DE BENEFICIO ACUMULADO (25 AÑOS) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Beneficio Acumulado (25 Años)
                </h3>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-red-500"></span>
                    <span className="text-slate-700">Inversión Neta Negativa</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-600"></span>
                    <span className="text-slate-700">Beneficio Acumulado Positivo</span>
                  </div>
                </div>
              </div>

              <div className="h-[260px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="yearLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                      tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                    <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                      {cumulativeChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.cumulative < 0 ? '#ef4444' : '#16a34a'}
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
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  {/* Fila Año 0 */}
                  <tr className="hover:bg-slate-50 font-bold bg-slate-50/50">
                    <td className="py-2.5 px-4 text-center">0</td>
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
                        <td className="py-2 px-4 text-center font-bold">{row.year}</td>
                        <td className="py-2 px-4 text-right font-medium">{row.productionKWh.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right font-medium">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-4 text-right text-emerald-700 font-semibold">
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
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Payback (Periodo de Recuperación)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.paybackYears}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Años hasta recuperar la inversión inicial</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">TIR (Tasa Interna de Retorno)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.irrPct}%</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Rendimiento anual del proyecto</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">VAN a tasa descuento {project.financials.discountRatePct}%</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Valor actual neto — positivo = proyecto viable</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Ahorro Total 25 Años</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Beneficio acumulado al final del periodo</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">ROI Total del Proyecto</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.roi25YrPct}%</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Retorno sobre inversión total en 25 años</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Reducción CO2 estimada (25 años)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{(summary.co2AvoidedTonsPerYear * 25).toFixed(2)} Ton</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Factor emisión red RD: {project.financials.co2FactorKgPerKWh || 0.481} kg CO2/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Precio por Watt instalado</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(2)} USD/W</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Competitividad vs mercado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
