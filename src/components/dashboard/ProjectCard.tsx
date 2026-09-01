import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ProjectSimulation } from '../../types';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';
import {
  MapPin,
  Zap,
  Share2,
  Copy,
  Trash2,
  Eye,
  Cloud,
  Laptop,
  Check,
} from 'lucide-react';

interface ProjectCardProps {
  project: ProjectSimulation;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const {
    setActiveProject,
    duplicateProject,
    deleteProject,
    openShareModal,
  } = useSimulationStore();

  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // DC System capacity
  const dcKWp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);

  // Format date
  const formattedDate = React.useMemo(() => {
    try {
      const d = new Date(project.createdAt);
      return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return 'Fecha N/A';
    }
  }, [project.createdAt]);

  // Project type determination
  const projectType = React.useMemo(() => {
    if (project.specs.hasBattery) return 'Híbrido';
    if (project.rates.isZeroExport) return 'Inyección Cero';
    return 'Inyección';
  }, [project.specs.hasBattery, project.rates.isZeroExport]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', project.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateProject(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`¿Estás seguro de que deseas eliminar la propuesta "${project.client.name}"?`)) {
      setIsDeleting(true);
      deleteProject(project.id);
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveProject(project.id);
    openShareModal();
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onClick={() => setActiveProject(project.id)}
      className="bg-white dark:bg-[#181d27] border border-slate-200/90 dark:border-[#293242] rounded-3xl p-6 shadow-xs hover:shadow-xl transition-all duration-200 flex flex-col justify-between gap-4 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700/60 group relative select-none"
    >
      {/* 🏷️ Top Row: ID Tag & Quick Actions */}
      <div className="flex items-center justify-between">
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          {project.client.projectId || 'SP-2026-001'}
        </span>

        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleShare}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-[#222a38] transition-colors cursor-pointer"
            title="Compartir Propuesta Web"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-[#222a38] transition-colors cursor-pointer"
            title="Duplicar Propuesta"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-[#222a38] transition-colors cursor-pointer"
            title="Eliminar Propuesta"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 👤 Project Identity */}
      <div>
        <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
          {project.client.name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 mt-1 truncate">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{project.client.province || project.client.location || 'República Dominicana'}</span>
        </div>
      </div>

      {/* 📊 Technical Summary Box (Light Blue / Dark Container) */}
      <div className="bg-slate-50/90 dark:bg-[#12161f] border border-slate-200/70 dark:border-[#222938] rounded-2xl p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
              Potencia DC
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
              {dcKWp.toFixed(2)} <span className="text-xs font-semibold">kWp</span>
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
              Distribuidora
            </span>
            <div className="flex items-center gap-1 text-sm font-black text-slate-800 dark:text-zinc-100 truncate">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-500" />
              <span className="truncate">{project.rates.distributor}</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/50 dark:border-[#222938]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
            Tipo de Proyecto
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            {projectType}
          </span>
        </div>
      </div>

      {/* 👥 Author & Sync Status */}
      <div className="flex items-center justify-between text-xs pt-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shadow-2xs">
            {project.authorName ? project.authorName.charAt(0).toUpperCase() : 'U'}
          </div>
          <span className="font-semibold text-slate-700 dark:text-zinc-300 text-xs truncate max-w-[120px]">
            {project.authorName || 'Ing. Solar'}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
          <Cloud className="w-3.5 h-3.5 text-sky-500" />
          <span>{project.syncStatus === 'synced' ? 'Nube' : 'Local'}</span>
        </div>
      </div>

      {/* 📅 Date & Module Count Details */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500">
        <span>{formattedDate}</span>
        <span>
          {project.specs.panelCount} Paneles ({project.specs.panelPowerW}W)
        </span>
      </div>

      {/* 👁️ Bottom Action Button: Detalles */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActiveProject(project.id);
        }}
        className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-[#202734] dark:hover:bg-[#2a3446] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>Detalles</span>
      </button>
    </div>
  );
};
