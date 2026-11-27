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
/** Propuesta que se desenlaza si se suelta fuera de toda propuesta (como sacarla de una carpeta). */
export function unlinkableDrag(sourceId: string | null, all: ProjectSimulation[]) {
  if (!sourceId) return null;
  const project = all.find((p) => p.id === sourceId && !p.isDeleted);
  return project?.proposalLink?.parentId ? project : null;
}
/**
 * Soltar sin esperar sobre una propuesta de otro grupo saca la arrastrada de su grupo: en la lista casi no
 * quedan huecos vacíos donde soltarla. Dentro de su propio grupo (principal, hermanas, sus vinculadas) no.
 */
export function unlinkOnQuickDrop(sourceId: string | null, targetId: string, all: ProjectSimulation[]) {
  const source = unlinkableDrag(sourceId, all);
  const target = all.find((p) => p.id === targetId && !p.isDeleted);
  if (!source || !target || source.id === target.id) return null;
  return proposalFamily(source, all).root.id === proposalFamily(target, all).root.id ? null : source;
}
/** Marca de los destinos con su propia lógica de soltar (propuestas, carpetas): ahí no se desenlaza. */
export const PROPOSAL_DROP_TARGET = "data-proposal-drop-target";
const DRAG_STOP_EVENT = "solarsim-proposal-drag-stop";
let draggingId: string | null = null;
let releaseFallback: (() => void) | null = null;
/**
 * Imagen de arrastre compacta: sin ella Chromium fotografía la fila de la tabla (en Wayland, un bloque enorme
 * con las filas vecinas) y esa imagen puede quedarse pegada en pantalla.
 */
function setCompactDragImage(dataTransfer: DataTransfer, label: string) {
  if (typeof document === "undefined" || typeof dataTransfer.setDragImage !== "function") return;
  const chip = document.createElement("div");
  chip.className = "proposal-drag-chip";
  chip.textContent = label || "Sin nombre";
  document.body.appendChild(chip);
  dataTransfer.setDragImage(chip, 16, 16);
  setTimeout(() => chip.remove(), 0);
}
/**
 * Si el arrastre acaba sin dragend (Wayland, la ventana pierde el foco), el siguiente puntero suelto lo libera.
 * Durante un arrastre nativo no llegan eventos de puntero, así que no corta un arrastre en curso.
 */
function armDragFallback() {
  releaseFallback?.();
  if (typeof window === "undefined") return;
  const end = (event: PointerEvent) => {
    if (event.type === "pointermove" && event.buttons) return;
    stopProposalDrag();
  };
  const timer = setTimeout(() => {
    window.addEventListener("pointermove", end, true);
    window.addEventListener("pointerdown", end, true);
  }, 0);
  releaseFallback = () => {
    clearTimeout(timer);
    window.removeEventListener("pointermove", end, true);
    window.removeEventListener("pointerdown", end, true);
  };
}
export function startProposalDrag(event: React.DragEvent, id: string, label?: string) {
  draggingId = id;
  event.dataTransfer.setData("text/plain", id);
  event.dataTransfer.effectAllowed = "move";
  if (label !== undefined) setCompactDragImage(event.dataTransfer, label);
  armDragFallback();
}
export function stopProposalDrag() {
  releaseFallback?.();
  releaseFallback = null;
  if (draggingId === null) return;
  draggingId = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAG_STOP_EVENT));
}
export function currentProposalDrag() {
  return draggingId;
}
/** Avisa a los destinos que limpien su resaltado cuando el arrastre termina, llegue o no el dragend. */
export function onProposalDragStop(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DRAG_STOP_EVENT, listener);
  return () => window.removeEventListener(DRAG_STOP_EVENT, listener);
}
