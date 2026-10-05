import React from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { EquipmentManagerSettingsTab } from '../../common/EquipmentManagerSettingsTab';

export const EquipmentSection: React.FC = () => {
  const isDark = useSimulationStore((s) => s.sidebarTheme === 'dark');
  const { equipmentConflicts, equipmentCatalog, resolveEquipmentConflict, syncSettings } = useSimulationStore();

  const canWrite = !syncSettings.currentUser || ['ADMIN', 'EDITOR'].includes(syncSettings.currentUser.role);

  return (
    <section id="sec-catalogo" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Catálogo de Equipos</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Administra módulos fotovoltaicos, inversores y almacenamiento BESS compartidos en la nube.
        </p>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs">
        {Object.entries(equipmentConflicts).map(([id, conflict]) => <div key={id} role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Conflicto: {equipmentCatalog.find((item) => item.id === id)?.displayName || id}</p>
          <p className="mt-1">Se conservan tus cambios. Versión del servidor: {conflict.serverVersion ?? 'equipo eliminado'}.</p>
          <div className="mt-3 flex flex-wrap gap-3" hidden={!canWrite}>
            {conflict.serverItem && <button type="button" onClick={() => resolveEquipmentConflict(id, 'accept_server')} className="min-h-9 rounded-md border border-amber-300 px-3 text-xs font-medium">Usar versión del servidor</button>}
            {conflict.serverItem?.organizationId === syncSettings.currentUser?.organizationId && <button type="button" onClick={() => resolveEquipmentConflict(id, 'keep_local')} className="min-h-9 rounded-md border border-amber-300 px-3 text-xs font-medium">Guardar mis cambios sobre esa versión</button>}
            <button type="button" onClick={() => resolveEquipmentConflict(id, 'fork')} className="min-h-9 rounded-md border border-amber-300 px-3 text-xs font-medium">Conservar como equipo nuevo</button>
          </div>
        </div>)}
        <EquipmentManagerSettingsTab isDark={isDark} />
      </div>
    </section>
  );
};
