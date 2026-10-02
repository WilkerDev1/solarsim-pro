import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  ArrowLeft,
  Share2,
  Sliders,
  Camera,
  MapPin,
  Calendar,
  PanelLeftClose,
  PanelLeftOpen,
  Building,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { ProjectHubSidebarDock } from './ProjectHubSidebarDock';
import { ProjectHubPDFCanvas } from './ProjectHubPDFCanvas';
import { CreateSnapshotModal } from './components/CreateSnapshotModal';

export const ProjectHubView: React.FC = () => {
  const {
    activeProjectId,
    projects,
    setActiveView,
    openShareModal,
    sidebarTheme,
    restoreProject,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];

  const [isDockOpen, setIsDockOpen] = useState<boolean>(true);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState<boolean>(false);

  if (!project) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors ${
          isDark ? 'bg-[#0b0e14] text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        <h2 className="text-xl font-bold mb-2">No hay propuesta seleccionada</h2>
        <p className="text-slate-400 mb-4 text-sm">
          Selecciona una propuesta del dashboard para visualizar su hub técnico y comercial.
        </p>
        <button
          onClick={() => setActiveView('dashboard')}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  const financialSummary = calculateProjectFinancialSummary(project);

  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-hidden transition-colors duration-200 select-none ${
        isDark ? 'bg-[#0b0e14] text-slate-100' : 'bg-slate-100 text-slate-800'
      }`}
    >
      {/* 🚀 Top Executive Navigation Bar */}
      <header
        className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-4 shrink-0 z-30 backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-[#10141f]/95 border-slate-800 text-slate-100'
            : 'bg-white/95 border-slate-200 text-slate-800 shadow-xs'
        }`}
      >
        {/* Left: Back button, Proposal Code & Client Identity */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200 hover:text-white'
                : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
            }`}
            title="Volver al Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30">
                {project.client.projectId || 'SP-SOLAR'}
              </span>
              <h1 className="text-base sm:text-lg font-black tracking-tight truncate max-w-[280px] sm:max-w-md">
                {project.client.name || 'Propuesta Solar Fotovoltaica'}
              </h1>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold hidden md:inline-flex items-center gap-1 ${
                  isDark ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {project.rates.tariffCode || 'BTS2'} • {project.rates.distributor || 'EDEESTE'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate max-w-[200px]">{project.client.province || 'República Dominicana'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Actualizado: {new Date(project.updatedAt).toLocaleDateString('es-DO')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle Details Dock */}
          <button
            onClick={() => setIsDockOpen(!isDockOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isDockOpen
                ? isDark
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
                : isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title={isDockOpen ? 'Ocultar panel de detalles' : 'Mostrar panel de detalles'}
          >
            {isDockOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            <span className="hidden lg:inline">{isDockOpen ? 'Ocultar Dock' : 'Ver Detalles'}</span>
          </button>

          {/* Git Milestone Snapshot */}
          <button
            onClick={() => setIsSnapshotModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title="Guardar un hito o versión intencional de este proyecto"
          >
            <Camera className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Hito Git</span>
          </button>

          {/* Share Web Proposal */}
          <button
            onClick={() => openShareModal()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title="Compartir propuesta web interactiva con enlace temporal y QR"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Compartir Web</span>
          </button>

          {/* Primary Action: Abrir en Simulador */}
          <button
            onClick={() => setActiveView('simulator')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            title="Abrir en simulador para ajustar parámetros solares y cotización"
          >
            <Sliders className="w-4 h-4" />
            <span>Abrir en Simulador</span>
          </button>
        </div>
      </header>

      {/* Banner if Project is in Trash (Read-Only) */}
      {project.isDeleted && (
        <div className="bg-rose-900/90 text-white px-5 py-2.5 flex items-center justify-between gap-4 border-b border-rose-500/40 text-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-4 h-4 text-rose-300" />
            <span>
              <strong>Propuesta en Papelera (Modo Solo Lectura).</strong> Puedes explorar todos sus datos y exportar el PDF, pero no modificarla.
            </span>
          </div>
          <button
            onClick={() => restoreProject(project.id)}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Propuesta</span>
          </button>
        </div>
      )}

      {/* 🧩 Unified Split Layout: Lateral Dock + Main PDF Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Lateral Proposal Dock */}
        <ProjectHubSidebarDock
          project={project}
          summary={financialSummary}
          isDark={isDark}
          isOpen={isDockOpen}
          onToggleOpen={() => setIsDockOpen(!isDockOpen)}
          onOpenSnapshotModal={() => setIsSnapshotModalOpen(true)}
        />

        {/* Center Stage: Continuous Scrollable PDF Proposal Canvas */}
        <ProjectHubPDFCanvas
          project={project}
          summary={financialSummary}
          isDark={isDark}
        />
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
