import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Sun, Moon, FileText, LayoutDashboard, Save, Plus, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { NewProjectModal } from './NewProjectModal';
import { UpdateModal } from './UpdateModal';

export const Header: React.FC = () => {
  const {
    activeView,
    setActiveView,
    getActiveProject,
    openNewProjectModal,
    openUpdateModal,
    saveActiveProject,
    saveFeedbackMessage,
    sidebarTheme,
    toggleSidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const activeProject = getActiveProject();

  return (
    <>
      <header
        className={`flex justify-between items-center px-6 h-16 w-full shrink-0 z-30 relative transition-colors duration-200 ${
          isDark
            ? 'bg-[#18181b] border-b border-[#27272a] text-zinc-100 shadow-md'
            : 'bg-white border-b border-slate-200 text-slate-900 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setActiveView('dashboard')}
            title="Ir al panel de proyectos"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-xs group-hover:bg-emerald-700 transition-colors">
              <Sun className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <h1 className={`font-bold text-xl tracking-tight transition-colors ${isDark ? 'text-white' : 'text-emerald-950'}`}>
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

        {/* Navigation & Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Main Navigation Tabs */}
          <div
            className={`hidden md:flex items-center gap-1 p-1 rounded-xl border transition-colors ${
              isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              onClick={() => setActiveView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'dashboard'
                  ? isDark
                    ? 'bg-[#27272a] text-white shadow-xs'
                    : 'bg-white text-emerald-900 shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Proyectos</span>
            </button>

            <button
              onClick={() => setActiveView('simulator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'simulator'
                  ? isDark
                    ? 'bg-[#27272a] text-white shadow-xs'
                    : 'bg-white text-emerald-900 shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Simulador</span>
            </button>

            <button
              onClick={() => setActiveView('pdf-preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === 'pdf-preview'
                  ? isDark
                    ? 'bg-[#27272a] text-white shadow-xs'
                    : 'bg-white text-emerald-900 shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Propuesta PDF</span>
            </button>
          </div>

          {/* Theme Toggle Button (Selector de Modo Oscuro / Claro) */}
          <button
            onClick={toggleSidebarTheme}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer shadow-xs text-xs font-bold ${
              isDark
                ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 hover:bg-[#323238]'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
                <span className="hidden sm:inline">Modo Oscuro</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Modo Claro</span>
              </>
            )}
          </button>

          <div className={`flex items-center gap-2 border-l pl-3 ${isDark ? 'border-[#27272a]' : 'border-slate-200'}`}>
            {/* Button Buscar Actualizaciones */}
            <button
              onClick={openUpdateModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shadow-xs cursor-pointer ${
                isDark
                  ? 'border-[#3f3f46] bg-[#27272a] hover:bg-[#323238] text-zinc-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title="Buscar actualizaciones en GitHub"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Actualizaciones</span>
            </button>

            {/* Save Button (in Simulator View) */}
            {activeView === 'simulator' && (
              <button
                onClick={saveActiveProject}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isDark
                    ? 'border-emerald-700/80 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                }`}
                title="Guardar cambios de la simulación"
              >
                <Save className="w-3.5 h-3.5 text-emerald-500" />
                <span>Guardar Cambios</span>
              </button>
            )}

            {/* View Specific Actions */}
            {activeView === 'pdf-preview' ? (
              <button
                onClick={() => setActiveView('simulator')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white transition-colors text-xs font-bold shadow-xs cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver a Simulación
              </button>
            ) : activeView === 'dashboard' ? (
              <button
                onClick={openNewProjectModal}
                className="bg-emerald-700 text-white hover:bg-emerald-800 transition-all px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nueva Simulación
              </button>
            ) : (
              <button
                onClick={() => setActiveView('pdf-preview')}
                className="bg-emerald-700 text-white hover:bg-emerald-800 transition-all px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Ver Propuesta PDF
              </button>
            )}
          </div>
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

      {/* Modals */}
      <NewProjectModal />
      <UpdateModal />
    </>
  );
};
