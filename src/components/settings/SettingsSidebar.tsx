import React from 'react';
import {
  Users,
  SlidersHorizontal,
  Sparkles,
  Layers,
  Building2,
  Database,
  ArrowLeft,
  Sun,
  Moon,
  ChevronRight,
  X,
} from 'lucide-react';

interface SettingsSidebarProps {
  activeSection: string;
  onSelectSection: (sectionId: string) => void;
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeSection,
  onSelectSection,
  onClose,
  isDark,
  onToggleTheme,
}) => {
  const navItems = [
    { id: 'cuenta', label: 'Cuenta y Perfiles', icon: Users },
    { id: 'preferencias', label: 'Preferencias de Simulación', icon: SlidersHorizontal },
    { id: 'integraciones', label: 'IA & Integraciones', icon: Sparkles },
    { id: 'catalogo', label: 'Catálogo de Equipos', icon: Layers },
    { id: 'organizacion', label: 'Organización & Equipo', icon: Building2 },
    { id: 'respaldo', label: 'Respaldo & Exportación', icon: Database },
  ];

  return (
    <aside className="w-72 md:w-80 h-full border-r border-slate-200/90 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 flex flex-col justify-between shrink-0 shadow-xs z-10 select-none">
      <div>
        {/* Header de Configuración */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-[#27272a]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Configuración</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Gestiona tus preferencias y cuenta.</p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menú de Accesos Directos */}
        <nav className="flex flex-col gap-1.5 mt-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100/80 dark:hover:bg-[#27272a] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Acciones Inferiores del Sidebar */}
      <div className="pt-4 border-t border-slate-100 dark:border-[#27272a] flex flex-col gap-2.5">
        {/* Botón Volver a la App */}
        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all bg-slate-900 text-white hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs active:scale-[0.98]"
          title="Volver a la vista principal (Esc)"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a SolarSim</span>
          <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Esc</span>
        </button>

        {/* Toggle de Modo Claro / Oscuro */}
        <button
          onClick={onToggleTheme}
          className="w-full py-2 px-4 rounded-xl text-xs font-medium flex items-center justify-between text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer border border-slate-200/60 dark:border-[#27272a]"
        >
          <span className="flex items-center gap-2">
            {isDark ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
            <span>Tema de Interfaz</span>
          </span>
          <span className="text-[11px] font-semibold">{isDark ? 'Modo Oscuro' : 'Modo Claro'}</span>
        </button>
      </div>
    </aside>
  );
};
