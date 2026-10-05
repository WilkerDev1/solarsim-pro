import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';

type Choice = 'fork' | 'accept_server' | 'keep_local';
const choices: { id: Choice; title: string; description: string }[] = [
  { id: 'fork', title: 'Guardar una copia', description: 'Conserva la propuesta de la nube y crea otra con tus cambios. No pierdes ninguna versión.' },
  { id: 'accept_server', title: 'Usar la versión de la nube', description: 'Sustituye el contenido de este equipo. Tus cambios quedan guardados en el historial local.' },
  { id: 'keep_local', title: 'Enviar mis cambios', description: 'Sustituye el contenido de la nube si su versión no ha cambiado. Si cambia, podrás revisarlo de nuevo.' },
];
export const ConflictResolutionModal: React.FC = () => {
  const { activeConflict, resolveConflict, setActiveConflict, sidebarTheme, syncSettings } = useSimulationStore();
  const [choice, setChoice] = useState<Choice>('fork');
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeConflict) return;
    setChoice(activeConflict.reason !== 'deleted' && !['ADMIN', 'EDITOR'].includes(syncSettings.currentUser?.role ?? '') ? 'accept_server' : 'fork');
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.isConnected && previous.focus(); };
  }, [activeConflict?.projectId]);
  if (!activeConflict) return null;
  const readOnly = !['ADMIN', 'EDITOR'].includes(syncSettings.currentUser?.role ?? '');
  const visibleChoices = activeConflict.reason === 'deleted' ? (readOnly ? [] : [{ id: 'fork' as Choice, title: 'Guardar como nueva', description: 'Crea una propuesta nueva con los cambios de este equipo.' }]) : choices;
  const close = () => setActiveConflict(null);
  const allowed = (id: Choice) => (!readOnly || id === 'accept_server') && (activeConflict.reason !== 'deleted' || id === 'fork');
  return createPortal(<div className={sidebarTheme === 'dark' ? 'dark' : ''}>
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
          if (event.key === 'Tab') {
            const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary'));
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-zinc-700">
          <div>

            <h2 id="conflict-title" className="flex items-center gap-2 text-xl font-semibold"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />Resolver conflicto</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{activeConflict.localProject.client.projectId} · {activeConflict.localProject.client.name}</p>
          </div>
          <button aria-label="Resolver después y cerrar" onClick={close} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <p id="conflict-description" className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">{activeConflict.reason === 'deleted' ? 'La propuesta fue eliminada de la nube. Los cambios de este equipo se conservan.' : 'Hay una versión en este equipo y otra en la nube. Elige cómo continuar.'} Puedes cerrar esta ventana y volver desde «Resolver conflicto» en el menú de la propuesta.</p>
          {activeConflict.lastModifiedByName && <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">Último cambio en la nube: {activeConflict.lastModifiedByName}</p>}
          {activeConflict.reason !== 'deleted' && <details className="mt-5 rounded-lg border border-slate-200 dark:border-zinc-700" >
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{activeConflict.diffs.length ? `${activeConflict.diffs.length} diferencias de contenido` : 'El contenido coincide'}<span className="ml-2 text-xs font-normal text-slate-500 dark:text-zinc-400">Base {activeConflict.localVersion} · Nube {activeConflict.serverVersion}</span></summary>
            {activeConflict.diffs.length ? <div className="max-h-52 overflow-auto border-t border-slate-200 dark:border-zinc-700">
              <table className="w-full table-fixed text-left text-xs"><thead className="sticky top-0 bg-slate-50 dark:bg-zinc-800"><tr><th className="px-4 py-2 font-medium">Dato</th><th className="px-3 py-2 font-medium">Este equipo</th><th className="px-3 py-2 font-medium">Nube</th></tr></thead>
                <tbody>{activeConflict.diffs.map((diff, index) => <tr key={index} className="border-t border-slate-100 dark:border-zinc-800"><th className="break-words px-4 py-3 font-medium">{diff.field}<span className="mt-1 block font-normal text-slate-500 dark:text-zinc-400">{diff.section}</span></th><td className="break-words px-3 py-3 align-top">{diff.formattedNew}</td><td className="break-words px-3 py-3 align-top">{diff.formattedOld}</td></tr>)}</tbody></table>
            </div> : <p className="px-4 pb-3 text-xs text-slate-600 dark:text-zinc-400">No hay cambios de contenido que comparar. Usar la versión de la nube confirma su versión en este equipo.</p>}
          </details>}
          {visibleChoices.length > 0 && <fieldset className="mt-5 space-y-2"><legend className="mb-2 text-sm font-medium">Cómo quieres continuar</legend>
            {visibleChoices.map(option => <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${choice === option.id ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-zinc-700'} ${!allowed(option.id) ? 'cursor-not-allowed opacity-50' : ''}`}>
              <input type="radio" name="conflict-choice" value={option.id} checked={choice === option.id} disabled={!allowed(option.id)} onChange={() => setChoice(option.id)} className="mt-1 accent-emerald-600" />
              <span><span className="block text-sm font-medium">{option.title}{option.id === 'fork' && activeConflict.reason !== 'deleted' && <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">Conserva ambas</span>}</span><span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{option.description}</span></span>
            </label>)}
          </fieldset>}
          {readOnly && <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400">{activeConflict.reason === 'deleted' ? 'La propuesta ya no está en la nube. Un editor puede recuperar tus cambios creando una copia.' : 'Tu rol permite descargar la versión de la nube. Un editor puede enviar cambios o crear una copia.'}</p>}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-zinc-700">
          <button onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Resolver después</button>
          {visibleChoices.length > 0 && <button disabled={!allowed(choice)} onClick={() => resolveConflict(choice)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700">{visibleChoices.find(option => option.id === choice)?.title}</button>}
        </footer>
      </div>
    </div>
  </div>, document.body);
};
