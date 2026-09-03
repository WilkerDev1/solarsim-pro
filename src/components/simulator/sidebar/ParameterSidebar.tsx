import React, { useState } from 'react';
import { ProjectSimulation, FinancialSummaryResult, ClientInfo, SystemSpecs, UtilityRates, FinancialParams } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { ClientParamsSection } from './ClientParamsSection';
import { RatesParamsSection } from './RatesParamsSection';
import { EquipmentParamsSection } from './EquipmentParamsSection';
import { PricingParamsSection } from './PricingParamsSection';
import { FinancialsParamsSection } from './FinancialsParamsSection';
import { Save } from 'lucide-react';

interface ParameterSidebarProps {
  project: ProjectSimulation;
  projects: ProjectSimulation[];
  summary: FinancialSummaryResult;
  isDark: boolean;
  sidebarWidth: number;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  isFetchingSolar: boolean;
  solarApiStatus: string | null;
  onFetchSolarApi: () => void;
  updateClient: (client: Partial<ClientInfo>) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
  saveActiveProject: () => void;
}

export const ParameterSidebar: React.FC<ParameterSidebarProps> = ({
  project,
  projects,
  summary,
  isDark,
  sidebarWidth,
  isDragging,
  onMouseDown,
  isFetchingSolar,
  solarApiStatus,
  onFetchSolarApi,
  updateClient,
  updateSpecs,
  updateRates,
  updateFinancials,
  saveActiveProject,
}) => {
  const [isIdUnlocked, setIsIdUnlocked] = useState(false);

  // Accordion state for sidebar parameter categories (default: all collapsed)
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    client: false,
    rates: false,
    equipment: false,
    costs: false,
    financials: false,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const allSectionsOpen = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const nextState = !allSectionsOpen;
    setOpenSections({
      client: nextState,
      rates: nextState,
      equipment: nextState,
      costs: nextState,
      financials: nextState,
    });
  };

  return (
    <>
      {/* Left Sidebar: Parameters */}
      <aside
        style={{ width: `${Math.max(sidebarWidth || 380, 380)}px` }}
        className={`flex flex-col shrink-0 h-full overflow-y-auto z-10 transition-[background-color,border-color,color] duration-200 ${
          isDark
            ? 'bg-[#18181b] border-r border-[#27272a] text-zinc-100 shadow-xl'
            : 'bg-white border-r border-slate-200 text-slate-800 shadow-sm'
        }`}
      >
        <div
          className={`p-4 border-b flex justify-between items-center transition-colors ${
            isDark ? 'border-[#27272a] bg-[#121214]' : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div>
            <h2 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
              Parámetros
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Configurar restricciones del sistema
            </p>
          </div>
          <button
            onClick={saveActiveProject}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
              isDark
                ? 'border-emerald-700/80 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300'
                : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
            }`}
            title="Guardar cambios de la simulación"
          >
            <Save className="w-3.5 h-3.5 text-emerald-500" />
            <span>Guardar</span>
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Barra de control rápido: Expandir / Colapsar Todo */}
          <div className="flex justify-between items-center px-1 pb-0.5">
            <span className={`text-[11px] font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Categorías de Configuración
            </span>
            <button
              type="button"
              onClick={toggleAllSections}
              className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                isDark ? 'text-emerald-400 hover:bg-[#27272a]' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {allSectionsOpen ? 'Colapsar Todo' : 'Expandir Todo'}
            </button>
          </div>

          {/* 1. SECCIÓN: Proyecto y Cliente */}
          <ClientParamsSection
            project={project}
            projects={projects}
            isOpen={openSections.client}
            onToggle={() => toggleSection('client')}
            isDark={isDark}
            isIdUnlocked={isIdUnlocked}
            setIsIdUnlocked={setIsIdUnlocked}
            isFetchingSolar={isFetchingSolar}
            solarApiStatus={solarApiStatus}
            onFetchSolarApi={onFetchSolarApi}
            updateClient={updateClient}
          />

          {/* 2. SECCIÓN: Tarifas y Distribuidora */}
          <RatesParamsSection
            project={project}
            isOpen={openSections.rates}
            onToggle={() => toggleSection('rates')}
            isDark={isDark}
            updateRates={updateRates}
          />

          {/* 3. SECCIÓN: Equipamiento y Sistema */}
          <EquipmentParamsSection
            project={project}
            summary={summary}
            isOpen={openSections.equipment}
            onToggle={() => toggleSection('equipment')}
            isDark={isDark}
            updateSpecs={updateSpecs}
          />

          {/* 4. SECCIÓN: Costos y Margen de Venta */}
          <PricingParamsSection
            project={project}
            summary={summary}
            isOpen={openSections.costs}
            onToggle={() => toggleSection('costs')}
            isDark={isDark}
            updateSpecs={updateSpecs}
          />

          {/* 5. SECCIÓN: Finanzas e Incentivos */}
          <FinancialsParamsSection
            project={project}
            isOpen={openSections.financials}
            onToggle={() => toggleSection('financials')}
            isDark={isDark}
            updateFinancials={updateFinancials}
          />
        </div>

        <div
          className={`mt-auto p-4 border-t transition-colors ${
            isDark ? 'border-[#27272a] bg-[#121214]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            onClick={() => {
              useSimulationStore.setState({ activeProjectId: project.id });
            }}
            className={`w-full border transition-colors py-2 rounded-lg text-xs flex items-center justify-center gap-2 font-semibold shadow-xs cursor-pointer ${
              isDark
                ? 'bg-[#18181b] border-[#27272a] text-emerald-400 hover:bg-[#27272a]'
                : 'bg-white border-emerald-600 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Actualizar Simulación
          </button>
        </div>
      </aside>

      {/* Vertical Drag Handle for Sidebar Resizing */}
      <div
        onMouseDown={onMouseDown}
        className={`w-1.5 hover:w-2 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-all z-20 relative group select-none ${
          isDragging ? 'bg-emerald-500 w-2' : isDark ? 'bg-[#27272a]' : 'bg-slate-200'
        }`}
        title="Arrastra para cambiar el ancho de la barra de parámetros"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      </div>
    </>
  );
};
