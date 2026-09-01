import React, { useEffect } from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { Header } from './components/common/Header';
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
import { SplashScreen } from './components/common/SplashScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const { activeView, setActiveView, sidebarTheme, syncSettings, syncProjectsWithServer } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';

  // 🔄 Ciclo de Vida Global de Sincronización Automática en Segundo Plano (Heartbeat & Focus)
  useEffect(() => {
    if (syncSettings.authToken && syncSettings.autoSyncEnabled) {
      // 1. Sincronización inicial silenciosa al abrir la app
      syncProjectsWithServer(true);
    }

    // 2. Heartbeat periódico cada 15 segundos (Red Social / Servidor como Fuente de Verdad)
    const interval = setInterval(() => {
      const state = useSimulationStore.getState();
      if (state.syncSettings.authToken && state.syncSettings.autoSyncEnabled && !state.isSyncing) {
        state.syncProjectsWithServer(true);
      }
    }, 15000);

    // 3. Sincronización al reenfocar la ventana o cambiar de pestaña
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

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#121214] text-zinc-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* App Launch Splash Screen */}
      <SplashScreen />

      <Header />
      <main className="flex-1 flex overflow-hidden min-h-0 w-full">
        <ErrorBoundary onReset={() => setActiveView('dashboard')}>
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'simulator' && <SimulatorView />}
          {activeView === 'pdf-preview' && <PDFProposalView />}
        </ErrorBoundary>
      </main>

      {/* Global Modals Mounted at Root Level */}
      <NewProjectModal />
      <UpdateModal />
      <AIInvoiceScannerModal />
      <AIDatasheetScannerModal />
      <AISettingsModal />
      <ImportConflictModal />
      <ShareProposalModal />
      <SettingsModal />
    </div>
  );
};

export default App;
