import { CLIENT_KINDS } from '../../../shared/clients';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { clientProposals, filterClients, linkedProposalCounts, summarizeClient } from '../../utils/clientSummary';
import type { ClientRecord } from '../../types/client';
import { visibleAssistantProjects } from '../assistant/tools';
import { canWriteWorkspace, fingerprint, pickFields, proposalCard, requireEditableProject, store, type NativeHandler } from './nativeTools';

const INPUT_FIELDS = ['kind', 'name', 'taxId', 'phone', 'email', 'address', 'province', 'notes'] as const;
const pickInput = (args: Record<string, unknown>) =>
  Object.fromEntries(INPUT_FIELDS.filter((k) => typeof args[k] === 'string').map((k) => [k, String(args[k])]));

function findClient(id: string): ClientRecord {
  const client = store().clients.find((c) => c.id === id);
  if (!client) throw new Error('Cliente no encontrado en este espacio. Usa search_clients.');
  return client;
}
const requireWriter = () => {
  if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
};
const clientData = (c: ClientRecord, proposalCount = 0) => ({
  id: c.id, kind: c.kind, kindLabel: CLIENT_KINDS[c.kind], name: c.name, taxId: c.taxId, phone: c.phone, email: c.email,
  address: c.address, province: c.province, notes: c.notes, proposalCount,
});

const searchClients: NativeHandler = (args) => {
  const counts = linkedProposalCounts(visibleAssistantProjects());
  const clients = filterClients(store().clients, String(args.query || ''), args.kind || 'all').slice(0, 20);
  // Compact projection: notes and address can be long; get_client returns the full record.
  const compact = (c: ClientRecord) => ({ id: c.id, kind: c.kind, name: c.name, taxId: c.taxId, phone: c.phone, email: c.email, province: c.province, proposalCount: counts.get(c.id) ?? 0 });
  return { data: { clients: clients.map(compact), limit: 20 } };
};

const getClient: NativeHandler = (args) => {
  const client = findClient(args.id);
  const projects = visibleAssistantProjects();
  const summary = summarizeClient(projects, client.id, (p) => calculateProjectFinancialSummary(p).contractPriceUSD);
  const linked = clientProposals(projects, client.id);
  return {
    data: {
      client: clientData(client, linked.length), summary,
      proposals: linked.slice(0, 30).map((p) => ({ id: p.id, code: p.client.projectId, printedName: p.client.name, status: p.status, decision: p.commercial?.status ?? 'pending', updatedAt: p.updatedAt })),
    },
    cards: [{ type: 'client', id: client.id, title: client.name, detail: `${summary.total} propuestas · ${summary.decisions.approved} aprobadas`, proposalCount: summary.total },
      ...linked.slice(0, 3).map(proposalCard)],
  };
};

const createClient: NativeHandler = (args) => {
  requireWriter();
  const input = { kind: 'empresa', ...pickInput(args), name: String(args.name) };
  return {
    data: { status: 'ready' },
    plan: {
      title: `Nuevo cliente: ${input.name}`, targetType: 'client',
      changes: Object.entries(input).filter(([, v]) => v).map(([k, v]) => ({ label: k, value: String(v).slice(0, 120) })),
      execute() {
        requireWriter();
        const result = store().createClientRecord(input as Parameters<ReturnType<typeof store>['createClientRecord']>[0]);
        if (!result.ok) throw new Error(result.error);
        // The directory syncs with CAS; removing a client is a separate, confirmed action (delete_client).
        return { targetId: result.client.id, data: { clientId: result.client.id }, cards: [{ type: 'client', id: result.client.id, title: result.client.name }] };
      },
    },
  };
};

const updateClient: NativeHandler = (args) => {
  requireWriter();
  const client = findClient(args.id);
  const updates = pickInput(args);
  if (!Object.keys(updates).length) throw new Error('Indica al menos un campo a cambiar.');
  return {
    data: { status: 'ready' },
    plan: {
      title: `Cliente ${client.name}`, targetType: 'client',
      changes: Object.entries(updates).map(([k, v]) => ({ label: k, value: `${String((client as unknown as Record<string, unknown>)[k] ?? '')} → ${v}`.slice(0, 160) })),
      execute() {
        requireWriter();
        const result = store().updateClientRecord(client.id, updates);
        if (!result.ok) throw new Error(result.error);
        return { targetId: client.id };
      },
    },
  };
};

/** Links (or unlinks with clientId null) a proposal; the printed client data in the document never changes. */
const linkProposal: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  const clientId: string | null = args.clientId ?? null;
  const client = clientId ? findClient(clientId) : undefined;
  return {
    data: { status: 'ready' },
    plan: {
      title: client ? `Enlazar ${project.client.projectId || project.id} con ${client.name}` : `Desenlazar cliente de ${project.client.projectId || project.id}`,
      targetType: 'project', changes: [{ label: 'Cliente del directorio', value: client?.name ?? '(ninguno)' }],
      execute() {
        const current = requireEditableProject(args.proposalId);
        const before = pickFields(current, ['clientId']);
        const result = store().linkProposalToClient(current.id, clientId);
        if (!result.ok) throw new Error(result.error);
        const after = store().projects.find((p) => p.id === current.id)!;
        return { targetId: current.id, undo: { before, fields: ['clientId'], afterFingerprint: fingerprint(pickFields(after, ['clientId'])) } };
      },
    },
  };
};

const deleteClient: NativeHandler = (args) => {
  requireWriter();
  const client = findClient(args.id);
  const linked = clientProposals(visibleAssistantProjects(), client.id).length;
  return {
    data: { status: 'ready' },
    plan: {
      title: `Eliminar cliente ${client.name}`, targetType: 'client',
      changes: [{ label: 'Propuestas enlazadas', value: `${linked} (se desenlazan; sus datos impresos no cambian)` }],
      execute() {
        requireWriter();
        if (!store().deleteClientRecord(client.id)) throw new Error('No se pudo eliminar el cliente.');
        return { targetId: client.id };
      },
    },
  };
};

export const CLIENT_TOOL_HANDLERS: Record<string, NativeHandler> = {
  search_clients: searchClients,
  get_client: getClient,
  create_client: createClient,
  update_client: updateClient,
  link_proposal_to_client: linkProposal,
  delete_client: deleteClient,
};
