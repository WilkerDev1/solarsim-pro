import { isWriterRole } from '../../../shared/permissions';
import { useSimulationStore } from '../../store/useSimulationStore';
import { draftOwnerKey } from '../../utils/draftOwnerKey';
import { calculateProjectFinancialSummary, engineBlockBilling, engineGridUseCharge } from '../../engine/financeEngine';
import { resolveAssumptions } from '../../../shared/assumptions';
import { calculateMonthlySolarProduction } from '../../engine/solarEngine';
import { effectiveFeatureSettings } from '../application/featurePolicy';
import {
  energyCalculationMode,
  featureScope,
} from '../../../shared/applicationFeatures';
import { buildAITariffContext } from '../../utils/aiTariffContext';
import { readEquipment, type EquipmentKind } from '../../../shared/equipment';
import { editableAssistantFields, validateAssistantEdits } from './validation';
import { preserveHiddenInQuotation } from '../../../shared/quotationItems';
import type { CustomQuotationItem } from '../../types';
import type { SolarEquipmentItem } from '../../types/equipment';
import { searchEquipmentByRequest } from '../../../shared/equipmentMatch';
import { effectiveGenericPrice } from '../../store/slices/equipmentPriceSlice';
import { touchesPricingEdits } from './pricingFields';
import { AUTOMATED_PRICING } from '../../../shared/automatedProposalPolicy';
import { resolveGridConnection } from '../../../shared/gridConnection';
import {
  hasSavingsComparison, noSavingsNote, resolveGeneratorCostPerKWh, resolveSavingsBasis, resolveSupplyAlternative, savingsValuationCostPerKWh,
} from '../../../shared/offGridSupply';
import type {
  AssistantAction,
  AssistantToolCall,
  AssistantToolResult,
} from './types';
/** Campos escalares del asistente que equivalen a un dato de grupo; el almacén los aplica al grupo único. */
const SCALAR_EQUIPMENT_FIELDS: Record<string, EquipmentKind> = {
  panelPowerW: 'panel', panelCount: 'panel', panelUnitPriceUSD: 'panel',
  inverterPowerKW: 'inverter', inverterCount: 'inverter', inverterUnitPriceUSD: 'inverter',
  batteryCapacityKWh: 'battery', batteryCount: 'battery', batteryUnitPriceUSD: 'battery', batteryDOD: 'battery', batteryEfficiencyPct: 'battery',
};
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
const timestamp = (value: unknown) => {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const recency = (p: { updatedAt?: string; createdAt?: string }) => timestamp(p.updatedAt) || timestamp(p.createdAt);
function canWrite() {
  const s = useSimulationStore.getState();
  const user = s.syncSettings.currentUser;
  return user
    ? !!s.syncSettings.authToken && isWriterRole(user.role)
    : s.workspaceScope === 'local';
}
export function executeAssistantTool(
  call: AssistantToolCall,
  owner: string,
  options: { requireAssistantEnabled?: boolean } = {}
): AssistantToolResult {
  if (owner !== assistantOwner())
    throw new Error('El espacio o la sesión cambió.');
  const { name, args } = call;
  const s = useSimulationStore.getState();
  if (options.requireAssistantEnabled !== false && !s.appAssistantEnabled)
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
      // Most recently modified first, like the API's search: an empty query answers «la última propuesta».
      .sort((a, b) => recency(b) - recency(a))
      .slice(0, 12);
    return {
      data: {
        projects: found.map((p) => ({
          id: p.id,
          name: p.client.name,
          code: p.client.projectId,
          province: p.client.province,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        limit: 12,
        order: 'updatedAt desc',
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
    if (args.type !== undefined && !['panel', 'inverter', 'battery'].includes(String(args.type)))
      throw new Error('Tipo de equipo inválido: panel, inverter o battery.');
    const query = normalize(args.query);
    const available = (e: SolarEquipmentItem) =>
      (!args.type || e.type === args.type) &&
      (!args.unavailableOnly ||
        !e.supplierPrices?.some((p) => p.stockStatus === 'in_stock'));
    const visible = visibleAssistantEquipment();
    let found = visible
      .filter(
        (e) =>
          normalize(`${e.brand} ${e.displayName} ${e.modelSeries}`).includes(
            query
          ) && available(e)
      )
      .slice(0, 12);
    // Sin coincidencia literal («batería WeCo 16 kWh»), el emparejador compartido busca por marca, modelo y especificación.
    const fits = found.length || !query ? [] : searchEquipmentByRequest(String(args.query), visible.filter(available));
    if (fits.length) found = fits.map((fit) => fit.item);
    return {
      data: {
        equipment: found.map((e, i) => ({
          id: e.id,
          type: e.type,
          name: e.displayName,
          brand: e.brand,
          offers: e.supplierPrices,
          genericPriceUSD: effectiveGenericPrice(s, e.id)?.priceUSD ?? null,
          stockNote: !e.supplierPrices?.length
            ? 'Sin ofertas; disponibilidad desconocida'
            : undefined,
          ...(fits[i] ? { match: fits[i].kind, matchReason: fits[i].reason } : {}),
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
    const generic = effectiveGenericPrice(s, e.id);
    return {
      data: {
        ...e,
        datasheetUrl: undefined,
        syncServerUrl: undefined,
        genericPriceUSD: generic?.priceUSD ?? null,
        genericPriceObservedAt: generic?.observedAt ?? null,
      },
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
    // Sistema aislado sin comparación (o generador sin costo): el motor deja el ahorro en 0; el agente recibe `null`
    // y el estado, nunca ceros que parezcan cifras reales.
    const basis = resolveSavingsBasis(p.rates);
    const comparable = hasSavingsComparison(basis);
    const withoutMoney = <T extends object>(row: T, fields: string[]): T =>
      comparable ? row : { ...row, ...Object.fromEntries(fields.map((field) => [field, null])) };
    // `withoutMoney` es superficial: el desglose anidado de la factura (`tariffBill`, con importes) se vacía entero.
    const monthlyMoney = ['savingsUSD', 'originalBillUSD', 'netBillUSD', 'gridUseChargeUSD', 'tariffBill'];
    const summary = calculateProjectFinancialSummary(p, mode);
    return {
      data: {
        id: p.id,
        client: {
          name: p.client.name,
          projectId: p.client.projectId,
          province: p.client.province,
        },
        specs: p.specs,
        // Equipos normalizados: igual para propuestas con espejo antiguo o solo con grupos.
        equipment: readEquipment(p.specs),
        rates: p.rates,
        financials: p.financials,
        monthlyConsumption: p.monthlyConsumption,
        calculationMode: mode,
        energy: calculateMonthlySolarProduction(
          p.client.province,
          p.specs,
          p.monthlyConsumption,
          // Mismo costo con el que el resumen valora el ahorro (aislado: tarifa, generador o sin comparación).
          savingsValuationCostPerKWh(p.rates),
          resolveAssumptions(p).gridExportFeePct,
          p.client.customMonthlyHSP,
          p.rates.tariffCode,
          resolveGridConnection(p.rates),
          mode,
          engineGridUseCharge(resolveAssumptions(p), resolveGridConnection(p.rates)),
          // Misma valoración que el resumen: facturación neta en SIE-007-2026 (bloques o precio único).
          engineBlockBilling(resolveAssumptions(p), p.rates, savingsValuationCostPerKWh(p.rates))
        ).map((month) => withoutMoney(month, monthlyMoney)),
        summary: comparable ? summary : {
          ...withoutMoney(summary, ['year1SavingsUSD', 'total25YearSavingsUSD', 'paybackYears', 'irrPct', 'npvUSD', 'roi25YrPct', 'annualCreditSettlementUSD']),
          monthlyBreakdown: summary.monthlyBreakdown.map((month) => withoutMoney(month, monthlyMoney)),
        },
        savings: {
          basis,
          comparable,
          supplyAlternative: resolveSupplyAlternative(p.rates),
          generatorCostPerKWh: resolveGeneratorCostPerKWh(p.rates),
          ...(comparable ? {} : { note: noSavingsNote(basis) }),
        },
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
    // Una lista completa de ítems extra sin «hideInQuotation» no vuelve visible un ítem que ya estaba oculto en la factura.
    if (kind === 'project') {
      const previous = (target as { financials?: { customItems?: CustomQuotationItem[] } }).financials?.customItems;
      for (const edit of edits)
        if (edit.section === 'financials' && edit.field === 'customItems')
          edit.value = preserveHiddenInQuotation(edit.value as CustomQuotationItem[], previous);
    }
    // Agent edits that affect pricing leave the proposal in catalog mode with the cost matrix. Unrelated edits
    // (e.g. system losses) never switch the mode: that change is guarded and needs its own confirmation.
    if (kind === 'project' && touchesPricingEdits(edits)) {
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
    // Scalar shortcuts cannot silently detach/misprice a multi-model installation. Con un solo modelo por tipo
    // llegan al grupo; los parámetros de sistema (vida útil, pérdidas…) nunca se bloquean por tener grupos.
    if (kind === 'project') {
      const p = target as ReturnType<typeof visibleAssistantProjects>[number];
      const equipment = readEquipment({ ...p.specs, hasBattery: true });
      for (const e of edits) {
        // `batteryCostUSD` no llega a ningún grupo: con grupos guardados se rechaza como siempre.
        if (e.section === 'specs' && e.field === 'batteryCostUSD' && p.specs.batteries?.length)
          throw new Error(
            'Esta propuesta usa grupos de equipos. Edita sus modelos y cantidades en el simulador o en el borrador de propuestas.'
          );
        const scalarKind = e.section === 'specs' ? SCALAR_EQUIPMENT_FIELDS[e.field] : undefined;
        if (scalarKind && equipment[{ panel: 'panels', inverter: 'inverters', battery: 'batteries' }[scalarKind] as 'panels'].length > 1)
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
export function applyAssistantAction(action: AssistantAction, options: { requireAssistantEnabled?: boolean } = {}) {
  const fresh = executeAssistantTool(
    {
      name:
        action.kind === 'project'
          ? 'propose_project_update'
          : 'propose_equipment_update',
      // Policy edits are re-derived by the planner; agents cannot submit them directly.
      args: { id: action.targetId, title: action.title, edits: action.edits.filter((e) => !(e.section === 'specs' && e.field in AUTOMATED_PRICING)) },
    },
    action.owner,
    options
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
          if (key === 'panels') specs.autoCalculatePanels = false;
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
