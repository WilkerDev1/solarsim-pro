import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Users } from 'lucide-react';
import { canWrite } from '../../../shared/permissions';
import { CLIENT_KINDS, type ClientKind } from '../../../shared/clients';
import { useSimulationStore } from '../../store/useSimulationStore';
import { filterClients, linkedProposalCounts } from '../../utils/clientSummary';
import { ClientDetailPanel } from './ClientDetailPanel';
import { ClientForm, EMPTY_CLIENT } from './ClientForm';
import './clients-hub.css';

/** Clients directory: search, kind filter, duplicate warnings, detail and linked proposals. */
export function ClientsHubView() {
  const {
    clients, projects, sidebarTheme, syncSettings, clientSyncFeedback, activeClientId, setActiveClientId,
    createClientRecord, syncClientsWithServer,
  } = useSimulationStore();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ClientKind | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const readOnly = !canWrite(syncSettings.currentUser);
  const visible = useMemo(() => filterClients(clients, query, kind), [clients, query, kind]);
  const counts = useMemo(() => linkedProposalCounts(projects), [projects]);
  const active = clients.find((c) => c.id === activeClientId);
  const online = !!syncSettings.currentUser && !!syncSettings.authToken;
  return (
    <div className="clients-hub" data-theme={sidebarTheme}>
      <header>
        <h1>Clientes</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          {online && (
            <button
              type="button"
              disabled={syncing}
              aria-busy={syncing}
              onClick={async () => { setSyncing(true); await syncClientsWithServer(); setSyncing(false); }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              Sincronizar
            </button>
          )}
          {!readOnly && (
            <button type="button" className="cl-primary" onClick={() => { setCreating(true); setActiveClientId(null); }}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo cliente
            </button>
          )}
        </div>
      </header>
      <div className="clients-hub-body">
        <aside aria-label="Directorio de clientes">
          <div className="cl-filters">
            <label>
              <span className="sr-only">Buscar clientes</span>
              <span style={{ position: 'relative', display: 'block' }}>
                <Search className="h-4 w-4" aria-hidden="true" style={{ position: 'absolute', left: 12, top: 13, color: 'var(--cl-muted)' }} />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, RNC, teléfono o correo" style={{ paddingLeft: 36 }} />
              </span>
            </label>
            <div className="cl-kind-filter" role="group" aria-label="Filtrar por tipo">
              {([['all', 'Todos'], ...Object.entries(CLIENT_KINDS).map(([k, l]) => [k, `${l}s`])] as [ClientKind | 'all', string][]).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="cl-list-empty">
              {clients.length ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes en este espacio de trabajo.'}
            </p>
          ) : (
            <ul className="cl-list">
              {visible.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    aria-current={client.id === activeClientId && !creating ? 'page' : undefined}
                    onClick={() => { setActiveClientId(client.id); setCreating(false); }}
                  >
                    <span className="cl-list-name">
                      <span style={{ overflowWrap: 'anywhere' }}>{client.name}</span>
                      <small>{[CLIENT_KINDS[client.kind], client.taxId, client.province].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="cl-count" aria-label={`${counts.get(client.id) ?? 0} propuestas`}>{counts.get(client.id) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <main>
          {clientSyncFeedback && (
            <div className="cl-content" style={{ marginBottom: 24 }}>
              <p className="cl-notice cl-error" role="alert">{clientSyncFeedback}</p>
            </div>
          )}
          {creating ? (
            <div className="cl-content">
              <div className="cl-identity"><div><h2>Nuevo cliente</h2><p>Solo el nombre es obligatorio. Los datos impresos de cada propuesta se mantienen independientes.</p></div></div>
              <ClientForm
                initial={EMPTY_CLIENT}
                clients={clients}
                readOnly={readOnly}
                submitLabel="Crear cliente"
                onCancel={() => setCreating(false)}
                onSubmit={(value) => {
                  const result = createClientRecord(value);
                  if (!result.ok) return result.error;
                  setCreating(false);
                  setActiveClientId(result.client.id);
                  return null;
                }}
              />
            </div>
          ) : active ? (
            <ClientDetailPanel key={active.id} client={active} readOnly={readOnly} />
          ) : (
            <div className="cl-empty">
              <Users className="h-8 w-8" aria-hidden="true" style={{ color: 'var(--cl-muted)' }} />
              <h2>Directorio de clientes</h2>
              <p>
                Agrupa las propuestas de un mismo cliente y consulta sus estados. Enlazar una propuesta no cambia el nombre
                impreso en su documento.
              </p>
              {!readOnly && <button type="button" className="cl-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Nuevo cliente</button>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
