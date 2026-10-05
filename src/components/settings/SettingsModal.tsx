import React, { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SettingsSidebar } from './SettingsSidebar';
import { settingsSections, resolveSettingsSection, SettingsSectionId } from './settingsNavigation';
import { ProfileSection } from './sections/ProfileSection';
import { SimulationPreferencesSection } from './sections/SimulationPreferencesSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { EquipmentSection } from './sections/EquipmentSection';
import { CloudflareProposalsSection } from './sections/CloudflareProposalsSection';
import { OrganizationSection } from './sections/OrganizationSection';
import { ApplicationFeaturesSection } from './sections/ApplicationFeaturesSection';
import { BackupSection } from './sections/BackupSection';

const sectionComponents: Record<SettingsSectionId, React.ComponentType> = {
  funciones: ApplicationFeaturesSection, cuenta: ProfileSection, preferencias: SimulationPreferencesSection, integraciones: IntegrationsSection,
  catalogo: EquipmentSection, cloudflare: CloudflareProposalsSection, organizacion: OrganizationSection, respaldo: BackupSection,
};

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, closeSettingsModal, sidebarTheme, toggleSidebarTheme, settingsActiveTab } = useSimulationStore();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('cuenta');
  const [visitedSections, setVisitedSections] = useState<Set<SettingsSectionId>>(new Set());
  const scrollRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isDark = sidebarTheme === 'dark';

  useEffect(() => {
    if (!isSettingsModalOpen) return;
    const section = resolveSettingsSection(settingsActiveTab);
    setActiveSection(section);
    setVisitedSections(new Set([section]));
  }, [isSettingsModalOpen, settingsActiveTab]);
  useEffect(() => {
    if (!isSettingsModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeSettingsModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSettingsModalOpen, closeSettingsModal]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (isSettingsModalOpen) headingRef.current?.focus();
  }, [activeSection, isSettingsModalOpen]);

  if (!isSettingsModalOpen) return null;
  const section = settingsSections.find((item) => item.id === activeSection)!;
  return (
    <div className={`settings-workspace fixed inset-y-0 right-0 left-16 z-40 flex overflow-hidden border-l border-slate-200 dark:border-zinc-800 ${isDark ? 'dark bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'}`}>
      <SettingsSidebar activeSection={activeSection} onSelectSection={(id) => {
        setActiveSection(id);
        // Keep visited forms mounted so navigating does not discard local edits.
        setVisitedSections((previous) => new Set([...previous, id]));
      }} onClose={closeSettingsModal} isDark={isDark} onToggleTheme={toggleSidebarTheme} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center border-b border-slate-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-slate-800 dark:text-zinc-100 focus:outline-none">Configuración <span className="mx-3 font-normal text-slate-400" aria-hidden="true">/</span> {section.label}</h2>
        </header>
        <main ref={scrollRef} aria-label={section.label} className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
          <div className="mx-auto w-full max-w-5xl pb-12">
            {settingsSections.filter((item) => visitedSections.has(item.id)).map((item) => {
              const Component = sectionComponents[item.id];
              return <div key={item.id} hidden={activeSection !== item.id}><Component /></div>;
            })}
          </div>
        </main>
      </div>
    </div>
  );
};
