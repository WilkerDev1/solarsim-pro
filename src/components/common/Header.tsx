import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Sun, FileText, LayoutDashboard, Settings, Bell, Plus, ArrowLeft } from 'lucide-react';

export const Header: React.FC = () => {
  const { activeView, setActiveView, getActiveProject, createNewProject } = useSimulationStore();
  const activeProject = getActiveProject();

  return (
    <header className="bg-surface border-b border-outline-variant flex justify-between items-center px-6 h-16 w-full shrink-0 z-20 relative shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveView('dashboard')}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
            <Sun className="w-5 h-5 animate-pulse" />
          </div>
          <h1 className="font-display font-bold text-xl text-primary tracking-tight">SolarSim Pro</h1>
        </div>

        {/* Active Project Context Badge */}
        {activeView !== 'dashboard' && activeProject && (
          <div className="hidden md:flex items-center gap-2.5 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="font-medium text-sm text-on-surface truncate max-w-[220px]">
              {activeProject.client.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono">
              {activeProject.client.projectId}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/40">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'dashboard'
                ? 'bg-white text-primary shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Proyectos</span>
          </button>

          <button
            onClick={() => setActiveView('simulator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'simulator'
                ? 'bg-white text-primary shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Simulador</span>
          </button>

          <button
            onClick={() => setActiveView('pdf-preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeView === 'pdf-preview'
                ? 'bg-white text-primary shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Propuesta PDF</span>
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-outline-variant pl-4">
          {activeView === 'pdf-preview' ? (
            <button
              onClick={() => setActiveView('simulator')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container transition-colors text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Simulación
            </button>
          ) : activeView === 'dashboard' ? (
            <button
              onClick={() => createNewProject()}
              className="bg-primary text-white hover:bg-primary-dark transition-colors px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Simulación
            </button>
          ) : (
            <button
              onClick={() => setActiveView('pdf-preview')}
              className="bg-primary text-white hover:bg-primary-dark transition-colors px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Ver Propuesta PDF
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
