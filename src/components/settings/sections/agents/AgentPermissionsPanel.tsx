import React from 'react';
import { useSimulationStore } from '../../../../store/useSimulationStore';
import type { AgentPolicy, AgentPolicySource, AgentSourcePolicy } from '../../../../store/slices/agentSlice';
import { InfoTip } from '../../../simulator/params/ui/InfoTip';

const SOURCES: { key: AgentPolicySource; title: string; description: string }[] = [
  { key: 'internal', title: 'Asistentes de la aplicación', description: 'Asistente de propuestas y asistente general.' },
  { key: 'external', title: 'Agentes externos (MCP)', description: 'Claude Code, Codex u otros clientes conectados al servidor MCP local.' },
];

const ROWS: { kind: keyof AgentSourcePolicy; label: string; hint: string; options: { value: string; label: string }[] }[] = [
  { kind: 'read', label: 'Consultas', hint: 'Buscar propuestas, equipos, tarifas y resultados.', options: [{ value: 'allow', label: 'Permitir' }, { value: 'deny', label: 'Bloquear' }] },
  {
    kind: 'draft', label: 'Borradores', hint: 'Crear o editar propuestas, textos, clientes y anexos. Quedan en la actividad y se pueden deshacer.',
    options: [{ value: 'allow', label: 'Aplicar sin preguntar' }, { value: 'confirm', label: 'Pedir confirmación' }, { value: 'deny', label: 'Bloquear' }],
  },
  {
    kind: 'guarded', label: 'Cambios sensibles', hint: 'Catálogo, precios, borrados, estados y plantillas de empresa. Piden confirmación de forma predeterminada.',
    options: [{ value: 'confirm', label: 'Pedir confirmación' }, { value: 'allow', label: 'Aplicar sin preguntar (bypass)' }, { value: 'deny', label: 'Bloquear' }],
  },
];

export const AgentPermissionsPanel: React.FC = () => {
  const policy = useSimulationStore((s) => s.agentPolicy);
  const setAgentPolicy = useSimulationStore((s) => s.setAgentPolicy);
  return (
    <section aria-labelledby="agent-permissions-title" className="space-y-4">
      <div>
        <h3 id="agent-permissions-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Permisos de agentes</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
          Preferencia de este equipo. Los agentes nunca superan los permisos de tu cuenta: un lector solo consulta y las propuestas en papelera no se modifican.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SOURCES.map((source) => (
          <div key={source.key} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{source.title}</h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{source.description}</p>
            <div className="mt-4 space-y-4">
              {ROWS.map((row) => (
                <label key={row.kind} className="block">
                  <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">{row.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">{row.hint}</span>
                  <select
                    value={policy[source.key][row.kind]}
                    onChange={(e) => setAgentPolicy({ [source.key]: { ...policy[source.key], [row.kind]: e.target.value } } as Partial<AgentPolicy>)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  >
                    {row.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {row.kind === 'guarded' && policy[source.key].guarded === 'allow' && (
                    <span role="alert" className="mt-2 block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      Modo bypass activo: estos agentes cambiarán catálogo, precios, borrados y plantillas sin preguntar. Todo queda en la actividad y se puede deshacer, salvo reportes comerciales, plantillas de empresa y clientes eliminados, que siguen pidiendo confirmación.
                    </span>
                  )}
                </label>
              ))}
              {source.key === 'internal' && (
                // Perfil del asistente general (ADR 0010): solo lo lee la fuente app-assistant; nunca los agentes externos.
                <label className="block">
                  <span className="flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-zinc-200">
                    Cambios dentro de una propuesta (asistente general)
                    <InfoTip
                      label="Qué cambia el perfil"
                      text={'Edición en vivo: precios, margen, extras y descuentos de la propuesta se aplican al momento, con el antes y después y deshacer.\nPedir confirmación: esos cambios esperan a que los confirmes en la tarjeta.\nEn los dos casos, lo compartido (catálogo, ofertas, estados, papelera y borrados) se confirma siempre, y los agentes externos siguen pidiendo confirmación.'}
                    />
                  </span>
                  <select
                    value={policy.appAssistantProfile}
                    onChange={(e) => setAgentPolicy({ appAssistantProfile: e.target.value === 'confirm' ? 'confirm' : 'live-edit' })}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  >
                    <option value="live-edit">Edición en vivo, con deshacer</option>
                    <option value="confirm">Pedir confirmación para precios</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
