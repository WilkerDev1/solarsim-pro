import { isReaderRole } from '../../../shared/permissions';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { draggedSidebarWidth } from './sidebar/sidebarWidth';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../../features/application/featurePolicy';
import { fetchSolarRadiationByCoordinates } from '../../services/solarRadiationApi';
import { Shield, Trash2, RotateCcw, ArrowLeft, Undo2, Redo2 } from 'lucide-react';
import { ParameterSidebar } from './sidebar/ParameterSidebar';
import { SAMPLE_GPS_COORDINATES } from './params/logic/dockDefaults';
import { createDockWriters, DOCK_COMMIT_OPTIONS } from './params/logic/dockEdits';
import { EnergyAnalysisTab } from './tabs/EnergyAnalysisTab';
import { QuotationEquipmentsTab } from './tabs/QuotationEquipmentsTab';
import { FinancialReturnTab } from './tabs/FinancialReturnTab';
import { confirmAction } from '../common/confirmAction';

export const SimulatorView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    getActiveProject,
    getFinancialSummary,
    commitProjectEdits,
    updateSpecs,
    updateMonthlyConsumption,
    updateAllMonthlyConsumption,
    setMonthlyConsumption,
    openAIInvoiceModal,
    syncSettings,
    sidebarWidth,
    setSidebarWidth,
    restoreProject,
    hardDeleteProject,
    setActiveView,
    setIsTrashActive,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useSimulationStore(useShallow((s) => ({ projects: s.projects, activeProjectId: s.activeProjectId, getActiveProject: s.getActiveProject, getFinancialSummary: s.getFinancialSummary, commitProjectEdits: s.commitProjectEdits, updateSpecs: s.updateSpecs, updateMonthlyConsumption: s.updateMonthlyConsumption, updateAllMonthlyConsumption: s.updateAllMonthlyConsumption, setMonthlyConsumption: s.setMonthlyConsumption, openAIInvoiceModal: s.openAIInvoiceModal, syncSettings: s.syncSettings, sidebarWidth: s.sidebarWidth, setSidebarWidth: s.setSidebarWidth, restoreProject: s.restoreProject, hardDeleteProject: s.hardDeleteProject, setActiveView: s.setActiveView, setIsTrashActive: s.setIsTrashActive, canUndo: s.canUndo, canRedo: s.canRedo, undo: s.undo, redo: s.redo, energyMode: energyCalculationMode(effectiveFeatureSettings(s)) })));

  const project = getActiveProject();
  const summary = getFinancialSummary();
  // F2a2: el dock escribe por la transacción de edición (un lote = una escritura, un autosync y un paso de deshacer).
  // Atado al id de la propuesta que se ve: una respuesta tardía (radiación NASA) cae en la propuesta donde se pidió.
  const projectId = project.id;
  const dock = useMemo(() => createDockWriters((edits) => commitProjectEdits(projectId, edits, DOCK_COMMIT_OPTIONS)), [commitProjectEdits, projectId]);

  // Navigation tab for the right content area
  const [activeMainTab, setActiveMainTab] = useState<'energia' | 'cotizacion' | 'retorno'>('energia');

  // Currency view state for confidential cost matrix ('ALL' dual | 'USD' | 'DOP')
  const [costTableCurrency, setCostTableCurrency] = useState<'ALL' | 'USD' | 'DOP'>('ALL');

  // NASA Solar API fetching state
  const [isFetchingSolar, setIsFetchingSolar] = useState(false);
  const [solarApiStatus, setSolarApiStatus] = useState<string | null>(null);

  // Resize Drawer state
  const [isDragging, setIsDragging] = useState(false);

  // Borde izquierdo del panel al empezar a arrastrar (a su izquierda está el dock de iconos).
  const sidebarLeftRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarLeftRef.current = e.currentTarget.previousElementSibling?.getBoundingClientRect().left ?? 0;
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setSidebarWidth(draggedSidebarWidth(e.clientX, sidebarLeftRef.current, window.innerWidth));
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

  // ⌨️ Global Keyboard Listeners for Live Undo / Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo) redo();
        } else {
          e.preventDefault();
          if (canUndo) undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Handler for GPS satellite solar radiation fetching
  const handleFetchSolarApi = async () => {
    const coords = project.client.coordinates || SAMPLE_GPS_COORDINATES;
    const parts = coords.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      setSolarApiStatus(`⚠️ Formato inválido. Usa: Latitud, Longitud (ej: ${SAMPLE_GPS_COORDINATES})`);
      return;
    }

    setIsFetchingSolar(true);
    setSolarApiStatus('Consultando satélites NASA SSE...');

    try {
      const result = await fetchSolarRadiationByCoordinates(parts[0], parts[1]);
      dock.updateClient({
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
        sidebarWidth={sidebarWidth}
        isDragging={isDragging}
        onMouseDown={handleMouseDown}
        isFetchingSolar={isFetchingSolar}
        solarApiStatus={solarApiStatus}
        onFetchSolarApi={handleFetchSolarApi}
        updateClient={project.isDeleted ? () => {} : dock.updateClient}
        updateSpecs={project.isDeleted ? () => {} : dock.updateSpecs}
        updateRates={project.isDeleted ? () => {} : dock.updateRates}
        updateFinancials={project.isDeleted ? () => {} : dock.updateFinancials}
        updateRatesAndSpecs={project.isDeleted ? () => {} : dock.updateRatesAndSpecs}
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
                onClick={async () => {
                  if (await confirmAction({ title: 'Eliminar definitivamente', message: `¿Eliminar DEFINITIVAMENTE la propuesta "${project.client?.name}"?\n\nEsta acción NO se puede deshacer.`, confirmLabel: 'Eliminar definitivo', tone: 'danger' })) {
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

        {/* Lector / Viewer Role Notice Banner */}
        {syncSettings.authToken && isReaderRole(syncSettings.currentUser?.role) && !project.isDeleted && (
          <div className="bg-blue-900 text-blue-100 px-6 py-2 text-xs font-semibold flex items-center justify-between border-b border-blue-800 shrink-0">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-300" />
              <span>Modo Solo Lectura: Has iniciado sesión con rol de <strong>Lector</strong>. Puedes explorar datos y exportar a PDF.</span>
            </div>
          </div>
        )}

        {/* Top Fixed View Selector Tabs */}
        <div className="bg-white border-b border-slate-200 px-4 lg:px-6 pt-3 pb-0 shrink-0 z-20 shadow-xs flex justify-between items-center gap-3">
          <div className="flex gap-2.5 lg:gap-8 min-w-0 overflow-x-auto [scrollbar-width:thin]">
            <button
              onClick={() => setActiveMainTab('energia')}
              aria-label="Análisis de Energía"
              title="Análisis de Energía"
              className={`pb-3 text-xs lg:text-sm font-bold whitespace-nowrap shrink-0 transition-all relative cursor-pointer ${
                activeMainTab === 'energia'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="xl:hidden" aria-hidden="true">Energía</span>
              <span className="hidden xl:inline" aria-hidden="true">Análisis de Energía</span>
            </button>

            <button
              onClick={() => setActiveMainTab('cotizacion')}
              aria-label="Cotización y Equipos"
              title="Cotización y Equipos"
              className={`pb-3 text-xs lg:text-sm font-bold whitespace-nowrap shrink-0 transition-all relative cursor-pointer ${
                activeMainTab === 'cotizacion'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="xl:hidden" aria-hidden="true">Cotización</span>
              <span className="hidden xl:inline" aria-hidden="true">Cotización y Equipos</span>
            </button>

            <button
              onClick={() => setActiveMainTab('retorno')}
              aria-label="Retorno de Inversión y Flujo 25 Años"
              title="Retorno de Inversión y Flujo 25 Años"
              className={`pb-3 text-xs lg:text-sm font-bold whitespace-nowrap shrink-0 transition-all relative cursor-pointer ${
                activeMainTab === 'retorno'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="xl:hidden" aria-hidden="true">Retorno</span>
              <span className="hidden xl:inline" aria-hidden="true">Retorno de Inversión y Flujo 25 Años</span>
            </button>
          </div>

          {/* Right: Live Undo / Redo & Hub Jump */}
          <div className="flex items-center gap-1.5 pb-2 shrink-0">
            <button
              type="button"
              onClick={undo}
              aria-label="Deshacer"
              disabled={!canUndo}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Deshacer último cambio (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Deshacer</span>
            </button>

            <button
              type="button"
              onClick={redo}
              aria-label="Rehacer"
              disabled={!canRedo}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Rehacer cambio (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Rehacer</span>
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
              updateSpecs={updateSpecs}
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
