// Montaje de la evaluación del asistente (no entra en el bundle; sin dobles de prueba): monta la sesión REAL del asistente de la app sobre el
// store real en memoria, con un catálogo sintético y sin red. Lo usan `scripts/qa/assistantEvalRunner.ts` (que le pone el modelo
// real) y, con los ayudantes de `src/tests/support/assistantHarness.ts`, `testAssistantEvals` y `testAssistantEvalFieldCoverage` (con ScriptedLlm). Nada de aquí lee ni escribe datos del
// usuario: el almacenamiento es el de memoria del entorno, sin sesión de SolarSim ni sincronización.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../../src/store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../src/data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../../src/store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../../src/store/slices/agentSlice';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { EMPTY_UNDO_HISTORY } from '../../src/store/undo/projectUndoJournal';
import { dockHighlightStore } from '../../src/store/dockHighlightStore';
import { assistantOwner } from '../../src/features/assistant/tools';
import { executeAssistantToolset } from '../../src/features/agentTools/appAssistant/toolset';
import { resetAssistantToolPorts } from '../../src/features/agentTools/appAssistant/ports';
import { createAssistantSession, type AssistantSession } from '../../src/features/assistant/session/assistantSession';
import type { LlmClient } from '../../src/services/llm/types';
import type { AppView } from '../../src/store/types';
import type { ProjectSimulation } from '../../src/types';

const store = useSimulationStore;
export const OFFER_STAMP = '2026-10-01T00:00:00.000Z';

type CatalogItem = (typeof DEFAULT_EQUIPMENT_CATALOG)[number];
const withoutPrices = (): CatalogItem[] => structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<CatalogItem['supplierPrices']> }));

/** Catálogo de fábrica con ofertas sintéticas de proveedor para el panel, el inversor y la batería que elige la fábrica de propuestas. */
export function offerCatalog(): CatalogItem[] {
  const catalog = withoutPrices();
  const offer = (id: string, supplierName: string, priceUSD: number) => {
    const item = id === 'battery' ? catalog.find((e) => e.type === 'battery')! : catalog.find((e) => e.id === id)!;
    item.supplierPrices = [{ id: `sp-${item.id}`, supplierName, priceUSD, stockStatus: 'in_stock', updatedAt: OFFER_STAMP }];
  };
  offer('eq-mod-cs-620', 'QA Paneles', 95);
  offer('eq-inv-luxpower-8k', 'QA Inversores', 1400);
  offer('battery', 'QA Baterías', 2100);
  return catalog;
}
/** El catálogo sin ninguna oferta (y sin precio genérico: no hay sesión de organización): nada que pueda dar un precio. */
export const unpricedCatalog = (): CatalogItem[] => withoutPrices();
/** Un panel del catálogo distinto del que elige la fábrica (para «cambia el panel»). */
export const evalPanelId = () => 'eq-mod-cs-595';

export interface EvalStoreOptions {
  catalog?: CatalogItem[];
  projects?: ProjectSimulation[];
  view?: AppView;
  /** Estado extra del store (sesión de organización, precios genéricos, perfil de permisos…). */
  patch?: Record<string, unknown>;
  /** Clave y modelo del turno. Sin ellos, valores sintéticos que nunca salen del proceso. */
  apiKey?: string;
  model?: string;
}

/** Deja el store en un estado conocido: local, sin sesión de SolarSim ni sincronización, el asistente encendido y sin historial. */
export function resetEvalStore(options: EvalStoreOptions = {}): void {
  dockHighlightStore.clear();
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: options.projects ?? [], activeProjectId: '', activeView: options.view ?? 'dashboard',
    equipmentCatalog: structuredClone(options.catalog ?? offerCatalog()), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
    defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
    agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
    geminiApiKey: options.apiKey ?? 'synthetic-key', geminiModel: options.model ?? 'gemini-4-hydrogen',
    isNewProjectModalOpen: false, isSettingsModalOpen: false,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
    ...options.patch,
  });
}

let turnSeq = 0;
/** Sesión del asistente conectada a sus puertos, con el cliente indicado y sin esperas reales entre reintentos. */
export function newEvalSession(client: LlmClient, extra: Parameters<typeof createAssistantSession>[0] = {}): AssistantSession {
  resetAssistantToolPorts();
  const session = createAssistantSession({ createClient: () => client, newTurnId: () => `eval-turn-${++turnSeq}`, sleep: async () => {}, ...extra });
  session.connectPorts();
  return session;
}

let seedSeq = 0;
/** Una propuesta nueva por el camino real (`create_proposal` sin datos), abierta en el simulador. Devuelve su id. */
export async function seedFreshProposal(): Promise<string> {
  const response = await executeAssistantToolset({ name: 'create_proposal', args: {} }, {
    source: 'app-assistant', owner: assistantOwner(), turnId: 'eval-seed', callId: `eval-seed-${++seedSeq}`,
  });
  assert.equal(response.status, 'applied', `la propuesta inicial no se pudo crear: ${JSON.stringify(response.error)}`);
  store.setState({ activeProjectId: response.proposalId!, activeView: 'simulator' });
  return response.proposalId!;
}

export const projectOf = (id: string): ProjectSimulation => {
  const project = store.getState().projects.find((p) => p.id === id);
  assert.ok(project, `la propuesta ${id} no existe`);
  return project;
};
