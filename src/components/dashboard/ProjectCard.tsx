import {
  ProposalGroupControls,
  useProposalLinkDrop,
} from "../../features/proposals/ProposalGroupControls";
import {
  proposalFamily,
  startProposalDrag,
  stopProposalDrag,
} from "../../features/proposals/proposalGroups";
import { ProposalDecisionField } from "../../features/proposals/ProposalDecisionField";
import React from "react";
import { ArrowUpRight, Cloud, Laptop, MapPin } from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import { ProjectSimulation } from "../../types";
import {
  calculateTotalDCCapacityKWp,
  calculateTotalPanelCount,
} from "../../utils/equipmentSpecsUtils";
import { ProjectActionsMenu } from "./ProjectActionsMenu";
import { ProposalClientBadge } from "../clients/ProposalClientLink";
import {
  projectDate,
  projectSyncLabel,
  projectType,
} from "./projectPresentation";

export const ProjectCard: React.FC<{ project: ProjectSimulation }> = ({
  project,
}) => {
  const setActiveProject = useSimulationStore(
    (state) => state.setActiveProject,
  );
  const allProjects = useSimulationStore((state) => state.projects);
  const family = proposalFamily(project, allProjects),
    drop = useProposalLinkDrop(project);
  const capacity = calculateTotalDCCapacityKWp(project.specs);
  return (
    <article
      draggable
      onDragStart={(event) => startProposalDrag(event, project.id)}
      onDragEnd={stopProposalDrag}
      {...drop.events}
      style={
        family.grouped
          ? {
              borderInlineStart: `3px solid ${family.color}`,
              marginInlineStart: family.depth ? 16 : 0,
            }
          : undefined
      }
      className={`flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 ${drop.hover === "ready" ? "proposal-drop-ready" : ""}`}
    >
      <ProposalGroupControls project={project} />
      {drop.hover && (
        <span className="proposal-drop-message">
          {drop.hover === "ready"
            ? "Soltar para enlazar debajo"
            : "Mantén aquí para enlazar…"}
        </span>
      )}
      {drop.feedback && (
        <span role="status" className="proposal-drop-message">
          {drop.feedback}
        </span>
      )}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
          {project.client.projectId || "Sin código"}
        </span>
        <ProjectActionsMenu project={project} />
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-zinc-100">
        <button
          type="button"
          className="text-left hover:text-emerald-700 dark:hover:text-emerald-300"
          onClick={() => setActiveProject(project.id, "project-hub")}
        >
          {project.client.name || "Sin nombre"}
        </button>
      </h3>
      <ProposalClientBadge project={project} />
      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {project.client.province || project.client.location || "Sin ubicación"}
      </p>
      <div className="mt-4">
        <p className="mb-1.5 text-xs text-slate-500 dark:text-zinc-400">
          Estado de la propuesta
        </p>
        <ProposalDecisionField project={project} />
      </div>
      <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-100 py-4 text-xs dark:border-zinc-800">
        <div>
          <dt className="text-slate-500 dark:text-zinc-400">Potencia DC</dt>
          <dd className="mt-1.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white">
            {capacity.toFixed(2)}{" "}
            <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">
              kWp
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-zinc-400">Distribuidora</dt>
          <dd className="mt-1.5 font-medium text-slate-800 dark:text-zinc-200">
            {project.rates.distributor}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-zinc-400">Sistema</dt>
          <dd className="mt-1.5 font-medium text-slate-800 dark:text-zinc-200">
            {projectType(project)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-zinc-400">Módulos</dt>
          <dd className="mt-1.5 font-medium tabular-nums text-slate-800 dark:text-zinc-200">
            {calculateTotalPanelCount(project.specs)} módulos
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
        <span className="truncate" title={project.authorName}>
          {project.authorName || "Sin autor"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {project.syncStatus === "synced" ? (
            <Cloud className="h-3.5 w-3.5" />
          ) : (
            <Laptop className="h-3.5 w-3.5" />
          )}
          {projectSyncLabel(project)}
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-zinc-800">
        <time className="text-xs text-slate-500 dark:text-zinc-400">
          {projectDate(project)}
        </time>
        <button
          type="button"
          onClick={() => setActiveProject(project.id, "project-hub")}
          className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          Abrir propuesta
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
};
