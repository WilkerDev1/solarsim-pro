import { isWriterRole } from '../../../shared/permissions';
import { useSimulationStore } from '../../store/useSimulationStore';
import { draftOwnerKey } from '../../utils/draftOwnerKey';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { calculateMonthlySolarProduction } from '../../engine/solarEngine';
import { effectiveFeatureSettings } from '../application/featurePolicy';
import {
  energyCalculationMode,
  featureScope,
} from '../../../shared/applicationFeatures';
import { buildAITariffContext } from '../../utils/aiTariffContext';
import { editableAssistantFields, validateAssistantEdits } from './validation';
import { AUTOMATED_PRICING } from '../../../shared/automatedProposalPolicy';
import type {
  AssistantAction,
  AssistantToolCall,
  AssistantToolResult,
} from './types';
export function assistantOwner() {
  const s = useSimulationStore.getState();
  return `${draftOwnerKey(s.workspaceScope, s.syncSettings, true)}|${s.sessionGeneration}`;
}
export function assistantFingerprint(value: unknown) {
  return JSON.stringify(value);
}
const normalize = (s: unknown) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
function inScope(item: { organizationId?: string; syncServerUrl?: string }) {
  const s = useSimulationStore.getState();
  const session = s.syncSettings;
  const url = (value: string) => value.trim().replace(/\/+$/, '');
  if (!session.currentUser)
    return (
      s.workspaceScope === 'local' &&
      !item.organizationId &&
      !item.syncServerUrl
    );
  return (
    !!session.authToken &&
    s.workspaceScope ===
      featureScope(session.serverUrl, session.currentUser.organizationId) &&
    item.organizationId === session.currentUser.organizationId &&
    (!item.syncServerUrl || url(item.syncServerUrl) === url(session.serverUrl))
  );
}
export function visibleAssistantProjects() {
  return useSimulationStore
    .getState()
    .projects.filter((p) => !p.isDeleted && !p.deletedAt && inScope(p));
}
export function visibleAssistantEquipment() {
  const s = useSimulationStore.getState();
  return s.equipmentCatalog.filter(
    (e) => !(s.deletedEquipmentIds || []).includes(e.id) && inScope(e)
  );
}
function canWrite() {
  const s = useSimulationStore.getState();
  const user = s.syncSettings.currentUser;
  return user
    ? !!s.syncSettings.authToken && isWriterRole(user.role)
    : s.workspaceScope === 'local';
}
export function executeAssistantTool(
  call: AssistantToolCall,
  owner: string
): AssistantToolResult {
  if (owner !== assistantOwner())
    throw new Error('El espacio o la sesión cambió.');
  const { name, args } = call;
  const s = useSimulationStore.getState();
  if (!s.appAssistantEnabled)
    throw new Error(
      'Activa el asistente experimental en Funciones de la aplicación.'
    );
  if (name === 'search_projects') {
    const query = normalize(args.query);
    const found = visibleAssistantProjects()
      .filter((p) =>
        normalize(
          `${p.client.name} ${p.client.projectId} ${p.client.province}`
        ).includes(query)
      )
      .slice(0, 12);
    return {
      data: {
        projects: found.map((p) => ({
          id: p.id,
          name: p.client.name,
          code: p.client.projectId,
          province: p.client.province,
          status: p.status,
        })),
        limit: 12,
      },
      cards: found.map((p) => ({
        kind: 'project',
        id: p.id,
        title: p.client.name,
        detail: p.client.projectId,
      })),
    };
  }
  if (name === 'search_equipment') {
    if (
      args.unavailableOnly !== undefined &&
      typeof args.unavailableOnly !== 'boolean'
    )
      throw new Error('Filtro de disponibilidad inválido.');
    const query = normalize(args.query);
    const found = visibleAssistantEquipment()
      .filter(
        (e) =>
          normalize(`${e.brand} ${e.displayName} ${e.modelSeries}`).includes(
            query
          ) &&
          (!args.unavailableOnly ||
            !e.supplierPrices?.some((p) => p.stockStatus === 'in_stock'))
      )
      .slice(0, 12);
    return {
      data: {
        equipment: found.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.displayName,
          brand: e.brand,
          offers: e.supplierPrices,
          stockNote: !e.supplierPrices?.length
            ? 'Sin ofertas; disponibilidad desconocida'
            : undefined,
        })),
        limit: 12,
      },
      cards: found.map((e) => ({
        kind: 'equipment',
        id: e.id,
        title: e.displayName,
        detail: e.brand,
      })),
    };
  }
  if (name === 'get_equipment') {
    const e = visibleAssistantEquipment().find((e) => e.id === args.id);
    if (!e) throw new Error('Equipo no disponible en este espacio.');
    return {
      data: { ...e, datasheetUrl: undefined, syncServerUrl: undefined },
      cards: [
        { kind: 'equipment', id: e.id, title: e.displayName, detail: e.brand },
      ],
    };
  }
  if (name === 'get_project' || name === 'get_simulation') {
    const p = visibleAssistantProjects().find(
      (p) => p.id === (args.id || s.activeProjectId)
    );
    if (!p) throw new Error('Propuesta no disponible en este espacio.');
    const mode = energyCalculationMode(effectiveFeatureSettings(s));
    return {
      data: {
        id: p.id,
        client: {
          name: p.client.name,
          projectId: p.client.projectId,
          province: p.client.province,
        },
        specs: p.specs,
        rates: p.rates,
        financials: p.financials,
        monthlyConsumption: p.monthlyConsumption,
        calculationMode: mode,
        energy: calculateMonthlySolarProduction(
          p.client.province,
          p.specs,
          p.monthlyConsumption,
          p.rates.energyCostPerKWh,
          p.rates.gridExportFeePct,
          p.client.customMonthlyHSP,
          p.rates.tariffCode,
          p.rates.isZeroExport,
          mode
        ),
        summary: calculateProjectFinancialSummary(p, mode),
      },
      cards: [
        {
          kind: 'project',
          id: p.id,
          title: p.client.name,
          detail: p.client.projectId,
        },
      ],
    };
  }
  if (name === 'get_tariffs')
    return { data: buildAITariffContext(s.tariffMatrix) };
  if (
    name === 'propose_project_update' ||
    name === 'propose_equipment_update'
  ) {
    if (!canWrite()) throw new Error('Tu cuenta solo puede consultar.');
    const kind = name === 'propose_project_update' ? 'project' : 'equipment';
    const targetId = String(args.id || '');
    const target =
      kind === 'project'
        ? visibleAssistantProjects().find((p) => p.id === targetId)
        : visibleAssistantEquipment().find((e) => e.id === targetId);
    if (!target) throw new Error('Destino no disponible.');
    if (
      kind === 'project' &&
      (!['simulator', 'project-hub'].includes(s.activeView) ||
        targetId !== s.activeProjectId)
    )
      throw new Error(
        'Abre esa propuesta antes de modificarla; puedes consultarla desde aquí.'
      );
    if (kind === 'equipment' && s.equipmentConflicts[targetId])
      throw new Error('Resuelve primero el conflicto del equipo.');
    if (kind === 'project' && (target as any).syncStatus === 'conflict')
      throw new Error('Resuelve primero el conflicto de esta propuesta.');
    const edits = validateAssistantEdits(args.edits, kind);
    // Agent edits that affect pricing always leave the proposal in catalog mode with the cost matrix.
    if (kind === 'project' && edits.some((e) => e.section === 'specs' || e.section === 'financials')) {
      const specs = (target as unknown as { specs: Record<string, unknown> }).specs;
      for (const [field, value] of Object.entries(AUTOMATED_PRICING))
        if (specs[field] !== value) edits.push({ section: 'specs', field, value });
    }
    const groups = edits.filter(
      (e) =>
        e.section === 'specs' &&
        ['panels', 'inverters', 'batteries'].includes(e.field)
    );
    for (const edit of groups) {
      for (const group of edit.value as { id: string }[]) {
        const e = visibleAssistantEquipment().find((e) => e.id === group.id);
        const expected = {
          panels: 'panel',
          inverters: 'inverter',
          batteries: 'battery',
        }[edit.field];
        if (!e || e.type !== expected)
          throw new Error('Selecciona un id de catálogo del tipo correcto.');
        const nominal =
          e.type === 'panel'
            ? e.powerW
            : e.type === 'inverter'
              ? e.powerKW
              : e.capacityKWh;
        if (!nominal || !Number.isFinite(nominal) || nominal <= 0)
          throw new Error('El equipo no tiene capacidad nominal válida.');
      }
    }
    const batteryGroups = groups.find((e) => e.field === 'batteries');
    const hasBattery = edits.find(
      (e) => e.section === 'specs' && e.field === 'hasBattery'
    );
    if (
      batteryGroups &&
      hasBattery &&
      hasBattery.value !== (batteryGroups.value as unknown[]).length > 0
    )
      throw new Error('El estado de baterías no coincide con sus grupos.');
    if (
      groups.length &&
      edits.some(
        (e) =>
          e.section === 'specs' &&
          e.field === 'autoCalculatePanels' &&
          e.value === true
      )
    )
      throw new Error(
        'Selecciona grupos explícitos o dimensionamiento automático, no ambos.'
      );
    // Scalar shortcuts cannot silently detach/misprice a multi-model installation.
    if (kind === 'project') {
      const p = target as ReturnType<typeof visibleAssistantProjects>[number];
      for (const e of edits) {
        if (
          e.section === 'specs' &&
          /^(panel|inverter|battery)/.test(e.field) &&
          !['panels', 'inverters', 'batteries'].includes(e.field) &&
          [p.specs.panels, p.specs.inverters, p.specs.batteries].some(
            (g) => g?.length
          )
        )
          throw new Error(
            'Esta propuesta usa grupos de equipos. Edita sus modelos y cantidades en el simulador o en el borrador de propuestas.'
          );
      }
    }
    const action: AssistantAction = {
      id: crypto.randomUUID(),
      kind,
      targetId,
      title: String(args.title || 'Revisar cambios').slice(0, 150),
      edits,
      fingerprint: assistantFingerprint({
        target,
        groups: groups.length ? s.equipmentCatalog : undefined,
      }),
      owner,
    };
    return { data: { status: 'pending_confirmation', edits }, action };
  }
  throw new Error('Herramienta no permitida.');
}
/** Revalidate live owner, permission and target before every confirmed mutation. */
export function applyAssistantAction(action: AssistantAction) {
  const fresh = executeAssistantTool(
    {
      name:
        action.kind === 'project'
          ? 'propose_project_update'
          : 'propose_equipment_update',
      // Policy edits are re-derived by the planner; agents cannot submit them directly.
      args: { id: action.targetId, title: action.title, edits: action.edits.filter((e) => !(e.section === 'specs' && e.field in AUTOMATED_PRICING)) },
    },
    action.owner
  ).action!;
  if (fresh.fingerprint !== action.fingerprint)
    throw new Error(
      'Los datos cambiaron desde la sugerencia. Pide al asistente que prepare el cambio nuevamente.'
    );
  const s = useSimulationStore.getState();
  if (action.kind === 'equipment') {
    s.updateEquipmentItem(
      action.targetId,
      Object.fromEntries(fresh.edits.map((e) => [e.field, e.value]))
    );
  } else {
    s.recordUndoState(s.getActiveProject());
    const patch = (section: string) =>
      Object.fromEntries(
        fresh.edits
          .filter((e) => e.section === section)
          .map((e) => [e.field, e.value])
      );
    if (fresh.edits.some((e) => e.section === 'client'))
      s.updateClient(patch('client'));
    if (fresh.edits.some((e) => e.section === 'specs')) {
      const specs = patch('specs');
      for (const key of ['panels', 'inverters', 'batteries'])
        if (Array.isArray(specs[key])) {
          specs[key] = (
            specs[key] as { id: string; count: number; unitPriceUSD: number }[]
          ).map((g) => {
            const e = s.equipmentCatalog.find((e) => e.id === g.id)!;
            const common = {
              id: g.id,
              count: g.count,
              unitPriceUSD: g.unitPriceUSD,
              priceSource: 'manual',
              brandModel: e.displayName,
              weightKilos: e.weightKg,
            };
            if (key === 'panels')
              return {
                ...common,
                powerW: e.powerW,
                efficiencyPct: e.efficiencyPct,
                tempCoeff: e.tempCoeff,
                annualDegradation: e.annualDegradation,
              };
            if (key === 'inverters')
              return {
                ...common,
                powerKW: e.powerKW,
                efficiencyPct: e.maxEfficiencyPct,
              };
            return {
              ...common,
              capacityKWh: e.capacityKWh,
              dodPct: e.dodPct,
              efficiencyPct: e.batteryEfficiencyPct,
            };
          });
          if (key === 'batteries')
            specs.hasBattery = (specs[key] as unknown[]).length > 0;
          if (key === 'panels') {
            specs.autoCalculatePanels = false;
            specs.panelCount = (specs[key] as { count: number }[]).reduce(
              (n, g) => n + g.count,
              0
            );
          }
        }
      s.updateSpecs(specs);
    }
    if (fresh.edits.some((e) => e.section === 'rates'))
      s.updateRates(patch('rates'));
    if (fresh.edits.some((e) => e.section === 'financials'))
      s.updateFinancials(patch('financials'));
    const consumption = fresh.edits.find((e) => e.section === 'consumption');
    if (consumption) s.setMonthlyConsumption(consumption.value as number[]);
  }
}
