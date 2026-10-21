import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Link2, UserRound, X } from 'lucide-react';
import { CLIENT_KINDS } from '../../../shared/clients';
import { canEditCommercial } from '../../features/proposals/commercial';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { ProjectSimulation } from '../../types';
import type { ClientRecord } from '../../types/client';
import { confirmAction } from '../common/confirmAction';
import { ClientPicker } from './ClientPicker';
import './client-link.css';

/** Same rule as the commercial decision: writer, own workspace, not in trash or conflict. */
const useCanLink = (project: ProjectSimulation) => canEditCommercial(project, useSimulationStore((s) => s.syncSettings));

function useOpenClient() {
  const setActiveClientId = useSimulationStore((s) => s.setActiveClientId);
  const setActiveView = useSimulationStore((s) => s.setActiveView);
  return (id: string) => { setActiveClientId(id); setActiveView('clients-hub'); };
}

/** Card badge: the linked directory client, distinct from the printed name. */
export function ProposalClientBadge({ project }: { project: ProjectSimulation }) {
  const client = useSimulationStore((s) => (project.clientId ? s.clients.find((c) => c.id === project.clientId) : undefined));
  const openClient = useOpenClient();
  if (!project.clientId) return null;
  return client ? (
    <button
      type="button"
      className="client-link-badge"
      title="Abrir cliente enlazado"
      onClick={(event) => { event.stopPropagation(); openClient(client.id); }}
    >
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Cliente: {client.name}</span>
    </button>
  ) : (
    <span className="client-link-badge" data-missing>
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
      Cliente pendiente de sincronizar
    </span>
  );
}

/** Dialog to link, change or remove the directory client of a proposal. */
export function ClientLinkDialog({ project, onClose }: { project: ProjectSimulation; onClose: () => void }) {
  const { clients, sidebarTheme, linkProposalToClient, createClientRecord } = useSimulationStore();
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus?.();
  }, []);
  const link = (client: ClientRecord | null) => {
    const result = linkProposalToClient(project.id, client?.id ?? null);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return createPortal(
    <div className={sidebarTheme === 'dark' ? 'dark' : ''}>
      <div className="client-link-backdrop" onMouseDown={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-link-title"
          className="client-link-dialog client-link-scope"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        >
          <header>
            <div>
              <h2 id="client-link-title">Cliente de la propuesta</h2>
              <p>«{project.client.name || 'Sin nombre'}». El nombre impreso en el documento no cambia.</p>
            </div>
            <button type="button" className="client-link-icon" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></button>
          </header>
          <ClientPicker
            clients={clients}
            selectedId={project.clientId ?? null}
            onSelect={link}
            onCreate={(name) => {
              const created = createClientRecord({ name });
              if (created.ok) link(created.client);
              else setError(created.error);
            }}
          />
          {error && <p role="alert" className="client-link-error">{error}</p>}
          <footer>
            {project.clientId && <button type="button" onClick={() => link(null)}>Quitar enlace</button>}
            <button type="button" onClick={onClose}>Cerrar</button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Project hub section: linked client summary and explicit actions. */
export function ProposalClientSection({ project }: { project: ProjectSimulation }) {
  const client = useSimulationStore((s) => (project.clientId ? s.clients.find((c) => c.id === project.clientId) : undefined));
  const updateClient = useSimulationStore((s) => s.updateClient);
  const canLink = useCanLink(project);
  const openClient = useOpenClient();
  const [open, setOpen] = useState(false);
  return (
    <section className="summary-section client-link-section client-link-scope" aria-labelledby="proposal-client-title">
      <header>
        <h2 id="proposal-client-title">Cliente</h2>
        <p>Enlace al directorio de clientes, independiente del nombre impreso.</p>
      </header>
      {client ? (
        <dl className="client-link-data">
          <div><dt>Nombre</dt><dd>{client.name}</dd></div>
          <div><dt>Tipo</dt><dd>{CLIENT_KINDS[client.kind]}{client.taxId ? ` · ${client.taxId}` : ''}</dd></div>
          {(client.phone || client.email) && <div><dt>Contacto</dt><dd>{[client.phone, client.email].filter(Boolean).join(' · ')}</dd></div>}
        </dl>
      ) : (
        <p>{project.clientId ? 'El cliente enlazado aún no está disponible en este equipo. Sincroniza para verlo.' : 'Sin cliente enlazado.'}</p>
      )}
      <div className="client-link-actions">
        {client && (
          <button type="button" onClick={() => openClient(client.id)}>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />Ver cliente
          </button>
        )}
        {canLink && (
          <button type="button" onClick={() => setOpen(true)}>
            <Link2 className="h-4 w-4" aria-hidden="true" />{project.clientId ? 'Cambiar' : 'Enlazar cliente'}
          </button>
        )}
        {canLink && client && (
          <button
            type="button"
            onClick={async () => {
              if (!(await confirmAction({ title: 'Usar datos del cliente', message: `¿Reemplazar los datos impresos de la propuesta con los de «${client.name}»? Los campos vacíos del cliente no se copian.`, confirmLabel: 'Usar datos' })))
                return;
              updateClient({
                name: client.name,
                ...(client.kind === 'empresa' ? { company: client.name } : {}),
                ...(client.taxId ? { rnc: client.taxId } : {}),
                ...(client.phone ? { contactPhone: client.phone } : {}),
                ...(client.email ? { contactEmail: client.email } : {}),
                ...(client.address ? { address: client.address } : {}),
                ...(client.province ? { province: client.province } : {}),
              });
            }}
          >
            Usar datos en el documento
          </button>
        )}
      </div>
      {open && <ClientLinkDialog project={project} onClose={() => setOpen(false)} />}
    </section>
  );
}
