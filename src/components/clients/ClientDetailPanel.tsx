import { useMemo } from 'react';
import { ArrowUpRight, Trash2, Unlink } from 'lucide-react';
import { CLIENT_KINDS, clientContent } from '../../../shared/clients';
import { PROPOSAL_DECISIONS, commercialState } from '../../../shared/proposalCommercial';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { useEnergyCalculationMode } from '../../features/application/useApplicationFeatures';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { ClientRecord } from '../../types/client';
import { DOCUMENT_STATUS_LABELS, clientProposals, summarizeClient } from '../../utils/clientSummary';
import { projectDate } from '../dashboard/projectPresentation';
import { confirmAction } from '../common/confirmAction';
import { canEditCommercial } from '../../features/proposals/commercial';
import { ClientForm } from './ClientForm';

const money = (value: number) =>
  value.toLocaleString('es-DO', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** One client: optional data, linked proposals and the summary of their document and commercial states. */
export function ClientDetailPanel({ client, readOnly }: { client: ClientRecord; readOnly: boolean }) {
  const { projects, clients, clientChanges, updateClientRecord, deleteClientRecord, resolveClientConflict, linkProposalToClient, setActiveProject, syncSettings } =
    useSimulationStore();
  const mode = useEnergyCalculationMode();
  const linked = useMemo(() => clientProposals(projects, client.id), [projects, client.id]);
  const summary = useMemo(
    () => summarizeClient(projects, client.id, (p) => calculateProjectFinancialSummary(p, mode).contractPriceUSD),
    [projects, client.id, mode],
  );
  const conflict = clientChanges[client.id]?.serverClient;
  const pending = !!clientChanges[client.id] && !conflict;
  return (
    <div className="cl-content">
      <div className="cl-identity">
        <div>
          <h2>{client.name}</h2>
          <p>
            {CLIENT_KINDS[client.kind]}
            {client.taxId ? ` · ${client.taxId}` : ''}
            {pending ? ' · Cambios pendientes de sincronizar' : ''}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="cl-danger"
            onClick={async () => {
              const message = linked.length
                ? `Se quitará el enlace de ${linked.length} propuesta(s). Sus datos impresos no cambian.`
                : 'El cliente no tiene propuestas enlazadas.';
              if (await confirmAction({ title: 'Eliminar cliente', message: `¿Eliminar «${client.name}»? ${message}`, confirmLabel: 'Eliminar cliente', tone: 'danger' }))
                deleteClientRecord(client.id);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Eliminar
          </button>
        )}
      </div>

      {conflict && (
        <div className="cl-notice cl-error" role="alert">
          Otro miembro cambió este cliente («{conflict.name}», versión {conflict.version}). Elige qué versión conservar.
          <div className="cl-actions">
            <button type="button" onClick={() => resolveClientConflict(client.id, 'accept_server')}>Usar la del servidor</button>
            <button type="button" onClick={() => resolveClientConflict(client.id, 'keep_local')}>Conservar la mía</button>
          </div>
        </div>
      )}

      <section className="cl-section" aria-labelledby="client-summary-title">
        <h3 id="client-summary-title">Resumen de propuestas</h3>
        <dl className="cl-metrics">
          <div><dt>Propuestas</dt><dd>{summary.total}</dd></div>
          <div><dt>Aprobadas</dt><dd>{summary.decisions.approved}</dd></div>
          <div><dt>En espera</dt><dd>{summary.decisions.pending}</dd></div>
          <div><dt>Monto aprobado</dt><dd>{money(summary.approvedAmountUSD)}</dd></div>
        </dl>
        <div className="cl-chip-row" aria-label="Estados del documento y decisiones comerciales">
          {Object.entries(DOCUMENT_STATUS_LABELS).map(([key, label]) => (
            <span key={key} className="cl-chip">{label}: {summary.documents[key as keyof typeof summary.documents]}</span>
          ))}
          {Object.entries(PROPOSAL_DECISIONS).map(([key, label]) => (
            <span key={key} className="cl-chip" data-decision={summary.decisions[key as keyof typeof summary.decisions] ? key : undefined}>{label}: {summary.decisions[key as keyof typeof summary.decisions]}</span>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12 }}>
          El monto suma el precio de contrato de las propuestas aprobadas; las de prueba y la papelera no cuentan.
        </p>
      </section>

      <section className="cl-section" aria-labelledby="client-proposals-title">
        <h3 id="client-proposals-title">Propuestas enlazadas</h3>
        {linked.length === 0 ? (
          <p>Sin propuestas enlazadas. Enlázalas desde el menú de acciones de cada propuesta o desde su resumen.</p>
        ) : (
          <div className="cl-table-wrap">
            <table>
              <thead>
                <tr><th>Propuesta</th><th>Documento</th><th>Decisión</th><th>Actualizada</th><th><span className="sr-only">Acciones</span></th></tr>
              </thead>
              <tbody>
                {linked.map((project) => {
                  const decision = commercialState(project).status;
                  return (
                    <tr key={project.id}>
                      <td>
                        {project.client.name || 'Sin nombre'}
                        <small>{project.client.projectId || 'Sin código'}</small>
                      </td>
                      <td><span className="cl-chip">{DOCUMENT_STATUS_LABELS[project.status] ?? project.status}</span></td>
                      <td><span className="cl-chip" data-decision={decision}>{PROPOSAL_DECISIONS[decision]}</span></td>
                      <td>{projectDate(project)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => setActiveProject(project.id, 'project-hub')} aria-label={`Abrir ${project.client.name || 'propuesta'}`}>
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />Abrir
                        </button>{' '}
                        {!readOnly && canEditCommercial(project, syncSettings) && (
                          <button type="button" onClick={() => linkProposalToClient(project.id, null)} aria-label={`Quitar enlace de ${project.client.name || 'la propuesta'}`}>
                            <Unlink className="h-4 w-4" aria-hidden="true" />Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ClientForm
        key={client.id}
        initial={clientContent(client)}
        clients={clients}
        editingId={client.id}
        readOnly={readOnly}
        submitLabel="Guardar cliente"
        onSubmit={(value) => {
          const result = updateClientRecord(client.id, value);
          return result.ok ? null : result.error;
        }}
      />
    </div>
  );
}
