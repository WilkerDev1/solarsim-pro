import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  validateGeminiApiKey,
  fetchAvailableGeminiModels,
  DEFAULT_POPULAR_MODELS,
} from '../../services/geminiInvoiceService';
import { GeminiModelInfo } from '../../types/aiInvoice';
import {
  X,
  Key,
  Bot,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Zap,
  Cpu,
  Check,
  Radio,
  Search,
} from 'lucide-react';

export const AISettingsModal: React.FC = () => {
  const {
    isAISettingsModalOpen,
    closeAISettingsModal,
    geminiApiKey,
    setGeminiApiKey,
    geminiModel,
    setGeminiModel,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';

  const [inputKey, setInputKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash-lite');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [modelsList, setModelsList] = useState<GeminiModelInfo[]>(DEFAULT_POPULAR_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
    modelName?: string;
  }>({ tested: false, success: false });

  useEffect(() => {
    if (isAISettingsModalOpen) {
      const activeKey = geminiApiKey || '';
      const activeModel = geminiModel || 'gemini-3.5-flash-lite';
      setInputKey(activeKey);
      setSelectedModel(activeModel);
      setValidationResult({ tested: false, success: false });

      const isPreset = DEFAULT_POPULAR_MODELS.some((m) => m.id === activeModel);
      if (!isPreset && activeModel) {
        setIsCustomMode(true);
        setCustomModelInput(activeModel);
      } else {
        setIsCustomMode(false);
      }

      if (activeKey.trim().length > 10) {
        handleAutoDetectModels(activeKey, activeModel);
      }
    }
  }, [isAISettingsModalOpen, geminiApiKey, geminiModel]);

  if (!isAISettingsModalOpen) return null;

  const handleAutoDetectModels = async (keyToUse?: string, currentModel?: string) => {
    const key = (keyToUse || inputKey).trim();
    if (!key) return;

    setIsLoadingModels(true);
    try {
      let result: { success: boolean; error?: string; models?: GeminiModelInfo[] };
      if (window.electronAPI?.listGeminiModels) {
        result = await window.electronAPI.listGeminiModels(key);
      } else {
        result = await fetchAvailableGeminiModels(key);
      }

      if (result.success && result.models && result.models.length > 0) {
        // Merge with friendly descriptions
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

        // Ensure 3.5-flash-lite, 3.6-flash, 3.7-flash, 2.0-flash are present in the list
        DEFAULT_POPULAR_MODELS.forEach((preset) => {
          if (!merged.some((m) => m.id === preset.id)) {
            merged.push(preset);
          }
        });

        setModelsList(merged);

        // If current model wasn't set, pick gemini-3.5-flash-lite or first recommended
        if (!currentModel && !selectedModel) {
          const rec = merged.find((m) => m.id.includes('3.5-flash-lite')) || merged[0];
          if (rec) setSelectedModel(rec.id);
        }
      }
    } catch (err) {
      console.warn('Could not auto-detect models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleTestAndSave = async () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setValidationResult({
        tested: true,
        success: false,
        message: 'Por favor ingresa una API Key de Google Gemini.',
      });
      return;
    }

    const modelToUse = isCustomMode ? (customModelInput.trim() || 'gemini-3.5-flash-lite') : selectedModel;

    setIsValidating(true);
    setValidationResult({ tested: false, success: false });

    try {
      let res: { success: boolean; error?: string; modelName?: string; models?: any[] };
      if (window.electronAPI?.validateGeminiApiKey) {
        res = await window.electronAPI.validateGeminiApiKey(trimmed, modelToUse);
      } else {
        res = await validateGeminiApiKey(trimmed, modelToUse);
      }

      if (res.success) {
        setGeminiApiKey(trimmed);
        setGeminiModel(modelToUse);
        setValidationResult({
          tested: true,
          success: true,
          modelName: res.modelName || modelToUse,
          message: `¡Conexión exitosa con Google AI Studio (${res.modelName || modelToUse})! Clave y modelo guardados.`,
        });

        if (res.models && res.models.length > 0) {
          setModelsList(res.models);
        }
      } else {
        setValidationResult({
          tested: true,
          success: false,
          message: res.error || 'No se pudo autenticar con Google AI Studio.',
        });
      }
    } catch (err: any) {
      setValidationResult({
        tested: true,
        success: false,
        message: err.message || 'Error de red al conectar con Google AI.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleOpenGoogleAIStudio = () => {
    const url = 'https://aistudio.google.com/app/apikey';
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200 transition-colors ${
          isDark ? 'bg-[#16161c] border-[#2e2e3e] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 flex justify-between items-center shrink-0 border-b transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-slate-950 via-[#1c1c28] to-[#16161c] border-[#2e2e3e] text-white'
              : 'bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-400/30">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                <span>Configuración de Inteligencia Artificial</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                  Google Gemini
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                Motor de visión multimodal para facturas eléctricas de República Dominicana
              </p>
            </div>
          </div>
          <button
            onClick={closeAISettingsModal}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Banner Free Tier */}
          <div
            className={`border rounded-xl p-3.5 flex items-start gap-3 ${
              isDark
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs">Capa Gratuita de Google AI Studio</h4>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Hasta 500-1,500 RPD
                </span>
              </div>
              <p className="opacity-90 text-[11px] leading-relaxed">
                Obtén tu API Key gratuita en segundos para procesar facturas con <strong>Gemini 3.5 Flash Lite</strong>, <strong>Gemini 3.6 Flash</strong> y <strong>Gemini 2.0 Flash</strong>.
              </p>
              <button
                onClick={handleOpenGoogleAIStudio}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline pt-1 cursor-pointer"
              >
                <span>Obtener API Key en aistudio.google.com/app/apikey</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                Google Gemini API Key
              </label>
              {inputKey.trim().length > 10 && (
                <button
                  onClick={() => handleAutoDetectModels(inputKey)}
                  disabled={isLoadingModels}
                  className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  <span>{isLoadingModels ? 'Detectando...' : 'Auto-detectar Modelos'}</span>
                </button>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`} />
              </div>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  if (e.target.value.trim().length > 15) {
                    handleAutoDetectModels(e.target.value);
                  }
                }}
                placeholder="AIzaSy..."
                className={`w-full pl-9 pr-3 py-2.5 rounded-xl border font-mono text-xs transition-colors outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isDark
                    ? 'bg-[#121216] border-[#2e2e3e] text-white placeholder-zinc-600'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <p className={`text-[10px] flex items-center gap-1 pt-0.5 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Tu API Key se almacena localmente de forma privada en tu dispositivo y nunca se comparte.
            </p>
          </div>

          {/* Model Selector Section */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center">
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                Modelo Seleccionado
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCustomMode(!isCustomMode)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-white cursor-pointer underline"
                >
                  {isCustomMode ? 'Elegir de la lista' : 'Escribir modelo personalizado'}
                </button>
              </div>
            </div>

            {/* Custom text input if custom mode */}
            {isCustomMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="ej. gemini-3.5-flash-lite o gemini-3.6-flash"
                  className={`w-full px-3 py-2.5 rounded-xl border font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isDark ? 'bg-[#121216] border-[#2e2e3e] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <p className="text-[10px] text-zinc-500">
                  Ingresa el identificador exacto de cualquier modelo publicado en Google AI Studio.
                </p>
              </div>
            ) : (
              /* Models Cards Grid */
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {modelsList.map((m) => {
                  const isSelected = selectedModel === m.id;
                  const isLite = m.id.includes('flash-lite') || m.id.includes('3.5-flash-lite');
                  const is36 = m.id.includes('3.6-flash') || m.id.includes('3.7-flash');

                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 flex items-start justify-between gap-3 ${
                        isSelected
                          ? isDark
                            ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                            : 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-xs'
                          : isDark
                          ? 'bg-[#121218] border-[#262634] text-zinc-300 hover:border-zinc-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs flex items-center gap-1.5">
                            {isLite ? (
                              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            ) : is36 ? (
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {m.name}
                          </span>

                          {isLite && (
                            <span className="text-[9px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              500 RPD Gratis
                            </span>
                          )}

                          {m.rateLimitNote && !isLite && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-700/40 text-zinc-400 font-mono">
                              {m.rateLimitNote}
                            </span>
                          )}

                          {m.isRecommended && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-semibold font-mono">
                              Recomendado
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] opacity-80 leading-relaxed">{m.description}</p>
                        <span className="text-[9px] font-mono opacity-60 block">ID: {m.id}</span>
                      </div>

                      <div className="pt-0.5">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : isDark
                              ? 'border-zinc-600'
                              : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Validation Feedback Message */}
          {validationResult.tested && (
            <div
              className={`border rounded-xl p-3 flex items-start gap-2.5 animate-in fade-in duration-200 ${
                validationResult.success
                  ? isDark
                    ? 'bg-emerald-950/50 border-emerald-700/80 text-emerald-200'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : isDark
                  ? 'bg-rose-950/50 border-rose-800/80 text-rose-200'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {validationResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-bold text-[11px]">
                  {validationResult.success ? 'Conexión Validada con Éxito' : 'Fallo en la Validación'}
                </p>
                <p className="text-[10px] opacity-90">{validationResult.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`p-4 flex justify-between items-center border-t shrink-0 ${isDark ? 'border-[#2e2e3e] bg-[#121218]' : 'border-slate-200 bg-slate-50'}`}>
          <button
            onClick={closeAISettingsModal}
            className={`px-4 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
              isDark
                ? 'border-[#383848] text-zinc-300 hover:bg-[#242430]'
                : 'border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Cerrar
          </button>
          <button
            onClick={handleTestAndSave}
            disabled={isValidating || !inputKey.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 active:scale-95"
          >
            {isValidating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>{isValidating ? 'Verificando con Google AI...' : 'Probar y Guardar Modelo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
