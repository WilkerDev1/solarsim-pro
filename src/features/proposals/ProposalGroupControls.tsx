import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { ProjectSimulation } from "../../types";
import { useSimulationStore } from "../../store/useSimulationStore";
import { useShallow } from 'zustand/react/shallow';
import { canEditCommercial } from "./commercial";
import { proposalFamily, currentProposalDrag, unlinkableDrag, unlinkOnQuickDrop, onProposalDragStop, PROPOSAL_DROP_TARGET } from "./proposalGroups";
import { PROPOSAL_GROUP_COLORS } from "../../../shared/proposalLinks";
import "./proposal-groups.css";
export function requestProposalGroupMenu(id:string,x:number,y:number) {
  window.dispatchEvent(new CustomEvent('solarsim-proposal-group-menu',{detail:{id,x,y}}));
}
type DropHover = "waiting" | "unlink" | "ready";
/** Texto bajo la propuesta destino mientras otra pasa por encima. */
export function proposalDropMessage(hover: DropHover) {
  if (hover === "ready") return "Soltar para enlazar debajo";
  if (hover === "unlink") return "Suelta ya para sacarla de su grupo · mantén para enlazarla aquí";
  return "Mantén aquí para enlazar…";
}
export function useProposalLinkDrop(project: ProjectSimulation) {
  const { syncSettings, linkProposals } = useSimulationStore(useShallow((s) => ({ syncSettings: s.syncSettings, linkProposals: s.linkProposals })));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    ready = useRef(false);
  const [hover, setHover] = useState<DropHover | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ready.current = false;
    setHover(null);
  };
  useEffect(()=>{
    const cancel=()=>clear();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};
    document.addEventListener('dragend',cancel,true);window.addEventListener('blur',cancel);document.addEventListener('keydown',key);
    const unsubscribe=onProposalDragStop(cancel);
    return()=>{if(timer.current)clearTimeout(timer.current);document.removeEventListener('dragend',cancel,true);window.removeEventListener('blur',cancel);document.removeEventListener('keydown',key);unsubscribe();};
  },[]);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!feedback) return;
    const done = setTimeout(() => setFeedback(""), 4000);
    return () => clearTimeout(done);
  }, [feedback]);
  return {
    hover,
    feedback,
    events: {
      onContextMenu: (event:React.MouseEvent)=>{
        if((event.target as HTMLElement).closest('dialog,input,textarea,select'))return;
        event.preventDefault();event.stopPropagation();requestProposalGroupMenu(project.id,event.clientX,event.clientY);
      },
      onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==='ContextMenu' || (event.key==='F10' && event.shiftKey)){event.preventDefault();const bounds=event.currentTarget.getBoundingClientRect();requestProposalGroupMenu(project.id,bounds.left+24,bounds.top+24);}},
      onDragOver: (event: React.DragEvent) => {
        const source = currentProposalDrag();
        if (
          !source ||
          source === project.id ||
          !canEditCommercial(project, syncSettings)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (!timer.current) {
          setHover(unlinkOnQuickDrop(source, project.id, useSimulationStore.getState().projects) ? "unlink" : "waiting");
          timer.current = setTimeout(() => {
            ready.current = true;
            setHover("ready");
          }, 850);
        }
      },
      onDragLeave: (event: React.DragEvent) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        clear();
      },
      onDrop: (event: React.DragEvent) => {
        const source = currentProposalDrag();
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        const outside = ready.current ? null : unlinkOnQuickDrop(source, project.id, useSimulationStore.getState().projects);
        if (ready.current) {
          const result = linkProposals(source, project.id);
          setFeedback(
            result.success
              ? "Propuesta enlazada."
              : result.error || "No se pudo enlazar.",
          );
        } else if (outside) {
          const result = linkProposals(outside.id, null);
          setFeedback(
            result.success
              ? `«${outside.client.name || "Sin nombre"}» ya no está enlazada.`
              : result.error || "No se pudo desenlazar.",
          );
        } else
          setFeedback(
            "Mantén la propuesta sobre el destino hasta ver «Soltar para enlazar».",
          );
        clear();
      },
    },
  };
}
/**
 * Zona que rodea las propuestas: soltar una propuesta enlazada en un hueco (fuera de cualquier propuesta o carpeta)
 * la desenlaza de su principal. Sus propias vinculadas la siguen, como una subcarpeta.
 */
export function useProposalUnlinkZone() {
  const { projects, linkProposals } = useSimulationStore(useShallow((s) => ({ projects: s.projects, linkProposals: s.linkProposals })));
  const [active, setActive] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const clear = () => setActive(null);
    document.addEventListener("dragend", clear, true);
    window.addEventListener("blur", clear);
    const unsubscribe = onProposalDragStop(clear);
    return () => { document.removeEventListener("dragend", clear, true); window.removeEventListener("blur", clear); unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const candidate = (event: React.DragEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(`[${PROPOSAL_DROP_TARGET}]`)) return null;
    return unlinkableDrag(currentProposalDrag(), projects);
  };
  const source = active ? projects.find((p) => p.id === active) : undefined;
  return {
    active: source ? source.client.name || "Sin nombre" : null,
    feedback,
    events: {
      // En captura: al pasar a una propuesta o carpeta el aviso se apaga aunque esas paren la propagación.
      onDragOverCapture: (event: React.DragEvent) => {
        const next = candidate(event)?.id ?? null;
        if (next !== active) setActive(next);
      },
      onDragOver: (event: React.DragEvent) => {
        if (!candidate(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (event: React.DragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setActive(null);
      },
      onDrop: (event: React.DragEvent) => {
        const project = candidate(event);
        setActive(null);
        if (!project || event.defaultPrevented) return;
        event.preventDefault();
        const result = linkProposals(project.id, null);
        setFeedback(result.success ? `«${project.client.name || "Sin nombre"}» ya no está enlazada.` : result.error || "No se pudo desenlazar.");
      },
    },
  };
}
export function ProposalGroupControls({
  project,
}: {
  project: ProjectSimulation;
}) {
  const state = useSimulationStore(useShallow((s) => ({ projects: s.projects, syncSettings: s.syncSettings, sidebarTheme: s.sidebarTheme, linkProposals: s.linkProposals, setProposalGroupColor: s.setProposalGroupColor }))),
    family = proposalFamily(project, state.projects);
  const dialog = useRef<HTMLDialogElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{
    const listener=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.id===project.id)setPosition({x:Math.max(8,Math.min(detail.x,window.innerWidth-238)),y:Math.max(8,Math.min(detail.y,window.innerHeight-100))});else setPosition(null);};
    window.addEventListener('solarsim-proposal-group-menu',listener);return()=>window.removeEventListener('solarsim-proposal-group-menu',listener);
  },[project.id]);
  useEffect(()=>{
    if(!position)return;menu.current?.querySelector('button')?.focus();
    const dismiss=(event:Event)=>{if(!menu.current?.contains(event.target as Node))setPosition(null);};
    const scroll=()=>setPosition(null);
    document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true);};
  },[position]);
  const [parent, setParent] = useState(project.proposalLink?.parentId || "");
  const [color, setColor] = useState(family.color),
    [error, setError] = useState("");
  const [colorEdited,setColorEdited]=useState(false);
  const writable = canEditCommercial(project, state.syncSettings);
  const [open, setOpen] = useState(false);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const candidates = state.projects.filter(
    (p) =>
      p.id !== project.id &&
      !p.isDeleted &&
      canEditCommercial(p, state.syncSettings),
  );
  return (
    <span
      className="proposal-group-controls"
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <span tabIndex={0} className="proposal-group-trigger" title="Clic derecho o Shift+F10 para organizar enlaces" aria-label={`Grupo de ${project.client.name}`}>
        <GitBranch size={13}/>{family.grouped?(family.missingParent?'Principal no disponible':family.depth?'Vinculada':'Principal'):'Sin grupo'}
      </span>
      {position && createPortal(<div className={state.sidebarTheme==='dark'?'dark':''}><div ref={menu} role="menu" aria-label="Organización de propuestas" className="proposal-group-context" style={{left:position.x,top:position.y}} onKeyDown={event=>{if(event.key==='Escape' || event.key==='Tab'){setPosition(null);}}}>
        <button role="menuitem" type="button" onClick={()=>{setPosition(null);setParent(project.proposalLink?.parentId||'');setColor(family.color);setColorEdited(false);setError('');setOpen(true);dialog.current?.showModal();}}><GitBranch size={16}/>{family.grouped?'Organizar grupo…':'Enlazar propuesta…'}</button>
      </div></div>,document.body)}
      <dialog
        ref={dialog}
        className="proposal-group-dialog"
        aria-labelledby={`group-title-${project.id}`}
        onCancel={() => setOpen(false)}
      >
        {open && (
          <>
            <header>
              <h3 id={`group-title-${project.id}`}>
                Organizar propuestas enlazadas
              </h3>
              <button
                type="button"
                aria-label="Cerrar organización de propuestas"
                onClick={close}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              {project.client.name} · {project.client.projectId}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if(parent !== (project.proposalLink?.parentId || '')) {
                  const result=state.linkProposals(project.id,parent||null);
                  if(!result.success){setError(result.error||'No se pudo enlazar.');return;}
                }
                if(colorEdited){
                  const updated=state.setProposalGroupColor(project.id,color);
                  if(!updated.success){setError(updated.error||'El enlace se guardó; no se pudo cambiar el color.');return;}
                }
                close();
              }}
            >
              <label>
                Propuesta principal
                <select
                  aria-label="Propuesta principal"
                  disabled={!writable}
                  value={parent}
                  onChange={(event) => {setParent(event.target.value);const destination=state.projects.find(p=>p.id===event.target.value);setColor(destination?proposalFamily(destination,state.projects).color:family.color);setColorEdited(false);}}
                >
                  <option value="">
                    Sin principal · propuesta independiente
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.client.name} · {candidate.client.projectId}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                El enlace organiza versiones de un cliente. Equipos, estados y
                carpetas se mantienen independientes.
              </p>
              <label>
                Color del grupo
                <input
                  type="color"
                  aria-label="Color del grupo"
                  value={color}
                  disabled={!writable}
                  onChange={(event) => {setColor(event.target.value);setColorEdited(true);}}
                />
              </label>
              <div className="proposal-color-options">
                {PROPOSAL_GROUP_COLORS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    disabled={!writable}
                    aria-label={`Elegir color ${value}`}
                    aria-pressed={color === value}
                    style={{ background: value }}
                    onClick={() => {setColor(value);setColorEdited(true);}}
                  />
                ))}
              </div>
              {error && <p role="alert">{error}</p>}
              {!writable && (
                <p>
                  Solo lectura. Revisa los permisos o conflictos de la
                  propuesta.
                </p>
              )}
              <footer>
                <button type="button" onClick={close}>
                  Cancelar
                </button>
                <button className="group-save" disabled={!writable}>
                  Guardar organización
                </button>
              </footer>
            </form>
          </>
        )}
      </dialog>
    </span>
  );
}
