import React from 'react';
import {
  X,
  Sparkles,
  Settings,
  Building2,
  Calendar,
  SunMedium,
  CheckCircle2,
  Check,
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
    openAISettingsModal,
    geminiApiKey,
    panelCatalog,
    inverterCatalog,
    batteryCatalog,
    activeProject,
    isInsideProject,
    isDark,

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
    handleInverterChange,
    handleInverterCountChange,
    handleBatteryChange,
    handleBatteryCountChange,
    handleUpdateMonthlyConsumption,
    handleApplyToActive,
    handleApplyAsNew,
    handleResetDocument,
  } = useAIInvoiceScanner();

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
              <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                <span>Smart Proposal Studio</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                  IA Multimodal
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                {isInsideProject
                  ? `Dimensionamiento y autocompletado para ${activeProject?.client?.name || 'el proyecto activo'}`
                  : 'Generación automatizada de propuestas a partir de factura y especificaciones'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openAISettingsModal}
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
              openAISettingsModal={openAISettingsModal}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              fileInputRef={fileInputRef}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              projectRequirementsPrompt={projectRequirementsPrompt}
              setProjectRequirementsPrompt={setProjectRequirementsPrompt}
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

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    {isInsideProject ? (
                      <button
                        onClick={handleApplyToActive}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <Check className="w-4 h-4" />
                        <span>Aplicar al Proyecto Activo ✨</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleApplyAsNew}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        <span>Crear Propuesta (95% Lista) 🚀</span>
                      </button>
                    )}
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
              openAISettingsModal={openAISettingsModal}
            />
          )}
        </div>
      </div>
    </div>
  );
};
