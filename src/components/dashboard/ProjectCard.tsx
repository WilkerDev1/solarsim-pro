import React from 'react';
import { ArrowUpRight, Cloud, Laptop, MapPin } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ProjectSimulation } from '../../types';
import { calculateTotalDCCapacityKWp, calculateTotalPanelCount } from '../../utils/equipmentSpecsUtils';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { projectDate, projectSyncLabel, projectType } from './projectPresentation';

export const ProjectCard: React.FC<{ project: ProjectSimulation }> = ({ project }) => {
  const setActiveProject = useSimulationStore((state) => state.setActiveProject);
  const capacity = calculateTotalDCCapacityKWp(project.specs);
  return (
    <article draggable onDragStart={(event) => {
      event.dataTransfer.setData('text/plain', project.id);
      event.dataTransfer.effectAllowed = 'move';
    }} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">{project.client.projectId || 'Sin código'}</span>
        <ProjectActionsMenu project={project} />
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-zinc-100">
        <button type="button" className="text-left hover:text-emerald-700 dark:hover:text-emerald-300" onClick={() => setActiveProject(project.id, 'project-hub')}>{project.client.name || 'Sin nombre'}</button>
      </h3>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-zinc-400"><MapPin className="h-3.5 w-3.5 shrink-0" />{project.client.province || project.client.location || 'Sin ubicación'}</p>
      <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-100 py-4 text-xs dark:border-zinc-800">
        <div><dt className="text-slate-500 dark:text-zinc-400">Potencia DC</dt><dd className="mt-1.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white">{capacity.toFixed(2)} <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">kWp</span></dd></div>
        <div><dt className="text-slate-500 dark:text-zinc-400">Distribuidora</dt><dd className="mt-1.5 font-medium text-slate-800 dark:text-zinc-200">{project.rates.distributor}</dd></div>
        <div><dt className="text-slate-500 dark:text-zinc-400">Sistema</dt><dd className="mt-1.5 font-medium text-slate-800 dark:text-zinc-200">{projectType(project)}</dd></div>
        <div><dt className="text-slate-500 dark:text-zinc-400">Módulos</dt><dd className="mt-1.5 font-medium tabular-nums text-slate-800 dark:text-zinc-200">{calculateTotalPanelCount(project.specs)} módulos</dd></div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
        <span className="truncate" title={project.authorName}>{project.authorName || 'Sin autor'}</span>
        <span className="flex shrink-0 items-center gap-1.5">{project.syncStatus === 'synced' ? <Cloud className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}{projectSyncLabel(project)}</span>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-zinc-800">
        <time className="text-xs text-slate-500 dark:text-zinc-400">{projectDate(project)}</time>
        <button type="button" onClick={() => setActiveProject(project.id, 'project-hub')} className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">Abrir propuesta<ArrowUpRight className="h-3.5 w-3.5" /></button>
      </div>
    </article>
  );
};
