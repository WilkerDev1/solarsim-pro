import React, { useEffect } from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { Header } from './components/common/Header';
import { PrimaryIconDock } from './components/layout/PrimaryIconDock';
import { SolarCoreTreeSidebar } from './components/dashboard/sidebar/SolarCoreTreeSidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { SimulatorView } from './components/simulator/SimulatorView';
import { PDFProposalView } from './components/pdf/PDFProposalView';
import { NewProjectModal } from './components/common/NewProjectModal';
import { UpdateModal } from './components/common/UpdateModal';
import { AIInvoiceScannerModal } from './components/common/AIInvoiceScannerModal';
import { AIDatasheetScannerModal } from './components/common/AIDatasheetScannerModal';
import { AISettingsModal } from './components/common/AISettingsModal';
import { ImportConflictModal } from './components/common/ImportConflictModal';
import { ShareProposalModal } from './components/common/ShareProposalModal';
import { SettingsModal } from './components/common/SettingsModal';
import { AIPriceCatalogScannerModal } from './components/common/AIPriceCatalogScannerModal';
import { SupplierPricesDetailModal } from './components/common/SupplierPricesDetailModal';
import { SplashScreen } from './components/common/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const { activeView, setActiveView, sidebarTheme, syncSettings, syncProjectsWithServer } = useSimulationStore();
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

  // 🌓 Sincronización del Modo Oscuro con Tailwind (html.dark)
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <div
      className={`h-screen w-screen flex flex-row overflow-hidden transition-colors duration-200 ${
        isDark ? 'dark bg-[#10141d] text-zinc-100' : 'bg-[#f4f6fa] text-slate-900'
      }`}
    >
      {/* App Launch Splash Screen */}
      <SplashScreen />

      {/* 🧭 1. Dock Vertical Oscuro Estrecho (~64px) */}
      <PrimaryIconDock />

      {/* 🖼️ 2. Contenedor Principal con Header Adaptativo y Vistas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {activeView !== 'dashboard' && <Header />}

        <main className="flex-1 flex overflow-hidden min-h-0 w-full">
          <ErrorBoundary onReset={() => setActiveView('dashboard')}>
            {activeView === 'dashboard' && (
              <div className="flex-1 flex h-full overflow-hidden w-full">
                {/* 🌳 Pestaña Clara / Intermedia (Solar Core Tree Explorer) */}
                <SolarCoreTreeSidebar />
                {/* 🎴 Lienzo Principal de Proyectos */}
                <DashboardView />
              </div>
            )}
            {activeView === 'simulator' && <SimulatorView />}
            {activeView === 'pdf-preview' && <PDFProposalView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Modals Mounted at Root Level */}
      <NewProjectModal />
      <UpdateModal />
      <AIInvoiceScannerModal />
      <AIDatasheetScannerModal />
      <AISettingsModal />
      <ImportConflictModal />
      <ShareProposalModal />
      <SettingsModal />
      <AIPriceCatalogScannerModal />
      <SupplierPricesDetailModal />
    </div>
  );
};

export default App;
