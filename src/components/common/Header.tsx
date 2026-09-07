import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  FileText,
  Sun,
  Save,
  CheckCircle2,
  Share2,
  Globe,
  MoreVertical,
} from 'lucide-react';
import electsunEmblem from '../../assets/electsun-emblem-transparent.png';

export const Header: React.FC = () => {
  const {
    activeView,
    setActiveView,
    getActiveProject,
    openShareModal,
    saveActiveProject,
    exportProjectAsJSON,
    saveFeedbackMessage,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const activeProject = getActiveProject();

  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Close actions dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionsOpen(false);
    };
    if (isActionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsOpen]);

  return (
    <>
      <header
        className={`flex justify-between items-center px-6 h-16 w-full shrink-0 z-30 relative transition-colors duration-200 ${
          isDark
            ? 'bg-[#18181b] border-b border-[#27272a] text-zinc-100 shadow-md'
            : 'bg-white border-b border-slate-200 text-slate-900 shadow-xs'
        }`}
      >
        {/* Left: Branding & Active Project Context */}
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setActiveView('dashboard')}
            title="Ir al panel de proyectos"
          >
            <img
              src={electsunEmblem}
              alt="Electsun Logo"
              className="w-8 h-8 object-contain transition-transform duration-200 group-hover:scale-105 select-none shrink-0"
            />
            <h1
              className={`font-bold text-xl tracking-tight transition-colors ${
                isDark ? 'text-white' : 'text-emerald-950'
              }`}
            >
              SolarSim Pro
            </h1>
          </div>

          {/* Active Project Context Badge */}
          {activeView !== 'dashboard' && activeProject && (
            <div
              className={`hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border transition-colors ${
                isDark
                  ? 'bg-[#27272a]/90 border-[#3f3f46] text-zinc-200'
                  : 'bg-slate-100/90 border-slate-200 text-slate-800'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-xs truncate max-w-[200px]">
                {activeProject.client.name}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold border ${
                  isDark
                    ? 'bg-[#18181b] text-zinc-400 border-[#3f3f46]'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {activeProject.client.projectId}
              </span>
            </div>
          )}
        </div>

        {/* Right: Navigation Switcher & 3-Dots Action Menu */}
        <div className="flex items-center gap-3">
          {activeView !== 'dashboard' && (
            <div className="flex items-center gap-2.5">
              {/* View Mode Toggle (Simulador vs Propuesta PDF) */}
              <div
                className={`flex items-center gap-1 p-1 rounded-xl border transition-colors ${
                  isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <button
                  onClick={() => setActiveView('simulator')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeView === 'simulator'
                      ? isDark
                        ? 'bg-[#27272a] text-white shadow-xs'
                        : 'bg-white text-emerald-900 shadow-xs'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Simulador</span>
                </button>

                <button
                  onClick={() => setActiveView('pdf-preview')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeView === 'pdf-preview'
                      ? isDark
                        ? 'bg-[#27272a] text-white shadow-xs'
                        : 'bg-white text-emerald-900 shadow-xs'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Propuesta PDF</span>
                </button>
              </div>

              {/* Botón de 3 Puntos Desplegable (Guardar, Compartir, Exportar) */}
              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsActionsOpen(!isActionsOpen)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer shadow-xs flex items-center justify-center ${
                    isActionsOpen
                      ? isDark
                        ? 'bg-[#27272a] border-emerald-500/50 text-emerald-400'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : isDark
                      ? 'bg-[#27272a] border-[#3f3f46] text-zinc-300 hover:text-white hover:bg-[#323238]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title="Opciones del proyecto (Guardar, Compartir, Exportar)"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isActionsOpen && (
                  <div
                    className={`absolute right-0 top-full mt-2 w-52 rounded-2xl border shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl ${
                      isDark
                        ? 'bg-[#18181b]/95 border-[#27272a] text-zinc-200'
                        : 'bg-white/95 border-slate-200 text-slate-800'
                    }`}
                  >
                    {/* Guardar Cambios */}
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        saveActiveProject();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isDark
                          ? 'hover:bg-emerald-950/60 text-zinc-200 hover:text-emerald-300'
                          : 'hover:bg-emerald-50 text-slate-700 hover:text-emerald-900'
                      }`}
                    >
                      <Save className="w-4 h-4 text-emerald-500" />
                      <span>Guardar Cambios</span>
                    </button>

                    {/* Compartir Web */}
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        openShareModal();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isDark
                          ? 'hover:bg-emerald-950/60 text-zinc-200 hover:text-emerald-300'
                          : 'hover:bg-emerald-50 text-slate-700 hover:text-emerald-900'
                      }`}
                    >
                      <Globe className="w-4 h-4 text-emerald-500" />
                      <span>Compartir Web</span>
                    </button>

                    {/* Exportar JSON */}
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        exportProjectAsJSON();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isDark
                          ? 'hover:bg-[#27272a] text-zinc-200 hover:text-amber-300'
                          : 'hover:bg-slate-100 text-slate-700 hover:text-amber-800'
                      }`}
                    >
                      <Share2 className="w-4 h-4 text-amber-500" />
                      <span>Exportar JSON</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Floating Save Feedback Toast */}
      {saveFeedbackMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveFeedbackMessage}</span>
          </div>
        </div>
      )}
    </>
  );
};
