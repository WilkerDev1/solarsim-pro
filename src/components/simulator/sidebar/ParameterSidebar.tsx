import React, { useEffect, useRef, useState } from 'react';
import { ProjectSimulation, FinancialSummaryResult, ClientInfo, SystemSpecs, UtilityRates, FinancialParams } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { ParameterDockPanel } from './ParameterDockPanel';
import {
  allSections, anySectionOpen, financialsBadge, loadOpenSections, saveOpenSections, toggleSection as toggleSectionState,
  type DockSectionKey, type OpenSections,
} from '../params/logic/dockSections';
import { ClientParamsSection } from './ClientParamsSection';
import { RatesParamsSection } from './RatesParamsSection';
import { EquipmentParamsSection } from './EquipmentParamsSection';
import { PricingParamsSection } from './PricingParamsSection';
import { FinancialsParamsSection } from './FinancialsParamsSection';

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

  const userId = useSimulationStore((st) => st.syncSettings.currentUser?.id);
  const [openSections, setOpenSections] = useState<OpenSections>(() => loadOpenSections(userId));

  // Recarga el estado recordado si cambia el usuario autenticado.
  const loadedFor = useRef(userId);
  useEffect(() => {
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    setOpenSections(loadOpenSections(userId));
  }, [userId]);

  const updateOpen = (next: OpenSections) => {
    setOpenSections(next);
    saveOpenSections(next, userId);
  };
  const toggleSection = (key: DockSectionKey) => updateOpen(toggleSectionState(openSections, key));
  const toggleAllSections = () => updateOpen(allSections(!anySectionOpen(openSections)));
  const badge = financialsBadge(project.financials);

  const renderBody = (key: DockSectionKey): React.ReactNode => {
    switch (key) {
      case 'client':
        return (
          <ClientParamsSection
            project={project}
            projects={projects}
            isDark={isDark}
            isIdUnlocked={isIdUnlocked}
            setIsIdUnlocked={setIsIdUnlocked}
            isFetchingSolar={isFetchingSolar}
            solarApiStatus={solarApiStatus}
            onFetchSolarApi={onFetchSolarApi}
            updateClient={updateClient}
          />
        );
      case 'rates':
        return <RatesParamsSection project={project} isDark={isDark} updateRates={updateRates} updateSpecs={updateSpecs} />;
      case 'equipment':
        return <EquipmentParamsSection project={project} summary={summary} isDark={isDark} updateSpecs={updateSpecs} />;
      case 'costs':
        return <PricingParamsSection project={project} summary={summary} isDark={isDark} updateSpecs={updateSpecs} />;
      case 'financials':
        return <FinancialsParamsSection project={project} isDark={isDark} updateFinancials={updateFinancials} />;
    }
  };

  return (
    <>
      {/* Left Sidebar: Parameters */}
      <aside
        style={{ width: `${Math.max(sidebarWidth || 380, 380)}px` }}
        className={`flex flex-col shrink-0 h-full overflow-y-auto z-10 transition-[background-color,border-color,color] duration-200 ${
          isDark ? 'bg-[#18181b] border-r border-[#27272a] shadow-xl' : 'bg-white border-r border-slate-200 shadow-sm'
        }`}
      >
        <ParameterDockPanel
          open={openSections}
          onToggle={toggleSection}
          onToggleAll={toggleAllSections}
          financialsBadge={badge}
          renderBody={renderBody}
        />
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
