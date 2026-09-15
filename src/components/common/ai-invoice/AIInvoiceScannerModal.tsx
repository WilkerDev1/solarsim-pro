import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Settings,
  Building2,
  Calendar,
  SunMedium,
  CheckCircle2,
  Check,
  AlertTriangle,
  PlusCircle,
  FileEdit,
  FolderKanban,
  RefreshCw,
} from 'lucide-react';
import { useAIInvoiceScanner } from './hooks/useAIInvoiceScanner';
import { AIInvoiceInitialConfigView } from './components/AIInvoiceInitialConfigView';
import { AIInvoiceLoadingState } from './components/AIInvoiceLoadingState';
import { AIInvoiceDocViewer } from './components/AIInvoiceDocViewer';
import { AIInvoiceClientTab } from './components/AIInvoiceClientTab';
import { AIInvoiceConsumptionTab } from './components/AIInvoiceConsumptionTab';
import { AIInvoiceSolarTab } from './components/AIInvoiceSolarTab';
import { AIInvoiceErrorState } from './components/AIInvoiceErrorState';

export const AIInvoiceScannerModal: React.FC = () => {
  const {
    // Store & Project
    isAIInvoiceModalOpen,
    closeAIInvoiceModal,
    openSettingsModal,
    geminiApiKey,
    panelCatalog,
    inverterCatalog,
    batteryCatalog,
    activeProject,
    isInsideProject,
    isDark,
    dopExchangeRate,

    // State
    selectedFile,
    setSelectedFile,
    isProcessing,
    extractedData,
    setExtractedData,
    errorMsg,
    isPeakModeActive,
    selectedPanel,
    activeTab,
    setActiveTab,
    zoomLevel,
    setZoomLevel,
    fileInputRef,
    projectRequirementsPrompt,
    setProjectRequirementsPrompt,
    includeBattery,
    setIncludeBattery,

    // Computados
    peakConsumptionVal,
    peakMonthName,
    maxConsumptionVal,
    estimatedRealCoveragePct,

    // Handlers
    handleFileSelect,
    handleDragOver,
    handleDrop,
    processSmartProposal,
    handleTogglePeakMonthMode,
    handlePanelChange,
    handleCoverageChange,
    handleProvinceChange,
    handleInverterChange,
    handleInverterCountChange,
    handleBatteryChange,
    handleBatteryCountChange,
    handleUpdateMonthlyConsumption,
    handleApplyToActive,
    handleApplyAsNew,
    handleResetDocument,
  } = useAIInvoiceScanner();

  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  if (!isAIInvoiceModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`border rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden scale-100 animate-in zoom-in-95 duration-200 transition-colors ${
          isDark ? 'bg-[#141419] border-[#2a2a38] text-zinc-100' : 'bg-slate-50 border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          className={`px-6 py-3.5 flex justify-between items-center shrink-0 border-b transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-slate-950 via-[#181822] to-[#141419] border-[#2a2a38]'
              : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                  <span>Smart Proposal Studio</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                    IA Multimodal
                  </span>
                </h3>
                {activeProject && (
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${
                      isDark
                        ? 'bg-zinc-800/70 border-zinc-700 text-zinc-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                    title={`Proyecto abierto en segundo plano: ${activeProject.client.name || activeProject.client.projectId}`}
                  >
                    <FolderKanban className="w-3 h-3 text-zinc-400" />
                    <span>En memoria: <strong>{activeProject.client.projectId}</strong></span>
                  </span>
                )}
              </div>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                Generación automatizada y dimensionamiento fotovoltaico a partir de facturas y requerimientos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openSettingsModal('ai')}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#2d2d3e] text-zinc-400 hover:text-white hover:bg-[#20202c]'
                  : 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Ajustes de IA y Gemini API Key"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={closeAIInvoiceModal}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#2d2d3e] text-zinc-400 hover:text-white hover:bg-[#20202c]'
                  : 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileSelect(e.target.files[0]);
            }
          }}
        />

        {/* Modal Body Container */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* STATE 1: Initial upload & project prompt configuration */}
          {!isProcessing && !extractedData && (
            <AIInvoiceInitialConfigView
              isDark={isDark}
              isInsideProject={isInsideProject}
              activeProject={activeProject}
              geminiApiKey={geminiApiKey}
              openAISettingsModal={() => openSettingsModal('ai')}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              fileInputRef={fileInputRef}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              projectRequirementsPrompt={projectRequirementsPrompt}
              setProjectRequirementsPrompt={setProjectRequirementsPrompt}
              includeBattery={includeBattery}
              setIncludeBattery={setIncludeBattery}
              processSmartProposal={processSmartProposal}
              errorMsg={errorMsg}
            />
          )}

          {/* STATE 2: Loading / Extracting */}
          {isProcessing && (
            <AIInvoiceLoadingState
              isDark={isDark}
              selectedFile={selectedFile}
            />
          )}

          {/* STATE 3: Split-View with Document Preview & Verification Form */}
          {!isProcessing && extractedData && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* LEFT COLUMN: Document Preview */}
              <AIInvoiceDocViewer
                isDark={isDark}
                selectedFile={selectedFile}
                extractedData={extractedData}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                handleResetDocument={handleResetDocument}
              />

              {/* RIGHT COLUMN: Interactive tabs & results */}
              <div
                className={`w-full md:w-1/2 flex flex-col overflow-hidden transition-colors ${
                  isDark ? 'bg-[#141419]' : 'bg-slate-50'
                }`}
              >
                {/* Fallback Model Notice Banner if model was saturated (503) */}
                {extractedData.modelWarning && (
                  <div
                    className={`px-5 py-2.5 border-b flex items-start gap-2.5 text-xs shrink-0 ${
                      isDark
                        ? 'bg-amber-950/40 border-amber-800/40 text-amber-200'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-snug">
                      <span className="font-bold text-amber-300">Aviso de Servidor Google AI: </span>
                      <span>{extractedData.modelWarning}</span>
                    </div>
                  </div>
                )}

                {/* Tab Navigation Header */}
                <div
                  className={`px-6 py-2.5 border-b flex items-center justify-between shrink-0 ${
                    isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setActiveTab('client')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'client'
                          ? isDark
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                          : isDark
                          ? 'text-zinc-400 hover:text-zinc-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>1. Cliente & Suministro</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('consumption')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'consumption'
                          ? isDark
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                          : isDark
                          ? 'text-zinc-400 hover:text-zinc-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>2. Consumo (12 Meses)</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('solar')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'solar'
                          ? isDark
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                          : isDark
                          ? 'text-zinc-400 hover:text-zinc-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <SunMedium className="w-3.5 h-3.5" />
                      <span>3. Propuesta Solar</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{extractedData.confidenceScore}% Confiabilidad</span>
                  </div>
                </div>

                {/* Tab Contents */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                  {/* TAB 1: Client & Utility */}
                  {activeTab === 'client' && (
                    <AIInvoiceClientTab
                      isDark={isDark}
                      extractedData={extractedData}
                      setExtractedData={setExtractedData}
                      onProvinceChange={handleProvinceChange}
                      dopExchangeRate={dopExchangeRate}
                    />
                  )}

                  {/* TAB 2: 12-Month Consumption & Billing */}
                  {activeTab === 'consumption' && (
                    <AIInvoiceConsumptionTab
                      isDark={isDark}
                      extractedData={extractedData}
                      maxConsumptionVal={maxConsumptionVal}
                      isPeakModeActive={isPeakModeActive}
                      peakConsumptionVal={peakConsumptionVal}
                      peakMonthName={peakMonthName}
                      handleTogglePeakMonthMode={handleTogglePeakMonthMode}
                      handleUpdateMonthlyConsumption={handleUpdateMonthlyConsumption}
                      dopExchangeRate={dopExchangeRate}
                    />
                  )}

                  {/* TAB 3: Suggested Solar Sizing & Matched Equipment */}
                  {activeTab === 'solar' && (
                    <AIInvoiceSolarTab
                      isDark={isDark}
                      extractedData={extractedData}
                      selectedPanel={selectedPanel}
                      panelCatalog={panelCatalog}
                      inverterCatalog={inverterCatalog}
                      batteryCatalog={batteryCatalog}
                      estimatedRealCoveragePct={estimatedRealCoveragePct}
                      handleCoverageChange={handleCoverageChange}
                      handlePanelChange={handlePanelChange}
                      handleInverterChange={handleInverterChange}
                      handleInverterCountChange={handleInverterCountChange}
                      handleBatteryChange={handleBatteryChange}
                      handleBatteryCountChange={handleBatteryCountChange}
                    />
                  )}
                </div>

                {/* Footer Actions */}
                <div
                  className={`p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 ${
                    isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
                  }`}
                >
                  <button
                    onClick={handleResetDocument}
                    className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                      isDark ? 'border-[#38384c] text-zinc-300 hover:bg-[#222230]' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Ajustar Parámetros
                  </button>

                  <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2.5">
                    {activeProject && (
                      <button
                        type="button"
                        onClick={() => setShowOverwriteConfirm(true)}
                        className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                          isDark
                            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300'
                            : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                        }`}
                        title={`Actualizar y reemplazar los parámetros del proyecto abierto (${activeProject.client.projectId})`}
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">Actualizar Proyecto Abierto ({activeProject.client.projectId})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleApplyAsNew}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition-all shadow-md hover:shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      title="Crear una nueva propuesta solar sin modificar ningún proyecto existente"
                    >
                      <PlusCircle className="w-4 h-4 text-emerald-100 shrink-0" />
                      <span>Crear como Proyecto Nuevo ✨</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STATE 4: Error after selecting file */}
          {selectedFile && !isProcessing && !extractedData && errorMsg && (
            <AIInvoiceErrorState
              isDark={isDark}
              errorMsg={errorMsg}
              handleResetDocument={handleResetDocument}
              openAISettingsModal={() => openSettingsModal('ai')}
            />
          )}
        </div>
      </div>

      {/* DIÁLOGO DE CONFIRMACIÓN DE SOBREESCRITURA */}
      {showOverwriteConfirm && activeProject && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl flex flex-col gap-5 ${
              isDark ? 'bg-[#181822] border-amber-500/40 text-zinc-100' : 'bg-white border-amber-300 text-slate-800'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold tracking-tight">
                  ¿Sobrescribir Proyecto Existente?
                </h4>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Estás a punto de reemplazar los parámetros técnicos, consumos y cliente del proyecto abierto en memoria con los datos de esta factura.
                </p>
              </div>
            </div>

            {/* Comparativa Visual */}
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                isDark ? 'bg-black/30 border-zinc-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-dashed border-zinc-700/50">
                <span className="text-zinc-400">Proyecto a modificar:</span>
                <span className="font-mono font-bold text-amber-400">
                  {activeProject.client.projectId}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Cliente Actual en Memoria
                  </span>
                  <div className="font-bold truncate text-zinc-200" title={activeProject.client.name}>
                    {activeProject.client.name || 'Sin Nombre'}
                  </div>
                  <div className="text-zinc-400 text-[10px] truncate">
                    {activeProject.specs.panelCount} Paneles • {((activeProject.specs.panelCount * activeProject.specs.panelPowerW) / 1000).toFixed(2)} kWp
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                    Nueva Factura Escaneada
                  </span>
                  <div className="font-bold truncate text-emerald-300" title={extractedData?.clientName}>
                    {extractedData?.clientName || 'Cliente Factura'}
                  </div>
                  <div className="text-zinc-400 text-[10px] truncate">
                    {extractedData?.recommendedPanelCount || selectedPanel?.powerW
                      ? `${extractedData?.recommendedPanelCount || 0} Paneles • ${(extractedData?.recommendedCapacityKWp || 0).toFixed(2)} kWp`
                      : extractedData?.distributor || 'EDE'}
                  </div>
                </div>
              </div>
            </div>

            {/* Botones de Decisión */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowOverwriteConfirm(false)}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  handleApplyAsNew();
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>No, Crear Proyecto Nuevo (Recomendado)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  handleApplyToActive();
                }}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'border-amber-500/60 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200'
                    : 'border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-900'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Sí, Sobrescribir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
