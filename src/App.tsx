import React from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { Header } from './components/common/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { SimulatorView } from './components/simulator/SimulatorView';
import { PDFProposalView } from './components/pdf/PDFProposalView';
import { NewProjectModal } from './components/common/NewProjectModal';
import { UpdateModal } from './components/common/UpdateModal';
import { AIInvoiceScannerModal } from './components/common/AIInvoiceScannerModal';
import { AISettingsModal } from './components/common/AISettingsModal';
import { ImportConflictModal } from './components/common/ImportConflictModal';
import { SplashScreen } from './components/common/SplashScreen';

export const App: React.FC = () => {
  const { activeView, sidebarTheme } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';

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
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'simulator' && <SimulatorView />}
        {activeView === 'pdf-preview' && <PDFProposalView />}
      </main>

      {/* Global Modals Mounted at Root Level */}
      <NewProjectModal />
      <UpdateModal />
      <AIInvoiceScannerModal />
      <AISettingsModal />
      <ImportConflictModal />
    </div>
  );
};

export default App;
