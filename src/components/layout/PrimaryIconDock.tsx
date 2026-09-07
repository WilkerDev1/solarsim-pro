import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Sun,
  Moon,
  FileText,
  Sparkles,
  Cpu,
  Tag,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  X,
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
    openAIPriceCatalogModal,
    openUpdateModal,
    openSettingsModal,
    isSettingsModalOpen,
    closeSettingsModal,
    updateInfo,
    setActiveFolderId,
    setActiveTeamMemberFilter,
    isTrashActive,
    setIsTrashActive,
    projects,
    geminiModel,
  } = useSimulationStore();

  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);
  const aiMenuRef = useRef<HTMLDivElement>(null);

  const isDark = sidebarTheme === 'dark';
  const hasUpdate = updateInfo.state === 'downloaded' || updateInfo.state === 'downloading';
  const trashedCount = React.useMemo(() => projects.filter((p) => p.isDeleted).length, [projects]);

  // Close AI flyout when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
        setIsAIMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAIMenuOpen(false);
      }
    };
    if (isAIMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAIMenuOpen]);

  return (
    <aside
      className="w-16 h-full bg-[#1b222d] border-r border-[#2a3444] flex flex-col items-center justify-between py-5 shrink-0 z-40 select-none shadow-lg relative"
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
            onClick={() => {
              if (isSettingsModalOpen) closeSettingsModal();
              setActiveView('dashboard');
              setIsTrashActive(false);
              setActiveFolderId(null);
              setActiveTeamMemberFilter(null);
              setIsAIMenuOpen(false);
            }}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              !isSettingsModalOpen && activeView === 'dashboard' && !isTrashActive
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#283243]'
            }`}
            title="Catálogo de Proyectos (Home)"
          >
            <FileText className="w-5 h-5" />
            {!isSettingsModalOpen && activeView === 'dashboard' && !isTrashActive && (
              <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-400 rounded-r-full" />
            )}
          </button>

          {/* 2. Botón Unificado de IA Gemini con Menú Selector */}
          <div className="relative">
            <button
              onClick={() => setIsAIMenuOpen(!isAIMenuOpen)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group relative ${
                isAIMenuOpen
                  ? 'bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-md shadow-purple-950/50 font-bold'
                  : 'text-slate-400 hover:text-purple-300 hover:bg-[#283243]'
              }`}
              title="Herramientas de Inteligencia Artificial (Facturas, Datasheets y Precios)"
            >
              <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform text-purple-400" />
              {isAIMenuOpen && (
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-purple-400 rounded-r-full" />
              )}
            </button>

            {/* Menú Desplegable / Selector Flotante de IA */}
            {isAIMenuOpen && (
              <div
                ref={aiMenuRef}
                className="fixed left-[4.5rem] top-28 w-80 bg-[#161b24]/95 border border-[#2d3748] rounded-2xl shadow-2xl p-2.5 flex flex-col gap-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
              >
                {/* Cabecera del Menú */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#242c3b] mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-wide">Herramientas de IA</h4>
                      <p className="text-[10px] text-slate-400">Google Gemini Multimodal</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAIMenuOpen(false)}
                    className="p-1 rounded-lg hover:bg-[#242c3b] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Cerrar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Opción 1: Smart Proposal Studio / Facturas EDE */}
                <button
                  onClick={() => {
                    if (isSettingsModalOpen) closeSettingsModal();
                    setIsAIMenuOpen(false);
                    openAIInvoiceModal();
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#202734] transition-all flex items-center gap-3 text-left group cursor-pointer border border-transparent hover:border-purple-500/30"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 group-hover:bg-purple-500/25 text-purple-400 flex items-center justify-center shrink-0 transition-colors">
                    <FileText className="w-4.5 h-4.5 group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white group-hover:text-purple-300 flex items-center justify-between">
                      <span>Escanear Factura Eléctrica</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-mono">95% Listo</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      Extrae NIC, 12 meses de consumo y dimensiona propuesta solar EDE.
                    </p>
                  </div>
                </button>

                {/* Opción 2: Fichas Técnicas (Datasheets) */}
                <button
                  onClick={() => {
                    if (isSettingsModalOpen) closeSettingsModal();
                    setIsAIMenuOpen(false);
                    openAIDatasheetModal();
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#202734] transition-all flex items-center gap-3 text-left group cursor-pointer border border-transparent hover:border-cyan-500/30"
                >
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 group-hover:bg-cyan-500/25 text-cyan-400 flex items-center justify-center shrink-0 transition-colors">
                    <Cpu className="w-4.5 h-4.5 group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300 flex items-center justify-between">
                      <span>Escanear Ficha Técnica</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-mono">Datasheet</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      Extrae parámetros de paneles, inversores y baterías BESS.
                    </p>
                  </div>
                </button>

                {/* Opción 3: Listas de Precios de Proveedores */}
                <button
                  onClick={() => {
                    if (isSettingsModalOpen) closeSettingsModal();
                    setIsAIMenuOpen(false);
                    openAIPriceCatalogModal();
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#202734] transition-all flex items-center gap-3 text-left group cursor-pointer border border-transparent hover:border-emerald-500/30"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 group-hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0 transition-colors">
                    <Tag className="w-4.5 h-4.5 group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white group-hover:text-emerald-300 flex items-center justify-between">
                      <span>Escanear Lista de Precios</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono">Precios</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      Procesa cotizaciones y listas de distribuidores con coincidencia inteligente.
                    </p>
                  </div>
                </button>

                {/* Pie de Menú: Configuración de IA */}
                <div className="pt-2 mt-1 border-t border-[#242c3b] flex items-center justify-between px-2.5">
                  <span className="text-[10px] text-slate-400 truncate max-w-[170px]">
                    Modelo: <span className="text-zinc-300 font-mono">{geminiModel || 'gemini-3.5-flash-lite'}</span>
                  </span>
                  <button
                    onClick={() => {
                      setIsAIMenuOpen(false);
                      openSettingsModal('ai');
                    }}
                    className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Ajustes IA</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Acción Rápida: Crear Nueva Simulación */}
          <button
            onClick={() => {
              if (isSettingsModalOpen) closeSettingsModal();
              setIsAIMenuOpen(false);
              openNewProjectModal();
            }}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-300 hover:bg-[#283243] transition-all cursor-pointer group"
            title="Crear Nueva Simulación (+)"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform text-emerald-400" />
          </button>
        </nav>
      </div>

      {/* Zona Inferior: Actualizaciones & Ajustes */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Papelera de Reciclaje */}
        <button
          onClick={() => {
            if (isSettingsModalOpen) closeSettingsModal();
            setActiveView('dashboard');
            setIsTrashActive(true);
            setActiveFolderId(null);
            setActiveTeamMemberFilter(null);
          }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
            !isSettingsModalOpen && activeView === 'dashboard' && isTrashActive
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs font-bold'
              : 'text-slate-400 hover:text-rose-400 hover:bg-[#283243]'
          }`}
          title={`Papelera de Reciclaje (${trashedCount} propuesta${trashedCount === 1 ? '' : 's'})`}
        >
          <Trash2 className="w-5 h-5 group-hover:scale-105 transition-transform" />
          {trashedCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
              {trashedCount > 99 ? '99+' : trashedCount}
            </span>
          )}
          {!isSettingsModalOpen && activeView === 'dashboard' && isTrashActive && (
            <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-rose-400 rounded-r-full" />
          )}
        </button>

        {/* Botón de Actualizaciones */}
        <button
          onClick={() => {
            if (isSettingsModalOpen) closeSettingsModal();
            openUpdateModal();
          }}
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
          onClick={() => {
            if (isSettingsModalOpen) {
              closeSettingsModal();
            } else {
              openSettingsModal('account');
            }
          }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer group relative ${
            isSettingsModalOpen
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs font-bold'
              : 'text-slate-400 hover:text-white hover:bg-[#283243]'
          }`}
          title={isSettingsModalOpen ? 'Cerrar Configuración (Esc)' : 'Centro de Configuración'}
        >
          <Settings
            className={`w-5 h-5 transition-transform duration-300 ${
              isSettingsModalOpen ? 'rotate-45 text-emerald-400' : 'group-hover:rotate-45'
            }`}
          />
          {isSettingsModalOpen && (
            <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-400 rounded-r-full" />
          )}
        </button>
      </div>
    </aside>
  );
};
