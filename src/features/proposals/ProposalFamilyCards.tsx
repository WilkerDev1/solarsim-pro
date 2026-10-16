import { useMemo } from "react";
import type { ProjectSimulation } from "../../types";
import { ProjectCard } from "../../components/dashboard/ProjectCard";
import { proposalFamily } from "./proposalGroups";

/** Keep each visible family in one column without bringing filtered proposals back. */
export function ProposalFamilyCards({
  projects,
  allProjects,
}: {
  projects: ProjectSimulation[];
  allProjects: ProjectSimulation[];
}) {
  const families = useMemo(() => {
    const groups = new Map<string, ProjectSimulation[]>();
    for (const project of projects) {
      const rootId = proposalFamily(project, allProjects).root.id;
      const family = groups.get(rootId);
      if (family) family.push(project);
      else groups.set(rootId, [project]);
    }
    return [...groups];
  }, [projects, allProjects]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {families.map(([rootId, family]) => (
        <div key={rootId} className="flex min-w-0 flex-col gap-4">
          {family.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ))}
    </div>
  );
}
