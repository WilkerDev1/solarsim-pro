import React, { useState, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { parseInvoiceWithGemini } from '../../services/geminiInvoiceService';
import { ExtractedInvoiceData } from '../../types/aiInvoice';
import {
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Zap,
  Building2,
  Calendar,
  SunMedium,
  Check,
  HelpCircle,
} from 'lucide-react';
import { RD_PROVINCES } from '../../data/rdProvinces';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const AIInvoiceScannerModal: React.FC = () => {
  const {
    isAIInvoiceModalOpen,
    closeAIInvoiceModal,
    openAISettingsModal,
    geminiApiKey,
    geminiModel,
    applyExtractedInvoice,
    getActiveProject,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const activeProject = getActiveProject();

  // File state
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    name: string;
    type: string;
    dataUrl: string;
    base64: string;
  } | null>(null);

  // Processing & Extracted Data state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Split View Active Tab
  const [activeTab, setActiveTab] = useState<'client' | 'consumption' | 'solar'>('client');
  const [zoomLevel, setZoomLevel] = useState(100);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isAIInvoiceModalOpen) return null;

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|webp)$/i)) {
      setErrorMsg('Formato no soportado. Por favor sube un archivo PDF o una imagen (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
      setSelectedFile({
        file,
        name: file.name,
        type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        dataUrl,
        base64,
      });
      // Start processing automatically
      processFileWithAI({
        file,
        name: file.name,
        type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        dataUrl,
        base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const processFileWithAI = async (fileObj: {
    file: File;
    name: string;
    type: string;
    dataUrl: string;
    base64: string;
  }) => {
    if (!geminiApiKey || geminiApiKey.trim().length === 0) {
      setErrorMsg('Para usar la extracción con IA, debes configurar tu API Key gratuita de Google AI Studio.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStep('Iniciando análisis multimodal con Google Gemini...');

    try {
      setTimeout(() => setProcessingStep('Identificando distribuidora (EDEESTE / EDESUR / EDENORTE), NIC y tarifas...'), 700);
      setTimeout(() => setProcessingStep('Leyendo gráfica de histórico de consumos (kWh) de los 12 meses...'), 1600);
      setTimeout(() => setProcessingStep('Calculando pre-dimensionamiento y cobertura solar recomendada...'), 2400);

      let result: ExtractedInvoiceData;
      if (window.electronAPI?.parseInvoiceWithAI) {
        const res = await window.electronAPI.parseInvoiceWithAI({
          fileBase64: fileObj.base64,
          mimeType: fileObj.type,
          fileName: fileObj.name,
          apiKey: geminiApiKey,
          model: geminiModel,
          panelPowerW: activeProject?.specs?.panelPowerW || 620,
        });
        if (!res.success || !res.data) {
          throw new Error(res.error || 'No se pudo extraer la información del documento.');
        }
        result = res.data;
      } else {
        result = await parseInvoiceWithGemini({
          fileBase64: fileObj.base64,
          mimeType: fileObj.type,
          fileName: fileObj.name,
          apiKey: geminiApiKey,
          model: geminiModel,
          panelPowerW: activeProject?.specs?.panelPowerW || 620,
        });
      }

      setExtractedData(result);
    } catch (err: any) {
      console.error('Error in AI extraction:', err);
      setErrorMsg(err.message || 'Error procesando la factura con IA.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpdateMonthlyConsumption = (index: number, val: number) => {
    if (!extractedData) return;
    const newArr = [...extractedData.monthlyConsumptionKWh];
    newArr[index] = Math.max(0, val);
    const newTotal = newArr.reduce((s, v) => s + v, 0);
    const newAvg = Math.round(newTotal / 12);
    
    // Recalculate suggested panels
    const panelWatts = activeProject?.specs?.panelPowerW || 620;
    const targetKWh = newTotal * 0.95;
    const capKWp = Math.round((targetKWh / 1450) * 100) / 100;
    const panelCount = Math.max(1, Math.ceil((capKWp * 1000) / panelWatts));

    setExtractedData({
      ...extractedData,
      monthlyConsumptionKWh: newArr,
      annualConsumptionKWh: newTotal,
      averageMonthlyKWh: newAvg,
      recommendedCapacityKWp: capKWp,
      recommendedPanelCount: panelCount,
    });
  };

  const handleApplyToActive = () => {
    if (!extractedData) return;
    applyExtractedInvoice(extractedData, false);
  };

  const handleApplyAsNew = () => {
    if (!extractedData) return;
    applyExtractedInvoice(extractedData, true);
  };

  const handleResetDocument = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setErrorMsg(null);
    setZoomLevel(100);
  };

  // Max consumption for chart scaling
  const maxConsumptionVal = extractedData
    ? Math.max(...extractedData.monthlyConsumptionKWh, 100)
    : 1000;

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
              : 'bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                <span>Extracción Inteligente de Facturas EDE</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                  IA Multimodal
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                Carga tu factura de EDEESTE, EDESUR, EDENORTE o CEPM en PDF o imagen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Settings button */}
            <button
              onClick={openAISettingsModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                geminiApiKey
                  ? isDark
                    ? 'bg-[#22222e] border-emerald-500/40 text-emerald-400 hover:bg-[#2c2c3c]'
                    : 'bg-white/10 border-emerald-400/40 text-emerald-300 hover:bg-white/20'
                  : 'bg-amber-500/20 border-amber-400/50 text-amber-300 hover:bg-amber-500/30 animate-bounce'
              }`}
              title="Configurar Google Gemini API Key"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{geminiApiKey ? `IA: ${geminiModel || '3.5-flash-lite'}` : 'Configurar API Key'}</span>
            </button>

            <button
              onClick={closeAIInvoiceModal}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* STATE 1: No file uploaded yet */}
          {!selectedFile && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />

              {!geminiApiKey && (
                <div
                  className={`mb-6 max-w-md p-4 rounded-xl border flex items-start gap-3 text-left ${
                    isDark
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-xs">Se requiere configurar la API Key</h4>
                    <p className="text-[11px] opacity-90">
                      Para extraer facturas de forma ilimitada con la capa gratuita de Google AI Studio, ingresa tu clave primero.
                    </p>
                    <button
                      onClick={openAISettingsModal}
                      className="text-[11px] font-bold text-amber-400 hover:underline pt-0.5 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Configurar API Key gratuita ahora</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-xl p-10 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ${
                  isDark
                    ? 'border-[#38384c] hover:border-emerald-500 bg-[#191922]/60 hover:bg-[#1f1f2c]'
                    : 'border-slate-300 hover:border-emerald-600 bg-white hover:bg-emerald-50/40'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Upload className="w-8 h-8 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Arrastra tu factura eléctrica aquí
                  </h4>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    o haz clic para seleccionar un archivo desde tu equipo
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF, PNG, JPG, JPEG, WEBP (Facturas EDE)</span>
                </div>
              </div>

              {/* Supported Distributor Badges */}
              <div className="mt-8 flex flex-col items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Compatible con Facturación Oficial Dominicana
                </span>
                <div className="flex items-center gap-2.5 flex-wrap justify-center">
                  {['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].map((ede) => (
                    <span
                      key={ede}
                      className={`text-xs px-3 py-1 rounded-lg font-bold border ${
                        isDark
                          ? 'bg-[#1d1d28] border-[#343448] text-zinc-300'
                          : 'bg-white border-slate-200 text-slate-700 shadow-xs'
                      }`}
                    >
                      {ede}
                    </span>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 max-w-md">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* STATE 2: Loading / Extracting */}
          {selectedFile && isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                  <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Analizando Factura con IA...
                </h4>
                <p className="text-xs text-emerald-400 font-semibold font-mono animate-pulse">
                  {processingStep || 'Extrayendo historial de consumo y datos del cliente...'}
                </p>
                <p className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Archivo: <span className="font-mono">{selectedFile.name}</span>
                </p>
              </div>
            </div>
          )}

          {/* STATE 3: Split-View with Document Preview & Verification Form */}
          {selectedFile && !isProcessing && extractedData && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* LEFT COLUMN: Document Preview */}
              <div
                className={`w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r transition-colors ${
                  isDark ? 'bg-[#101014] border-[#2a2a38]' : 'bg-slate-200/60 border-slate-300'
                }`}
              >
                {/* Viewer toolbar */}
                <div
                  className={`px-4 py-2 flex justify-between items-center border-b text-xs ${
                    isDark ? 'bg-[#16161d] border-[#2a2a38] text-zinc-300' : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  <span className="font-bold truncate max-w-[200px] flex items-center gap-1.5">
                    {selectedFile.type.includes('pdf') ? <FileText className="w-4 h-4 text-rose-400" /> : <ImageIcon className="w-4 h-4 text-cyan-400" />}
                    {selectedFile.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                      className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                      title="Alejar"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[10px] font-semibold w-10 text-center">{zoomLevel}%</span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
                      className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                      title="Acercar"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setZoomLevel(100)}
                      className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                      title="Restablecer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-4 w-px bg-zinc-700/40 mx-1" />
                    <button
                      onClick={handleResetDocument}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      Cambiar Archivo
                    </button>
                  </div>
                </div>

                {/* Document Display Area */}
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative">
                  {selectedFile.type.includes('pdf') ? (
                    <iframe
                      src={selectedFile.dataUrl}
                      title="Factura PDF"
                      className="w-full h-full rounded-lg shadow-md border-0"
                      style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                    />
                  ) : (
                    <img
                      src={selectedFile.dataUrl}
                      alt="Factura Eléctrica"
                      className="max-w-full max-h-full object-contain rounded-lg shadow-md transition-transform duration-200"
                      style={{ transform: `scale(${zoomLevel / 100})` }}
                    />
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Extracted Data & Validation (Human-in-the-Loop) */}
              <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-inherit">
                {/* Confidence & Navigation Tabs */}
                <div
                  className={`px-6 py-2.5 flex justify-between items-center border-b shrink-0 ${
                    isDark ? 'bg-[#181820] border-[#2a2a38]' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1">
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
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Nombre del Titular / Razón Social
                          </label>
                          <input
                            type="text"
                            value={extractedData.clientName}
                            onChange={(e) => setExtractedData({ ...extractedData, clientName: e.target.value })}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            NIC (No. Contrato)
                          </label>
                          <input
                            type="text"
                            value={extractedData.nic || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, nic: e.target.value })}
                            placeholder="Ej. 7333529"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40]' : 'bg-white border-slate-300 text-emerald-800'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            NIS / Suministro
                          </label>
                          <input
                            type="text"
                            value={extractedData.nis || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, nis: e.target.value })}
                            placeholder="Ej. 4115260"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            RNC / Cédula
                          </label>
                          <input
                            type="text"
                            value={extractedData.rnc || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, rnc: e.target.value })}
                            placeholder="Ej. 130549682"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            No. Medidor / Contador
                          </label>
                          <input
                            type="text"
                            value={extractedData.meterNumber || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, meterNumber: e.target.value })}
                            placeholder="Ej. 21002764"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Circuito Eléctrico
                          </label>
                          <input
                            type="text"
                            value={extractedData.circuit || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, circuit: e.target.value })}
                            placeholder="Ej. INVI03"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Distribuidora Eléctrica
                          </label>
                          <select
                            value={extractedData.distributor}
                            onChange={(e) => setExtractedData({ ...extractedData, distributor: e.target.value as any })}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-emerald-400' : 'bg-white border-slate-300 text-emerald-800'
                            }`}
                          >
                            <option value="EDEESTE">EDEESTE</option>
                            <option value="EDESUR">EDESUR</option>
                            <option value="EDENORTE">EDENORTE</option>
                            <option value="CEPM">CEPM</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Tarifa Eléctrica
                          </label>
                          <input
                            type="text"
                            value={extractedData.tariffCode}
                            onChange={(e) => setExtractedData({ ...extractedData, tariffCode: e.target.value })}
                            placeholder="Ej. BTD, BTS1, BTS2, MTD"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Voltaje / Fases
                          </label>
                          <input
                            type="text"
                            value={extractedData.voltagePhase || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, voltagePhase: e.target.value })}
                            placeholder="Ej. Baja 120/208 Trifásica"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Comprobante e-NCF
                          </label>
                          <input
                            type="text"
                            value={extractedData.eNCF || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, eNCF: e.target.value })}
                            placeholder="Ej. E310000696268"
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Provincia (Irradiación Solar)
                          </label>
                          <select
                            value={extractedData.province || 'Distrito Nacional'}
                            onChange={(e) => setExtractedData({ ...extractedData, province: e.target.value })}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          >
                            {RD_PROVINCES.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name} ({p.avgHSP} HSP)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-400">
                            Dirección de Suministro
                          </label>
                          <input
                            type="text"
                            value={extractedData.address || ''}
                            onChange={(e) => setExtractedData({ ...extractedData, address: e.target.value })}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
                              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {extractedData.aiNotes && (
                        <div
                          className={`p-3 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2 ${
                            isDark ? 'bg-[#191924] border-[#2e2e40] text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          <Bot className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Análisis de la IA: </span>
                            {extractedData.aiNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: 12-Month Consumption & Billing */}
                  {activeTab === 'consumption' && (
                    <div className="space-y-4">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div
                          className={`p-3 rounded-xl border ${
                            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
                          }`}
                        >
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Consumo Anual Total</span>
                          <p className="text-base font-extrabold text-emerald-400 font-mono">
                            {extractedData.annualConsumptionKWh.toLocaleString()} <span className="text-[10px] font-normal">kWh/a</span>
                          </p>
                        </div>
                        <div
                          className={`p-3 rounded-xl border ${
                            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
                          }`}
                        >
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Promedio Mensual</span>
                          <p className="text-base font-extrabold text-amber-400 font-mono">
                            {extractedData.averageMonthlyKWh.toLocaleString()} <span className="text-[10px] font-normal">kWh/m</span>
                          </p>
                        </div>
                        <div
                          className={`p-3 rounded-xl border ${
                            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
                          }`}
                        >
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Precio Energía</span>
                          <p className="text-base font-extrabold text-cyan-400 font-mono">
                            {extractedData.energyCostPerKWhDOP ? `RD$ ${extractedData.energyCostPerKWhDOP.toFixed(2)}` : 'N/D'}
                          </p>
                        </div>
                        <div
                          className={`p-3 rounded-xl border ${
                            isDark ? 'bg-[#1a1a26] border-[#2e2e44]' : 'bg-white border-slate-200'
                          }`}
                        >
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Total Facturado</span>
                          <p className="text-base font-extrabold text-rose-400 font-mono">
                            {extractedData.totalBilledAmountDOP ? `RD$ ${extractedData.totalBilledAmountDOP.toLocaleString()}` : 'N/D'}
                          </p>
                        </div>
                      </div>

                      {/* Financial & Technical Details Pill Banner */}
                      {(extractedData.peakDemandKW || extractedData.governmentSubsidyDOP || extractedData.powerFactor) && (
                        <div
                          className={`p-3 rounded-xl border text-[11px] grid grid-cols-2 sm:grid-cols-3 gap-2 ${
                            isDark ? 'bg-[#161622] border-[#2a2a3c] text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-800'
                          }`}
                        >
                          {extractedData.peakDemandKW && (
                            <div>
                              <span className="text-zinc-500 font-bold block text-[10px]">POTENCIA MÁXIMA (DEMANDA):</span>
                              <span className="font-mono font-bold text-emerald-400">{extractedData.peakDemandKW} kW</span>
                            </div>
                          )}
                          {extractedData.powerFactor && (
                            <div>
                              <span className="text-zinc-500 font-bold block text-[10px]">FACTOR DE POTENCIA / EFIC.:</span>
                              <span className="font-mono font-bold text-amber-400">{extractedData.powerFactor}</span>
                            </div>
                          )}
                          {extractedData.governmentSubsidyDOP && (
                            <div>
                              <span className="text-zinc-500 font-bold block text-[10px]">SUBSIDIO GOBIERNO RD$:</span>
                              <span className="font-mono font-bold text-cyan-400">RD$ {extractedData.governmentSubsidyDOP.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Visual Mini Bar Chart */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-2 ${
                          isDark ? 'bg-[#13131a] border-[#2a2a38]' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                            Histórico de 12 Meses (kWh)
                          </span>
                          <span className="text-[9px] text-emerald-400 font-mono font-semibold">
                            Ene a Dic (Año Natural)
                          </span>
                        </div>
                        <div className="h-24 flex items-end gap-1.5 pt-2">
                          {extractedData.monthlyConsumptionKWh.map((val, idx) => {
                            const pct = Math.min(100, Math.round((val / maxConsumptionVal) * 100));
                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div className="w-full bg-emerald-500/20 rounded-t h-20 flex items-end">
                                  <div
                                    className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t transition-all duration-300"
                                    style={{ height: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">
                                  {MONTH_NAMES[idx].slice(0, 3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 12 Editable Inputs */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">
                          Ajuste Manual por Mes (kWh)
                        </span>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {MONTH_NAMES.map((m, idx) => (
                            <div
                              key={m}
                              className={`p-2 rounded-xl border ${
                                isDark ? 'bg-[#181822] border-[#2a2a38]' : 'bg-white border-slate-200'
                              }`}
                            >
                              <label className="block text-[9px] font-bold uppercase text-zinc-400 truncate">
                                {m}
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={extractedData.monthlyConsumptionKWh[idx] || 0}
                                onChange={(e) => handleUpdateMonthlyConsumption(idx, parseFloat(e.target.value) || 0)}
                                className={`w-full mt-1 px-2 py-1 rounded-lg border text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500 ${
                                  isDark ? 'bg-[#101016] border-[#343448] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Suggested Solar Sizing */}
                  {activeTab === 'solar' && (
                    <div className="space-y-4">
                      <div
                        className={`p-4 rounded-xl border space-y-3 ${
                          isDark
                            ? 'bg-gradient-to-br from-[#18241e] to-[#14141c] border-emerald-800/50 text-emerald-100'
                            : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 text-emerald-950'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <SunMedium className="w-5 h-5 text-amber-400" />
                          <h4 className="font-extrabold text-sm">Dimensionamiento Solar Fotovoltaico Calculado</h4>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          La IA ha calculado automáticamente la capacidad de generación fotovoltaica recomendada para cubrir el{' '}
                          <strong>95% de la demanda anual</strong> del cliente en base al perfil de radiación solar de{' '}
                          <strong>{extractedData.province || 'Santo Domingo'}</strong>.
                        </p>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40' : 'bg-white border-emerald-200'}`}>
                            <span className="text-[10px] uppercase font-bold opacity-80">Potencia Sugerida</span>
                            <p className="text-xl font-black text-emerald-400 font-mono">
                              {extractedData.recommendedCapacityKWp} <span className="text-xs font-normal">kWp</span>
                            </p>
                          </div>
                          <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-emerald-700/40' : 'bg-white border-emerald-200'}`}>
                            <span className="text-[10px] uppercase font-bold opacity-80">Módulos Tier-1</span>
                            <p className="text-xl font-black text-amber-400 font-mono">
                              {extractedData.recommendedPanelCount} <span className="text-xs font-normal">Paneles ({activeProject?.specs?.panelPowerW || 620}W)</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`p-3.5 rounded-xl border space-y-2 text-xs ${
                          isDark ? 'bg-[#181822] border-[#2a2a38] text-zinc-300' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="font-bold block text-emerald-400">¿Qué sucederá al aplicar?</span>
                        <ul className="space-y-1 text-[11px] list-disc list-inside opacity-90">
                          <li>Se inyectarán los 12 meses de consumo en el simulador.</li>
                          <li>Se actualizarán los datos de cliente, distribuidora y tarifa.</li>
                          <li>Se ajustará automáticamente la cantidad de paneles para coincidir con la potencia requerida.</li>
                          <li>Se recalcularán al instante el Payback, VAN, TIR y las 9 páginas de la propuesta PDF.</li>
                        </ul>
                      </div>
                    </div>
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
                    Escanear Otra Factura
                  </button>

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    <button
                      onClick={handleApplyAsNew}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>Crear Nuevo Proyecto</span>
                    </button>

                    <button
                      onClick={handleApplyToActive}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aplicar a Proyecto Activo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STATE 4: Error after selecting file */}
          {selectedFile && !isProcessing && !extractedData && errorMsg && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  No se pudo procesar la factura
                </h4>
                <p className="text-xs text-rose-400">{errorMsg}</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleResetDocument}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                    isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Probar con otro archivo
                </button>
                <button
                  onClick={openAISettingsModal}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  Revisar API Key
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
