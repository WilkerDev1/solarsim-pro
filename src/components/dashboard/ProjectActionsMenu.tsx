import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import { ProjectSimulation } from '../../types';
import { useSimulationStore } from '../../store/useSimulationStore';

/** Shared document actions. Portal keeps menus outside scrolling tables/cards. */
export function ProjectActionsMenu({ project }: { project: ProjectSimulation }) {
  const { duplicateProject, deleteProject, setActiveProject, openShareModal, syncSettings, sidebarTheme } = useSimulationStore();
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const readOnly = ['VIEWER', 'LECTOR'].includes(syncSettings.currentUser?.role ?? '');
  const close = () => { setPosition(null); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setPosition(null);
    };
    const onScroll = () => setPosition(null);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [position]);

  const actionClass = 'flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50';
  return <>
    <button ref={triggerRef} type="button" aria-label={`Acciones de ${project.client.name || 'la propuesta'}`} aria-haspopup="menu" aria-expanded={!!position}
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition(position ? null : { top: Math.min(rect.bottom + 4, window.innerHeight - 152), right: Math.max(8, window.innerWidth - rect.right) });
      }}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white">
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
    </button>
    {position && createPortal(
      <div className={sidebarTheme === 'dark' ? 'dark' : ''}>
        <div ref={menuRef} role="menu" aria-label="Acciones de propuesta" style={position}
          className="fixed z-[70] w-48 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }
            if (event.key === 'Tab') setPosition(null);
          }}>
          <button role="menuitem" type="button" disabled={readOnly} className={actionClass} onClick={() => { close(); setActiveProject(project.id); openShareModal(); }}><Share2 className="h-4 w-4" />Compartir web</button>
          <button role="menuitem" type="button" disabled={readOnly} className={actionClass} onClick={() => { close(); duplicateProject(project.id); }}><Copy className="h-4 w-4" />Duplicar</button>
          <button role="menuitem" type="button" disabled={readOnly} className={`${actionClass} !text-rose-700 dark:!text-rose-400`} onClick={() => {
            close();
            if (confirm(`¿Mover a la papelera la propuesta «${project.client.name}»?`)) deleteProject(project.id);
          }}><Trash2 className="h-4 w-4" />Mover a papelera</button>
        </div>
      </div>, document.body)}
  </>;
}
