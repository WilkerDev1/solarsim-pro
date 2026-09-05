import React, { useState, useCallback, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { fetchSolarRadiationByCoordinates } from '../../services/solarRadiationApi';
import { Shield, Trash2, RotateCcw, ArrowLeft } from 'lucide-react';
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
    updateAllMonthlyConsumption,
    setMonthlyConsumption,
    saveActiveProject,
    openAIInvoiceModal,
    syncSettings,
    sidebarWidth,
    setSidebarWidth,
    sidebarTheme,
    restoreProject,
    hardDeleteProject,
    setActiveView,
    setIsTrashActive,
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
        updateClient={project.isDeleted ? () => {} : updateClient}
        updateSpecs={project.isDeleted ? () => {} : updateSpecs}
        updateRates={project.isDeleted ? () => {} : updateRates}
        updateFinancials={project.isDeleted ? () => {} : updateFinancials}
        saveActiveProject={project.isDeleted ? () => {} : saveActiveProject}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-100">
        {/* Banner de Advertencia: Proyecto en Papelera (Modo Solo Lectura) */}
        {project.isDeleted && (
          <div className="bg-rose-900/95 border-b border-rose-700 text-white px-6 py-2.5 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-sm z-30">
            <div className="flex items-center gap-2.5">
              <span className="p-1 rounded-md bg-rose-800 text-rose-200">
                <Trash2 className="w-4 h-4" />
              </span>
              <span>
                <strong>Propuesta en Papelera (Modo Solo Lectura)</strong> — Esta propuesta fue eliminada
                {project.deletedAt ? ` el ${new Date(project.deletedAt).toLocaleDateString('es-DO')}` : ''}
                {project.deletedBy ? ` por ${project.deletedBy}` : ''}. No se pueden aplicar modificaciones.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => restoreProject(project.id)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar DEFINITIVAMENTE la propuesta "${project.client?.name}"?\n\nEsta acción NO se puede deshacer.`)) {
                    hardDeleteProject(project.id);
                    setActiveView('dashboard');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Definitivo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView('dashboard');
                  setIsTrashActive(true);
                }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Volver a la Papelera"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Lector Role Notice Banner */}
        {syncSettings.currentUser?.role === 'LECTOR' && !project.isDeleted && (
          <div className="bg-blue-900 text-blue-100 px-6 py-2 text-xs font-semibold flex items-center justify-between border-b border-blue-800 shrink-0">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-300" />
              <span>Modo Solo Lectura: Has iniciado sesión con rol de <strong>Lector</strong>. Puedes explorar datos y exportar a PDF.</span>
            </div>
          </div>
        )}

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
              updateAllMonthlyConsumption={updateAllMonthlyConsumption}
              setMonthlyConsumption={setMonthlyConsumption}
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
