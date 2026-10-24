import React, { useEffect, lazy, Suspense } from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './components/common/Header';
import { PrimaryIconDock } from './components/layout/PrimaryIconDock';
import { SolarCoreTreeSidebar } from './components/dashboard/sidebar/SolarCoreTreeSidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { TrashView } from './components/dashboard/TrashView';
const loadSimulatorView = () => import('./components/simulator/SimulatorView');
const loadPDFProposalView = () => import('./components/pdf/PDFProposalView');
const loadProjectHubView = () => import('./components/hub/ProjectHubView');
const loadCompanyProfileHubView = () => import('./components/companies/CompanyProfileHubView');
const loadClientsHubView = () => import('./components/clients/ClientsHubView');
const SimulatorView = lazy(() => loadSimulatorView().then((module) => ({ default: module.SimulatorView })));
const PDFProposalView = lazy(() => loadPDFProposalView().then((module) => ({ default: module.PDFProposalView })));
const ProjectHubView = lazy(() => loadProjectHubView().then((module) => ({ default: module.ProjectHubView })));
const CompanyProfileHubView = lazy(() => loadCompanyProfileHubView().then((module) => ({ default: module.CompanyProfileHubView })));
const ClientsHubView = lazy(() => loadClientsHubView().then((module) => ({ default: module.ClientsHubView })));
import { ConflictResolutionModal } from './components/common/ConflictResolutionModal';
import { NewProjectModal } from './components/common/NewProjectModal';
import { UpdateModal } from './components/common/UpdateModal';
import { ClientOutdatedNotice } from './components/common/ClientOutdatedNotice';
const AIInvoiceScannerModal = lazy(() => import('./components/common/ai-invoice/AIInvoiceScannerModal').then((module) => ({ default: module.AIInvoiceScannerModal })));
const AIDatasheetScannerModal = lazy(() => import('./components/common/AIDatasheetScannerModal').then((module) => ({ default: module.AIDatasheetScannerModal })));
import { ImportConflictModal } from './components/common/ImportConflictModal';
import { ShareProposalModal } from './components/common/ShareProposalModal';
import { SettingsModal } from './components/settings/SettingsModal';
const AIPriceCatalogScannerModal = lazy(() => import('./components/common/AIPriceCatalogScannerModal').then((module) => ({ default: module.AIPriceCatalogScannerModal })));
import { SupplierPricesDetailModal } from './components/common/SupplierPricesDetailModal';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { SplashScreen } from './components/common/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
const AppAssistant = lazy(() => import('./features/assistant/components/AppAssistant').then(module => ({ default: module.AppAssistant })));
import { AgentRuntimeHost } from './features/agentTools/AgentRuntimeHost';
import { draftOwnerKey } from './utils/draftOwnerKey';

export const App: React.FC = () => {
  const { sessionGeneration, workspaceScope, activeView, setActiveView, sidebarTheme, syncSettings, syncProjectsWithServer, isTrashActive, isSettingsModalOpen, activeConflict, loadOrganizationFeaturePolicy } = useSimulationStore(useShallow((s) => ({ sessionGeneration: s.sessionGeneration, workspaceScope: s.workspaceScope, activeView: s.activeView, setActiveView: s.setActiveView, sidebarTheme: s.sidebarTheme, syncSettings: s.syncSettings, syncProjectsWithServer: s.syncProjectsWithServer, isTrashActive: s.isTrashActive, isSettingsModalOpen: s.isSettingsModalOpen, activeConflict: s.activeConflict, loadOrganizationFeaturePolicy: s.loadOrganizationFeaturePolicy })));
  const settingsOwner = draftOwnerKey(workspaceScope, syncSettings, true);
  const isDark = sidebarTheme === 'dark';

  // 🔄 Ciclo de Vida Global de Sincronización Automática en Segundo Plano (Heartbeat & Focus)
  useEffect(() => {
    if (syncSettings.authToken && syncSettings.autoSyncEnabled) {
      syncProjectsWithServer(true);
    }

    const interval = setInterval(() => {
      const state = useSimulationStore.getState();
      if (state.syncSettings.authToken && state.syncSettings.autoSyncEnabled && !state.isSyncing) {
        state.syncProjectsWithServer(true);
      }
    }, 15000);

    const handleFocus = () => {
      const state = useSimulationStore.getState();
      if (state.syncSettings.authToken && state.syncSettings.autoSyncEnabled && !state.isSyncing) {
        state.syncProjectsWithServer(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncSettings.authToken, syncSettings.autoSyncEnabled]);

  useEffect(() => {
    if (syncSettings.currentUser && syncSettings.authToken) void loadOrganizationFeaturePolicy();
  }, [syncSettings.currentUser?.id, syncSettings.currentUser?.organizationId, syncSettings.serverUrl]);

  // Precarga las vistas diferidas tras el arranque para que navegar no muestre pantallas de carga.
  useEffect(() => {
    // En serie: el chunk del PDF es grande y no debe competir con el arranque.
    const preload = async () => { for (const load of [loadProjectHubView, loadSimulatorView, loadClientsHubView, loadCompanyProfileHubView, loadPDFProposalView]) await load().catch(() => undefined); };
    const handle = setTimeout(() => void preload(), 3000);
    return () => clearTimeout(handle);
  }, []);

  // 🌓 Sincronización del Modo Oscuro con Tailwind (html.dark)
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <div aria-hidden={!!activeConflict || undefined} {...(activeConflict ? { inert: '' } : {})}
      className={`h-screen w-screen flex flex-row overflow-hidden transition-colors duration-200 ${
        isDark ? 'dark bg-[#10141d] text-zinc-100' : 'bg-[#f4f6fa] text-slate-900'
      }`}
    >
      {/* App Launch Splash Screen */}
      <SplashScreen />

      {/* 🧭 1. Dock Vertical Oscuro Estrecho (~64px) */}
      <PrimaryIconDock />

      {/* 🖼️ 2. Contenedor Principal con Header Adaptativo y Vistas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0" aria-hidden={isSettingsModalOpen || undefined} {...(isSettingsModalOpen ? { inert: '' } : {})}>
        {(activeView === 'project-hub' || activeView === 'simulator' || activeView === 'pdf-preview') && <Header />}

        <main className="flex-1 flex overflow-hidden min-h-0 w-full">
          <ErrorBoundary onReset={() => setActiveView('dashboard')}>
            {activeView === 'dashboard' && (
              <div className="flex-1 flex h-full overflow-hidden w-full">
                {/* 🌳 Pestaña Clara / Intermedia (Solar Core Tree Explorer) */}
                <SolarCoreTreeSidebar />
                {/* 🎴 Lienzo Principal de Proyectos o Papelera */}
                {isTrashActive ? <TrashView /> : <DashboardView />}
              </div>
            )}
            <Suspense fallback={<div role="status" className="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-zinc-400">Cargando…</div>}>
              {activeView === 'project-hub' && <ProjectHubView />}
              {activeView === 'companies-hub' && <CompanyProfileHubView />}
              {activeView === 'clients-hub' && <ClientsHubView />}
              {activeView === 'simulator' && <SimulatorView />}
              {activeView === 'pdf-preview' && <PDFProposalView />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <Suspense fallback={null}>
        <AppAssistant />
      </Suspense>
      <AgentRuntimeHost key={`agent-runtime-${sessionGeneration}`} />

      {/* Global Modals Mounted at Root Level */}
      <ConflictResolutionModal key={`conflict-resolution-${sessionGeneration}`} />
      <NewProjectModal key={`new-project-${sessionGeneration}`} />
      <UpdateModal />
      <ClientOutdatedNotice />
      <Suspense fallback={null}><AIInvoiceScannerModal key={`ai-invoice-${sessionGeneration}`} /></Suspense>
      <Suspense fallback={null}><AIDatasheetScannerModal key={`ai-datasheet-${sessionGeneration}`} /></Suspense>
      <ImportConflictModal key={`import-conflict-${sessionGeneration}`} />
      <ShareProposalModal key={`share-proposal-${sessionGeneration}`} />
      <SettingsModal key={`settings-modal-${settingsOwner}`} />
      <Suspense fallback={null}><AIPriceCatalogScannerModal key={`ai-catalog-${sessionGeneration}`} /></Suspense>
      <SupplierPricesDetailModal key={`supplier-prices-${sessionGeneration}`} />
      <ConfirmDialog />
    </div>
  );
};

export default App;
