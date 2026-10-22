/** Disposable visual fixture for the proposal document editor. Never authenticates or syncs. */
import { createRoot } from 'react-dom/client';
import { PDFProposalView } from '../../../src/components/pdf/PDFProposalView';
import { useSimulationStore } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { DEFAULT_LOCAL_COMPANY } from '../../../src/types/companyProfile';
import type { ProjectSimulation } from '../../../src/types';
import '../../../src/index.css';

// ?theme=dark · ?role=lector (solo lectura) · ?trash=1 (propuesta en papelera) · ?legacy=1 (textos de fábrica copiados por 2.6.x)
const params = new URLSearchParams(location.search);
const company = { ...DEFAULT_LOCAL_COMPANY, id: 'qa-doc-company', name: 'Caribe Solar', phone: '809-000-0000', email: 'empresa@example.test', address: 'Dirección de prueba aislada' };
const project: ProjectSimulation = {
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'qa-document-editor',
  companyProfileId: company.id,
  syncStatus: 'local_only',
  isDeleted: params.get('trash') === '1',
  deletedAt: params.get('trash') === '1' ? new Date().toISOString() : null,
  customization: params.get('legacy') === '1'
    ? { ...useSimulationStore.getState().defaultDocumentCustomization, companyName: company.name }
    : { companyName: company.name, companyPhone: company.phone, companyEmail: company.email, companyFooterText: company.address },
};
useSimulationStore.setState({
  sidebarTheme: params.get('theme') === 'dark' ? 'dark' : 'light',
  workspaceScope: 'local',
  companies: [company],
  activeCompanyId: company.id,
  projects: [project],
  activeProjectId: project.id,
  activeView: 'pdf-preview',
  syncSettings: {
    serverUrl: 'https://example.invalid',
    authToken: null,
    autoSyncEnabled: false,
    lastSyncTimestamp: null,
    currentUser: params.get('role') === 'lector'
      ? { id: 'qa-reader', name: 'Lectora de prueba', email: 'lectora@example.test', role: 'LECTOR', organizationId: 'qa-org' }
      : null,
  },
});
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
(window as unknown as { qaStore: typeof useSimulationStore }).qaStore = useSimulationStore; // inspección desde la consola
createRoot(document.getElementById('root')!).render(<PDFProposalView />);
