import React, { useState, useCallback, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { fetchSolarRadiationByCoordinates } from '../../services/solarRadiationApi';
import { ParameterSidebar } from './sidebar/ParameterSidebar';
import { EnergyAnalysisTab } from './tabs/EnergyAnalysisTab';
import { QuotationEquipmentsTab } from './tabs/QuotationEquipmentsTab';
import { FinancialReturnTab } from './tabs/FinancialReturnTab';

export const SimulatorView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    getActiveProject,
    getFinancialSummary,
    updateClient,
    updateSpecs,
    updateRates,
    updateFinancials,
    updateMonthlyConsumption,
    saveActiveProject,
    openAIInvoiceModal,
    sidebarWidth,
    setSidebarWidth,
    sidebarTheme,
  } = useSimulationStore();

  const project = getActiveProject();
  const summary = getFinancialSummary();
  const isDark = sidebarTheme === 'dark';

  // Navigation tab for the right content area
  const [activeMainTab, setActiveMainTab] = useState<'energia' | 'cotizacion' | 'retorno'>('energia');

  // Currency view state for confidential cost matrix ('ALL' dual | 'USD' | 'DOP')
  const [costTableCurrency, setCostTableCurrency] = useState<'ALL' | 'USD' | 'DOP'>('ALL');

  // NASA Solar API fetching state
  const [isFetchingSolar, setIsFetchingSolar] = useState(false);
  const [solarApiStatus, setSolarApiStatus] = useState<string | null>(null);

  // Resize Drawer state
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const minW = 280;
      const maxW = 600;
      const newW = Math.max(minW, Math.min(maxW, e.clientX));
      setSidebarWidth(newW);
    },
    [isDragging, setSidebarWidth]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) setIsDragging(false);
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handler for GPS satellite solar radiation fetching
  const handleFetchSolarApi = async () => {
    const coords = project.client.coordinates || '18.4861, -69.9312';
    const parts = coords.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      setSolarApiStatus('⚠️ Formato inválido. Usa: Latitud, Longitud (ej: 18.4861, -69.9312)');
      return;
    }

    setIsFetchingSolar(true);
    setSolarApiStatus('Consultando satélites NASA SSE...');

    try {
      const result = await fetchSolarRadiationByCoordinates(parts[0], parts[1]);
      updateClient({
        customMonthlyHSP: result.monthlyHSP,
        solarSourceMode: 'gps',
      });
      setSolarApiStatus(`✅ Datos NASA aplicados exitosamente (Promedio: ${result.avgHSP} HSP/día)`);
    } catch (err: any) {
      setSolarApiStatus(`❌ Error al consultar API: ${err.message || 'Error de conexión'}`);
    } finally {
      setIsFetchingSolar(false);
    }
  };

  return (
    <div key={activeProjectId} className="flex-1 flex overflow-hidden min-h-0 bg-slate-100">
      {/* Barra Lateral Modular de Parámetros */}
      <ParameterSidebar
        project={project}
        projects={projects}
        summary={summary}
        isDark={isDark}
        sidebarWidth={sidebarWidth}
        isDragging={isDragging}
        onMouseDown={handleMouseDown}
        isFetchingSolar={isFetchingSolar}
        solarApiStatus={solarApiStatus}
        onFetchSolarApi={handleFetchSolarApi}
        updateClient={updateClient}
        updateSpecs={updateSpecs}
        updateRates={updateRates}
        updateFinancials={updateFinancials}
        saveActiveProject={saveActiveProject}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-100">
        {/* Top Fixed View Selector Tabs */}
        <div className="bg-white border-b border-slate-200 px-6 pt-3 pb-0 shrink-0 z-20 shadow-xs flex justify-between items-center">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveMainTab('energia')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'energia'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Análisis de Energía
            </button>

            <button
              onClick={() => setActiveMainTab('cotizacion')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'cotizacion'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cotización y Equipos
            </button>

            <button
              onClick={() => setActiveMainTab('retorno')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'retorno'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Retorno de Inversión y Flujo 25 Años
            </button>
          </div>
        </div>

        {/* Scrollable Container for Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 gap-6 flex flex-col min-h-0">
          {activeMainTab === 'energia' && (
            <EnergyAnalysisTab
              project={project}
              summary={summary}
              openAIInvoiceModal={openAIInvoiceModal}
              updateMonthlyConsumption={updateMonthlyConsumption}
            />
          )}

          {activeMainTab === 'cotizacion' && (
            <QuotationEquipmentsTab
              project={project}
              summary={summary}
              costTableCurrency={costTableCurrency}
              setCostTableCurrency={setCostTableCurrency}
            />
          )}

          {activeMainTab === 'retorno' && (
            <FinancialReturnTab
              project={project}
              summary={summary}
            />
          )}
        </div>
      </main>
    </div>
  );
};
