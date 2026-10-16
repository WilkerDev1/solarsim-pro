import type { ProjectSimulation } from "../../types";
import { proposalGroupColor } from "../../../shared/proposalLinks";
/** Resolve through filtered/missing ancestors without hiding or duplicating matches. */
export function proposalFamily(
  project: ProjectSimulation,
  all: ProjectSimulation[],
) {
  let root = project,
    depth = 0;
  const seen = new Set([project.id]);
  while (root.proposalLink?.parentId) {
    const parent = all.find(
      (p) => p.id === root.proposalLink?.parentId && !p.isDeleted,
    );
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
    depth++;
  }
  const grouped =
    depth > 0 ||
    !!project.proposalLink?.parentId ||
    all.some((p) => !p.isDeleted && p.proposalLink?.parentId === project.id);
  return {
    root,
    depth: Math.min(depth, 6),
    grouped,
    color: root.proposalLink?.color || proposalGroupColor(root.id),
    missingParent: !!project.proposalLink?.parentId && depth === 0,
  };
}
export function orderProposalFamilies(
  visible: ProjectSimulation[],
  all: ProjectSimulation[],
) {
  const visibleIds = new Set(visible.map((p) => p.id));
  const emitted = new Set<string>();
  const result: ProjectSimulation[] = [];
  const visit = (project: ProjectSimulation) => {
    if (emitted.has(project.id)) return;
    emitted.add(project.id);
    if (visibleIds.has(project.id)) result.push(project);
    const visibleRank=new Map(visible.map((p,index)=>[p.id,index]));
    all.filter(p=>!p.isDeleted && p.proposalLink?.parentId===project.id)
      .sort((a,b)=>(visibleRank.get(a.id)??Number.MAX_SAFE_INTEGER)-(visibleRank.get(b.id)??Number.MAX_SAFE_INTEGER)).forEach(visit);
  };
  const roots = new Map<string, ProjectSimulation[]>();
  visible.forEach((project) => {
    const { root } = proposalFamily(project, all);
    if (!roots.has(root.id)) roots.set(root.id, []);
    roots.get(root.id)!.push(project);
  });
  roots.forEach((family,id)=>{const root=all.find(p=>p.id===id);if(root)visit(root);family.forEach(visit);});
  return result;
}
let draggingId: string | null = null;
export function startProposalDrag(event: React.DragEvent, id: string) {
  draggingId = id;
  event.dataTransfer.setData("text/plain", id);
  event.dataTransfer.effectAllowed = "move";
}
export function stopProposalDrag() {
  draggingId = null;
}
export function currentProposalDrag() {
  return draggingId;
}
