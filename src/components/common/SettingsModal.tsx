import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  X,
  Settings,
  Cloud,
  User,
  Users,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  LogIn,
  UserPlus,
  Activity,
  Sparkles,
  Bot,
  Laptop,
  ExternalLink,
  AlertTriangle,
  Zap,
  Cpu,
  Check,
  Layers,
} from 'lucide-react';
import { EquipmentManagerSettingsTab } from './EquipmentManagerSettingsTab';
import { SyncService, PingResult } from '../../services/syncService';
import {
  validateGeminiApiKey,
  fetchAvailableGeminiModels,
  DEFAULT_POPULAR_MODELS,
} from '../../services/geminiInvoiceService';
import { GeminiModelInfo } from '../../types/aiInvoice';
import { UserRole, UserProfile } from '../../types';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settingsActiveTab,
    setSettingsActiveTab,
    syncSettings,
    setSyncSettings,
    loginUser,
    registerUser,
    logoutUser,
    syncProjectsWithServer,
    isSyncing,
    syncFeedbackMessage,
    geminiApiKey,
    setGeminiApiKey,
    geminiModel,
    setGeminiModel,
    sidebarTheme,
    equipmentCatalog,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';

  // Local state for Cloud Sync Tab
  const [serverUrlInput, setServerUrlInput] = useState(syncSettings.serverUrl || 'http://10.0.0.103');
  const [pingState, setPingState] = useState<{ testing: boolean; result: PingResult | null }>({
    testing: false,
    result: null,
  });

  // Local state for Auth Tab
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regOrgName, setRegOrgName] = useState('Electsun Dominicana');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Local state for Admin User Management
  const [companyUsers, setCompanyUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('EDITOR');
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local state for AI Gemini Tab (matching AISettingsModal)
  const [aiInputKey, setAiInputKey] = useState('');
  const [aiSelectedModel, setAiSelectedModel] = useState<string>('gemini-3.5-flash-lite');
  const [aiCustomModelInput, setAiCustomModelInput] = useState('');
  const [aiIsCustomMode, setAiIsCustomMode] = useState(false);
  const [aiModelsList, setAiModelsList] = useState<GeminiModelInfo[]>(DEFAULT_POPULAR_MODELS);
  const [aiIsLoadingModels, setAiIsLoadingModels] = useState(false);
  const [aiIsValidating, setAiIsValidating] = useState(false);
  const [aiValidationResult, setAiValidationResult] = useState<{
    tested: boolean;
    success: boolean;
    message?: string;
    modelName?: string;
  }>({ tested: false, success: false });

  // Sync serverUrlInput with store
  useEffect(() => {
    setServerUrlInput(syncSettings.serverUrl || 'http://10.0.0.103');
  }, [syncSettings.serverUrl]);

  // Sync AI state on modal open
  useEffect(() => {
    if (isSettingsModalOpen) {
      const activeKey = geminiApiKey || '';
      const activeModel = geminiModel || 'gemini-3.5-flash-lite';
      setAiInputKey(activeKey);
      setAiSelectedModel(activeModel);
      setAiValidationResult({ tested: false, success: false });

      const isPreset = DEFAULT_POPULAR_MODELS.some((m) => m.id === activeModel);
      if (!isPreset && activeModel) {
        setAiIsCustomMode(true);
        setAiCustomModelInput(activeModel);
      } else {
        setAiIsCustomMode(false);
      }

      if (activeKey.trim().length > 10) {
        handleAutoDetectAIModels(activeKey, activeModel);
      }
    }
  }, [isSettingsModalOpen, geminiApiKey, geminiModel]);

  // Fetch users when admin opens account tab
  useEffect(() => {
    if (isSettingsModalOpen && settingsActiveTab === 'account' && syncSettings.currentUser?.role === 'ADMIN' && syncSettings.authToken) {
      loadUsers();
    }
  }, [isSettingsModalOpen, settingsActiveTab, syncSettings.currentUser?.role, syncSettings.authToken]);

  if (!isSettingsModalOpen) return null;

  const handleAutoDetectAIModels = async (keyToUse?: string, currentModel?: string) => {
    const key = (keyToUse || aiInputKey).trim();
    if (!key) return;

    setAiIsLoadingModels(true);
    try {
      let result: { success: boolean; error?: string; models?: GeminiModelInfo[] };
      if (window.electronAPI?.listGeminiModels) {
        result = await window.electronAPI.listGeminiModels(key);
      } else {
        result = await fetchAvailableGeminiModels(key);
      }

      if (result.success && result.models && result.models.length > 0) {
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

        DEFAULT_POPULAR_MODELS.forEach((preset) => {
          if (!merged.some((m) => m.id === preset.id)) {
            merged.push(preset);
          }
        });

        setAiModelsList(merged);

        if (!currentModel && !aiSelectedModel) {
          const rec = merged.find((m) => m.id.includes('3.5-flash-lite')) || merged[0];
          if (rec) setAiSelectedModel(rec.id);
        }
      }
    } catch (err) {
      console.warn('Could not auto-detect models:', err);
    } finally {
      setAiIsLoadingModels(false);
    }
  };

  const handleTestAndSaveAI = async () => {
    const trimmed = aiInputKey.trim();
    if (!trimmed) {
      setAiValidationResult({
        tested: true,
        success: false,
        message: 'Por favor ingresa una API Key de Google Gemini.',
      });
      return;
    }

    const modelToUse = aiIsCustomMode ? (aiCustomModelInput.trim() || 'gemini-3.5-flash-lite') : aiSelectedModel;

    setAiIsValidating(true);
    setAiValidationResult({ tested: false, success: false });

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
        setAiValidationResult({
          tested: true,
          success: true,
          modelName: res.modelName || modelToUse,
          message: `¡Conexión exitosa con Google AI Studio (${res.modelName || modelToUse})! Clave y modelo guardados.`,
        });

        if (res.models && res.models.length > 0) {
          setAiModelsList(res.models);
        }
      } else {
        setAiValidationResult({
          tested: true,
          success: false,
          message: res.error || 'No se pudo autenticar con Google AI Studio.',
        });
      }
    } catch (err: any) {
      setAiValidationResult({
        tested: true,
        success: false,
        message: err.message || 'Error de red al conectar con Google AI.',
      });
    } finally {
      setAiIsValidating(false);
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

  const loadUsers = async () => {
    if (!syncSettings.authToken) return;
    setLoadingUsers(true);
    try {
      const list = await SyncService.getCompanyUsers(syncSettings.serverUrl, syncSettings.authToken);
      setCompanyUsers(list);
    } catch {
      // Ignorar fallos silenciosos
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleTestConnection = async () => {
    setPingState({ testing: true, result: null });
    const res = await SyncService.testConnection(serverUrlInput);
    setPingState({ testing: false, result: res });
    if (res.online) {
      setSyncSettings({ serverUrl: serverUrlInput.trim() });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    const res = await loginUser(loginEmail, loginPassword);
    setAuthLoading(false);
    if (res.success) {
      setAuthSuccess('¡Sesión iniciada correctamente!');
      setLoginPassword('');
    } else {
      setAuthError(res.error || 'Error al iniciar sesión');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    const res = await registerUser(regName, regEmail, regPassword, regOrgName);
    setAuthLoading(false);
    if (res.success) {
      setAuthSuccess('¡Usuario registrado e inicio de sesión completado!');
      setRegPassword('');
    } else {
      setAuthError(res.error || 'Error al registrar usuario');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncSettings.authToken) return;
    setAuthLoading(true);
    setUserActionMsg(null);

    const res = await SyncService.createCompanyUser(syncSettings.serverUrl, syncSettings.authToken, {
      name: newUserName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
    });

    setAuthLoading(false);
    if (res.success) {
      setUserActionMsg({ type: 'success', text: `Usuario "${newUserName}" creado con éxito.` });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setShowAddUserModal(false);
      loadUsers();
    } else {
      setUserActionMsg({ type: 'error', text: res.error || 'Error al crear usuario' });
    }
  };

  const handleSyncNow = async () => {
    await syncProjectsWithServer();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isDark ? 'bg-[#18181b] border-[#27272a] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Centro de Ajustes y Configuración</h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Sincronización en la nube, gestión de usuarios RBAC y parámetros de SolarSim Pro
              </p>
            </div>
          </div>

          <button
            onClick={closeSettingsModal}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark
                ? 'border-[#3f3f46] hover:bg-[#27272a] text-zinc-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Navigation */}
        <div
          className={`flex items-center gap-2 px-6 pt-3 border-b overflow-x-auto shrink-0 ${
            isDark ? 'bg-[#141416] border-[#27272a]' : 'bg-slate-100/70 border-slate-200'
          }`}
        >
          <button
            onClick={() => setSettingsActiveTab('sync')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              settingsActiveTab === 'sync'
                ? isDark
                  ? 'border-emerald-500 bg-[#18181b] text-emerald-400'
                  : 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                : isDark
                ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-4 h-4 text-emerald-500" />
            <span>Nube & Servidor</span>
          </button>

          <button
            onClick={() => setSettingsActiveTab('account')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              settingsActiveTab === 'account'
                ? isDark
                  ? 'border-emerald-500 bg-[#18181b] text-emerald-400'
                  : 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                : isDark
                ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-500" />
            <span>Cuenta & Permisos</span>
            {syncSettings.currentUser && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  syncSettings.currentUser.role === 'ADMIN'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : syncSettings.currentUser.role === 'EDITOR'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}
              >
                {syncSettings.currentUser.role}
              </span>
            )}
          </button>

          <button
            onClick={() => setSettingsActiveTab('share')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              settingsActiveTab === 'share'
                ? isDark
                  ? 'border-emerald-500 bg-[#18181b] text-emerald-400'
                  : 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                : isDark
                ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-500" />
            <span>Propuestas Web (Cloudflare)</span>
          </button>

          <button
            onClick={() => setSettingsActiveTab('ai')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              settingsActiveTab === 'ai'
                ? isDark
                  ? 'border-purple-500 bg-[#18181b] text-purple-400'
                  : 'border-purple-600 bg-white text-purple-800 shadow-xs'
                : isDark
                ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>IA Gemini</span>
          </button>

          <button
            onClick={() => setSettingsActiveTab('equipment')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              settingsActiveTab === 'equipment'
                ? isDark
                  ? 'border-emerald-500 bg-[#18181b] text-emerald-400'
                  : 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                : isDark
                ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Catálogo de Equipos</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                isDark
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}
            >
              {equipmentCatalog.length}
            </span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: CLOUD & SERVER SYNC */}
          {settingsActiveTab === 'sync' && (
            <div className="space-y-6">
              {/* Server Endpoint Card */}
              <div
                className={`p-5 rounded-2xl border ${
                  isDark ? 'bg-[#1f1f23] border-[#2f2f35]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Server className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h4 className="text-sm font-bold">Servidor de Sincronización Electsun</h4>
                      <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Dirección IP o dominio del host de bases de datos y sincronización
                      </p>
                    </div>
                  </div>

                  {pingState.result?.online && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>En línea ({pingState.result.latencyMs} ms)</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder="http://10.0.0.103"
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-mono transition-colors ${
                      isDark
                        ? 'bg-[#121214] border-[#3f3f46] text-white focus:border-emerald-500 focus:outline-none'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600 focus:outline-none'
                    }`}
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={pingState.testing}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Activity className={`w-4 h-4 ${pingState.testing ? 'animate-spin' : ''}`} />
                    <span>{pingState.testing ? 'Probando...' : 'Probar Conexión'}</span>
                  </button>
                </div>

                {/* Ping Result Feedback */}
                {pingState.result && (
                  <div
                    className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                      pingState.result.online
                        ? isDark
                          ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : isDark
                        ? 'bg-red-950/40 border-red-800 text-red-300'
                        : 'bg-red-50 border-red-300 text-red-900'
                    }`}
                  >
                    {pingState.result.online ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold">
                        {pingState.result.online
                          ? `Conexión establecida con éxito (${pingState.result.latencyMs} ms)`
                          : 'No se pudo conectar con el servidor'}
                      </span>
                      {pingState.result.online ? (
                        <p className="opacity-80 mt-0.5">
                          Servicio: {pingState.result.service} | Base de Datos: {pingState.result.database} | Versión: {pingState.result.version}
                        </p>
                      ) : (
                        <p className="opacity-80 mt-0.5">{pingState.result.error}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sync Actions Card */}
              <div
                className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isDark ? 'bg-[#1f1f23] border-[#2f2f35]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-emerald-500 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Sincronización Bidireccional de Proyectos</span>
                  </h4>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Última sincronización:{' '}
                    {syncSettings.lastSyncTimestamp
                      ? new Date(syncSettings.lastSyncTimestamp).toLocaleString('es-DO')
                      : 'Nunca'}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
                    <input
                      type="checkbox"
                      checked={syncSettings.autoSyncEnabled}
                      onChange={(e) => setSyncSettings({ autoSyncEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Auto-sync al guardar</span>
                  </label>

                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing || !syncSettings.authToken}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-40"
                    title={!syncSettings.authToken ? 'Inicia sesión para sincronizar' : 'Sincronizar proyectos ahora'}
                  >
                    <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
                  </button>
                </div>
              </div>

              {/* Sync Feedback Toast inside Modal */}
              {syncFeedbackMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{syncFeedbackMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACCOUNT & RBAC */}
          {settingsActiveTab === 'account' && (
            <div className="space-y-6">
              {/* User Session Profile (if logged in) */}
              {syncSettings.currentUser ? (
                <div className="space-y-6">
                  <div
                    className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isDark ? 'bg-[#1f1f23] border-[#2f2f35]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-black text-xl shadow-md">
                        {syncSettings.currentUser.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-base font-black">{syncSettings.currentUser.name}</h4>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              syncSettings.currentUser.role === 'ADMIN'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : syncSettings.currentUser.role === 'EDITOR'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {syncSettings.currentUser.role === 'ADMIN' && '👑 Administrador'}
                            {syncSettings.currentUser.role === 'EDITOR' && '✏️ Editor'}
                            {syncSettings.currentUser.role === 'LECTOR' && '👁️ Lector'}
                          </span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                          {syncSettings.currentUser.email} • {syncSettings.currentUser.organizationName || 'Electsun'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={logoutUser}
                      className="px-4 py-2 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>

                  {/* ADMIN ONLY: Team Management Table */}
                  {syncSettings.currentUser.role === 'ADMIN' && (
                    <div
                      className={`p-5 rounded-2xl border space-y-4 ${
                        isDark ? 'bg-[#1f1f23] border-[#2f2f35]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-purple-400" />
                          <div>
                            <h4 className="text-sm font-bold">Gestión de Usuarios y Roles de la Empresa</h4>
                            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                              Control de acceso basado en roles (RBAC) para ingenieros y consultores
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setShowAddUserModal(!showAddUserModal)}
                          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>Crear Usuario</span>
                        </button>
                      </div>

                      {/* New User Form inside Admin panel */}
                      {showAddUserModal && (
                        <form
                          onSubmit={handleCreateUser}
                          className={`p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200 ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        >
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-70">
                              Nombre Completo
                            </label>
                            <input
                              type="text"
                              required
                              value={newUserName}
                              onChange={(e) => setNewUserName(e.target.value)}
                              placeholder="Ej. Ing. Carlos Mendoza"
                              className={`w-full px-3 py-1.5 rounded-lg border text-xs ${
                                isDark ? 'bg-[#18181b] border-[#3f3f46]' : 'bg-white border-slate-300'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-70">
                              Correo Electrónico
                            </label>
                            <input
                              type="email"
                              required
                              value={newUserEmail}
                              onChange={(e) => setNewUserEmail(e.target.value)}
                              placeholder="carlos@electsun.com.do"
                              className={`w-full px-3 py-1.5 rounded-lg border text-xs ${
                                isDark ? 'bg-[#18181b] border-[#3f3f46]' : 'bg-white border-slate-300'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-70">
                              Contraseña
                            </label>
                            <input
                              type="password"
                              required
                              value={newUserPassword}
                              onChange={(e) => setNewUserPassword(e.target.value)}
                              placeholder="••••••••"
                              className={`w-full px-3 py-1.5 rounded-lg border text-xs ${
                                isDark ? 'bg-[#18181b] border-[#3f3f46]' : 'bg-white border-slate-300'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-70">
                              Rol de Usuario
                            </label>
                            <div className="flex gap-2">
                              <select
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                                className={`flex-1 px-3 py-1.5 rounded-lg border text-xs ${
                                  isDark ? 'bg-[#18181b] border-[#3f3f46]' : 'bg-white border-slate-300'
                                }`}
                              >
                                <option value="ADMIN">Administrador</option>
                                <option value="EDITOR">Editor</option>
                                <option value="LECTOR">Lector</option>
                              </select>

                              <button
                                type="submit"
                                disabled={authLoading}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shrink-0"
                              >
                                {authLoading ? '...' : 'Guardar'}
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      {/* User list table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-[#2f2f35] text-zinc-400' : 'border-slate-200 text-slate-500'}`}>
                              <th className="py-2.5 px-3 font-bold">Usuario</th>
                              <th className="py-2.5 px-3 font-bold">Correo</th>
                              <th className="py-2.5 px-3 font-bold">Rol</th>
                              <th className="py-2.5 px-3 font-bold">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {companyUsers.map((u) => (
                              <tr
                                key={u.id}
                                className={`border-b transition-colors ${
                                  isDark ? 'border-[#27272a] hover:bg-[#27272a]/50' : 'border-slate-100 hover:bg-slate-100/50'
                                }`}
                              >
                                <td className="py-2.5 px-3 font-bold">{u.name}</td>
                                <td className="py-2.5 px-3 font-mono opacity-80">{u.email}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      u.role === 'ADMIN'
                                        ? 'bg-purple-500/20 text-purple-400'
                                        : u.role === 'EDITOR'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-blue-500/20 text-blue-400'
                                    }`}
                                  >
                                    {u.role}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-emerald-400 font-semibold">● Activo</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Login / Register Form */
                <div className="max-w-md mx-auto space-y-6">
                  <div className="flex rounded-xl p-1 bg-slate-200 dark:bg-[#121214] border border-slate-300 dark:border-[#27272a]">
                    <button
                      onClick={() => setAuthMode('login')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        authMode === 'login'
                          ? isDark
                            ? 'bg-[#27272a] text-white shadow-xs'
                            : 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      Iniciar Sesión
                    </button>
                    <button
                      onClick={() => setAuthMode('register')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        authMode === 'register'
                          ? isDark
                            ? 'bg-[#27272a] text-white shadow-xs'
                            : 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      Registrar Administrador
                    </button>
                  </div>

                  {authError && (
                    <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  {authSuccess && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{authSuccess}</span>
                    </div>
                  )}

                  {authMode === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-1">Correo Electrónico</label>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="tu@electsun.com.do"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Contraseña</label>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        {authLoading ? 'Iniciando Sesión...' : 'Entrar a SolarSim Cloud'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-1">Nombre y Apellido</label>
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="Ing. Carlos Mendoza"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Correo Electrónico Corporativo</label>
                        <input
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="carlos@electsun.com.do"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Empresa / Organización</label>
                        <input
                          type="text"
                          value={regOrgName}
                          onChange={(e) => setRegOrgName(e.target.value)}
                          placeholder="Electsun Dominicana"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Contraseña</label>
                        <input
                          type="password"
                          required
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                            isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        {authLoading ? 'Registrando...' : 'Crear Cuenta y Asignar Administrador'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CLOUDFLARE WEB PROPOSALS */}
          {settingsActiveTab === 'share' && (
            <div className="space-y-4">
              <div
                className={`p-5 rounded-2xl border ${
                  isDark ? 'bg-[#1f1f23] border-[#2f2f35]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <Globe className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h4 className="text-sm font-bold">Servicio Serverless de Propuestas Web (Cloudflare)</h4>
                    <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Microservicio de publicación de enlaces temporales interactivos para clientes
                    </p>
                  </div>
                </div>

                <p className="text-xs opacity-80 leading-relaxed mb-4">
                  Las propuestas generadas en SolarSim Pro pueden publicarse de forma instantánea en la red global de Cloudflare Workers con código QR y expiración automática de 7 a 30 días.
                </p>

                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400">
                  Endpoint Activo: https://solarsim-share.wilkerdev1.workers.dev
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI GEMINI VISION */}
          {settingsActiveTab === 'ai' && (
            <div className="space-y-4 text-xs">
              {/* Banner Free Tier */}
              <div
                className={`border rounded-2xl p-4 flex items-start gap-3.5 transition-colors ${
                  isDark
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-xs sm:text-sm">Capa Gratuita de Google AI Studio</h4>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Hasta 500-1,500 RPD
                    </span>
                  </div>
                  <p className="opacity-90 text-xs leading-relaxed">
                    Obtén tu API Key gratuita en segundos para procesar facturas con <strong>Gemini 3.5 Flash Lite</strong>, <strong>Gemini 3.6 Flash</strong> y <strong>Gemini 2.0 Flash</strong>.
                  </p>
                  <button
                    onClick={handleOpenGoogleAIStudio}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline pt-1 cursor-pointer"
                  >
                    <span>Obtener API Key en aistudio.google.com/app/apikey</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Google Gemini API Key
                  </label>
                  {aiInputKey.trim().length > 10 && (
                    <button
                      onClick={() => handleAutoDetectAIModels(aiInputKey)}
                      disabled={aiIsLoadingModels}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${aiIsLoadingModels ? 'animate-spin' : ''}`} />
                      <span>{aiIsLoadingModels ? 'Detectando...' : 'Auto-detectar Modelos'}</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Key className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`} />
                  </div>
                  <input
                    type="password"
                    value={aiInputKey}
                    onChange={(e) => {
                      setAiInputKey(e.target.value);
                      if (e.target.value.trim().length > 15) {
                        handleAutoDetectAIModels(e.target.value);
                      }
                    }}
                    placeholder="AIzaSy..."
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-mono text-xs transition-colors outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isDark
                        ? 'bg-[#121216] border-[#2e2e3e] text-white placeholder-zinc-600'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
                <p className={`text-[11px] flex items-center gap-1.5 pt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
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
                      onClick={() => setAiIsCustomMode(!aiIsCustomMode)}
                      className="text-xs font-bold text-zinc-400 hover:text-white cursor-pointer underline"
                    >
                      {aiIsCustomMode ? 'Elegir de la lista' : 'Escribir modelo personalizado'}
                    </button>
                  </div>
                </div>

                {/* Custom text input if custom mode */}
                {aiIsCustomMode ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={aiCustomModelInput}
                      onChange={(e) => setAiCustomModelInput(e.target.value)}
                      placeholder="ej. gemini-3.5-flash-lite o gemini-3.6-flash"
                      className={`w-full px-4 py-2.5 rounded-xl border font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500 ${
                        isDark ? 'bg-[#121216] border-[#2e2e3e] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <p className="text-[11px] text-zinc-500">
                      Ingresa el identificador exacto de cualquier modelo publicado en Google AI Studio.
                    </p>
                  </div>
                ) : (
                  /* Models Cards Grid */
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {aiModelsList.map((m) => {
                      const isSelected = aiSelectedModel === m.id;
                      const isLite = m.id.includes('flash-lite') || m.id.includes('3.5-flash-lite');
                      const is36 = m.id.includes('3.6-flash') || m.id.includes('3.7-flash');

                      return (
                        <div
                          key={m.id}
                          onClick={() => setAiSelectedModel(m.id)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-150 flex items-start justify-between gap-3 ${
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
                              <span className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5">
                                {isLite ? (
                                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                                ) : is36 ? (
                                  <Sparkles className="w-4 h-4 text-cyan-400" />
                                ) : (
                                  <Cpu className="w-4 h-4 text-emerald-400" />
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

                            <p className="text-[11px] opacity-80 leading-relaxed">{m.description}</p>
                            <span className="text-[10px] font-mono opacity-60 block">ID: {m.id}</span>
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
              {aiValidationResult.tested && (
                <div
                  className={`border rounded-2xl p-3.5 flex items-start gap-2.5 animate-in fade-in duration-200 ${
                    aiValidationResult.success
                      ? isDark
                        ? 'bg-emerald-950/50 border-emerald-700/80 text-emerald-200'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : isDark
                      ? 'bg-rose-950/50 border-rose-800/80 text-rose-200'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {aiValidationResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-bold text-xs">
                      {aiValidationResult.success ? 'Conexión Validada con Éxito' : 'Fallo en la Validación'}
                    </p>
                    <p className="text-[11px] opacity-90">{aiValidationResult.message}</p>
                  </div>
                </div>
              )}

              {/* Botón Probar y Guardar Modelo */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleTestAndSaveAI}
                  disabled={aiIsValidating || !aiInputKey.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 active:scale-95"
                >
                  {aiIsValidating ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{aiIsValidating ? 'Verificando con Google AI...' : 'Probar y Guardar Modelo'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: EQUIPMENT CATALOG MANAGER */}
          {settingsActiveTab === 'equipment' && (
            <EquipmentManagerSettingsTab isDark={isDark} />
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-end px-6 py-4 border-t shrink-0 ${
            isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            onClick={closeSettingsModal}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
          >
            Listo / Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
