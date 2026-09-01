import React from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { EquipmentManagerSettingsTab } from '../../common/EquipmentManagerSettingsTab';

export const EquipmentSection: React.FC = () => {
  const isDark = useSimulationStore((s) => s.sidebarTheme === 'dark');

  return (
    <section id="sec-catalogo" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Catálogo de Equipos</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Administra módulos fotovoltaicos, inversores y almacenamiento BESS compartidos en la nube.
        </p>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs">
        <EquipmentManagerSettingsTab isDark={isDark} />
      </div>
    </section>
  );
};
