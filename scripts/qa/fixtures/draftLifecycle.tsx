/** Browser-only synthetic fixture. No account/data is sent to any server. */
import { createRoot } from 'react-dom/client';
import { CompanyProfileHubView } from '../../../src/components/companies/CompanyProfileHubView';
import { SettingsModal } from '../../../src/components/settings/SettingsModal';
import { CompanyService } from '../../../src/services/companyService';
import { SyncService } from '../../../src/services/syncService';
import { useSimulationStore } from '../../../src/store/useSimulationStore';
import { DEFAULT_LOCAL_COMPANY } from '../../../src/types';
import { draftOwnerKey } from '../../../src/utils/draftOwnerKey';
import '../../../src/index.css';

const company = { ...DEFAULT_LOCAL_COMPANY, id: 'qa-draft-brand', name: 'Empresa QA A', email: 'empresa@example.test', isDefault: true };
const user = { id: 'qa-draft-user', name: 'Administradora QA', email: 'admin@example.test', role: 'ADMIN' as const, organizationId: 'qa-draft-org-a', organizationName: 'Empresa QA A' };
useSimulationStore.setState({
  workspaceScope: 'https://example.invalid|qa-draft-org-a',
  sidebarTheme: 'light', projects: [], companies: [company], activeCompanyId: company.id,
  sessionGeneration: 100,
  isSettingsModalOpen: true, settingsActiveTab: 'sync',
  syncSettings: { serverUrl: 'https://example.invalid', authToken: 'synthetic-qa-100', currentUser: user, autoSyncEnabled: false, lastSyncTimestamp: null },
});
let profileVersion = 1;
CompanyService.list = async () => { const current = useSimulationStore.getState().syncSettings.currentUser || user; return { success: true, organizations: [{ id: current.organizationId, name: current.organizationName || '', rnc: '', role: 'ADMIN', version: 1 }] }; };
CompanyService.profile = async () => { const current = useSimulationStore.getState().companies[0]; return { success: true, profile: { ...current, name: profileVersion === 1 ? current.name : 'Nombre actualizado por servidor QA' }, version: profileVersion }; };
CompanyService.saveProfile = async (_server, _token, profile, baseVersion) => baseVersion !== profileVersion
  ? { success: false, error: 'Conflicto QA: conserva tu borrador; el perfil del servidor cambió.' }
  : { success: true, profile, version: ++profileVersion };
CompanyService.invitations = async () => ({ success: true, invitations: [] });
CompanyService.invite = async () => ({ success: true, code: 'a'.repeat(64) });
SyncService.getCompanyUsers = async () => ({ success: true, users: [{ ...user, isActive: true, canEditIdentity: true }] });
SyncService.getMe = async () => useSimulationStore.getState().syncSettings.currentUser || user;
SyncService.getSessionIdentity = async () => ({ success: true, user: useSimulationStore.getState().syncSettings.currentUser || user });
SyncService.login = async (_server, _email, password) => ({ success: false, error: password.startsWith(' ') && password.endsWith(' ') ? 'QA: contraseña recibida con espacios intactos; acceso rechazado.' : 'QA: acceso rechazado.' });
useSimulationStore.setState({ loadOrganizationFeaturePolicy: async () => {}, syncProjectsWithServer: async () => ({ success: true, message: 'Sincronización QA aislada.' }) });

function Fixture() {
  const state = useSimulationStore();
  const settings = new URLSearchParams(location.search).get('surface') === 'settings';
  const generation = state.sessionGeneration;
  return <>
    <div style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #94a3b8', padding: 8, display: 'flex', gap: 10 }}>
      <span>QA · generación {generation}</span>
      <button onClick={() => useSimulationStore.setState({ syncSettings: { ...state.syncSettings, authToken: `synthetic-renewed-${generation}` } })}>Renovar token QA</button>
      <button onClick={() => useSimulationStore.setState({ sessionGeneration: generation + 1, syncSettings: { ...state.syncSettings, authToken: null } })}>Invalidar sesión QA</button>
      <button onClick={() => { profileVersion = 2; useSimulationStore.setState({ sessionGeneration: generation + 1, syncSettings: { ...state.syncSettings, authToken: `synthetic-restored-${generation}` } }); }}>Reautenticar QA misma empresa</button>
      <button onClick={() => useSimulationStore.setState({ sessionGeneration: generation + 1, workspaceScope: 'https://example.invalid|qa-draft-org-b', companies: [{ ...company, id: 'qa-brand-b', name: 'Empresa QA B' }], activeCompanyId: 'qa-brand-b', syncSettings: { ...state.syncSettings, authToken: 'synthetic-b', currentUser: { ...user, id: 'qa-user-b', organizationId: 'qa-draft-org-b', organizationName: 'Empresa QA B' } } })}>Cambiar empresa QA B</button>
    </div>
    {settings ? <SettingsModal key={draftOwnerKey(state.workspaceScope, state.syncSettings, true)} /> : <CompanyProfileHubView />}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
