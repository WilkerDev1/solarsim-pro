import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useSimulationStore } from '../../../../store/useSimulationStore';

const SOURCE_LABEL = { 'app-assistant': 'Asistente general', 'proposal-assistant': 'Asistente de propuestas', mcp: 'Agente externo' } as const;

export const AgentActivityPanel: React.FC = () => {
  const activity = useSimulationStore((s) => s.agentActivity);
  const undo = useSimulationStore((s) => s.undoAgentActivity);
  const [filter, setFilter] = useState<'all' | 'mcp' | 'internal'>('all');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const visible = activity.filter((a) => filter === 'all' || (filter === 'mcp' ? a.source === 'mcp' : a.source !== 'mcp')).slice(0, 100);
  return (
    <section aria-labelledby="agent-activity-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="agent-activity-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Actividad de agentes</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Cambios aplicados por agentes en este espacio de trabajo (últimos 300).</p>
        </div>
        <select aria-label="Filtrar por origen" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
          <option value="all">Todos los orígenes</option>
          <option value="internal">Asistentes de la aplicación</option>
          <option value="mcp">Agentes externos</option>
        </select>
      </div>
      {!visible.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">Todavía no hay cambios de agentes.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {visible.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{entry.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  {SOURCE_LABEL[entry.source]}{entry.clientLabel ? ` · ${entry.clientLabel}` : ''} · {new Date(entry.at).toLocaleString('es-DO')} · {entry.targetType === 'equipment' ? 'Catálogo' : 'Propuesta'}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-zinc-300">{entry.changes.slice(0, 4).map((c) => `${c.label}: ${c.value}`).join(' · ')}</p>
                {errors[entry.id] && <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">{errors[entry.id]}</p>}
              </div>
              {entry.status === 'applied' && entry.undo ? (
                <button type="button" onClick={() => { const r = undo(entry.id); setErrors((e) => ({ ...e, [entry.id]: r.success ? '' : r.error || 'No se pudo deshacer.' })); }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <RotateCcw className="h-3.5 w-3.5" />Deshacer
                </button>
              ) : (
                <span className="shrink-0 text-xs text-slate-500 dark:text-zinc-400">{entry.status === 'undone' ? 'Deshecho' : ''}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
