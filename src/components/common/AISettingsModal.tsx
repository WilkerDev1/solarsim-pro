import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { validateGeminiApiKey } from '../../services/geminiInvoiceService';
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
  const [selectedModel, setSelectedModel] = useState<'gemini-2.0-flash' | 'gemini-1.5-flash' | 'gemini-1.5-pro'>('gemini-2.0-flash');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
    modelName?: string;
  }>({ tested: false, success: false });

  useEffect(() => {
    if (isAISettingsModalOpen) {
      setInputKey(geminiApiKey || '');
      setSelectedModel(geminiModel || 'gemini-2.0-flash');
      setValidationResult({ tested: false, success: false });
    }
  }, [isAISettingsModalOpen, geminiApiKey, geminiModel]);

  if (!isAISettingsModalOpen) return null;

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

    setIsValidating(true);
    setValidationResult({ tested: false, success: false });

    try {
      // Validate via electronAPI if available or direct fetch
      let res: { success: boolean; error?: string; modelName?: string };
      if (window.electronAPI?.validateGeminiApiKey) {
        res = await window.electronAPI.validateGeminiApiKey(trimmed);
      } else {
        res = await validateGeminiApiKey(trimmed, selectedModel);
      }

      if (res.success) {
        setGeminiApiKey(trimmed);
        setGeminiModel(selectedModel);
        setValidationResult({
          tested: true,
          success: true,
          modelName: res.modelName || selectedModel,
          message: '¡Conexión exitosa con Google AI Studio! Clave guardada de forma segura.',
        });
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
        className={`border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200 transition-colors ${
          isDark ? 'bg-[#18181f] border-[#2e2e3a] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 flex justify-between items-center shrink-0 border-b transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-slate-950 via-[#1c1c26] to-[#18181f] border-[#2e2e3a] text-white'
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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                  Google Gemini
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                Motor de extracción multimodal para facturas eléctricas EDE
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

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Banner Free Tier */}
          <div
            className={`border rounded-xl p-3.5 flex items-start gap-3 ${
              isDark
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-xs">Capa Gratuita de Google AI Studio</h4>
              <p className="opacity-90 text-[11px] leading-relaxed">
                Puedes obtener tu propia API Key 100% gratuita con hasta <strong>1,500 solicitudes por día</strong> en Google AI Studio para procesar facturas en segundos.
              </p>
              <button
                onClick={handleOpenGoogleAIStudio}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline pt-1 cursor-pointer"
              >
                <span>Obtener API Key gratuita en aistudio.google.com</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-1.5">
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              Google Gemini API Key
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`} />
              </div>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
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

          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              Modelo de Inteligencia Artificial
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() => setSelectedModel('gemini-2.0-flash')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedModel === 'gemini-2.0-flash'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-xs'
                      : 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-xs'
                    : isDark
                    ? 'bg-[#14141a] border-[#2a2a38] text-zinc-400 hover:border-zinc-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    Gemini 2.0 Flash
                  </span>
                  {selectedModel === 'gemini-2.0-flash' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </div>
                <p className="text-[10px] opacity-80 mt-1">Recomendado. Ultrarrápido y máxima precisión en tablas y gráficas de facturas.</p>
              </div>

              <div
                onClick={() => setSelectedModel('gemini-1.5-flash')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedModel === 'gemini-1.5-flash'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-xs'
                      : 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-xs'
                    : isDark
                    ? 'bg-[#14141a] border-[#2a2a38] text-zinc-400 hover:border-zinc-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-cyan-400" />
                    Gemini 1.5 Flash
                  </span>
                  {selectedModel === 'gemini-1.5-flash' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </div>
                <p className="text-[10px] opacity-80 mt-1">Alternativa ligera para conexiones lentas o límites de cuota estrictos.</p>
              </div>
            </div>
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

          {/* Actions */}
          <div className={`pt-3 flex justify-between items-center border-t ${isDark ? 'border-[#2e2e3a]' : 'border-slate-200'}`}>
            <button
              onClick={closeAISettingsModal}
              className={`px-4 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#383848] text-zinc-300 hover:bg-[#242430]'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
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
              <span>{isValidating ? 'Verificando con Google AI...' : 'Probar y Guardar Clave'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
