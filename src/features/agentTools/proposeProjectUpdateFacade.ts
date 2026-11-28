/**
 * Fachada de `propose_project_update` (F3c). La herramienta sigue funcionando una versión más para los agentes externos
 * (MCP local) y para el asistente flotante antiguo, con la MISMA definición (contrato congelado:
 * docs/AGENT_CONTRACT_FREEZE.md) y el mismo resultado observable. El planificador, la validación, los permisos, la cola de
 * confirmación y el registro de actividad no cambian (`executeAssistantTool` / `applyAssistantAction`).
 *
 * Lo que cambia es CÓMO se escribe un plan confirmado: el camino antiguo aplica un parche por sección (cliente, specs, tarifas,
 * finanzas, consumos), cada uno con su escritura, su sello y su autosync. La fachada delega en la transacción nueva
 * (`commitProjectEdits`: una escritura, un sello, un autosync y el paso de deshacer con las rutas de campo) SOLO cuando la
 * transacción deja exactamente la misma propuesta que esos parches en orden. No delega (y escribe como siempre) cuando:
 *  - las reglas nuevas darían otra propuesta (`rules_differ`): p. ej. una tarifa por ruta trae su precio de referencia y su
 *    perfil, que el camino antiguo conservaba; cambiar eso sería cambiar lo que obtiene un agente externo;
 *  - la transacción rechaza el lote (`rejected`): un campo que el registro no conoce o un valor fuera de su rango estricto;
 *  - no habría cambios (`no_changes`): el camino antiguo estampa `updatedAt` y sincroniza igualmente.
 * Así, el F0 de caracterización (testAssistantEditCharacterization: equipos + tarifa) sigue idéntico.
 */
import type { ProjectSimulation } from '../../types';
import type { SolarEquipmentItem } from '../../types/equipment';
import { applyProjectEdit, type ProjectEditContext } from '../../domain/projectEdit';
import { applyProjectEdits, editsFromPatch, type ProjectEditsContext, type ProjectFieldEdit } from '../../domain/projectEditTransaction';
import type { AssistantEdit } from '../assistant/types';
import { useSimulationStore } from '../../store/useSimulationStore';
import { effectiveGenericPrice, priceFeatureActive } from '../../store/slices/equipmentPriceSlice';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../application/featurePolicy';
import { DEFAULT_EDIT_COALESCE_KEY } from '../../store/undo/projectUndoJournal';

/** Los parches por sección de un plan de `propose_project_update`, como los aplicaba `applyAssistantAction`. */
export interface LegacySectionPatches {
  client?: Record<string, unknown>;
  specs?: Record<string, unknown>;
  rates?: Record<string, unknown>;
  financials?: Record<string, unknown>;
  monthlyConsumption?: number[];
}

export type FacadeCommitPlan =
  | { delegate: true; edits: ProjectFieldEdit[] }
  | { delegate: false; reason: 'rules_differ' | 'rejected' | 'no_changes' };

const GROUP_KEYS = ['panels', 'inverters', 'batteries'] as const;

/**
 * Parches por sección de las ediciones validadas de un plan. Los grupos de equipos llegan como {id, count, unitPriceUSD} y se
 * completan con los datos del catálogo y precio manual; elegir paneles apaga el autodimensionado y la lista de baterías fija
 * «Incluir batería» (lo mismo que hacía `applyAssistantAction`).
 */
export function legacySectionPatches(edits: readonly AssistantEdit[], catalog: readonly SolarEquipmentItem[]): LegacySectionPatches {
  const patch = (section: string) => Object.fromEntries(edits.filter((e) => e.section === section).map((e) => [e.field, e.value]));
  const patches: LegacySectionPatches = {};
  if (edits.some((e) => e.section === 'client')) patches.client = patch('client');
  if (edits.some((e) => e.section === 'specs')) {
    const specs = patch('specs');
    for (const key of GROUP_KEYS)
      if (Array.isArray(specs[key])) {
        specs[key] = (specs[key] as { id: string; count: number; unitPriceUSD: number }[]).map((g) => {
          const e = catalog.find((item) => item.id === g.id)!;
          const common = { id: g.id, count: g.count, unitPriceUSD: g.unitPriceUSD, priceSource: 'manual', brandModel: e.displayName, weightKilos: e.weightKg };
          if (key === 'panels') return { ...common, powerW: e.powerW, efficiencyPct: e.efficiencyPct, tempCoeff: e.tempCoeff, annualDegradation: e.annualDegradation };
          if (key === 'inverters') return { ...common, powerKW: e.powerKW, efficiencyPct: e.maxEfficiencyPct };
          return { ...common, capacityKWh: e.capacityKWh, dodPct: e.dodPct, efficiencyPct: e.batteryEfficiencyPct };
        });
        if (key === 'batteries') specs.hasBattery = (specs[key] as unknown[]).length > 0;
        if (key === 'panels') specs.autoCalculatePanels = false;
      }
    patches.specs = specs;
  }
  if (edits.some((e) => e.section === 'rates')) patches.rates = patch('rates');
  if (edits.some((e) => e.section === 'financials')) patches.financials = patch('financials');
  const consumption = edits.find((e) => e.section === 'consumption');
  if (consumption) patches.monthlyConsumption = consumption.value as number[];
  return patches;
}

/** El camino antiguo, puro: un `applyProjectEdit` por sección en el orden de siempre (sin sellos: eso es del store). */
export function legacyPatchesResult(project: ProjectSimulation, patches: LegacySectionPatches, ctx: ProjectEditContext): ProjectSimulation {
  let next = project;
  if (patches.client) next = { ...next, ...applyProjectEdit(next, { kind: 'client', patch: patches.client }, ctx) };
  if (patches.specs) next = { ...next, ...applyProjectEdit(next, { kind: 'specs', patch: patches.specs }, ctx) };
  if (patches.rates) next = { ...next, ...applyProjectEdit(next, { kind: 'rates', patch: patches.rates }, ctx) };
  if (patches.financials) next = { ...next, ...applyProjectEdit(next, { kind: 'financials', patch: patches.financials }, ctx) };
  if (patches.monthlyConsumption) next = { ...next, ...applyProjectEdit(next, { kind: 'consumption', monthlyConsumption: patches.monthlyConsumption }, ctx) };
  return next;
}

/** Los mismos parches como un lote por ruta del registro de campos. */
export function facadeEdits(patches: LegacySectionPatches): ProjectFieldEdit[] {
  return [
    ...editsFromPatch('client', patches.client), ...editsFromPatch('specs', patches.specs),
    ...editsFromPatch('rates', patches.rates), ...editsFromPatch('financials', patches.financials),
    ...(patches.monthlyConsumption ? [{ path: 'monthlyConsumption', value: patches.monthlyConsumption }] : []),
  ];
}

/**
 * ¿Se puede escribir el plan con la transacción sin cambiar el resultado? Solo si la transacción, con el MISMO contexto que
 * usará `commitProjectEdits`, deja la propuesta idéntica (JSON) a la del camino antiguo y hay algo que cambiar.
 */
export function planFacadeCommit(project: ProjectSimulation, patches: LegacySectionPatches, ctx: ProjectEditsContext): FacadeCommitPlan {
  const edits = facadeEdits(patches);
  const transaction = applyProjectEdits(project, edits, ctx, { validation: 'strict' });
  if (!transaction.ok) return { delegate: false, reason: 'rejected' };
  if (transaction.changes.length === 0) return { delegate: false, reason: 'no_changes' };
  if (JSON.stringify(transaction.project) !== JSON.stringify(legacyPatchesResult(project, patches, ctx))) return { delegate: false, reason: 'rules_differ' };
  return { delegate: true, edits };
}

/** El contexto con que `commitProjectEdits` aplica la transacción (el mismo cálculo que hace la porción del store). */
function commitContext(): ProjectEditsContext {
  const state = useSimulationStore.getState();
  return {
    equipmentCatalog: state.equipmentCatalog, tariffMatrix: state.tariffMatrix,
    genericPriceFor: (equipmentId) => (priceFeatureActive(state) ? effectiveGenericPrice(state, equipmentId) : null),
    calculationMode: energyCalculationMode(effectiveFeatureSettings(state)),
  };
}

/**
 * Escribe los parches de un plan confirmado de `propose_project_update` en la propuesta ACTIVA: por la transacción si es
 * equivalente (ver el encabezado), si no como siempre, un parche por sección con las porciones del store.
 * Devuelve por dónde fue, para las pruebas y el diagnóstico.
 */
export function writeProposeProjectUpdate(patches: LegacySectionPatches): 'transaction' | 'legacy' {
  const s = useSimulationStore.getState();
  const project = s.getActiveProject();
  s.recordUndoState(project);
  const plan = planFacadeCommit(project, patches, commitContext());
  if (plan.delegate) {
    // La misma fuente y clave de agrupado que dejaba el camino antiguo en el diario de deshacer.
    const committed = useSimulationStore.getState().commitProjectEdits(project.id, plan.edits, { source: 'user', coalesceKey: DEFAULT_EDIT_COALESCE_KEY, validation: 'strict' });
    if (committed.ok) return 'transaction';
    // Imposible con el mismo contexto y sin esperas; si ocurriera, la propuesta no se tocó y el camino antiguo la escribe.
  }
  if (patches.client) s.updateClient(patches.client);
  if (patches.specs) s.updateSpecs(patches.specs);
  if (patches.rates) s.updateRates(patches.rates);
  if (patches.financials) s.updateFinancials(patches.financials);
  if (patches.monthlyConsumption) s.setMonthlyConsumption(patches.monthlyConsumption);
  return 'legacy';
}
