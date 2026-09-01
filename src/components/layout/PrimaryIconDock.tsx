import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Sun,
  Moon,
  FileText,
  Sparkles,
  Cpu,
  Plus,
  RefreshCw,
  Settings,
} from 'lucide-react';

export const PrimaryIconDock: React.FC = () => {
  const {
    activeView,
    setActiveView,
    sidebarTheme,
    toggleSidebarTheme,
    openNewProjectModal,
    openAIInvoiceModal,
    openAIDatasheetModal,
    openUpdateModal,
    openSettingsModal,
    updateInfo,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const hasUpdate = updateInfo.state === 'downloaded' || updateInfo.state === 'downloading';

  return (
    <aside
      className="w-16 h-full bg-[#1b222d] border-r border-[#2a3444] flex flex-col items-center justify-between py-5 shrink-0 z-40 select-none shadow-lg"
      aria-label="Barra de Navegación Principal"
    >
      {/* Zona Superior: Theme Toggle & Navegación */}
      <div className="flex flex-col items-center gap-5 w-full">
        {/* Toggle de Tema (Sol/Luna) */}
        <button
          onClick={toggleSidebarTheme}
          className="w-10 h-10 rounded-xl bg-[#2e3748] hover:bg-[#384358] text-amber-400 border border-[#3e4b62] flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 group"
          title={`Cambiar a ${isDark ? 'Modo Claro' : 'Modo Oscuro'}`}
        >
          {isDark ? (
            <Sun className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Separador sutil */}
        <div className="w-8 h-[1px] bg-[#2a3444]" />

        {/* Iconos de Acción Principal */}
        <nav className="flex flex-col items-center gap-3 w-full px-2">
          {/* 1. Proyectos / Dashboard */}
          <button
            onClick={() => setActiveView('dashboard')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              activeView === 'dashboard'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#283243]'
            }`}
            title="Catálogo de Proyectos (Home)"
          >
            <FileText className="w-5 h-5" />
            {activeView === 'dashboard' && (
              <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-400 rounded-r-full" />
            )}
          </button>

          {/* 2. Escáner de Facturas con IA Gemini */}
          <button
            onClick={openAIInvoiceModal}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-[#283243] transition-all cursor-pointer group relative"
            title="Escanear Factura Eléctrica con IA (Gemini)"
          >
            <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform text-purple-400" />
          </button>

          {/* 3. Escáner de Equipos / Fichas Técnicas con IA Gemini */}
          <button
            onClick={openAIDatasheetModal}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-[#283243] transition-all cursor-pointer group relative"
            title="Escanear Ficha Técnica de Equipos con IA (Gemini)"
          >
            <Cpu className="w-5 h-5 group-hover:scale-110 transition-transform text-cyan-400" />
          </button>

          {/* 4. Acción Rápida: Crear Nueva Simulación */}
          <button
            onClick={openNewProjectModal}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-300 hover:bg-[#283243] transition-all cursor-pointer group"
            title="Crear Nueva Simulación (+)"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform text-emerald-400" />
          </button>
        </nav>
      </div>

      {/* Zona Inferior: Actualizaciones & Ajustes */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Botón de Actualizaciones */}
        <button
          onClick={openUpdateModal}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-300 hover:bg-[#283243] transition-all cursor-pointer group relative"
          title="Buscar Actualizaciones de Software"
        >
          <RefreshCw
            className={`w-5 h-5 group-hover:rotate-180 transition-transform duration-500 ${
              hasUpdate ? 'text-emerald-400' : 'text-slate-400'
            }`}
          />
          {hasUpdate && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#1b222d] animate-pulse" />
          )}
        </button>

        {/* Centro de Ajustes y Configuración */}
        <button
          onClick={() => openSettingsModal('sync')}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#283243] transition-all cursor-pointer group"
          title="Centro de Configuración"
        >
          <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform" />
        </button>
      </div>
    </aside>
  );
};
