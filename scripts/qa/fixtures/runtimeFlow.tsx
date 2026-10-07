/** Actual application + actual disposable HTTP services. No transport mocks. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';
import { useSimulationStore } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { DEFAULT_LOCAL_COMPANY } from '../../../src/types';
import { ShareProposalService } from '../../../src/services/shareProposalService';
import { featureScope } from '../../../shared/applicationFeatures';
import '../../../src/index.css';
const response = await fetch('/scripts/qa/fixtures/runtime-config.json', { cache: 'no-store' });
if (!response.ok) throw new Error('Start the isolated QA runtime first.');
const config = await response.json();
const api = new URL(config.api);
if (api.hostname !== '127.0.0.1' || api.protocol !== 'http:' || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(config.worker)) throw new Error('Only disposable QA targets allowed.');
const marker = await fetch(config.api + '/qa-instance').then(r => r.json());
if (!config.instanceId || marker.qaInstance !== config.instanceId) throw new Error('QA instance marker mismatch.');
useSimulationStore.setState({
  workspaceScope: 'local', organizationWorkspaces: {}, projects: [], activeProjectId: '', folders: [], snapshotsByProject: {},
  projectConflicts: {}, projectDeletionQueue: [], companies: [DEFAULT_LOCAL_COMPANY], activeCompanyId: DEFAULT_LOCAL_COMPANY.id,
  equipmentChanges: {}, equipmentConflicts: {}, equipmentDeletionQueue: [], sidebarTheme: 'light', activeView: 'dashboard',
  syncSettings: { serverUrl: config.api, authToken: null, currentUser: null, autoSyncEnabled: false, lastSyncTimestamp: null },
  isSettingsModalOpen: true, settingsActiveTab: 'sync', sessionGeneration: 1,
});
ShareProposalService.setWorkerUrl(config.worker);
function RuntimeFlow() {
  const [status, setStatus] = useState('Entorno HTTP real aislado; datos sintéticos.');
  const run = async (operation: () => Promise<void>) => { try { await operation(); } catch (error) { setStatus(error instanceof Error ? error.message : 'QA failed'); } };
  return <><App /><aside aria-label="Controles QA aislados" style={{ position: 'fixed', zIndex: 100000, bottom: 0, left: 0, right: 0, background: '#102a24', color: 'white', padding: '6px 12px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
    <button onClick={() => useSimulationStore.getState().openSettingsModal('sync')}>Cuenta QA</button>
    <button onClick={() => { const state = useSimulationStore.getState(); state.closeSettingsModal(); state.setActiveView('companies-hub'); }}>Empresa QA</button>
    <button onClick={() => void run(async () => {
      const state = useSimulationStore.getState(); const user = state.syncSettings.currentUser;
      if (!user || !state.syncSettings.authToken) throw new Error('Inicia sesión QA antes de preparar el documento.');
      if (!user.email.endsWith('@staging.example.invalid')) throw new Error('Synthetic QA account required.');
      const project = { ...structuredClone(BENCHMARK_PROJECT), id: crypto.randomUUID(), organizationId: user.organizationId, syncServerUrl: config.api, baseVersion: 0, version: 1, syncStatus: 'pending' as const, client: { ...BENCHMARK_PROJECT.client, name: 'QA navegador — Oficina sintética', email: 'contacto@example.invalid', phone: '', rnc: '', address: 'Dirección sintética', projectId: 'SP-QA-BROWSER' } };
      useSimulationStore.setState({ projects: [...state.projects, project], activeProjectId: project.id, workspaceScope: featureScope(config.api, user.organizationId) });
      const result = await state.syncProjectsWithServer(false);
      if (!result.success) throw new Error(result.message);
      const current = useSimulationStore.getState(); current.closeSettingsModal(); current.openShareModal();
      setStatus('Documento QA confirmado por API; compartir usa Worker real.');
    })}>Documento QA</button>
    <button onClick={() => void run(async () => {
      const state = useSimulationStore.getState(); if (!state.syncSettings.currentUser) throw new Error('Primero inicia sesión QA.');
      useSimulationStore.setState({ sessionGeneration: state.sessionGeneration + 1, syncSettings: { ...state.syncSettings, authToken: 'synthetic-rejected-runtime-token' } });
      const result = await useSimulationStore.getState().validateSession();
      setStatus(result.valid ? 'Unexpected valid token' : 'Token QA rechazado por API real; reautentica con isolated-qa-only.');
      useSimulationStore.getState().openSettingsModal('sync');
    })}>Rechazar token QA</button>
    <output>{status}</output>
  </aside></>;
}
createRoot(document.getElementById('root')!).render(<RuntimeFlow />);
