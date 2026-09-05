import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ProjectSimulation } from '../../types';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';
import {
  MapPin,
  Zap,
  RotateCcw,
  Trash2,
  Eye,
  Clock,
  AlertTriangle,
  User,
} from 'lucide-react';

interface TrashProjectCardProps {
  project: ProjectSimulation;
}

export const TrashProjectCard: React.FC<TrashProjectCardProps> = ({ project }) => {
  const {
    setActiveProject,
    restoreProject,
    hardDeleteProject,
  } = useSimulationStore();

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // DC System capacity
  const dcKWp = calculateDCCapacityKWp(project.specs?.panelPowerW || 620, project.specs?.panelCount || 0);

  // Calculation of days remaining (30 days total retention)
  const { daysRemaining, deletedDateFormatted } = React.useMemo(() => {
    const deletedTime = project.deletedAt
      ? new Date(project.deletedAt).getTime()
      : (project.updatedAt ? new Date(project.updatedAt).getTime() : Date.now());

    const daysElapsed = Math.floor((Date.now() - deletedTime) / (1000 * 60 * 60 * 24));
    const left = Math.max(0, 30 - daysElapsed);

    let dateStr = 'Fecha N/A';
    try {
      dateStr = new Date(deletedTime).toLocaleDateString('es-DO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      // ignore
    }

    return { daysRemaining: left, deletedDateFormatted: dateStr };
  }, [project.deletedAt, project.updatedAt]);

  const handleOpenReadOnly = () => {
    setActiveProject(project.id);
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    restoreProject(project.id);
  };

  const handleHardDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`¿Estás completamente seguro de eliminar DEFINITIVAMENTE la propuesta "${project.client?.name}"?\n\nEsta acción NO se puede deshacer y borrará los datos permanentemente.`)) {
      hardDeleteProject(project.id);
    }
  };

  return (
    <div
      onClick={handleOpenReadOnly}
      className="bg-white dark:bg-[#181d27] border border-rose-200/80 dark:border-rose-950/70 rounded-3xl p-6 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between gap-4 cursor-pointer hover:border-rose-300 dark:hover:border-rose-800/80 group relative select-none"
    >
      {/* 🏷️ Top Row: Countdown Tag & Acciones */}
      <div className="flex items-center justify-between">
        {/* Badge de Días Restantes */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            daysRemaining <= 5
              ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-400 border border-red-200 dark:border-red-900'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40'
          }`}
          title="Tiempo antes de eliminación permanente"
        >
          {daysRemaining <= 5 ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          )}
          <span>
            {daysRemaining === 0
              ? 'Expira hoy'
              : `Se elimina en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Acciones de Papelera */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Botón Restaurar */}
          <button
            type="button"
            onClick={handleRestore}
            className="p-2 rounded-xl text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all cursor-pointer shadow-2xs group/restore"
            title="Restaurar Proyecto"
          >
            <RotateCcw className="w-4 h-4 group-hover/restore:-rotate-45 transition-transform" />
          </button>

          {/* Botón Eliminar Definitivamente */}
          <button
            type="button"
            onClick={handleHardDelete}
            className="p-2 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-all cursor-pointer shadow-2xs group/del"
            title="Eliminar Definitivamente"
          >
            <Trash2 className="w-4 h-4 group-hover/del:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* 👤 Client & Project Info */}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
          {project.client?.name || 'Cliente'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
          {project.client?.company || 'Comercial / Residencial'}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
          <span className="font-mono bg-slate-100 dark:bg-[#202634] px-2 py-0.5 rounded-md text-slate-600 dark:text-zinc-300">
            {project.client?.projectId || 'PRJ'}
          </span>
          {project.client?.province && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{project.client.province}</span>
            </span>
          )}
        </div>
      </div>

      {/* ⚡ Metrics Row */}
      <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-[#222836]">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
            Potencia DC
          </span>
          <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono flex items-center gap-1 mt-0.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            {dcKWp.toFixed(2)} kWp
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
            Paneles / Inv.
          </span>
          <span className="text-sm font-bold text-slate-700 dark:text-zinc-300 font-mono mt-0.5">
            {project.specs?.panelCount || 0} uds
          </span>
        </div>
      </div>

      {/* 📅 Bottom Row: Deletion Metadata & Read-Only Hint */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 pt-1">
        <div className="flex items-center gap-1.5 truncate">
          <User className="w-3 h-3 shrink-0 text-slate-400" />
          <span className="truncate">
            Por {project.deletedBy || 'Ing. Solar'} • {deletedDateFormatted}
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-400 font-semibold group-hover:text-rose-500 transition-colors shrink-0">
          <Eye className="w-3.5 h-3.5" />
          <span>Ver Lectura</span>
        </div>
      </div>
    </div>
  );
};
