import React from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { settingsSections, SettingsSectionId } from './settingsNavigation';
interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelectSection: (id: SettingsSectionId) => void;
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}
export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ activeSection, onSelectSection, onClose, isDark, onToggleTheme }) => (
  <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:w-64">
    <div className="px-5 py-6">
      <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Configuración</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Tu espacio de trabajo.</p>
    </div>
    <nav aria-label="Categorías de configuración" className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
      {['Personal', 'Aplicación', 'Administración'].map((group) => (
        <div key={group} className="mb-5">
          <p className="mb-2 px-3 text-xs font-medium text-slate-500 dark:text-zinc-400">{group}</p>
          <div className="flex flex-col gap-1">
            {settingsSections.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={activeSection === id ? 'page' : undefined} onClick={() => onSelectSection(id)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${activeSection === id ? 'bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
    <div className="flex flex-col gap-2 border-t border-slate-200 p-3 dark:border-zinc-800">
      <button type="button" onClick={onToggleTheme} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}<span>Tema {isDark ? 'oscuro' : 'claro'}</span>
      </button>
      <button type="button" onClick={onClose} className="flex min-h-10 items-center gap-3 rounded-lg bg-slate-900 px-3 text-left text-xs font-medium text-white hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700">
        <ArrowLeft className="h-4 w-4" /><span>Volver a SolarSim</span><kbd className="ml-auto text-slate-300">Esc</kbd>
      </button>
    </div>
  </aside>
);
