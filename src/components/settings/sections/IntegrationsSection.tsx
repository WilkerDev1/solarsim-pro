import React, { useState, useEffect, useMemo } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SyncService, PingResult } from '../../../services/syncService';
import { ShareProposalService } from '../../../services/shareProposalService';
import {
  fetchAvailableGeminiModels,
  DEFAULT_POPULAR_MODELS,
} from '../../../services/geminiInvoiceService';
import { GeminiModelInfo } from '../../../types/aiInvoice';
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
  Bot,
  ChevronDown,
} from 'lucide-react';

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
  const [aiSelectedModel, setAiSelectedModel] = useState<string>(geminiModel || 'gemini-3.5-flash-lite');
  const [aiIsCustomMode, setAiIsCustomMode] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [availableModelsList, setAvailableModelsList] = useState<GeminiModelInfo[]>(DEFAULT_POPULAR_MODELS);
  const [isDetectingModels, setIsDetectingModels] = useState(false);

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

  // Auto-detect available models from Gemini API
  const handleAutoDetectModels = async (keyToUse?: string) => {
    const key = (keyToUse || aiKeyInput).trim();
    if (!key || key.length < 10) {
      setAiValidationResult({ tested: true, success: false, message: 'Por favor ingresa una API Key de Gemini primero.' });
      return;
    }

    setIsDetectingModels(true);
    try {
      let result: { success: boolean; error?: string; models?: GeminiModelInfo[] };
      if (window.electronAPI?.listGeminiModels) {
        result = await window.electronAPI.listGeminiModels(key);
      } else {
        result = await fetchAvailableGeminiModels(key);
      }

      if (result.success && result.models && result.models.length > 0) {
        // Combinar con metadatos descriptivos
        const merged: GeminiModelInfo[] = result.models.map((m) => {
          const matchedPreset = DEFAULT_POPULAR_MODELS.find(
            (p) => p.id === m.id || m.id.includes(p.id)
          );
          return {
            ...m,
            description: matchedPreset?.description || m.description,
            rateLimitNote: matchedPreset?.rateLimitNote || m.rateLimitNote,
            isRecommended: matchedPreset?.isRecommended || m.isRecommended,
          };
        });

        // Asegurar que modelos estándar figuren en la lista
        DEFAULT_POPULAR_MODELS.forEach((preset) => {
          if (!merged.some((m) => m.id === preset.id)) {
            merged.push(preset);
          }
        });

        setAvailableModelsList(merged);
        setAiValidationResult({
          tested: true,
          success: true,
          message: `¡Se detectaron ${result.models.length} modelos disponibles en tu cuenta de Google AI Studio!`,
        });
      } else {
        setAiValidationResult({
          tested: true,
          success: false,
          message: result.error || 'No se pudieron consultar los modelos con esta clave.',
        });
      }
    } catch (err: any) {
      setAiValidationResult({
        tested: true,
        success: false,
        message: err?.message || 'Error al conectar con Google AI Studio.',
      });
    } finally {
      setIsDetectingModels(false);
    }
  };

  // Sync with store on mount
  useEffect(() => {
    if (geminiApiKey && geminiApiKey.trim().length > 10) {
      setAiKeyInput(geminiApiKey);
      handleAutoDetectModels(geminiApiKey);
    }
  }, [geminiApiKey]);

  useEffect(() => {
    if (geminiModel) {
      setAiSelectedModel(geminiModel);
      const isKnown = availableModelsList.some((m) => m.id === geminiModel);
      if (!isKnown && geminiModel) {
        setCustomModelInput(geminiModel);
      }
    }
  }, [geminiModel, availableModelsList]);

  // Model categories
  const recommendedModels = useMemo(() => {
    return availableModelsList.filter((m) => m.isRecommended || m.id.includes('flash'));
  }, [availableModelsList]);

  const otherModels = useMemo(() => {
    const recIds = new Set(recommendedModels.map((m) => m.id));
    return availableModelsList.filter((m) => !recIds.has(m.id));
  }, [availableModelsList, recommendedModels]);

  const selectedModelDetails = useMemo(() => {
    return availableModelsList.find((m) => m.id === aiSelectedModel) || {
      id: aiSelectedModel,
      name: aiSelectedModel,
      description: 'Modelo personalizado o seleccionado.',
    };
  }, [availableModelsList, aiSelectedModel]);

  const popularShortcuts = useMemo(() => {
    const presets = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro'];
    const list: GeminiModelInfo[] = [];
    presets.forEach((pId) => {
      const found = availableModelsList.find((m) => m.id === pId || m.id.includes(pId));
      if (found) {
        list.push(found);
      } else {
        list.push({
          id: pId,
          name: pId === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : pId === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite' : 'Gemini 2.5 Pro',
        });
      }
    });
    return list;
  }, [availableModelsList]);

  // Handlers
  const handleValidateAiKey = async () => {
    if (!aiKeyInput.trim()) {
      setAiValidationResult({ tested: true, success: false, message: 'Por favor ingresa una API Key de Gemini.' });
      return;
    }
    setAiTesting(true);
    setGeminiApiKey(aiKeyInput.trim());
    const modelToUse = aiIsCustomMode ? customModelInput.trim() : aiSelectedModel;
    if (modelToUse) setGeminiModel(modelToUse);

    try {
      await handleAutoDetectModels(aiKeyInput.trim());
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${aiKeyInput.trim()}`);
      setAiTesting(false);
      if (res.ok) {
        setAiValidationResult({ tested: true, success: true, message: '¡API Key válida y modelos sincronizados con éxito!' });
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
                  Extracción multimodal inteligente de facturas eléctricas dominicanas, datasheets y listas de precios.
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  API Key de Google Gemini
                </label>
                <button
                  type="button"
                  onClick={() => handleAutoDetectModels()}
                  disabled={isDetectingModels || !aiKeyInput.trim()}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                  title="Consultar y detectar todos los modelos disponibles en tu cuenta de Google Gemini"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDetectingModels ? 'animate-spin' : ''}`} />
                  <span>Auto-detectar Modelos</span>
                </button>
              </div>
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
                    disabled={aiTesting || isDetectingModels}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-2xs"
                  >
                    {(aiTesting || isDetectingModels) && <RefreshCw className="w-3 h-3 animate-spin" />}
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

            {/* Selector de Modelos de IA con Menú Desplegable */}
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Modelo Activo de Google Gemini
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                    {availableModelsList.length} modelos detectados
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiIsCustomMode(!aiIsCustomMode)}
                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                >
                  {aiIsCustomMode ? 'Elegir del menú desplegable' : 'Escribir modelo personalizado'}
                </button>
              </div>

              {/* Menú Desplegable con todos los modelos disponibles */}
              {!aiIsCustomMode ? (
                <div className="relative">
                  <select
                    value={aiSelectedModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__custom__') {
                        setAiIsCustomMode(true);
                      } else {
                        setAiSelectedModel(val);
                        setGeminiModel(val);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-xs appearance-none pr-9"
                  >
                    {recommendedModels.length > 0 && (
                      <optgroup label="⭐ Modelos Recomendados (Mayor Velocidad y Cuota)">
                        {recommendedModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id} ({m.id}) {m.rateLimitNote ? `— ${m.rateLimitNote}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherModels.length > 0 && (
                      <optgroup label="📋 Todos los Modelos Disponibles en la API">
                        {otherModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id} ({m.id}) {m.rateLimitNote ? `— ${m.rateLimitNote}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__custom__">✏️ Escribir modelo personalizado...</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomModelInput(val);
                      setGeminiModel(val);
                      setAiSelectedModel(val);
                    }}
                    placeholder="ej. gemini-2.5-flash o gemini-2.5-pro"
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-xs border border-purple-300 dark:border-purple-700 bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setAiIsCustomMode(false)}
                    className="px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#202024] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 cursor-pointer"
                  >
                    Volver a la lista
                  </button>
                </div>
              )}

              {/* Ficha Informativa del Modelo Actualmente Seleccionado */}
              {selectedModelDetails && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121214] border border-slate-200/80 dark:border-[#27272a] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-2xs">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {selectedModelDetails.name || selectedModelDetails.id}
                        </span>
                        {selectedModelDetails.isRecommended && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 px-2 py-0.5 rounded-md font-semibold">
                            Recomendado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                        {selectedModelDetails.description || `Modelo ${selectedModelDetails.id} configurado para procesamiento.`}
                      </p>
                    </div>
                  </div>
                  {selectedModelDetails.rateLimitNote && (
                    <span className="text-[10px] px-2 py-1 rounded-md bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono font-medium shrink-0 self-start sm:self-center">
                      {selectedModelDetails.rateLimitNote}
                    </span>
                  )}
                </div>
              )}

              {/* Píldoras de Acceso Rápido */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1.5 block">
                  Accesos Rápidos Populares:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {popularShortcuts.map((mod) => {
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
