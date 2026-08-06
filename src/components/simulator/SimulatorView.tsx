import React, { useState } from 'react';
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
  User,
  Zap,
  Cpu,
  Sliders,
  DollarSign,
  Leaf,
  TrendingUp,
  BarChart2,
  Table as TableIcon,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  BatteryCharging,
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

  return (
    <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-64px)] bg-surface">
      {/* Left Sidebar: Parameters */}
      <aside className="w-[340px] bg-white border-r border-outline-variant/60 flex flex-col shrink-0 h-full overflow-y-auto shadow-sm z-10">
        <div className="p-5 border-b border-outline-variant/40 bg-slate-50/50">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-bold text-on-surface">Parámetros del Sistema</h2>
            <select
              value={project.status}
              onChange={(e) => setProjectStatus(project.id, e.target.value as any)}
              className="text-xs font-semibold px-2 py-1 rounded bg-white border border-outline-variant text-on-surface focus:ring-1 focus:ring-primary"
            >
              <option value="Draft">Borrador</option>
              <option value="Final">Finalizado</option>
              <option value="Archived">Archivado</option>
            </select>
          </div>
          <p className="text-xs text-secondary">Ajustes técnicos, tarifas e incentivos fiscales</p>
        </div>

        <div className="p-5 space-y-6">
          {/* Section 1: Client & Project */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-primary/20 pb-1.5">
              <User className="w-3.5 h-3.5" />
              Cliente y Ubicación
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  value={project.client.name}
                  onChange={(e) => updateClient({ name: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Provincia (Irradiación HSP)</label>
                <select
                  value={project.client.province}
                  onChange={(e) => updateClient({ province: e.target.value })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary"
                >
                  {RD_PROVINCES.map((prov) => (
                    <option key={prov.code} value={prov.name}>
                      {prov.name} (HSP {prov.avgHSP} hrs/día)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Distribuidora</label>
                  <select
                    value={project.client.distributor}
                    onChange={(e) => updateClient({ distributor: e.target.value as any })}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary"
                  >
                    <option value="EDEESTE">EDEESTE</option>
                    <option value="EDESUR">EDESUR</option>
                    <option value="EDENORTE">EDENORTE</option>
                    <option value="CEPM">CEPM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">ID Proyecto</label>
                  <input
                    type="text"
                    value={project.client.projectId}
                    onChange={(e) => updateClient({ projectId: e.target.value })}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Utility & Rates */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-primary/20 pb-1.5">
              <Zap className="w-3.5 h-3.5" />
              Tarifa y Red Eléctrica
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Tarifa Energía (USD / kWh)</label>
                <input
                  type="number"
                  step="0.01"
                  value={project.rates.energyCostPerKWh}
                  onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Cargo Exportación Red (SIE-007-2026-REG)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    value={project.rates.gridExportFeePct}
                    onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-secondary">%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Hardware System Specs (Simple vs Detailed) */}
          <section className="space-y-3">
            <div className="flex justify-between items-center border-b border-primary/20 pb-1.5">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Equipamiento
              </h3>
              {/* Mode Toggle Switch */}
              <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-md border border-outline-variant/60">
                <button
                  type="button"
                  onClick={() => updateSpecs({ isDetailed: false })}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    !project.specs.isDetailed ? 'bg-primary text-white' : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => updateSpecs({ isDetailed: true })}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    project.specs.isDetailed ? 'bg-primary text-white' : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  Detallado
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Potencia Panel (W)</label>
                  <input
                    type="number"
                    step="5"
                    value={project.specs.panelPowerW}
                    onChange={(e) => updateSpecs({ panelPowerW: parseInt(e.target.value) || 0 })}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Cant. Paneles</label>
                  <input
                    type="number"
                    step="1"
                    value={project.specs.panelCount}
                    onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Potencia Inversor (kW AC)</label>
                <input
                  type="number"
                  step="1"
                  value={project.specs.inverterPowerKW}
                  onChange={(e) => updateSpecs({ inverterPowerKW: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Battery Controls */}
              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.specs.hasBattery}
                    onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span>Incluye Almacenamiento (Batería)</span>
                </label>
                {project.specs.hasBattery && (
                  <div className="mt-2 pl-6">
                    <label className="block text-[11px] font-medium text-on-surface-variant mb-1">Capacidad (kWh)</label>
                    <input
                      type="number"
                      value={project.specs.batteryCapacityKWh}
                      onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-2.5 py-1 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Detailed Specs Fields */}
              {project.specs.isDetailed && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-lg space-y-2 text-xs mt-3">
                  <p className="font-semibold text-amber-800 text-[11px] flex items-center gap-1">
                    <Sliders className="w-3 h-3" /> Parámetros Avanzados de Eficiencia
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-amber-900 block">Eficiencia Panel (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={project.specs.panelEfficiency}
                        onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-900 block">Pérdidas Sistema (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={project.specs.systemLosses}
                        onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-amber-900 block">Coeff. Temp. (%/°C)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={project.specs.tempCoeff}
                        onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-900 block">Degradación Anual (%)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={project.specs.annualDegradation}
                        onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 4: Financials & Ley 57-07 */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-primary/20 pb-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Incentivos y Costos
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Precio por Vatio ($ USD / Wp)</label>
                <input
                  type="number"
                  step="0.05"
                  value={project.financials.pricePerWattUSD}
                  onChange={(e) => updateFinancials({ pricePerWattUSD: parseFloat(e.target.value) || 0, customCostUSD: undefined })}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer">
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
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span>Aplicar Crédito ISR 40% (Ley 57-07)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.financials.applyITBISExemption}
                    onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span>Exoneración 100% ITBIS</span>
                </label>
              </div>
            </div>
          </section>
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
              {project.specs.panelCount} panels × {project.specs.panelPowerW}W
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
