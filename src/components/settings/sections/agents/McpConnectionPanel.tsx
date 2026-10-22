import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import type { McpServerStatus } from '../../../../../shared/agentTools/bridge';
import { buildMcpSnippets } from '../../../../features/agentTools/mcpSnippets';
import { confirmAction } from '../../../common/confirmAction';

interface ViewProps {
  status: McpServerStatus | null;
  busy: boolean;
  unavailable?: boolean;
  message?: string;
  onToggle: (enabled: boolean) => void;
  onCopyToken: () => void;
  onRegenerate: () => void;
  onCopy: (text: string) => void;
}

const button = 'flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

const Snippet: React.FC<{ title: string; hint: string; code: string; onCopy: (text: string) => void }> = ({ title, hint, code, onCopy }) => (
  <div className="rounded-lg border border-slate-200 p-4 dark:border-zinc-800">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h5 className="text-sm font-medium text-slate-900 dark:text-white">{title}</h5>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{hint}</p>
      </div>
      <button type="button" onClick={() => onCopy(code)} className={button}><Copy className="h-3.5 w-3.5" />Copiar</button>
    </div>
    <pre className="mt-3 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs text-slate-800 dark:bg-zinc-950 dark:text-zinc-200"><code>{code}</code></pre>
  </div>
);

export const McpConnectionPanelView: React.FC<ViewProps> = ({ status, busy, unavailable, message, onToggle, onCopyToken, onRegenerate, onCopy }) => {
  const snippets = status ? buildMcpSnippets(status.url, status.executablePath) : null;
  return (
    <section aria-labelledby="mcp-title" className="space-y-4">
      <div>
        <h3 id="mcp-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Conexión MCP local</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
          Permite que Claude Code, Codex u otros clientes MCP de este equipo usen las herramientas de SolarSim con los permisos de «Agentes externos». Solo escucha en 127.0.0.1 y exige un token.
        </p>
      </div>
      {unavailable ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">La conexión MCP solo está disponible en la aplicación de escritorio.</p>
      ) : !status ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Cargando estado…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Servidor MCP</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{status.running ? 'Escuchando' : status.enabled ? 'Activado, sin escuchar' : 'Desactivado'}</p>
            </div>
            <button type="button" role="switch" aria-checked={status.enabled} aria-label="Activar servidor MCP local" disabled={busy} onClick={() => onToggle(!status.enabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${status.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${status.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {status.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{status.error}</p>}
          {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Dirección</p>
            <code className="mt-1 block break-all text-sm text-slate-900 dark:text-white">{status.url}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCopyToken} className={button}><KeyRound className="h-3.5 w-3.5" />Copiar token</button>
            <button type="button" disabled={busy} onClick={onRegenerate} className={button}><RefreshCw className="h-3.5 w-3.5" />Regenerar token</button>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Clientes conectados</p>
            {status.clients.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-slate-800 dark:text-zinc-200">
                {status.clients.map((client) => <li key={client.name}>{client.name} <span className="text-xs text-slate-500 dark:text-zinc-400">· última actividad {new Date(client.lastSeenAt).toLocaleTimeString('es-DO')}</span></li>)}
              </ul>
            ) : <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Ninguno desde que se activó el servidor.</p>}
          </div>
          {snippets && status.enabled && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-zinc-400">Sustituye <code>&lt;TOKEN&gt;</code> por el token copiado con el botón de arriba; no se muestra en pantalla.</p>
              <Snippet title="Claude Code" hint="Ejecuta en una terminal." code={snippets.claudeCode} onCopy={onCopy} />
              <Snippet title="Codex" hint="Añade a ~/.codex/config.toml y exporta el token en tu shell." code={`${snippets.codex}\n\n# shell\n${snippets.codexEnv}`} onCopy={onCopy} />
              <Snippet title="Claude Desktop" hint="Añade a claude_desktop_config.json (Ajustes → Desarrollador → Editar configuración) y reinicia Claude Desktop. SolarSim debe estar abierto; no requiere pegar el token." code={snippets.claudeDesktop} onCopy={onCopy} />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export const McpConnectionPanel: React.FC = () => {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI?.mcp;
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(undefined), 3000); };

  const refresh = useCallback(() => { api?.getStatus().then(setStatus).catch(() => undefined); }, [api]);
  useEffect(() => {
    if (!api) return;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [api, refresh]);

  const run = async (task: () => Promise<McpServerStatus>) => {
    setBusy(true);
    try { setStatus(await task()); } catch { flash('No se pudo completar la acción.'); } finally { setBusy(false); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash('Copiado al portapapeles.'); } catch { flash('No se pudo copiar.'); }
  };

  return (
    <McpConnectionPanelView
      status={status} busy={busy} unavailable={!api} message={message}
      onToggle={(enabled) => api && run(() => api.setEnabled(enabled))}
      onCopyToken={async () => { if (api && await api.copyToken()) flash('Token copiado al portapapeles.'); }}
      onRegenerate={async () => {
        if (!api) return;
        const ok = await confirmAction({ title: 'Regenerar token', message: 'Los clientes conectados con el token actual dejarán de funcionar hasta que configures el nuevo.', confirmLabel: 'Regenerar', tone: 'danger' });
        if (ok) await run(() => api.regenerateToken());
      }}
      onCopy={copy}
    />
  );
};
