/** Modelo falso en el puerto LlmClient y datos locales: sin Gemini ni escrituras en servidores. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppAssistant } from '../../../src/features/assistant/components/AppAssistant';
import { ApplicationFeaturesSection } from '../../../src/components/settings/sections/ApplicationFeaturesSection';
import { useSimulationStore } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../../src/data/defaultEquipmentCatalog';
import { featureScope } from '../../../shared/applicationFeatures';
import type { LlmClient, LlmContent, LlmPart, LlmRequest, LlmResponse } from '../../../src/services/llm/types';
import '../../../src/index.css';
const id = 'qa-assistant-project';
const project = {
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  client: { ...BENCHMARK_PROJECT.client, name: 'Proyecto de prueba sintético' },
  syncStatus: 'local_only' as const,
};
useSimulationStore.setState({
  workspaceScope: 'local',
  appAssistantEnabled: true,
  projects: [project],
  activeProjectId: id,
  activeView: 'simulator',
  sidebarTheme: 'light',
  equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((e) => ({
    ...e,
    imageAssetIds: undefined,
    datasheetAssetId: undefined,
  })),
  geminiApiKey: 'synthetic-key',
  syncSettings: {
    serverUrl: 'https://example.invalid',
    authToken: null,
    currentUser: null,
    autoSyncEnabled: false,
    lastSyncTimestamp: null,
  },
});
if (new URLSearchParams(location.search).has('assets')) {
  const server = `${location.origin}/scripts/qa/fixtures/assets`;
  const state = useSimulationStore.getState();
  useSimulationStore.setState({
    workspaceScope: featureScope(server, 'qa-org'),
    projects: state.projects.map((p) => ({
      ...p,
      organizationId: 'qa-org',
      syncServerUrl: server,
    })),
    equipmentCatalog: state.equipmentCatalog.map((e, i) => ({
      ...e,
      organizationId: 'qa-org',
      syncServerUrl: server,
      ...(i === 0
        ? {
            datasheetAssetId: 'qa-datasheet.pdf',
            datasheetName: 'Ficha sintética QA',
            imageAssetIds: ['qa-image.png'],
            imageNames: ['Imagen QA'],
          }
        : {}),
    })),
    syncSettings: {
      ...state.syncSettings,
      serverUrl: server,
      authToken: 'synthetic-token',
      currentUser: {
        id: 'qa-user',
        name: 'QA sintético',
        email: 'qa@example.invalid',
        role: 'EDITOR',
        organizationId: 'qa-org',
      } as any,
    },
  });
}
// Modelo falso en el puerto LlmClient (F4): sin red ni clave real. Un guion mínimo por palabras clave del mensaje.
const lastUserText = (contents: LlmContent[]) => {
  const user = [...contents].reverse().find((c) => c.role === 'user' && c.parts.some((p) => p.type === 'text'));
  const part = user?.parts.find((p) => p.type === 'text');
  return part && part.type === 'text' ? part.text : '';
};
function reply(request: LlmRequest): LlmResponse {
  const last = request.contents.at(-1)!;
  const fr = last.parts.find((p) => p.type === 'functionResponse');
  let parts: LlmPart[];
  if (fr && fr.type === 'functionResponse') {
    const status = String(fr.response.status);
    const text = status === 'pending_confirmation'
      ? 'Preparé el cambio. Confírmalo en la tarjeta para aplicarlo.'
      : fr.name === 'create_proposal' && status === 'applied'
        ? 'Listo: **creé la propuesta** y la abrí en el simulador. Supuse 1.000 kWh/mes estimados; con una factura ajusto el consumo real.'
        : status === 'applied'
          ? 'Listo: **cobertura al 90 %**. Puedes deshacerlo desde el chat.'
          : status === 'error'
            ? `No pude hacerlo: ${String((fr.response.error as { message?: string } | undefined)?.message ?? 'error')}`
            : 'Aquí tienes los datos actuales de la aplicación.';
    parts = [{ type: 'text', text }];
  } else {
    const text = lastUserText(request.contents);
    const active = useSimulationStore.getState().activeProjectId || id;
    const call = /crea/i.test(text)
      ? { id: 'qa-create', name: 'create_proposal', args: {} }
      : /90/.test(text)
        ? { id: 'qa-edit', name: 'edit_proposal', args: { proposalId: active, title: 'Cobertura objetivo de 90%', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }] } }
        : /equipo/i.test(text)
          ? { id: 'qa-search', name: 'search_equipment', args: { query: '' } }
          : { id: 'qa-state', name: 'get_proposal_state', args: { proposalId: active } };
    parts = [{ type: 'functionCall', call }];
  }
  return {
    model: request.model, content: { role: 'model', parts }, finishReason: 'stop',
    text: parts.map((p) => (p.type === 'text' ? p.text : '')).join(''),
    functionCalls: parts.flatMap((p) => (p.type === 'functionCall' ? [p.call] : [])),
  };
}
const fakeLlm: LlmClient = {
  async generate(request) { return reply(request); },
  async *stream(request) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const response = reply(request);
    for (const part of response.content.parts) {
      if (part.type === 'text') yield { type: 'text', text: part.text };
      if (part.type === 'functionCall') yield { type: 'functionCall', call: part.call };
    }
    yield { type: 'done', response };
  },
  async structured() { throw new Error('La fixture no lee facturas.'); },
  async listModels() { return []; },
};
const llmClientFactory = () => fakeLlm;
function Fixture() {
  const s = useSimulationStore();
  return (
    <div
      className={s.sidebarTheme === 'dark' ? 'dark' : ''}
      style={{
        minHeight: '100vh',
        padding: 32,
        background: s.sidebarTheme === 'dark' ? '#151b25' : '#f6f8fa',
        color: s.sidebarTheme === 'dark' ? '#edf2f8' : '#182230',
      }}
    >
      <h1>QA sintética · Asistente (sesión y bucle de F4)</h1>
      <p>
        Propuesta: {s.getActiveProject().client.name} · Cobertura:{' '}
        {s.getActiveProject().rates.targetCoveragePct}%
      </p>
      <nav className="flex gap-3 my-4">
        <button onClick={() => s.setActiveView('simulator')}>Simulador</button>
        <button onClick={() => s.setActiveView('project-hub')}>Hub</button>
        <button onClick={() => s.setActiveView('dashboard')}>Inicio</button>
        <button onClick={s.toggleSidebarTheme}>Cambiar tema</button>
        <button
          onClick={() =>
            useSimulationStore.setState({
              sessionGeneration: s.sessionGeneration + 1,
            })
          }
        >
          Cambiar sesión
        </button>
      </nav>
      {!new URLSearchParams(location.search).has('assets') && (
        <ApplicationFeaturesSection />
      )}
      <AppAssistant llmClientFactory={llmClientFactory} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
