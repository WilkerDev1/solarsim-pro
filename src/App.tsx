import React from 'react';
import { useSimulationStore } from './store/useSimulationStore';
import { Header } from './components/common/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { SimulatorView } from './components/simulator/SimulatorView';
import { PDFProposalView } from './components/pdf/PDFProposalView';

export const App: React.FC = () => {
  const { activeView } = useSimulationStore();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface text-on-surface">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'simulator' && <SimulatorView />}
        {activeView === 'pdf-preview' && <PDFProposalView />}
      </main>
    </div>
  );
};

export default App;
