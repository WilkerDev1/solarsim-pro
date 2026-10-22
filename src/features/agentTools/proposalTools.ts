import { PROPOSAL_DECISIONS, commercialState, type ProposalDecision } from '../../../shared/proposalCommercial';
import { buildProjectFromDraft } from '../../store/slices/aiSlice';
import type { ExtractedInvoiceData, ProjectSimulation } from '../../types';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  canWriteWorkspace, findVisibleEquipment, findVisibleProject, fingerprint, proposalCard, requireEditableProject, store,
  type NativeHandler,
} from './nativeTools';

const STATUS_LABEL = { Draft: 'Borrador', Final: 'Final', Archived: 'Archivada' } as const;
type GroupArg = { catalogItemId: string; count: number };

function catalogGroups(groups: GroupArg[] | undefined, type: 'panel' | 'inverter' | 'battery') {
  return (groups || []).map((g) => {
    const item = findVisibleEquipment(g.catalogItemId);
    if (item.type !== type) throw new Error(`${item.displayName} no es del tipo ${type}. Usa un id de catálogo del tipo correcto.`);
    return { equipmentId: item.id, quantity: g.count };
  });
}

/** Raw draft for the shared AI normalizer: prices come from supplier offers, never from the agent. */
function createDraft(args: Record<string, any>): ExtractedInvoiceData {
  const batteries = catalogGroups(args.batteries, 'battery');
  return {
    clientName: args.clientName, companyName: args.company, province: args.province, address: args.address, phone: args.phone, email: args.email,
    distributor: args.distributor, tariffCode: args.tariffCode, targetCoveragePct: args.targetCoveragePct,
    ...(Array.isArray(args.monthlyConsumptionKWh) && args.monthlyConsumptionKWh.length === 12 ? { observedMonthlyConsumptionKWh: args.monthlyConsumptionKWh } : {}),
    averageMonthlyKWh: args.averageMonthlyKWh,
    panels: catalogGroups(args.panels, 'panel'), inverters: catalogGroups(args.inverters, 'inverter'), batteries, hasBattery: batteries.length > 0,
    commercial: { priceBasis: 'purchase', markupPct: args.marginPct ?? null, marginOnSalePct: null, installationUnitPriceUSD: args.installationUnitPriceUSD ?? null,
      installationTotalUSD: null, customItems: [], customDiscounts: [] },
  } as unknown as ExtractedInvoiceData;
}

const createProposal: NativeHandler = (args) => {
  if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
  if (!Array.isArray(args.monthlyConsumptionKWh) && args.averageMonthlyKWh === undefined)
    throw new Error('Indica doce consumos mensuales o un consumo promedio.');
  if (Array.isArray(args.monthlyConsumptionKWh) && args.monthlyConsumptionKWh.length !== 12)
    throw new Error('monthlyConsumptionKWh necesita exactamente doce valores.');
  const draft = createDraft(args);
  const preview = buildProjectFromDraft(store(), draft, true);
  if ('error' in preview) throw new Error(preview.error);
  return {
    data: { status: 'ready', clientName: args.clientName },
    plan: {
      title: `Crear propuesta para ${args.clientName}`,
      targetType: 'project',
      changes: [{ label: 'Cliente', value: args.clientName }, { label: 'Modalidad', value: 'Simple (Catálogo IA) · matriz de costos' }],
      execute() {
        if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
        const built = buildProjectFromDraft(store(), createDraft(args), true);
        if ('error' in built) throw new Error(built.error);
        const project = built.project;
        insertProject(project);
        return { targetId: project.id, data: { proposalId: project.id, code: project.client.projectId }, cards: [proposalCard(project)],
          undo: { op: 'trash', before: {}, afterFingerprint: '' } };
      },
    },
  };
};

/** Agents never navigate: the new proposal is added without changing the active one. */
function insertProject(project: ProjectSimulation) {
  useSimulationStore.setState((s) => ({ projects: [project, ...s.projects] }));
  const s = store();
  if (s.syncSettings.autoSyncEnabled && s.syncSettings.authToken) s.triggerAutoSync(true);
}

const duplicateProposal: NativeHandler = (args) => {
  const source = findVisibleProject(args.id);
  if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
  return {
    data: { status: 'ready' },
    plan: {
      title: `Duplicar ${source.client.name}`, targetType: 'project', changes: [{ label: 'Original', value: source.client.projectId || source.id }],
      execute() {
        // Permissions may have changed while the plan waited for confirmation.
        if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
        findVisibleProject(args.id);
        const id = store().duplicateProject(args.id, { activate: false });
        const copy = id && store().projects.find((p) => p.id === id);
        if (!copy) throw new Error('No se pudo duplicar la propuesta.');
        return { targetId: copy.id, data: { proposalId: copy.id, code: copy.client.projectId }, cards: [proposalCard(copy)], undo: { op: 'trash', before: {}, afterFingerprint: '' } };
      },
    },
  };
};

const openProposal: NativeHandler = (args) => {
  const project = findVisibleProject(args.id);
  const view = args.view || 'project-hub';
  store().setActiveProject(project.id, view === 'simulator' ? 'simulator' : 'project-hub');
  if (view === 'pdf-preview') store().setActiveView('pdf-preview');
  return { data: { opened: project.id, view }, cards: [proposalCard(project)] };
};

const setProposalStatus: NativeHandler = (args) => {
  const project = requireEditableProject(args.id);
  const status = args.status as keyof typeof STATUS_LABEL;
  return {
    data: { status: 'ready' },
    plan: {
      title: `${project.client.name}: estado ${STATUS_LABEL[status]}`, targetType: 'project',
      changes: [{ label: 'Estado', value: `${STATUS_LABEL[project.status]} → ${STATUS_LABEL[status]}` }],
      execute() {
        const current = requireEditableProject(args.id);
        const before = { status: current.status };
        store().setProjectStatus(current.id, status);
        return { targetId: current.id, data: { status }, undo: { before, afterFingerprint: fingerprint({ status }) } };
      },
    },
  };
};

const setCommercialStatus: NativeHandler = (args) => {
  const project = requireEditableProject(args.id);
  const status = args.status as ProposalDecision;
  return {
    data: { status: 'ready' },
    plan: {
      title: `${project.client.name}: decisión ${PROPOSAL_DECISIONS[status]}`, targetType: 'project',
      changes: [{ label: 'Decisión comercial', value: `${PROPOSAL_DECISIONS[commercialState(project).status]} → ${PROPOSAL_DECISIONS[status]}` }],
      execute() {
        const current = requireEditableProject(args.id);
        const before = { commercial: structuredClone(current.commercial) };
        const result = store().setProposalCommercialState(current.id, { status });
        if (!result.success) throw new Error(result.error);
        const after = store().projects.find((p) => p.id === current.id)!;
        return { targetId: current.id, data: { status }, undo: { before, afterFingerprint: fingerprint({ commercial: after.commercial }) } };
      },
    },
  };
};

const addCommercialReport: NativeHandler = (args) => {
  const project = requireEditableProject(args.id);
  return {
    data: { status: 'ready' },
    plan: {
      title: `${project.client.name}: reporte comercial`, targetType: 'project',
      changes: [{ label: 'Nota', value: String(args.note).slice(0, 200) }, ...(args.status ? [{ label: 'Decisión', value: PROPOSAL_DECISIONS[args.status as ProposalDecision] }] : [])],
      execute() {
        const current = requireEditableProject(args.id);
        const state = commercialState(current);
        const result = store().addProposalCommercialReport(current.id, { status: args.status || state.status, note: args.note, ownerId: state.ownerId, ownerName: state.ownerName }, !!args.status);
        if (!result.success) throw new Error(result.error);
        // Reports are append-only on the server, so they are not undoable.
        return { targetId: current.id };
      },
    },
  };
};

const moveProposalToTrash: NativeHandler = (args) => {
  const project = requireEditableProject(args.id);
  return {
    data: { status: 'ready' },
    plan: {
      title: `Enviar a papelera: ${project.client.name}`, targetType: 'project', changes: [{ label: 'Propuesta', value: project.client.projectId || project.id }],
      execute() {
        const current = requireEditableProject(args.id);
        store().moveToTrash(current.id);
        return { targetId: current.id, undo: { op: 'restore', before: {}, afterFingerprint: '' } };
      },
    },
  };
};

export const PROPOSAL_TOOL_HANDLERS: Record<string, NativeHandler> = {
  create_proposal: createProposal,
  duplicate_proposal: duplicateProposal,
  open_proposal: openProposal,
  set_proposal_status: setProposalStatus,
  set_commercial_status: setCommercialStatus,
  add_commercial_report: addCommercialReport,
  move_proposal_to_trash: moveProposalToTrash,
};
