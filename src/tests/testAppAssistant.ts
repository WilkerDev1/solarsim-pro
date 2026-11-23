import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import {
  assistantOwner,
  executeAssistantTool,
  applyAssistantAction,
} from '../features/assistant/tools';
import { AssistantEditsError, validateAssistantEdits } from '../features/assistant/validation';
import { runAssistant } from '../features/assistant/service';
import { featureScope } from '../../shared/applicationFeatures';
import type { GeminiTransport } from '../../shared/geminiTransport';
const state = useSimulationStore;
const project = {
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'assistant-project',
  syncStatus: 'local_only' as const,
};
const equipment = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
assert.equal(
  state.getState().appAssistantEnabled,
  false,
  'experimental assistant defaults off'
);
state.setState({
  appAssistantEnabled: true,
  workspaceScope: 'local',
  projects: [project],
  activeProjectId: project.id,
  activeView: 'simulator',
  equipmentCatalog: equipment,
  deletedEquipmentIds: [],
  syncSettings: {
    ...state.getState().syncSettings,
    currentUser: null,
    authToken: null,
    autoSyncEnabled: false,
  },
  sessionGeneration: 0,
});
const owner = assistantOwner();
assert(executeAssistantTool({ name: 'get_simulation', args: {} }, owner).data);
const read = executeAssistantTool(
  { name: 'search_projects', args: { query: project.client.name } },
  owner
);
assert.equal(read.cards?.[0].id, project.id);
{
  // «La última propuesta»: la búsqueda vacía viene de la más reciente a la más antigua y trae sus fechas.
  const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  const older = { ...structuredClone(project), id: 'older', createdAt: at(1), updatedAt: at(2) };
  const newest = { ...structuredClone(project), id: 'newest', createdAt: at(20), updatedAt: at(21) };
  const touched = { ...structuredClone(project), id: 'touched', createdAt: at(3), updatedAt: at(22) };
  state.setState({ projects: [older, newest, touched] });
  const recent = executeAssistantTool({ name: 'search_projects', args: { query: '' } }, owner).data as {
    projects: { id: string; createdAt?: string; updatedAt?: string }[];
  };
  assert.deepEqual(recent.projects.map((p) => p.id), ['touched', 'newest', 'older'], 'most recently modified first');
  assert.equal(recent.projects.find((p) => p.id === 'newest')?.createdAt, at(20), 'creation date lets the model tell «la última creada»');
  assert.equal(recent.projects.find((p) => p.id === 'touched')?.updatedAt, at(22));
  state.setState({ projects: [project] });
}
// Texto libre sin coincidencia literal: el emparejador compartido encuentra el equipo por marca y capacidad.
const freeText = executeAssistantTool(
  { name: 'search_equipment', args: { query: 'batería de litio HinaESS 16.1 kWh' } },
  owner
).data as { equipment: { id: string; match?: string; matchReason?: string }[] };
assert.equal(freeText.equipment[0]?.id, 'eq-bat-hinaess-16k');
assert.equal(freeText.equipment[0]?.match, 'spec');
assert.match(freeText.equipment[0]?.matchReason || '', /16\.08 kWh/);
const pending = executeAssistantTool(
  {
    name: 'propose_project_update',
    args: {
      id: project.id,
      title: 'Cobertura 90%',
      edits: [{ section: 'rates', field: 'targetCoveragePct', value: 90 }],
    },
  },
  owner
).action!;
assert.notEqual(
  state.getState().getActiveProject().rates.targetCoveragePct,
  90,
  'planning never mutates'
);
applyAssistantAction(pending);
assert.equal(state.getState().getActiveProject().rates.targetCoveragePct, 90);
assert.throws(
  () => applyAssistantAction(pending),
  /cambiaron/,
  'replay is rejected'
);
const stale = executeAssistantTool(
  {
    name: 'propose_project_update',
    args: {
      id: project.id,
      edits: [{ section: 'rates', field: 'targetCoveragePct', value: 80 }],
    },
  },
  owner
).action!;
state.getState().updateClient({ name: 'Edición concurrente' });
assert.throws(() => applyAssistantAction(stale), /cambiaron/);
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'client', field: 'organizationId', value: 'foreign' }],
      'project'
    ),
  /no permitido/
);
// Validates every edit and reports the whole set, so the model fixes everything in one round (all or nothing).
{
  const batch = [
    { section: 'specs', field: 'systemLosses', value: 110 },
    { section: 'rates', field: 'targetCoveragePct', value: 90 },
    { section: 'specs', field: 'panelCount', value: 1.5 },
    { section: 'client', field: 'organizationId', value: 'foreign' },
  ];
  let caught: unknown;
  try { validateAssistantEdits(batch, 'project'); } catch (error) { caught = error; }
  assert(caught instanceof AssistantEditsError, 'one error with every problem');
  assert.deepEqual(caught.errors.map((e) => e.index), [0, 2, 3]);
  assert.deepEqual(caught.errors.map((e) => e.field), ['specs.systemLosses', 'specs.panelCount', 'client.organizationId']);
  assert.match(caught.message, /3 de 4 cambios/);
  assert.match(caught.message, /100%/);
  assert.match(caught.message, /entero/);
  assert.match(caught.message, /no permitido/);
  assert.match(caught.message, /ninguno/i, 'nothing is applied');
  // The tool call fails as a whole: the valid coverage edit is not prepared either.
  const before = JSON.stringify(state.getState().projects);
  assert.throws(() => executeAssistantTool({ name: 'propose_project_update', args: { id: project.id, title: 'Lote', edits: batch } }, owner), /3 de 4 cambios/);
  assert.equal(JSON.stringify(state.getState().projects), before);
  // A single invalid edit keeps its plain message.
  assert.throws(() => validateAssistantEdits([{ section: 'specs', field: 'systemLosses', value: 110 }], 'project'), (e: Error) => e instanceof AssistantEditsError && /^systemLosses no puede superar 100%\.$/.test(e.message));
}
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'specs', field: 'systemLosses', value: 110 }],
      'project'
    ),
  /100/
);
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'consumption', field: 'monthlyConsumption', value: [100] }],
      'project'
    ),
  /doce/
);
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'equipment', field: 'imageAssetIds', value: ['foreign'] }],
      'equipment'
    ),
  /no permitido/
);
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'specs', field: 'panelCount', value: 1.5 }],
      'project'
    ),
  /entero/
);
const pnl = equipment.find((e) => e.type === 'panel')!;
const groupAction = executeAssistantTool(
  {
    name: 'propose_project_update',
    args: {
      id: project.id,
      edits: [
        {
          section: 'specs',
          field: 'panels',
          value: [{ id: pnl.id, count: 7, unitPriceUSD: 100 }],
        },
      ],
    },
  },
  owner
).action!;
applyAssistantAction(groupAction);
assert.equal(
  state.getState().getActiveProject().specs.panels?.[0].brandModel,
  pnl.displayName
);
assert.equal(state.getState().getActiveProject().specs.panels?.reduce((n, g) => n + g.count, 0), 7); // cantidad total de los grupos (no hay espejo)
assert.equal('panelCount' in state.getState().getActiveProject().specs, false);
assert.equal(
  state.getState().getActiveProject().specs.autoCalculatePanels,
  false
);
assert.throws(
  () =>
    executeAssistantTool(
      {
        name: 'propose_project_update',
        args: {
          id: project.id,
          edits: [
            {
              section: 'specs',
              field: 'panels',
              value: [{ id: 'invented', count: 7, unitPriceUSD: 100 }],
            },
          ],
        },
      },
      owner
    ),
  /catálogo/
);
const catalogAction = executeAssistantTool(
  {
    name: 'propose_equipment_update',
    args: {
      id: pnl.id,
      edits: [
        {
          section: 'equipment',
          field: 'displayName',
          value: 'Nombre actualizado',
        },
      ],
    },
  },
  owner
).action!;
applyAssistantAction(catalogAction);
assert.equal(
  state.getState().equipmentCatalog.find((e) => e.id === pnl.id)?.displayName,
  'Nombre actualizado'
);
assert.deepEqual(
  state.getState().equipmentCatalog.find((e) => e.id === pnl.id)
    ?.supplierPrices,
  pnl.supplierPrices
);
const mock: GeminiTransport = async (_url, body: any) => {
  const previous = body.contents.at(-1);
  if (previous.parts[0].functionResponse) {
    assert.equal(previous.parts[0].functionResponse.id, 'qa-call-id');
    assert.equal(
      body.contents.at(-2).parts[0].thoughtSignature,
      'qa-signature'
    );
    return {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'Aquí está la propuesta.' }] },
        },
      ],
    };
  }
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          role: 'model',
          parts: [
            {
              thoughtSignature: 'qa-signature',
              functionCall: {
                id: 'qa-call-id',
                name: 'search_projects',
                args: { query: '' },
              },
            },
          ],
        },
      },
    ],
  };
};
const reply = await runAssistant({
  apiKey: 'synthetic-key',
  model: 'gemini-synthetic',
  prompt: 'Buscar propuestas',
  history: [],
  signal: new AbortController().signal,
  execute: (c) => executeAssistantTool(c, owner),
  transport: mock,
});
assert.equal(reply.cards?.length, 1);
assert.equal(reply.text, 'Aquí está la propuesta.');
assert.equal(state.getState().projects.length, 1);
const before = JSON.stringify(state.getState().projects);
const truncated: GeminiTransport = async () => ({
  candidates: [
    {
      finishReason: 'MAX_TOKENS',
      content: {
        parts: [{ functionCall: { name: 'propose_project_update', args: {} } }],
      },
    },
  ],
});
await assert.rejects(
  () =>
    runAssistant({
      apiKey: 'synthetic-key',
      model: 'gemini-synthetic',
      prompt: 'Cambiar',
      history: [],
      signal: new AbortController().signal,
      execute: (c) => executeAssistantTool(c, owner),
      transport: truncated,
    }),
  /límite/
);
assert.equal(JSON.stringify(state.getState().projects), before);
const foreign = { ...project, id: 'foreign', organizationId: 'foreign-org' };
state.setState({ projects: [state.getState().getActiveProject(), foreign] });
assert.equal(
  executeAssistantTool({ name: 'search_projects', args: { query: '' } }, owner)
    .cards?.length,
  1
);
assert.throws(
  () =>
    executeAssistantTool(
      { name: 'get_project', args: { id: 'foreign' } },
      owner
    ),
  /no disponible/
);
assert.throws(
  () =>
    validateAssistantEdits(
      [
        {
          section: 'financials',
          field: 'projectLifespanYears',
          value: 100000000,
        },
      ],
      'project'
    ),
  /100 años/
);
assert.throws(
  () =>
    validateAssistantEdits(
      [{ section: 'financials', field: 'customCostUSD', value: 200 }],
      'project'
    ),
  /no permitido/
);
state.setState({
  workspaceScope: featureScope(state.getState().syncSettings.serverUrl, 'test'),
  syncSettings: {
    ...state.getState().syncSettings,
    authToken: 'synthetic-token',
    currentUser: {
      id: 'reader',
      organizationId: 'test',
      role: 'VIEWER',
      email: 'qa@example.invalid',
      name: 'Lector',
    } as any,
  },
});
assert.throws(() => applyAssistantAction(catalogAction), /sesión cambió/);
assert.throws(
  () =>
    executeAssistantTool(
      {
        name: 'propose_equipment_update',
        args: {
          id: pnl.id,
          edits: [{ section: 'equipment', field: 'powerW', value: 620 }],
        },
      },
      assistantOwner()
    ),
  /solo puede consultar/
);
state.setState({
  projects: [
    {
      ...project,
      organizationId: 'test',
      syncServerUrl: 'https://other.invalid',
    },
  ],
  equipmentCatalog: [
    { ...pnl, organizationId: 'test', syncServerUrl: 'https://other.invalid' },
  ],
});
assert.equal(
  executeAssistantTool({ name: 'search_equipment', args: {} }, assistantOwner())
    .cards?.length,
  0
);
assert.equal(
  executeAssistantTool({ name: 'search_projects', args: {} }, assistantOwner())
    .cards?.length,
  0
);
state.getState().setAppAssistantEnabled(false);
assert.throws(
  () =>
    executeAssistantTool(
      { name: 'search_equipment', args: {} },
      assistantOwner()
    ),
  /experimental/
);
console.log(
  'App assistant: scoped queries, grounded groups, confirmation, stale/replay rejection, read permissions, tool loop and truncation passed (synthetic only).'
);
