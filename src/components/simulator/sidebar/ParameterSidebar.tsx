import React, { useEffect, useRef, useState } from 'react';
import { ProjectSimulation, FinancialSummaryResult, ClientInfo, SystemSpecs, UtilityRates, FinancialParams } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { ParameterDockPanel } from './ParameterDockPanel';
import {
  toggleAll, financialsBadge, loadOpenSections, saveOpenSections, toggleSection as toggleSectionState,
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
}

export const ParameterSidebar: React.FC<ParameterSidebarProps> = ({
  project,
  projects,
  summary,
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
  const toggleAllSections = () => updateOpen(toggleAll(openSections));
  const badge = financialsBadge(project.financials);

  const renderBody = (key: DockSectionKey): React.ReactNode => {
    switch (key) {
      case 'client':
        return (
          <ClientParamsSection
            project={project}
            projects={projects}
            isIdUnlocked={isIdUnlocked}
            setIsIdUnlocked={setIsIdUnlocked}
            isFetchingSolar={isFetchingSolar}
            solarApiStatus={solarApiStatus}
            onFetchSolarApi={onFetchSolarApi}
            updateClient={updateClient}
          />
        );
      case 'rates':
        return <RatesParamsSection project={project} updateRates={updateRates} updateSpecs={updateSpecs} />;
      case 'equipment':
        return <EquipmentParamsSection project={project} summary={summary} updateSpecs={updateSpecs} />;
      case 'costs':
        return <PricingParamsSection project={project} summary={summary} updateSpecs={updateSpecs} />;
      case 'financials':
        return <FinancialsParamsSection project={project} updateFinancials={updateFinancials} />;
    }
  };

  return (
    <>
      {/* Left Sidebar: Parameters */}
      <aside
        style={{ width: `${Math.max(sidebarWidth || 380, 380)}px` }}
        className="flex flex-col shrink-0 h-full overflow-y-auto z-10 bg-pd-panel border-r border-pd-border shadow-sm transition-[background-color,border-color,color] duration-200"
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
        className={`w-1.5 hover:w-2 hover:bg-pd-accent cursor-col-resize shrink-0 transition-all z-20 relative group select-none ${
          isDragging ? 'bg-pd-accent w-2' : 'bg-pd-border'
        }`}
        title="Arrastra para cambiar el ancho de la barra de parámetros"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      </div>
    </>
  );
};
