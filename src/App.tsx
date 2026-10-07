import React, { useEffect, lazy, Suspense } from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { Header } from './components/common/Header';
import { PrimaryIconDock } from './components/layout/PrimaryIconDock';
import { SolarCoreTreeSidebar } from './components/dashboard/sidebar/SolarCoreTreeSidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { TrashView } from './components/dashboard/TrashView';
const SimulatorView = lazy(() => import('./components/simulator/SimulatorView').then((module) => ({ default: module.SimulatorView })));
const PDFProposalView = lazy(() => import('./components/pdf/PDFProposalView').then((module) => ({ default: module.PDFProposalView })));
const ProjectHubView = lazy(() => import('./components/hub/ProjectHubView').then((module) => ({ default: module.ProjectHubView })));
const CompanyProfileHubView = lazy(() => import('./components/companies/CompanyProfileHubView').then((module) => ({ default: module.CompanyProfileHubView })));
import { ConflictResolutionModal } from './components/common/ConflictResolutionModal';
import { NewProjectModal } from './components/common/NewProjectModal';
import { UpdateModal } from './components/common/UpdateModal';
const AIInvoiceScannerModal = lazy(() => import('./components/common/ai-invoice/AIInvoiceScannerModal').then((module) => ({ default: module.AIInvoiceScannerModal })));
const AIDatasheetScannerModal = lazy(() => import('./components/common/AIDatasheetScannerModal').then((module) => ({ default: module.AIDatasheetScannerModal })));
import { ImportConflictModal } from './components/common/ImportConflictModal';
import { ShareProposalModal } from './components/common/ShareProposalModal';
import { SettingsModal } from './components/settings/SettingsModal';
const AIPriceCatalogScannerModal = lazy(() => import('./components/common/AIPriceCatalogScannerModal').then((module) => ({ default: module.AIPriceCatalogScannerModal })));
import { SupplierPricesDetailModal } from './components/common/SupplierPricesDetailModal';
import { SplashScreen } from './components/common/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { draftOwnerKey } from './utils/draftOwnerKey';

export const App: React.FC = () => {
  const { sessionGeneration, workspaceScope, activeView, setActiveView, sidebarTheme, syncSettings, syncProjectsWithServer, isTrashActive, isSettingsModalOpen, activeConflict, loadOrganizationFeaturePolicy } = useSimulationStore();
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
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncSettings.authToken, syncSettings.autoSyncEnabled]);

  useEffect(() => {
    if (syncSettings.currentUser && syncSettings.authToken) void loadOrganizationFeaturePolicy();
  }, [syncSettings.currentUser?.id, syncSettings.currentUser?.organizationId, syncSettings.serverUrl]);

  // 🌓 Sincronización del Modo Oscuro con Tailwind (html.dark)
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <Suspense fallback={<div role="status" className="flex h-screen items-center justify-center text-sm text-slate-600">Cargando SolarSim…</div>}>
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
        {(activeView === 'simulator' || activeView === 'pdf-preview') && <Header />}

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
            {activeView === 'project-hub' && <ProjectHubView />}
            {activeView === 'companies-hub' && <CompanyProfileHubView />}
            {activeView === 'simulator' && <SimulatorView />}
            {activeView === 'pdf-preview' && <PDFProposalView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Modals Mounted at Root Level */}
      <ConflictResolutionModal key={`conflict-resolution-${sessionGeneration}`} />
      <NewProjectModal key={`new-project-${sessionGeneration}`} />
      <UpdateModal />
      <AIInvoiceScannerModal key={`ai-invoice-${sessionGeneration}`} />
      <AIDatasheetScannerModal key={`ai-datasheet-${sessionGeneration}`} />
      <ImportConflictModal key={`import-conflict-${sessionGeneration}`} />
      <ShareProposalModal key={`share-proposal-${sessionGeneration}`} />
      <SettingsModal key={`settings-modal-${settingsOwner}`} />
      <AIPriceCatalogScannerModal key={`ai-catalog-${sessionGeneration}`} />
      <SupplierPricesDetailModal key={`supplier-prices-${sessionGeneration}`} />
    </div>
    </Suspense>
  );
};

export default App;
