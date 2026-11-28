/**
 * Ejecución de las herramientas propias del asistente de la app (F3a). Cada una recibe el id de la propuesta (ninguna exige
 * tenerla abierta ni navega) y devuelve un `ToolPayload`: cambios por ruta, resultados del motor antes y después (o los motivos
 * de «incompleta»), avisos y sus datos. `toolset.ts` le añade el estado y el resumen vivo de la propuesta.
 *
 * Las escrituras son planes (`NativePlan`) que pasan por `runNativeTool`, con los permisos de siempre (política por fuente,
 * rol actual, confirmación; F3b decide el perfil «edición en vivo»). `execute` revalida todo: la confirmación puede llegar
 * minutos después.
 */
import { useSimulationStore } from '../../../store/useSimulationStore';
import { effectiveFeatureSettings } from '../../application/featurePolicy';
import { energyCalculationMode, netMeteringRegimeSelectorVisible } from '../../../../shared/applicationFeatures';
import { effectiveGenericPrice, priceFeatureActive } from '../../../store/slices/equipmentPriceSlice';
import { applyProjectEdits, diffProjectFields, type ProjectEditError, type ProjectFieldChange } from '../../../domain/projectEditTransaction';
import { operationsToEdits, proposeSystemSizing, type OperationContext, type ProposalOperation } from '../../../domain/proposalOperations';
import { editableFieldPaths, engineResults, proposalWarnings, type EngineResults } from '../../../domain/proposalSnapshot';
import { createNewProposal } from '../../../domain/newProposal';
import { createProjectId } from '../../../utils/projectId';
import { generateNextProjectSequence } from '../../../store/initialData';
import { companyDocumentCustomization } from '../../../utils/companyDocumentTemplate';
import { RD_PROVINCES } from '../../../data/rdProvinces';
import type { UtilityDistributor } from '../../../types/tariffs';
import type { AgentActivityEntry, AgentChange } from '../../../store/slices/agentSlice';
import type { ProjectSimulation } from '../../../types';
import {
  canWriteWorkspace, findVisibleProject, fingerprint, pickFields, proposalCard, PROJECT_SECTIONS, requireEditableProject, store,
  type AgentToolContext, type NativeHandler,
} from '../nativeTools';
import { assistantToolPorts, findInvoiceExtraction, rememberInvoiceExtraction, type InvoiceExtraction, type ProposalView } from './ports';

/** Lo que devuelve cada herramienta propia (el cuerpo de `functionResponse.response`, sin el estado ni el resumen vivo). */
export interface ToolPayload {
  proposalId?: string;
  changes?: ProjectFieldChange[];
  results?: { before: EngineResults | null; after: EngineResults | null };
  warnings?: string[];
  data?: unknown;
  error?: { code: string; message: string; errors?: ProjectEditError[] };
}

const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];
const calculationMode = () => energyCalculationMode(effectiveFeatureSettings(store()));
const unique = (list: string[]) => [...new Set(list)];
const results = (before: ProjectSimulation | null, after: ProjectSimulation | null) => {
  const mode = calculationMode();
  return { before: before ? engineResults(before, mode) : null, after: after ? engineResults(after, mode) : null };
};
const errorsText = (errors: readonly ProjectEditError[]) => errors.slice(0, 6).map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join(' ');
const failure = (code: string, errors: ProjectEditError[], extra: Partial<ToolPayload> = {}): ToolPayload =>
  ({ ...extra, error: { code, message: errorsText(errors), errors } });
const notAvailable = (message: string, extra: Partial<ToolPayload> = {}): ToolPayload => ({ ...extra, error: { code: 'not_available', message } });
const shown = (value: unknown) => {
  const text = value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};
/** Cambios legibles para la tarjeta de confirmación y la actividad. */
const agentChanges = (changes: readonly ProjectFieldChange[]): AgentChange[] =>
  changes.slice(0, 20).map((c) => ({ label: c.label, value: `${shown(c.before)} → ${shown(c.after)}` }));
/** Clave del paso en el diario de deshacer y en la actividad: la llamada concreta del turno. */
const editKeyOf = (ctx: AgentToolContext) => `assistant:${ctx.turnId ?? 'sin-turno'}:${ctx.callId ?? globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
const activityOf = (ctx: AgentToolContext, editKey?: string): Pick<AgentActivityEntry, 'turnId' | 'editKey'> =>
  ({ ...(ctx.turnId ? { turnId: ctx.turnId } : {}), ...(editKey ? { editKey } : {}) });

/** Contexto de las reglas: catálogo, tarifas, precio genérico (solo con sesión y la función activa) y lo que oculta la organización. */
export function operationContext(): OperationContext {
  const state = store();
  return {
    equipmentCatalog: state.equipmentCatalog, tariffMatrix: state.tariffMatrix,
    genericPriceFor: (equipmentId) => (priceFeatureActive(state) ? effectiveGenericPrice(state, equipmentId) : null),
    calculationMode: calculationMode(), now: Date.now(),
    hidden: { netMeteringRegime: !netMeteringRegimeSelectorVisible(effectiveFeatureSettings(state)) },
  };
}

// ── get_proposal_state ──────────────────────────────────────────────────────────────────────

const getProposalState: NativeHandler = (args) => {
  const project = findVisibleProject(args.proposalId);
  return {
    data: { proposalId: project.id, changes: [], results: results(null, project), warnings: proposalWarnings(project), data: { editablePaths: editableFieldPaths() } } satisfies ToolPayload,
    cards: [proposalCard(project)],
  };
};

// ── edit_proposal ───────────────────────────────────────────────────────────────────────────

const editProposal: NativeHandler = (args, ctx) => {
  const project = requireEditableProject(args.proposalId);
  const ops = args.ops as ProposalOperation[];
  const opCtx = operationContext();
  const translation = operationsToEdits(project, ops, opCtx);
  if (!translation.ok) return { data: failure('invalid_operations', translation.errors, { proposalId: project.id, warnings: translation.warnings }) };
  const preview = applyProjectEdits(project, translation.edits, opCtx, { validation: 'strict' });
  if (!preview.ok) return { data: failure('invalid_edits', preview.errors, { proposalId: project.id, warnings: unique([...translation.warnings, ...preview.warnings]) }) };
  const warnings = unique([...translation.warnings, ...preview.warnings]);
  if (!preview.changes.length) {
    return { data: { proposalId: project.id, changes: [], results: results(project, project), warnings: [...warnings, 'Sin cambios: la propuesta ya estaba así.'] } satisfies ToolPayload };
  }
  const editKey = editKeyOf(ctx);
  const idempotencyKey = ctx.turnId && ctx.callId ? `${ctx.turnId}:${ctx.callId}` : undefined;
  const title = (typeof args.title === 'string' && args.title.trim()) || `Editar ${project.client.name}`;
  return {
    data: { proposalId: project.id, changes: preview.changes, results: results(project, preview.project), warnings } satisfies ToolPayload,
    plan: {
      title, targetType: 'project', changes: agentChanges(preview.changes),
      execute() {
        // Revalida contra la propuesta de AHORA (permisos, papelera, conflicto, catálogo): la confirmación puede ser tardía.
        const current = requireEditableProject(project.id);
        const again = operationsToEdits(current, ops, operationContext());
        if (!again.ok) throw new Error(errorsText(again.errors));
        const before = pickFields(current, PROJECT_SECTIONS);
        const committed = store().commitProjectEdits(current.id, again.edits, {
          source: 'assistant', turnId: ctx.turnId, coalesceKey: editKey, idempotencyKey, validation: 'strict',
        });
        if (!committed.ok) throw new Error(errorsText(committed.errors));
        const after = store().projects.find((p) => p.id === current.id)!;
        return {
          targetId: current.id,
          data: { proposalId: current.id, changes: committed.changes, results: results(current, after), warnings: unique([...again.warnings, ...committed.warnings]) } satisfies ToolPayload,
          cards: [proposalCard(after)],
          changes: agentChanges(committed.changes),
          ...(committed.written ? { undo: { before, fields: [...PROJECT_SECTIONS], afterFingerprint: fingerprint(pickFields(after, PROJECT_SECTIONS)) } } : {}),
          activity: activityOf(ctx, committed.undoRecorded ? editKey : undefined),
        };
      },
    },
  };
};

// ── size_system ─────────────────────────────────────────────────────────────────────────────

const sizeSystem: NativeHandler = (args) => {
  const project = findVisibleProject(args.proposalId);
  const opCtx = operationContext();
  const proposal = proposeSystemSizing(project, opCtx, { coveragePct: args.coveragePct, includeBatteries: args.includeBatteries, batteryCatalogItemId: args.batteryCatalogItemId });
  if (!proposal.ok) return { data: failure('cannot_size', proposal.errors, { proposalId: project.id }) };
  // Vista previa de aplicar las ops: diff y resultados, sin escribir nada.
  const translation = operationsToEdits(project, proposal.sizing.ops, opCtx);
  const preview = translation.ok ? applyProjectEdits(project, translation.edits, opCtx, { validation: 'strict' }) : undefined;
  const previewWarnings = translation.ok ? (preview && !preview.ok ? [`La vista previa no se pudo calcular: ${errorsText(preview.errors)}`] : []) : [`La vista previa no se pudo calcular: ${errorsText(translation.errors)}`];
  return {
    data: {
      proposalId: project.id,
      changes: preview?.ok ? preview.changes : [],
      results: results(project, preview?.ok ? preview.project : null),
      warnings: unique([...proposal.sizing.warnings, ...(translation.ok ? translation.warnings : []), ...previewWarnings]),
      data: { ...proposal.sizing, applied: false, next: 'Para aplicarlo, llama a edit_proposal con estas ops.' },
    } satisfies ToolPayload,
    cards: [proposalCard(project)],
  };
};

// ── create_proposal ─────────────────────────────────────────────────────────────────────────

const normalizeText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function provinceName(raw: string): string | undefined {
  const query = normalizeText(raw);
  return RD_PROVINCES.find((p) => normalizeText(p.name) === query)?.name ?? RD_PROVINCES.find((p) => normalizeText(p.name).includes(query))?.name;
}
const validMonths = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 12 && value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) && value.some((n) => n > 0);

type CreationInput = { client: NonNullable<Parameters<typeof createNewProposal>[0]['client']>; monthlyConsumption?: number[] };
function creationInput(args: Record<string, any>, owner: string): { ok: true; input: CreationInput } | { ok: false; payload: ToolPayload } {
  const errors: ProjectEditError[] = [];
  let extraction: InvoiceExtraction | undefined;
  if (args.extractionId) {
    extraction = findInvoiceExtraction(owner, args.extractionId);
    if (!extraction) errors.push({ path: 'extractionId', message: 'Esa extracción de factura no existe o caducó: vuelve a leer la factura con extract_invoice.' });
  }
  const pick = <K extends keyof InvoiceExtraction>(key: K) => (args[key] ?? extraction?.[key]) as InvoiceExtraction[K];
  let province: string | undefined;
  const rawProvince = pick('province');
  if (rawProvince) {
    province = provinceName(String(rawProvince));
    if (!province) errors.push({ path: 'province', message: `«${rawProvince}» no es una provincia de República Dominicana.` });
  }
  const distributor = pick('distributor');
  if (distributor && !DISTRIBUTORS.includes(String(distributor).toUpperCase())) errors.push({ path: 'distributor', message: `Distribuidora desconocida: ${DISTRIBUTORS.join(', ')}.` });
  let monthlyConsumption: number[] | undefined;
  if (args.monthlyConsumptionKWh !== undefined) {
    if (!validMonths(args.monthlyConsumptionKWh)) errors.push({ path: 'monthlyConsumptionKWh', message: 'monthlyConsumptionKWh necesita exactamente doce consumos (kWh, de enero a diciembre) con algún valor mayor que 0.' });
    else monthlyConsumption = [...args.monthlyConsumptionKWh];
  } else if (args.averageMonthlyKWh !== undefined) monthlyConsumption = Array(12).fill(args.averageMonthlyKWh);
  else if (validMonths(extraction?.monthlyConsumptionKWh)) monthlyConsumption = [...extraction!.monthlyConsumptionKWh!];
  else if (typeof extraction?.averageMonthlyKWh === 'number' && extraction.averageMonthlyKWh > 0) monthlyConsumption = Array(12).fill(extraction.averageMonthlyKWh);
  if (errors.length) return { ok: false, payload: failure('invalid_arguments', errors) };
  return {
    ok: true,
    input: {
      client: {
        name: pick('clientName') || undefined, company: pick('company') || undefined, province, address: pick('address') || undefined,
        distributor: distributor ? (String(distributor).toUpperCase() as UtilityDistributor) : undefined, tariffCode: pick('tariffCode') || undefined,
      },
      monthlyConsumption,
    },
  };
}

/** La propuesta nueva con la fábrica única (fuente `assistant`: matriz de costos), sin activarla. */
function buildProposal(input: CreationInput, id: string): ProjectSimulation {
  const state = store();
  const user = state.syncSettings.currentUser;
  return createNewProposal({
    source: 'assistant', defaults: state.defaultSimulationSettings,
    identity: { id, now: new Date().toISOString(), sequence: generateNextProjectSequence(state.projects), user, serverUrl: user ? state.syncSettings.serverUrl.trim().replace(/\/+$/, '') : undefined },
    tariffMatrix: state.tariffMatrix, catalog: state.equipmentCatalog,
    genericPriceFor: (equipmentId) => (priceFeatureActive(state) ? effectiveGenericPrice(state, equipmentId) : null),
    companyProfileId: state.activeCompanyId,
    customization: companyDocumentCustomization(state.getActiveCompany(), state.defaultDocumentCustomization, state.documentTemplatesByCompany),
    client: input.client, monthlyConsumption: input.monthlyConsumption,
  });
}

const createProposal: NativeHandler = (args, ctx) => {
  if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
  const resolved = creationInput(args, ctx.owner);
  if (!resolved.ok) return { data: resolved.payload };
  const preview = buildProposal(resolved.input, 'preview');
  const name = preview.client.name;
  return {
    data: { changes: [], results: results(null, preview), warnings: proposalWarnings(preview) } satisfies ToolPayload,
    plan: {
      title: `Crear propuesta para ${name}`, targetType: 'project',
      changes: [{ label: 'Cliente', value: name }, { label: 'Modalidad', value: 'Simple (Catálogo IA) · matriz de costos' }],
      execute() {
        if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
        const project = buildProposal(resolved.input, createProjectId());
        // El asistente nunca navega aquí: la propuesta entra sin cambiar la activa (abrirla es de open_proposal).
        useSimulationStore.setState((s) => ({ projects: [project, ...s.projects] }));
        const s = store();
        if (s.syncSettings.autoSyncEnabled && s.syncSettings.authToken) s.triggerAutoSync(true);
        return {
          targetId: project.id,
          data: {
            proposalId: project.id, changes: [], results: results(null, project), warnings: proposalWarnings(project),
            data: { proposalId: project.id, code: project.client.projectId, openSimulator: true, next: 'Ábrela en el simulador con open_proposal (view simulator) para que el usuario la vea.' },
          } satisfies ToolPayload,
          cards: [proposalCard(project)],
          undo: { op: 'trash', before: {}, afterFingerprint: '' },
          activity: activityOf(ctx),
        };
      },
    },
  };
};

// ── extract_invoice ─────────────────────────────────────────────────────────────────────────

const extractInvoice: NativeHandler = async (args, ctx) => {
  const port = assistantToolPorts().extractInvoice;
  if (!port) return { data: notAvailable('La lectura de facturas todavía no está disponible en este asistente; usa el asistente de propuestas (factura) o indica los consumos.') };
  const raw = await port({ fileId: args.fileId, signal: ctx.signal });
  const issues = [...(raw.issues ?? [])];
  const data: InvoiceExtraction = { ...raw, issues };
  if (raw.monthlyConsumptionKWh !== undefined && !validMonths(raw.monthlyConsumptionKWh)) {
    delete data.monthlyConsumptionKWh;
    issues.push('No se pudieron leer los doce consumos mensuales.');
  }
  if (raw.distributor && !DISTRIBUTORS.includes(raw.distributor.toUpperCase())) {
    delete data.distributor;
    issues.push(`Distribuidora no reconocida: ${raw.distributor}.`);
  }
  const extractionId = rememberInvoiceExtraction(ctx.owner, data);
  const annualKWh = data.monthlyConsumptionKWh?.reduce((sum, n) => sum + n, 0);
  return {
    data: {
      changes: [], results: { before: null, after: null }, warnings: issues,
      data: {
        extractionId,
        summary: { clientName: data.clientName, distributor: data.distributor, tariffCode: data.tariffCode, province: data.province, ...(annualKWh !== undefined ? { annualKWh } : {}), months: data.monthlyConsumptionKWh ? 12 : 0 },
        issues,
        next: 'Pasa extractionId a create_proposal; no transcribas los consumos.',
      },
    } satisfies ToolPayload,
  };
};

// ── open_proposal ───────────────────────────────────────────────────────────────────────────

const openProposal: NativeHandler = async (args) => {
  const project = findVisibleProject(args.proposalId);
  const view = (args.view || 'simulator') as ProposalView;
  const port = assistantToolPorts().openProposal;
  if (!port) return { data: notAvailable('Abrir propuestas desde este asistente todavía no está disponible; ábrela desde la lista de propuestas.', { proposalId: project.id }) };
  await port({ proposalId: project.id, view });
  return { data: { proposalId: project.id, changes: [], results: results(null, project), warnings: [], data: { opened: project.id, view } } satisfies ToolPayload, cards: [proposalCard(project)] };
};

// ── undo_change ─────────────────────────────────────────────────────────────────────────────

/** Cambios del asistente que pide deshacer, del más reciente al más antiguo (la actividad ya está en ese orden). */
function undoTargets(proposalId: string, args: Record<string, any>): AgentActivityEntry[] {
  const applied = store().agentActivity.filter((a) => a.status === 'applied' && a.targetId === proposalId && a.source === 'app-assistant' && !!a.undo);
  if (args.activityId) return applied.filter((a) => a.id === args.activityId);
  if (args.turnId) return applied.filter((a) => a.turnId === args.turnId);
  return applied.slice(0, 1);
}

/**
 * Deshace un cambio. Si es el último paso del diario de deshacer de la propuesta abierta, por el diario (como Ctrl+Z: pasa a
 * rehacer); si no (propuesta cerrada, o hubo cambios después), por la actividad, que comprueba la huella y rechaza si alguien
 * cambió lo mismo después.
 */
function undoOne(entry: AgentActivityEntry): { success: boolean; error?: string } {
  const s = store();
  const journal = s.undoHistory.journals[entry.targetId];
  const top = journal?.undo[journal.undo.length - 1];
  if (entry.editKey && s.activeProjectId === entry.targetId && s.undoHistory.activeId === entry.targetId && top?.coalesceKey === entry.editKey) {
    s.undo();
    useSimulationStore.setState((state) => ({ agentActivity: state.agentActivity.map((a) => (a.id === entry.id ? { ...a, status: 'undone' as const } : a)) }));
    return { success: true };
  }
  return s.undoAgentActivity(entry.id);
}

const undoChange: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  const targets = undoTargets(project.id, args);
  if (!targets.length) {
    const path = args.activityId ? 'activityId' : args.turnId ? 'turnId' : 'proposalId';
    return { data: failure('not_found', [{ path, message: 'No hay cambios del asistente que deshacer con ese criterio en esta propuesta (ya deshechos, o hechos por otra vía).' }], { proposalId: project.id }) };
  }
  return {
    data: { proposalId: project.id, changes: [], results: results(project, project), warnings: [] } satisfies ToolPayload,
    plan: {
      title: targets.length > 1 ? `Deshacer ${targets.length} cambios del asistente` : `Deshacer: ${targets[0].title}`, targetType: 'project',
      changes: targets.slice(0, 20).map((a) => ({ label: a.title, value: 'deshacer' })),
      execute() {
        const before = structuredClone(requireEditableProject(project.id));
        const undone: string[] = [];
        const warnings: string[] = [];
        for (const entry of undoTargets(project.id, args)) {
          const result = undoOne(entry);
          if (!result.success) {
            if (!undone.length) throw new Error(result.error || 'No se pudo deshacer.');
            warnings.push(`Se deshicieron ${undone.length} de ${targets.length} cambios; el resto no: ${result.error}`);
            break;
          }
          undone.push(entry.id);
        }
        const after = store().projects.find((p) => p.id === project.id)!;
        return {
          targetId: project.id,
          data: { proposalId: project.id, changes: diffProjectFields(before, after), results: results(before, after), warnings, data: { undone } } satisfies ToolPayload,
          cards: [proposalCard(after)],
        };
      },
    },
  };
};

export const APP_ASSISTANT_HANDLERS: Record<string, NativeHandler> = {
  get_proposal_state: getProposalState,
  create_proposal: createProposal,
  extract_invoice: extractInvoice,
  size_system: sizeSystem,
  edit_proposal: editProposal,
  undo_change: undoChange,
  open_proposal: openProposal,
};
