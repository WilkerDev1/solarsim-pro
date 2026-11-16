import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import type { AgentAccessStatus, AgentActivityEntry, AgentGrantSummary, AgentScope } from '../../../../../shared/agentAccess';
import { canAdminister, canWrite } from '../../../../../shared/permissions';
import { buildRemoteMcpSnippets } from '../../../../features/agentTools/remoteMcpSnippets';
import { AgentAccessService } from '../../../../services/agentAccessService';
import { useSimulationStore } from '../../../../store/useSimulationStore';
import { confirmAction } from '../../../common/confirmAction';

const button = 'flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const SCOPE_LABEL: Record<AgentScope, string> = { read: 'Solo lectura', write: 'Lectura y borradores' };

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

export interface RemoteMcpPanelViewProps {
  signedIn: boolean;
  canWriteRole: boolean;
  status: AgentAccessStatus | null;
  grants: AgentGrantSummary[];
  activity: AgentActivityEntry[];
  /** Token just created: shown once, then forgotten when the panel closes it. */
  newToken?: string;
  busy: boolean;
  error?: string;
  message?: string;
  onCreate: (input: { name: string; scope: AgentScope; expiresInDays: number }) => void;
  onRevoke: (grant: AgentGrantSummary) => void;
  onDismissToken: () => void;
  onCopy: (text: string) => void;
}

export const RemoteMcpPanelView: React.FC<RemoteMcpPanelViewProps> = (props) => {
  const { signedIn, canWriteRole, status, grants, activity, newToken, busy, error, message } = props;
  const [name, setName] = useState('');
  const [scope, setScope] = useState<AgentScope>('read');
  const [days, setDays] = useState(90);
  const snippets = useMemo(() => (status?.mcpUrl ? buildRemoteMcpSnippets(status.mcpUrl) : null), [status?.mcpUrl]);
  const header = (
    <div>
      <h3 id="remote-mcp-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Acceso remoto (MCP)</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
        Conecta ChatGPT, Claude.ai u otros agentes en la nube con los datos sincronizados de tu organización, con los permisos de tu cuenta. No necesita la app abierta. Las acciones que piden confirmación (precios, estados, papelera, borrados) no están disponibles por esta vía.
      </p>
    </div>
  );
  if (!signedIn)
    return <section aria-labelledby="remote-mcp-title" className="space-y-4">{header}<p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">Inicia sesión en la nube para gestionar el acceso remoto.</p></section>;
  if (!status)
    return <section aria-labelledby="remote-mcp-title" className="space-y-4">{header}{error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : <p className="text-sm text-slate-500 dark:text-zinc-400">Cargando estado…</p>}</section>;
  if (!status.enabled || !status.mcpUrl)
    return <section aria-labelledby="remote-mcp-title" className="space-y-4">{header}<p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">El servidor de tu organización no tiene habilitado el MCP remoto. Lo activa quien administra el servidor (docs/MCP_REMOTE.md).</p></section>;

  return (
    <section aria-labelledby="remote-mcp-title" className="space-y-4">
      {header}
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
        {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Dirección del servidor MCP</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all text-sm text-slate-900 dark:text-white">{status.mcpUrl}</code>
            <button type="button" onClick={() => props.onCopy(status.mcpUrl!)} className={button}><Copy className="h-3.5 w-3.5" />Copiar</button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
            {status.oauthEnabled
              ? 'ChatGPT y Claude.ai: añade un conector personalizado con esta dirección e inicia sesión con tu cuenta de SolarSim cuando lo pida. Para agentes por terminal o API, crea un token personal.'
              : 'Este servidor solo acepta tokens personales (sin inicio de sesión OAuth): úsalo con clientes que permitan una cabecera Authorization.'}
          </p>
        </div>

        {newToken ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Copia el token ahora: no se volverá a mostrar.</p>
            <code className="block break-all text-xs text-amber-950 dark:text-amber-100">{newToken}</code>
            <div className="flex gap-2">
              <button type="button" onClick={() => props.onCopy(newToken)} className={button}><KeyRound className="h-3.5 w-3.5" />Copiar token</button>
              <button type="button" onClick={props.onDismissToken} className={button}>Listo</button>
            </div>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) props.onCreate({ name: name.trim(), scope, expiresInDays: days }); }}>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-zinc-400">Nombre
              <input className={field} value={name} maxLength={120} placeholder="p. ej. Claude Code portátil" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-zinc-400">Alcance
              <select className={field} value={scope} onChange={(e) => setScope(e.target.value as AgentScope)}>
                <option value="read">{SCOPE_LABEL.read}</option>
                {canWriteRole && <option value="write">{SCOPE_LABEL.write}</option>}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-zinc-400">Vigencia
              <select className={field} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !name.trim()} className={button}><KeyRound className="h-3.5 w-3.5" />Crear token personal</button>
          </form>
        )}

        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Accesos activos</p>
          {grants.length ? (
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-zinc-800">
              {grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="text-slate-900 dark:text-white">{g.name} <span className="text-xs text-slate-500 dark:text-zinc-400">· {g.kind === 'oauth' ? 'Conexión OAuth' : `Token ${g.tokenPrefix ?? ''}…`} · {SCOPE_LABEL[g.scope]}</span></p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Creado {date(g.createdAt)} · último uso {date(g.lastUsedAt)}{g.expiresAt ? ` · caduca ${date(g.expiresAt)}` : ''}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => props.onRevoke(g)} className={button}><Trash2 className="h-3.5 w-3.5" />Revocar</button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Ningún agente remoto tiene acceso.</p>}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Actividad remota reciente</p>
          {activity.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-700 dark:text-zinc-300">
              {activity.slice(0, 20).map((a) => (
                <li key={a.id}>{date(a.createdAt)} · {a.userName} · {a.tool ?? `${a.method} ${a.route}`} · {a.grantName ?? 'acceso revocado'}{a.clientLabel ? ` (${a.clientLabel})` : ''} · {a.status < 400 ? 'ok' : `error ${a.status}`}</li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Sin actividad.</p>}
        </div>

        {snippets && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-zinc-400">Sustituye <code>&lt;TOKEN&gt;</code> por tu token personal.</p>
            <Snippet title="Claude Code" hint="Ejecuta en una terminal." code={snippets.claudeCode} onCopy={props.onCopy} />
            <Snippet title="Codex · config.toml" hint="Añade este bloque a ~/.codex/config.toml." code={snippets.codex} onCopy={props.onCopy} />
            <Snippet title="Codex · token en tu shell" hint="Ejecútalo antes de abrir Codex." code={snippets.codexEnv} onCopy={props.onCopy} />
            <Snippet title="Gemini CLI" hint="Añade a ~/.gemini/settings.json." code={snippets.geminiCli} onCopy={props.onCopy} />
          </div>
        )}
      </div>
    </section>
  );
};

export const RemoteMcpPanel: React.FC = () => {
  const syncSettings = useSimulationStore((s) => s.syncSettings);
  const user = syncSettings.currentUser;
  const signedIn = Boolean(user && syncSettings.authToken && syncSettings.serverUrl);
  const transport = useMemo(
    () => (signedIn ? AgentAccessService.transport(syncSettings.serverUrl, () => useSimulationStore.getState().syncSettings.authToken || '') : null),
    [signedIn, syncSettings.serverUrl],
  );
  const [status, setStatus] = useState<AgentAccessStatus | null>(null);
  const [grants, setGrants] = useState<AgentGrantSummary[]>([]);
  const [activity, setActivity] = useState<AgentActivityEntry[]>([]);
  const [newToken, setNewToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(undefined), 3000); };

  const refresh = useCallback(async () => {
    if (!transport) return;
    try {
      const next = await AgentAccessService.status(transport);
      setStatus(next);
      if (!next.enabled) return;
      const [g, a] = await Promise.all([AgentAccessService.grants(transport), AgentAccessService.activity(transport, canAdminister(user))]);
      setGrants(g);
      setActivity(a);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el acceso remoto.');
    }
  }, [transport, user]);
  useEffect(() => { void refresh(); }, [refresh]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash('Copiado al portapapeles.'); } catch { flash('No se pudo copiar.'); }
  };

  return (
    <RemoteMcpPanelView
      signedIn={signedIn} canWriteRole={Boolean(user) && canWrite(user)} status={status} grants={grants} activity={activity}
      newToken={newToken} busy={busy} error={error} message={message} onCopy={copy}
      onDismissToken={() => setNewToken(undefined)}
      onCreate={async (input) => {
        if (!transport) return;
        setBusy(true);
        try {
          const created = await AgentAccessService.create(transport, input);
          setNewToken(created.token);
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo crear el token.');
        } finally { setBusy(false); }
      }}
      onRevoke={async (grant) => {
        if (!transport) return;
        const ok = await confirmAction({ title: 'Revocar acceso', message: `«${grant.name}» dejará de funcionar de inmediato.`, confirmLabel: 'Revocar', tone: 'danger' });
        if (!ok) return;
        setBusy(true);
        try { await AgentAccessService.revoke(transport, grant.id); await refresh(); flash('Acceso revocado.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revocar.'); }
        finally { setBusy(false); }
      }}
    />
  );
};
