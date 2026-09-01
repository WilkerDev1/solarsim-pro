import React, { useState, useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { SettingsSidebar } from './SettingsSidebar';
import { ProfileSection } from './sections/ProfileSection';
import { SimulationPreferencesSection } from './sections/SimulationPreferencesSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { EquipmentSection } from './sections/EquipmentSection';
import { OrganizationSection } from './sections/OrganizationSection';
import { BackupSection } from './sections/BackupSection';

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, closeSettingsModal, sidebarTheme, setSidebarTheme } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';
  const [activeSection, setActiveSection] = useState<string>('cuenta');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Escuchar tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsModalOpen) {
        closeSettingsModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsModalOpen, closeSettingsModal]);

  // Scroll Spy para detectar la sección activa automáticamente
  useEffect(() => {
    if (!isSettingsModalOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const sections = ['cuenta', 'preferencias', 'integraciones', 'catalogo', 'organizacion', 'respaldo'];

    const handleScroll = () => {
      const scrollPos = container.scrollTop + 140;
      for (let i = sections.length - 1; i >= 0; i--) {
        const secEl = document.getElementById(`sec-${sections[i]}`);
        if (secEl && secEl.offsetTop <= scrollPos) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isSettingsModalOpen]);

  // Desplazamiento suave al hacer clic en un acceso directo del sidebar
  const handleSelectSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const target = document.getElementById(`sec-${sectionId}`);
    if (target && scrollContainerRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleToggleTheme = () => {
    setSidebarTheme(isDark ? 'light' : 'dark');
  };

  if (!isSettingsModalOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        isDark ? 'dark bg-[#0f0f11] text-zinc-100' : 'bg-[#f8fafc] text-slate-900'
      } overflow-hidden select-none animate-in fade-in duration-150`}
    >
      {/* 🧭 Sidebar de Accesos Directos y Tema */}
      <SettingsSidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onClose={closeSettingsModal}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      {/* 📜 Lienzo Continuo de Todas las Secciones */}
      <main
        ref={scrollContainerRef}
        className="flex-1 h-full overflow-y-auto overflow-x-hidden p-6 md:p-10 lg:p-12 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-12 pb-24">
          {/* 1. Perfil de Usuario */}
          <ProfileSection />

          <hr className="border-slate-200/60 dark:border-[#27272a]" />

          {/* 2. Preferencias de Simulación */}
          <SimulationPreferencesSection />

          <hr className="border-slate-200/60 dark:border-[#27272a]" />

          {/* 3. IA & Integraciones */}
          <IntegrationsSection />

          <hr className="border-slate-200/60 dark:border-[#27272a]" />

          {/* 4. Catálogo de Equipos */}
          <EquipmentSection />

          <hr className="border-slate-200/60 dark:border-[#27272a]" />

          {/* 5. Organización & Equipo RBAC */}
          <OrganizationSection />

          <hr className="border-slate-200/60 dark:border-[#27272a]" />

          {/* 6. Respaldo & Exportación */}
          <BackupSection />
        </div>
      </main>
    </div>
  );
};
