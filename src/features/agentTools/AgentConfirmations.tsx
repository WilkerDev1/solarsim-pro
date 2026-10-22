import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import './registry';

/**
 * Global inbox for actions that external agents (MCP) prepared and that need a human decision.
 * In-app assistants show their own confirmation cards inside the chat.
 */
export const AgentConfirmations: React.FC = () => {
  const all = useSimulationStore((s) => s.pendingAgentActions);
  const pending = all.filter((a) => a.status === 'pending' && a.source === 'mcp');
  const applyPending = useSimulationStore((s) => s.confirmAgentAction);
  const reject = useSimulationStore((s) => s.rejectAgentAction);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pending.length) return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [pending.length]);
  const live = pending.filter((a) => Date.parse(a.expiresAt) > now);
  if (!live.length) return null;
  return (
    <aside aria-label="Acciones de agentes por confirmar" className="fixed bottom-4 right-4 z-[60] flex max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto">
      {live.map((action) => (
        <div key={action.id} role="alertdialog" aria-labelledby={`agent-action-${action.id}`}
          className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p id={`agent-action-${action.id}`} className="text-sm font-semibold">{action.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{action.clientLabel || 'Agente externo'} solicita este cambio</p>
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-xs">
            {action.changes.slice(0, 8).map((c, i) => (
              <div key={`${c.label}-${i}`} className="flex gap-2">
                <dt className="shrink-0 text-slate-500 dark:text-zinc-400">{c.label}</dt>
                <dd className="min-w-0 break-words font-medium">{c.value}</dd>
              </div>
            ))}
          </dl>
          {errors[action.id] && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{errors[action.id]}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => reject(action.id)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Rechazar</button>
            <button type="button" onClick={() => { const r = applyPending(action.id); if (!r.success) setErrors((e) => ({ ...e, [action.id]: r.error || 'No se pudo aplicar.' })); }}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">Aplicar cambio</button>
          </div>
        </div>
      ))}
    </aside>
  );
};
