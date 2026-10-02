import React, { useState } from 'react';
import { ProjectSimulation, FinancialSummaryResult, ProjectSnapshot } from '../../types';
import { useSimulationStore } from '../../store/useSimulationStore';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';
import { formatProposalDate, getProposalDateInputValue } from '../../utils/formatDateUtils';
import {
  LayoutDashboard,
  Zap,
  DollarSign,
  GitBranch,
  Sun,
  Cpu,
  Battery,
  Shield,
  MapPin,
  Calendar,
  Building,
  TrendingUp,
  Percent,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Camera,
  RotateCcw,
  Sparkles,
  TreePine,
  Wind,
  Layers,
  FileCheck,
} from 'lucide-react';

interface ProjectHubSidebarDockProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isDark: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onOpenSnapshotModal: () => void;
}

type DockTab = 'overview' | 'specs' | 'financials' | 'git';

export const ProjectHubSidebarDock: React.FC<ProjectHubSidebarDockProps> = ({
  project,
  summary,
  isDark,
  isOpen,
  onToggleOpen,
  onOpenSnapshotModal,
}) => {
  const { setActiveView, getProjectSnapshots, restoreSnapshot, updateClient } = useSimulationStore();
  const [activeTab, setActiveTab] = useState<DockTab>('overview');

  const dcKWp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);
  const totalInverterKW = project.specs.inverterPowerKW * (project.specs.inverterCount || 1);
  const totalBESSKWh = project.specs.hasBattery
    ? (project.specs.batteryCapacityKWh || 0) * (project.specs.batteryCount || 1)
    : 0;

  const snapshots = getProjectSnapshots(project.id);

  if (!isOpen) {
    return (
      <div
        className={`h-full border-r flex flex-col items-center py-4 px-2 gap-4 shrink-0 transition-all duration-200 ${
          isDark ? 'bg-[#0f141f] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <button
          onClick={onToggleOpen}
          className={`p-2 rounded-xl transition-all ${
            isDark
              ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
          title="Mostrar Dock de Detalles"
        >
          <ChevronRight className="w-4 h-4 text-amber-500" />
        </button>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={() => {
              onToggleOpen();
              setActiveTab('overview');
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'overview'
                ? 'bg-amber-500/15 text-amber-500'
                : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Resumen & KPIs"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              onToggleOpen();
              setActiveTab('specs');
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'specs'
                ? 'bg-amber-500/15 text-amber-500'
                : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Equipos & BOS"
          >
            <Zap className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              onToggleOpen();
              setActiveTab('financials');
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'financials'
                ? 'bg-amber-500/15 text-amber-500'
                : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Finanzas & Ley 57-07"
          >
            <DollarSign className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              onToggleOpen();
              setActiveTab('git');
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'git'
                ? 'bg-amber-500/15 text-amber-500'
                : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Historial Git"
          >
            <GitBranch className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside
      className={`w-[410px] xl:w-[450px] h-full border-r flex flex-col shrink-0 select-none transition-colors duration-200 z-10 ${
        isDark ? 'bg-[#0f141f] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
      }`}
    >
      {/* 🧭 Dock Top Header */}
      <div
        className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 ${
          isDark ? 'border-slate-800 bg-[#131926]' : 'border-slate-200 bg-slate-50/80'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <LayoutDashboard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black tracking-wide uppercase">Detalles de la Propuesta</h3>
            <span className={`text-[10px] font-medium block truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {project.client.projectId || 'SP-SOLAR'} • {project.client.name}
            </span>
          </div>
        </div>

        <button
          onClick={onToggleOpen}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500'
          }`}
          title="Colapsar panel lateral"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 🎛️ Navigation Segmented Pills */}
      <div
        className={`px-3 py-2 border-b grid grid-cols-4 gap-1 ${
          isDark ? 'border-slate-800 bg-[#0c1018]' : 'border-slate-200 bg-slate-100/70'
        }`}
      >
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-1.5 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Resumen</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`py-1.5 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'specs'
              ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Equipos</span>
        </button>

        <button
          onClick={() => setActiveTab('financials')}
          className={`py-1.5 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'financials'
              ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Finanzas</span>
        </button>

        <button
          onClick={() => setActiveTab('git')}
          className={`py-1.5 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'git'
              ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Historial</span>
        </button>
      </div>

      {/* 📄 Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ============================================================== */}
        {/* TAB 1: RESUMEN Y KPIS */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* 6 Micro KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* DC Capacity */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Potencia DC</span>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-lg font-black font-mono">
                  {dcKWp.toFixed(2)} <span className="text-xs text-amber-500 font-semibold">kWp</span>
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
                </span>
              </div>

              {/* Inverter AC */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Inversores AC</span>
                  <Cpu className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="text-lg font-black font-mono">
                  {totalInverterKW.toFixed(1)} <span className="text-xs text-blue-500 font-semibold">kW</span>
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {project.specs.inverterCount || 1}x {project.specs.inverterPowerKW} kW híbrido
                </span>
              </div>

              {/* BESS Storage */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Almacenamiento</span>
                  <Battery className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="text-lg font-black font-mono">
                  {totalBESSKWh > 0 ? totalBESSKWh.toFixed(1) : '0'}{' '}
                  <span className="text-xs text-emerald-500 font-semibold">kWh</span>
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {project.specs.hasBattery ? `${project.specs.batteryCount || 1} bat. LiFePO4` : 'Sin baterías'}
                </span>
              </div>

              {/* Net Investment */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Inversión Neta</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="text-lg font-black text-emerald-500 font-mono">
                  ${Math.round(summary.netInvestmentUSD).toLocaleString()}
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  Con Ley 57-07 (40% ISR)
                </span>
              </div>

              {/* Year 1 Savings */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Ahorro Año 1</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-lg font-black font-mono">
                  ${Math.round(summary.year1SavingsUSD).toLocaleString()}{' '}
                  <span className="text-[10px] text-slate-400 font-normal">USD</span>
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  ~RD$ {Math.round(summary.year1SavingsUSD * (project.rates.usdExchangeRate || 60)).toLocaleString()}
                </span>
              </div>

              {/* Payback / TIR */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Payback / TIR</span>
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="text-lg font-black text-amber-500 font-mono">
                  {summary.paybackYears.toFixed(1)}a{' '}
                  <span className="text-xs text-slate-400 font-normal">/ {summary.irrPct.toFixed(1)}%</span>
                </div>
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Retorno acelerado
                </span>
              </div>
            </div>

            {/* ⚡ Balance Energético Anual */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Balance Anual
                </span>
                <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Cobertura {summary.energyCoveragePct.toFixed(1)}%
                </span>
              </div>

              {/* Coverage Progress Bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, summary.energyCoveragePct)}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div
                  className={`p-2.5 rounded-lg border ${
                    isDark ? 'bg-[#0f141f] border-slate-800/80' : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Generación Solar</span>
                  <span className="text-sm font-extrabold text-amber-500 font-mono">
                    {Math.round(summary.annualProductionKWh).toLocaleString()}{' '}
                    <span className="text-[10px]">kWh/año</span>
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border ${
                    isDark ? 'bg-[#0f141f] border-slate-800/80' : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Demanda Eléctrica</span>
                  <span className="text-sm font-extrabold text-blue-500 font-mono">
                    {Math.round(summary.annualConsumptionKWh).toLocaleString()}{' '}
                    <span className="text-[10px]">kWh/año</span>
                  </span>
                </div>
              </div>

              {/* Monthly Mini Bar Chart */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-medium">
                  <span>Comportamiento de 12 Meses:</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-amber-400" /> Solar
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-blue-500" /> Consumo
                    </span>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-20 pt-2 px-1 border-t border-slate-200 dark:border-slate-800">
                  {summary.monthlyBreakdown.map((m, idx) => {
                    const cons = project.monthlyConsumption[idx] || 1;
                    const maxVal = Math.max(m.productionKWh, cons, 100);
                    const genPct = Math.min(100, Math.round((m.productionKWh / maxVal) * 100));
                    const consPct = Math.min(100, Math.round((cons / maxVal) * 100));
                    const months = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end gap-1">
                        <div className="w-full flex items-end justify-center gap-0.5 h-14">
                          <div
                            style={{ height: `${genPct}%` }}
                            className="w-1.5 bg-amber-400 rounded-t-xs"
                            title={`Gen: ${Math.round(m.productionKWh)} kWh`}
                          />
                          <div
                            style={{ height: `${consPct}%` }}
                            className="w-1.5 bg-blue-500/70 rounded-t-xs"
                            title={`Cons: ${Math.round(cons)} kWh`}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-slate-400 font-bold">{months[idx]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 🏢 Ubicación & Régimen Tarifario */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2.5 text-xs ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-500" />
                Ubicación & Tarifas
              </span>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Provincia / Región:</span>
                  <span className="font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {project.client.province || 'Santo Domingo'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Distribuidora:</span>
                  <span className="font-bold font-mono text-amber-500">
                    {project.rates.distributor || 'EDEESTE'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Tarifa SIE:</span>
                  <span className="font-bold font-mono">{project.rates.tariffCode || 'BTS2'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Retención SIE-007:</span>
                  <span className="font-semibold text-emerald-500">25% (Net Metering)</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-500" />
                      Fecha Emisión Propuesta
                    </span>
                    {project.client.quoteDate && (
                      <button
                        type="button"
                        onClick={() => updateClient({ quoteDate: undefined })}
                        className="text-[10px] text-amber-500 hover:underline cursor-pointer"
                        title="Restablecer a fecha actual"
                      >
                        Usar Hoy
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={getProposalDateInputValue(project.client.quoteDate)}
                      onChange={(e) => updateClient({ quoteDate: e.target.value })}
                      className={`flex-1 text-[11px] p-1.5 rounded-lg border font-semibold outline-none transition-colors ${
                        isDark
                          ? 'bg-[#181822] border-slate-700 text-white focus:border-amber-500'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-amber-600'
                      }`}
                    />
                    <span className={`text-[11px] font-bold font-mono px-2 py-1.5 rounded-lg border shrink-0 ${
                      isDark ? 'bg-[#0f141f] border-slate-700 text-amber-400' : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}>
                      {formatProposalDate(project.client.quoteDate, 'numeric')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 🌱 Impacto Ambiental */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50/80 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                  <TreePine className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block text-[11px]">
                    {summary.co2AvoidedTonsPerYear.toFixed(1)} Toneladas de CO₂ / año
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Equivalente a plantar ~{Math.round(summary.co2AvoidedTonsPerYear * 45)} árboles
                  </span>
                </div>
              </div>
              <Wind className="w-5 h-5 text-emerald-500/40" />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: EQUIPOS Y BOS */}
        {/* ============================================================== */}
        {activeTab === 'specs' && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Solar Modules */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2.5 ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-amber-500">
                  <Sun className="w-3.5 h-3.5" /> Módulos Fotovoltaicos
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">
                  {dcKWp.toFixed(2)} kWp
                </span>
              </div>
              <div className="text-xs space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Modelo:</span>
                  <span className="font-bold truncate max-w-[200px]">
                    {project.specs.panelBrandModel || 'Canadian Solar TOPBiHiKu6'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Potencia Unitaria:</span>
                  <span className="font-mono font-bold">{project.specs.panelPowerW} Wp</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cantidad Total:</span>
                  <span className="font-mono font-bold">{project.specs.panelCount} módulos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Degradación Anual:</span>
                  <span className="font-mono">{project.specs.annualDegradation || 0.4}% / año</span>
                </div>
              </div>
            </div>

            {/* Inverters */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2.5 ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-blue-500">
                  <Cpu className="w-3.5 h-3.5" /> Inversores Híbridos
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-500">
                  {totalInverterKW.toFixed(1)} kW AC
                </span>
              </div>
              <div className="text-xs space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Modelo:</span>
                  <span className="font-bold truncate max-w-[200px]">
                    {project.specs.inverterBrandModel || 'LuxpowerTek LXP-LB-US'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Capacidad Nominal:</span>
                  <span className="font-mono font-bold">{project.specs.inverterPowerKW} kW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Unidades en Paralelo:</span>
                  <span className="font-mono font-bold">{project.specs.inverterCount || 1} inversor(es)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Eficiencia Inversor:</span>
                  <span className="font-mono">{project.specs.inverterEfficiencyPct || 97.5}%</span>
                </div>
              </div>
            </div>

            {/* Storage BESS */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2.5 ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-emerald-500">
                  <Battery className="w-3.5 h-3.5" /> Baterías Litio (BESS)
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                  {project.specs.hasBattery ? `${totalBESSKWh.toFixed(1)} kWh` : 'No incluye'}
                </span>
              </div>
              {project.specs.hasBattery ? (
                <div className="text-xs space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Modelo / Química:</span>
                    <span className="font-bold truncate max-w-[200px]">
                      {project.specs.batteryBrandModel || 'HinaESS PowerGem Max (LiFePO4)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capacidad por Unidad:</span>
                    <span className="font-mono font-bold">{project.specs.batteryCapacityKWh} kWh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cantidad:</span>
                    <span className="font-mono font-bold">{project.specs.batteryCount || 1} unidades</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Profundidad DoD:</span>
                    <span className="font-mono">{project.specs.batteryDOD || 90}%</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 py-1">
                  Esta propuesta no incluye almacenamiento BESS. Puedes agregarlo desde el simulador con un clic.
                </p>
              )}
            </div>

            {/* BOS and Installation */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2 text-xs ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                Materiales BOS & Protecciones
              </span>
              <ul className="space-y-1.5 text-[11px] text-slate-400 pt-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Estructuras de aluminio anodizado AL6005-T5</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Cableado solar DC PV 1000V/1500V con certificación UL</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Protecciones contra sobretensiones (SPD) Clase II</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Desconectivos de seguridad AC y DC</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: FINANZAS Y LEY 57-07 */}
        {/* ============================================================== */}
        {activeTab === 'financials' && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Big Net Investment Box */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-1.5 ${
                isDark
                  ? 'bg-gradient-to-br from-emerald-950/40 to-slate-900 border-emerald-500/40'
                  : 'bg-gradient-to-br from-emerald-50 to-white border-emerald-300'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Desembolso Neto Real
              </span>
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-300 font-mono">
                ${Math.round(summary.netInvestmentUSD).toLocaleString()}{' '}
                <span className="text-xs font-normal">USD</span>
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Ahorro fiscal aplicado conforme a la Ley 57-07
              </span>
            </div>

            {/* Financial Rows */}
            <div
              className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">Inversión Llave en Mano:</span>
                <span className="font-mono font-bold">
                  ${Math.round(summary.contractPriceUSD).toLocaleString()} USD
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">Exoneración ITBIS (18%):</span>
                <span className="font-mono font-bold text-emerald-500">
                  +${Math.round(summary.itbisSavedUSD).toLocaleString()} USD
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">Crédito ISR Ley 57-07 (40%):</span>
                <span className="font-mono font-bold text-emerald-500">
                  -${Math.round(summary.ley5707CreditUSD).toLocaleString()} USD
                </span>
              </div>

              <div className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                * El crédito fiscal del 40% se amortiza en 3 periodos fiscales en la DGII (~$
                {Math.round(summary.ley5707CreditUSD / 3).toLocaleString()} USD/año).
              </div>
            </div>

            {/* Key Financial KPIs */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] text-slate-400 uppercase block font-bold">TIR (IRR)</span>
                <span className="text-base font-black text-amber-500 font-mono">
                  {summary.irrPct.toFixed(1)}%
                </span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] text-slate-400 uppercase block font-bold">Payback Simple</span>
                <span className="text-base font-black text-amber-500 font-mono">
                  {summary.paybackYears.toFixed(1)} años
                </span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] text-slate-400 uppercase block font-bold">VAN (NPV 25a)</span>
                <span className="text-base font-black text-emerald-500 font-mono">
                  ${Math.round(summary.npvUSD).toLocaleString()}
                </span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] text-slate-400 uppercase block font-bold">ROI a 25 Años</span>
                <span className="text-base font-black text-blue-500 font-mono">
                  {summary.roi25YrPct.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Direct action to cost matrix */}
            <button
              onClick={() => setActiveView('simulator')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              <span>Ajustar Márgenes & Costos en Simulador</span>
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: HISTORIAL GIT Y HITOS */}
        {/* ============================================================== */}
        {activeTab === 'git' && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-500" /> Hitos de Versión
              </span>
              <button
                onClick={onOpenSnapshotModal}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
              >
                <Camera className="w-3 h-3" />
                <span>Guardar Hito</span>
              </button>
            </div>

            {/* Current Working Version Badge */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                isDark ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <span className="font-bold text-amber-600 dark:text-amber-400 block text-[11px]">
                    Versión de Trabajo v{project.version || 1}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {project.specs.panelCount} módulos • {dcKWp.toFixed(2)} kWp
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold">
                Activa
              </span>
            </div>

            {/* Snapshots Timeline */}
            <div className="space-y-2 pt-1">
              {snapshots.length === 0 ? (
                <div
                  className={`p-4 rounded-xl border text-center text-xs ${
                    isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  <Clock className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                  <p>No hay puntos de guardado manuales todavía.</p>
                  <p className="text-[10px] mt-1">Usa "Guardar Hito" para congelar versiones intencionales.</p>
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className={`p-3 rounded-xl border flex flex-col gap-1.5 text-xs transition-colors ${
                      isDark ? 'bg-[#141a27] border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-blue-500/20 text-blue-500">
                          v{snap.versionNumber}
                        </span>
                        <span className="truncate max-w-[170px]">{snap.label}</span>
                      </span>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `¿Restaurar el proyecto a v${snap.versionNumber} ("${snap.label}")?\nSe guardará un auto-checkpoint de tu estado actual.`
                            )
                          ) {
                            restoreSnapshot(project.id, snap.id);
                          }
                        }}
                        className={`p-1 rounded-md transition-all cursor-pointer ${
                          isDark
                            ? 'hover:bg-slate-700 text-slate-400 hover:text-white'
                            : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                        title="Restaurar esta versión"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {snap.notes && (
                      <p className={`text-[10px] line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {snap.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span>{snap.authorName}</span>
                      <span>{new Date(snap.createdAt).toLocaleDateString('es-DO')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 🚀 Dock Bottom Sticky Action */}
      <div
        className={`p-3 border-t flex items-center justify-between gap-2 ${
          isDark ? 'border-slate-800 bg-[#131926]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <button
          onClick={() => setActiveView('simulator')}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Sliders className="w-4 h-4" />
          <span>Abrir en Simulador</span>
        </button>
      </div>
    </aside>
  );
};
