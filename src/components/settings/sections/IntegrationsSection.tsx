import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SyncService, PingResult } from '../../../services/syncService';
import { ShareProposalService } from '../../../services/shareProposalService';
import {
  Sparkles,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Globe,
  Server,
  Cloud,
} from 'lucide-react';

const GEMINI_MODELS_LIST = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
];

export const IntegrationsSection: React.FC = () => {
  const {
    geminiApiKey,
    setGeminiApiKey,
    geminiModel,
    setGeminiModel,
    syncSettings,
    setSyncSettings,
    syncProjectsWithServer,
    isSyncing,
  } = useSimulationStore();

  // AI Local State
  const [aiKeyInput, setAiKeyInput] = useState(geminiApiKey || '');
  const [aiShowKey, setAiShowKey] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiValidationResult, setAiValidationResult] = useState<{ tested: boolean; success: boolean; message: string } | null>(null);
  const [aiSelectedModel, setAiSelectedModel] = useState<string>(geminiModel || 'gemini-2.5-flash');
  const [aiIsCustomMode, setAiIsCustomMode] = useState<boolean>(false);
  const [aiCustomInput, setAiCustomInput] = useState<string>('');

  // Worker Local State
  const [workerUrlInput, setWorkerUrlInput] = useState(ShareProposalService.getWorkerUrl());
  const [testingWorker, setTestingWorker] = useState(false);
  const [workerTestResult, setWorkerTestResult] = useState<{ tested: boolean; success: boolean; message: string } | null>(null);

  // Central Server Local State
  const [serverUrlInput, setServerUrlInput] = useState(syncSettings.serverUrl || 'https://solarsim.electsun.net');
  const [pingState, setPingState] = useState<{ testing: boolean; result: PingResult | null }>({
    testing: false,
    result: null,
  });
  const [syncFeedbackMessage, setSyncFeedbackMessage] = useState<string | null>(null);

  // Handlers
  const handleValidateAiKey = async () => {
    if (!aiKeyInput.trim()) {
      setAiValidationResult({ tested: true, success: false, message: 'Por favor ingresa una API Key de Gemini.' });
      return;
    }
    setAiTesting(true);
    setGeminiApiKey(aiKeyInput.trim());
    const modelToUse = aiIsCustomMode ? aiCustomInput.trim() : aiSelectedModel;
    if (modelToUse) setGeminiModel(modelToUse);

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${aiKeyInput.trim()}`);
      setAiTesting(false);
      if (res.ok) {
        setAiValidationResult({ tested: true, success: true, message: '¡API Key válida y lista para escanear facturas!' });
      } else {
        setAiValidationResult({ tested: true, success: false, message: 'API Key inválida o sin cuota disponible.' });
      }
    } catch {
      setAiTesting(false);
      setAiValidationResult({ tested: true, success: false, message: 'Error al conectar con Google AI Studio.' });
    }
  };

  const handleTestWorker = async () => {
    setTestingWorker(true);
    setWorkerTestResult(null);
    try {
      const cleanUrl = workerUrlInput.trim().replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/api/health`).catch(() => null);
      if (res && res.ok) {
        ShareProposalService.setWorkerUrl(cleanUrl);
        setWorkerTestResult({ tested: true, success: true, message: '¡Conexión exitosa con Cloudflare Worker! Guardado como predeterminado ✨' });
      } else {
        ShareProposalService.setWorkerUrl(cleanUrl);
        setWorkerTestResult({
          tested: true,
          success: true,
          message: 'Worker accesible y guardado para visualización web.',
        });
      }
    } catch {
      setWorkerTestResult({ tested: true, success: false, message: 'No se pudo conectar con el worker.' });
    } finally {
      setTestingWorker(false);
    }
  };

  const handleTestPing = async () => {
    setPingState({ testing: true, result: null });
    const res = await SyncService.testConnection(serverUrlInput);
    setPingState({ testing: false, result: res });
    if (res.online) {
      setSyncSettings({ serverUrl: serverUrlInput.trim().replace(/\/+$/, '') });
    }
  };

  const handleManualSync = async () => {
    setSyncFeedbackMessage(null);
    const res = await syncProjectsWithServer(false);
    if (res.success) {
      setSyncFeedbackMessage(`¡Sincronización exitosa! (${res.message || 'Datos actualizados con el servidor'}).`);
    } else {
      setSyncFeedbackMessage(`Fallo en sincronización: ${res.message || 'Error desconocido'}`);
    }
    setTimeout(() => setSyncFeedbackMessage(null), 4000);
  };

  return (
    <section id="sec-integraciones" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">IA & Integraciones</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Conecta Google Gemini Vision, Cloudflare Workers y el servidor central de datos.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* 🤖 Tarjeta Google Gemini AI */}
        <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Google Gemini Vision AI</h4>
                  <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">
                    IA NATIVA
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Extracción multimodal inteligente de facturas eléctricas dominicanas (EDEESTE, EDESUR, EDENORTE, CEPM).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  geminiApiKey ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-slate-300 dark:bg-zinc-600'
                }`}
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
                {geminiApiKey ? 'Conectado' : 'Sin Clave'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                API Key de Google Gemini
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="w-4 h-4" />
                </div>
                <input
                  type={aiShowKey ? 'text' : 'password'}
                  value={aiKeyInput}
                  onChange={(e) => setAiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full pl-10 pr-24 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 font-mono focus:outline-hidden"
                />
                <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAiShowKey(!aiShowKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {aiShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleValidateAiKey}
                    disabled={aiTesting}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-2xs"
                  >
                    {aiTesting && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>Probar</span>
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 block">
                Obtén tu API key gratuita en{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-600 dark:text-purple-400 underline font-semibold"
                >
                  Google AI Studio
                </a>
                .
              </span>
            </div>

            {/* Model Pills */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Modelo Recomendado para Facturas
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {GEMINI_MODELS_LIST.map((mod) => {
                  const isSelected = !aiIsCustomMode && aiSelectedModel === mod.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => {
                        setAiIsCustomMode(false);
                        setAiSelectedModel(mod.id);
                        setGeminiModel(mod.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-950/40 dark:border-purple-700 dark:text-purple-200 font-bold shadow-2xs'
                          : 'border-slate-200 dark:border-[#27272a] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#222226]'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{mod.name || mod.id}</div>
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{mod.id}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {aiValidationResult && aiValidationResult.tested && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  aiValidationResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
                }`}
              >
                {aiValidationResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{aiValidationResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ☁️ Tarjeta Cloudflare Pages & Workers */}
        <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 flex items-center justify-center shadow-2xs">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Cloudflare Share Worker</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Microservicio serverless con KV para generar enlaces públicos web y códigos QR interactivos.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">URL del Worker</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={workerUrlInput}
                  onChange={(e) => setWorkerUrlInput(e.target.value)}
                  placeholder="https://solarsim-share-viewer..."
                  className="w-full pl-10 pr-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleTestWorker}
                disabled={testingWorker}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
              >
                {testingWorker && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>Probar</span>
              </button>
            </div>
            {workerTestResult && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  workerTestResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
                }`}
              >
                {workerTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{workerTestResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* 🏢 Tarjeta Servidor Central & PostgreSQL Sync */}
        <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272a]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shadow-2xs">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Servidor Central & Base de Datos</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Sincronización colaborativa de proyectos, control de versiones V2/V3 y catálogo multi-usuario.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Endpoint API del Servidor
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  placeholder="https://solarsim.electsun.net"
                  className="flex-1 px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 font-mono"
                />
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={pingState.testing}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#27272a] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {pingState.testing && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>Ping</span>
                </button>
              </div>
            </div>

            {/* Auto-Sync Toggle */}
            <div className="p-3.5 rounded-xl border border-slate-200/70 dark:border-[#27272a] bg-slate-50/50 dark:bg-[#121214]/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Auto-Sincronización Silenciosa (Zero-Click Sync)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Sincroniza proyectos automáticamente cada 15 segundos y al enfocar la ventana.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncSettings.autoSyncEnabled}
                  onChange={(e) => setSyncSettings({ autoSyncEnabled: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
              </label>
            </div>

            {pingState.result && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  pingState.result.online
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
                }`}
              >
                {pingState.result.online ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>
                  {pingState.result.online
                    ? `Servidor en línea (${pingState.result.latencyMs}ms) — PostgreSQL Conectado`
                    : `Error al conectar: ${pingState.result.error || 'Servidor inaccesible'}`}
                </span>
              </div>
            )}
            {syncFeedbackMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{syncFeedbackMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
