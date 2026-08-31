import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Sun, Moon, FileText, LayoutDashboard, Save, Plus, ArrowLeft, RefreshCw, CheckCircle2, Sparkles, Bot, Share2, Globe, Settings, Cloud } from 'lucide-react';
import electsunEmblem from '../../assets/electsun-emblem-transparent.png';

export const Header: React.FC = () => {
  const {
    activeView,
    setActiveView,
    getActiveProject,
    openNewProjectModal,
    openUpdateModal,
    openAIInvoiceModal,
    openShareModal,
    openSettingsModal,
    syncSettings,
    isSyncing,
    saveActiveProject,
    exportProjectAsJSON,
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
            <img
              src={electsunEmblem}
              alt="Electsun Logo"
              className="w-8 h-8 object-contain transition-transform duration-200 group-hover:scale-105 select-none shrink-0"
            />
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
          {/* Project Navigation (Only shown when inside a project) */}
          {activeView !== 'dashboard' && (
            <div className="flex items-center gap-2">
              {/* Back to Projects Button */}
              <button
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  isDark
                    ? 'bg-[#27272a] border-[#3f3f46] text-zinc-200 hover:bg-[#323238] hover:text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title="Volver al catálogo de proyectos"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Proyectos</span>
              </button>

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
            </div>
          )}

          {/* Theme Toggle Button (Selector de Modo Oscuro / Claro - Icon Only) */}
          <button
            onClick={toggleSidebarTheme}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0 ${
              isDark
                ? 'bg-[#27272a] border-[#3f3f46] text-indigo-400 hover:bg-[#323238] hover:text-indigo-300'
                : 'bg-white border-slate-200 text-amber-500 hover:bg-slate-50 hover:text-amber-600'
            }`}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? (
              <Moon className="w-4 h-4 fill-indigo-400/20" />
            ) : (
              <Sun className="w-4 h-4 fill-amber-500/20" />
            )}
          </button>

          <div className={`flex items-center gap-2 border-l pl-3 ${isDark ? 'border-[#27272a]' : 'border-slate-200'}`}>
            {/* Button Escanear Factura con IA (Icono llamativo morado) */}
            <button
              onClick={openAIInvoiceModal}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all shadow-md cursor-pointer active:scale-95 group relative shrink-0 ${
                isDark
                  ? 'border-purple-500/60 bg-gradient-to-br from-purple-950 via-purple-900/70 to-indigo-950 text-purple-300 hover:border-purple-400 hover:shadow-purple-900/50 hover:scale-105'
                  : 'border-purple-300 bg-gradient-to-br from-purple-50 via-fuchsia-50 to-indigo-50 text-purple-600 hover:border-purple-400 hover:bg-purple-100 hover:shadow-purple-200/80 hover:scale-105'
              }`}
              title="Escanear factura eléctrica con IA (Google Gemini)"
            >
              <Sparkles className="w-4 h-4 text-purple-400 fill-purple-400/30 group-hover:rotate-12 transition-transform duration-300" />
            </button>

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

            {/* Button Ajustes / Configuración ⚙️ */}
            <button
              onClick={() => openSettingsModal('sync')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer relative group ${
                isDark
                  ? 'border-[#3f3f46] bg-[#27272a] hover:bg-[#323238] text-zinc-100 hover:border-emerald-500/70'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800 hover:border-emerald-500'
              }`}
              title="Centro de Ajustes: Sincronización en la nube, usuarios RBAC y configuración"
            >
              <Settings className={`w-3.5 h-3.5 text-emerald-500 group-hover:rotate-45 transition-transform duration-300 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Ajustes</span>
              {/* Online/User status dot indicator */}
              {syncSettings.currentUser ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs animate-pulse" title={`Sesión activa: ${syncSettings.currentUser.name} (${syncSettings.currentUser.role})`}></span>
              ) : syncSettings.authToken ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              ) : null}
            </button>

            {/* Share Web Proposal Button (when inside a Project) */}
            {activeView !== 'dashboard' && (
              <button
                onClick={openShareModal}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isDark
                    ? 'border-emerald-700/60 bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                }`}
                title="Compartir propuesta web interactiva y temporal (Cloudflare)"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Compartir Web</span>
              </button>
            )}

            {/* Export JSON Button (when inside a Project) */}
            {activeView !== 'dashboard' && (
              <button
                onClick={() => exportProjectAsJSON()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isDark
                    ? 'border-[#3f3f46] bg-[#27272a] hover:bg-[#323238] text-amber-300'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-amber-800'
                }`}
                title="Compartir / Exportar este proyecto como archivo JSON"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Exportar JSON</span>
              </button>
            )}

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
    </>
  );
};
