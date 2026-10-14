/** Synthetic transport and local data only: no Gemini/server writes. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppAssistant } from '../../../src/features/assistant/components/AppAssistant';
import { ApplicationFeaturesSection } from '../../../src/components/settings/sections/ApplicationFeaturesSection';
import { useSimulationStore } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../../src/data/defaultEquipmentCatalog';
import { featureScope } from '../../../shared/applicationFeatures';
import type { GeminiTransport } from '../../../shared/geminiTransport';
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
const transport: GeminiTransport = async (_url, body: any) => {
  const last = body.contents.at(-1).parts[0];
  if (last.functionResponse)
    return {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                text:
                  last.functionResponse.response.result?.status ===
                  'pending_confirmation'
                    ? 'Preparé el cambio. Confírmalo para recalcular la simulación.'
                    : 'Aquí tienes los datos actuales de la aplicación. Puedes abrir la propuesta o revisar un equipo.',
              },
            ],
          },
        },
      ],
    };
  const text = last.text || '';
  const call = /90/.test(text)
    ? {
        name: 'propose_project_update',
        args: {
          id,
          title: 'Cobertura objetivo de 90%',
          edits: [
            { section: 'rates', field: 'targetCoveragePct', valueJson: '90' },
          ],
        },
      }
    : /equipo/i.test(text)
      ? {
          name: 'search_equipment',
          args: {
            query: new URLSearchParams(location.search).has('assets')
              ? 'CS6.1-72TB-590'
              : '',
            unavailableOnly: true,
          },
        }
      : { name: 'get_simulation', args: { id } };
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { role: 'model', parts: [{ functionCall: call }] },
      },
    ],
  };
};
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
      <h1>QA sintética · Asistente experimental</h1>
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
      <AppAssistant transport={transport} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
