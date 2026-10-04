import { useEnergyCalculationMode } from '../../features/application/useApplicationFeatures';
import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  ArrowLeft,
  Share2,
  Sliders,
  MapPin,
  Calendar,
  RotateCcw,
  Trash2,
  Download,
  Printer,
  FileEdit,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { ProjectHubSidebarDock } from './ProjectHubSidebarDock';
import { ProjectHubPDFCanvas, ProjectHubPDFCanvasHandle } from './ProjectHubPDFCanvas';
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
  const [isOptionsOpen, setIsOptionsOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  const canvasRef = useRef<ProjectHubPDFCanvasHandle>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setIsOptionsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOptionsOpen(false);
    };

    if (isOptionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOptionsOpen]);

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

  const calculationMode = useEnergyCalculationMode();
  const financialSummary = calculateProjectFinancialSummary(project, calculationMode);

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
          {/* Unified Dropdown Menu: Compartir, Descargar, Imprimir, Personalizar */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              type="button"
              onClick={() => setIsOptionsOpen(!isOptionsOpen)}
              disabled={isExporting}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isOptionsOpen
                  ? isDark
                    ? 'bg-slate-800 border-slate-600 text-white shadow-md'
                    : 'bg-slate-200 border-slate-300 text-slate-900 shadow-md'
                  : isDark
                  ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Opciones de exportación, compartir y personalización"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  <span className="font-bold text-emerald-500">Exportando...</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      isOptionsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>

            {isOptionsOpen && (
              <div
                className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 ${
                  isDark
                    ? 'bg-[#141a27] border-slate-700 text-slate-200'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                {/* 1. Compartir Web */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    openShareModal();
                  }}
                  className={`w-full p-2.5 rounded-xl flex items-start gap-3 text-left transition-colors cursor-pointer ${
                    isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Compartir Web
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Enlace temporal interactivo y QR para el cliente
                    </div>
                  </div>
                </button>

                {/* 2. Descargar PDF */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    canvasRef.current?.exportPDF();
                  }}
                  disabled={isExporting}
                  className={`w-full p-2.5 rounded-xl flex items-start gap-3 text-left transition-colors cursor-pointer ${
                    isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 shrink-0 mt-0.5">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      Descargar PDF
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Documento A4 en alta resolución con anexos
                    </div>
                  </div>
                </button>

                {/* 3. Imprimir */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    window.print();
                  }}
                  className={`w-full p-2.5 rounded-xl flex items-start gap-3 text-left transition-colors cursor-pointer ${
                    isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500 shrink-0 mt-0.5">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-purple-600 dark:text-purple-400">
                      Imprimir
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Enviar a impresora o guardar como PDF nativo
                    </div>
                  </div>
                </button>

                <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

                {/* 4. Personalizar PDF */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    setActiveView('pdf-preview');
                  }}
                  className={`w-full p-2.5 rounded-xl flex items-start gap-3 text-left transition-colors cursor-pointer ${
                    isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                    <FileEdit className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      Personalizar PDF
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Editor completo, temas, marcas de agua y páginas
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Primary Action: Abrir en Simulador */}
          <button
            type="button"
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
          ref={canvasRef}
          project={project}
          summary={financialSummary}
          isDark={isDark}
          onExportStateChange={(exporting, progress) => {
            setIsExporting(exporting);
            setExportProgress(progress);
          }}
        />
      </div>

      {/* 🚀 Floating Export Progress Notification */}
      {isExporting && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-slate-900/95 border border-emerald-500/50 text-white shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
          <div>
            <div className="text-xs font-bold text-emerald-400">Generando Propuesta PDF</div>
            <div className="text-[11px] text-slate-300 font-mono">
              {exportProgress || 'Procesando páginas...'}
            </div>
          </div>
        </div>
      )}

      {/* 📸 Snapshot Creation Modal */}
      <CreateSnapshotModal
        isOpen={isSnapshotModalOpen}
        projectId={project.id}
        onClose={() => setIsSnapshotModalOpen(false)}
      />
    </div>
  );
};
