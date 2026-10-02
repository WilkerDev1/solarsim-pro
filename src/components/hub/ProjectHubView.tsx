import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Zap,
  Layers,
  Battery,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowLeft,
  Share2,
  FileText,
  Sliders,
  GitBranch,
  ShieldCheck,
  Building,
  MapPin,
  Calendar,
  Sparkles,
  Camera,
} from 'lucide-react';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { HubOverviewTab } from './tabs/HubOverviewTab';
import { HubEquipmentSpecsTab } from './tabs/HubEquipmentSpecsTab';
import { HubPDFPreviewTab } from './tabs/HubPDFPreviewTab';
import { HubGitHistoryTab } from './tabs/HubGitHistoryTab';
import { CreateSnapshotModal } from './components/CreateSnapshotModal';

export const ProjectHubView: React.FC = () => {
  const {
    activeProjectId,
    projects,
    setActiveView,
    openShareModal,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];

  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'pdf' | 'git'>('overview');
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0d1117] text-white">
        <h2 className="text-xl font-bold mb-2">No hay propuesta seleccionada</h2>
        <p className="text-zinc-400 mb-4 text-sm">
          Selecciona una propuesta del dashboard para visualizar su hub técnico y comercial.
        </p>
        <button
          onClick={() => setActiveView('dashboard')}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  const dcKWp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);
  const totalInverterKW = project.specs.inverterPowerKW * (project.specs.inverterCount || 1);
  const totalBESSKWh = project.specs.hasBattery
    ? (project.specs.batteryCapacityKWh || 0) * (project.specs.batteryCount || 1)
    : 0;

  const financialSummary = calculateProjectFinancialSummary(project);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#0d1117] text-zinc-200">
      {/* 🚀 Top Navigation & Identity Bar */}
      <div className="sticky top-0 z-30 bg-[#161b22]/90 backdrop-blur-md border-b border-[#30363d] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Back button & Project Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('dashboard')}
            className="p-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-zinc-300 hover:text-white transition-colors"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {project.client.projectId || 'PROY-SOLAR'}
              </span>
              <h1 className="text-lg font-black text-white tracking-tight">
                {project.client.name || 'Propuesta Solar Fotovoltaica'}
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#21262d] text-zinc-400 border border-[#30363d] font-medium">
                {project.rates.tariffCode || 'BTS2'} • {project.rates.distributor || 'EDEESTE'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-zinc-500" />
                {project.client.province || 'República Dominicana'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-zinc-500" />
                Actualizado: {new Date(project.updatedAt).toLocaleDateString('es-DO')}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Create Git Snapshot */}
          <button
            onClick={() => setIsSnapshotModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-zinc-200 hover:text-white text-xs font-semibold border border-[#30363d] transition-all"
            title="Guardar un hito o versión manual de este proyecto"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Hito Git</span>
          </button>

          {/* Share Web Proposal */}
          <button
            onClick={() => openShareModal()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-zinc-200 hover:text-white text-xs font-semibold border border-[#30363d] transition-all"
            title="Compartir propuesta web interactiva con enlace temporal y QR"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Compartir Web</span>
          </button>

          {/* PDF Proposal View */}
          <button
            onClick={() => setActiveView('pdf-preview')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-zinc-200 hover:text-white text-xs font-semibold border border-[#30363d] transition-all"
            title="Abrir vista de propuesta técnica y económica PDF"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Ver PDF</span>
          </button>

          {/* Primary Action: Abrir en Simulador */}
          <button
            onClick={() => setActiveView('simulator')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sliders className="w-4 h-4" />
            <span>Abrir en Simulador</span>
          </button>
        </div>
      </div>

      {/* 📊 High-Impact Executive KPI Strip */}
      <div className="px-6 py-4 bg-[#161b22]/50 border-b border-[#30363d]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {/* DC Capacity */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Potencia DC</span>
            <span className="text-lg font-black text-white font-mono">
              {dcKWp.toFixed(2)} <span className="text-xs text-amber-400 font-semibold">kWp</span>
            </span>
            <span className="text-[9px] text-zinc-500 block truncate">
              {project.specs.panelCount} módulos ({project.specs.panelPowerW}W)
            </span>
          </div>

          {/* Inverter AC */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Inversores AC</span>
            <span className="text-lg font-black text-white font-mono">
              {totalInverterKW.toFixed(1)} <span className="text-xs text-blue-400 font-semibold">kW AC</span>
            </span>
            <span className="text-[9px] text-zinc-500 block truncate">
              {project.specs.inverterCount || 1}x {project.specs.inverterPowerKW} kW
            </span>
          </div>

          {/* BESS */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Baterías BESS</span>
            <span className="text-lg font-black text-white font-mono">
              {totalBESSKWh > 0 ? totalBESSKWh.toFixed(1) : '0'}{' '}
              <span className="text-xs text-emerald-400 font-semibold">kWh</span>
            </span>
            <span className="text-[9px] text-zinc-500 block truncate">
              {project.specs.hasBattery ? `${project.specs.batteryCount || 1} módulos` : 'Sin batería'}
            </span>
          </div>

          {/* Net Investment */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Inversión Neta</span>
            <span className="text-lg font-black text-emerald-400 font-mono">
              ${Math.round(financialSummary.netInvestmentUSD).toLocaleString()}{' '}
              <span className="text-[10px] text-zinc-400 font-normal">USD</span>
            </span>
            <span className="text-[9px] text-emerald-500 block truncate">Con Ley 57-07</span>
          </div>

          {/* Annual Savings */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Ahorro Año 1</span>
            <span className="text-lg font-black text-white font-mono">
              ${Math.round(financialSummary.year1SavingsUSD).toLocaleString()}{' '}
              <span className="text-[10px] text-zinc-400 font-normal">USD</span>
            </span>
            <span className="text-[9px] text-zinc-500 block truncate">Ahorro estimado</span>
          </div>

          {/* Payback & IRR */}
          <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Payback / TIR</span>
            <span className="text-lg font-black text-amber-400 font-mono">
              {financialSummary.paybackYears.toFixed(1)}a{' '}
              <span className="text-xs text-zinc-400">/ {financialSummary.irrPct.toFixed(1)}%</span>
            </span>
            <span className="text-[9px] text-zinc-500 block truncate">Retorno acelerado</span>
          </div>
        </div>
      </div>

      {/* 🧭 Tabs Navigation Header */}
      <div className="px-6 border-b border-[#30363d] bg-[#161b22]/30 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Resumen Ejecutivo</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'specs'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Ficha Técnica de Equipos</span>
        </button>

        <button
          onClick={() => setActiveTab('pdf')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'pdf'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Vista Previa Documento PDF</span>
        </button>

        <button
          onClick={() => setActiveTab('git')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'git'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Historial Git & Hitos</span>
        </button>
      </div>

      {/* 📄 Active Tab Content Body */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'overview' && <HubOverviewTab project={project} />}
        {activeTab === 'specs' && <HubEquipmentSpecsTab project={project} />}
        {activeTab === 'pdf' && <HubPDFPreviewTab project={project} />}
        {activeTab === 'git' && <HubGitHistoryTab project={project} />}
      </div>

      {/* 📸 Snapshot Creation Modal */}
      <CreateSnapshotModal
        isOpen={isSnapshotModalOpen}
        projectId={project.id}
        onClose={() => setIsSnapshotModalOpen(false)}
      />
    </div>
  );
};
