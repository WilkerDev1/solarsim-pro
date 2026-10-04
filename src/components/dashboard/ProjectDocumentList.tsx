import React from 'react';
import { Cloud, FileText, Laptop } from 'lucide-react';
import { ProjectSimulation } from '../../types';
import { useSimulationStore } from '../../store/useSimulationStore';
import { calculateTotalDCCapacityKWp, calculateTotalPanelCount } from '../../utils/equipmentSpecsUtils';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { projectType, projectDate, projectSyncLabel } from './projectPresentation';

export function ProjectDocumentList({ projects }: { projects: ProjectSimulation[] }) {
  const setActiveProject = useSimulationStore((state) => state.setActiveProject);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[480px] xl:min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">Propuestas. Abrir un documento con su nombre; arrastrarlo para moverlo a una carpeta.</caption>
        <thead className="bg-slate-50 text-xs font-medium text-slate-600 dark:bg-zinc-800/60 dark:text-zinc-300">
          <tr><th scope="col" className="px-5 py-3">Documento</th><th scope="col" className="px-4 py-3 text-right">Potencia DC</th><th scope="col" className="hidden px-4 py-3 xl:table-cell">Distribuidora / tipo</th><th scope="col" className="hidden px-4 py-3 xl:table-cell">Actualización</th><th scope="col" className="px-4 py-3">Estado</th><th scope="col" className="px-3 py-3"><span className="sr-only">Acciones</span></th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {projects.map((project) => (
            <tr key={project.id} draggable onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', project.id);
              event.dataTransfer.effectAllowed = 'move';
            }} className="group hover:bg-slate-50 dark:hover:bg-zinc-800/40">
              <td className="w-[42%] px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
                  <div className="min-w-0">
                    <button type="button" onClick={() => setActiveProject(project.id, 'project-hub')} className="block text-left font-semibold text-slate-900 hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300">{project.client.name || 'Sin nombre'}</button>
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{project.client.projectId || 'Sin código'} · {project.client.province || 'Sin provincia'}</p><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 xl:hidden">{project.rates.distributor} · {projectType(project)} · {projectDate(project)}</p>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-slate-800 dark:text-zinc-200">{calculateTotalDCCapacityKWp(project.specs).toFixed(2)} <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">kWp</span></td>
              <td className="hidden px-4 py-3.5 xl:table-cell text-slate-700 dark:text-zinc-200">{project.rates.distributor}<p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{projectType(project)}</p></td>
              <td className="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell text-xs text-slate-600 dark:text-zinc-300">{projectDate(project)}<p className="mt-1 max-w-40 truncate text-slate-500 dark:text-zinc-400" title={project.authorName}>{project.authorName || 'Sin autor'}</p></td>
              <td className="px-4 py-3.5"><span className={`flex items-center gap-1.5 text-xs ${project.syncStatus === 'conflict' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-300'}`}>{project.syncStatus === 'synced' ? <Cloud className="h-3.5 w-3.5 shrink-0" /> : <Laptop className="h-3.5 w-3.5 shrink-0" />}{projectSyncLabel(project)}</span></td>
              <td className="px-3 py-3.5"><ProjectActionsMenu project={project} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
