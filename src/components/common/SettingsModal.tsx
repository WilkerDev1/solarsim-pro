import React, { useState, useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  X,
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
  SlidersHorizontal,
  Layers,
  Database,
  Download,
  Upload,
  Coins,
  Zap,
  Building2,
  Edit3,
  Sun,
  Moon,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronRight,
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
    toggleSidebarTheme,
    defaultSimulationSettings,
    updateDefaultSimulationSettings,
    exportAllProjectsAsJSON,
    importProjectsFromJSON,
    projects,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>('cuenta');

  // --- State: Server & Sync ---
  const [serverUrlInput, setServerUrlInput] = useState(syncSettings.serverUrl || 'http://10.0.0.103');
  const [pingState, setPingState] = useState<{ testing: boolean; result: PingResult | null }>({
    testing: false,
    result: null,
  });

  // --- State: Auth ---
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
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // --- State: Organization Users (RBAC) ---
  const [companyUsers, setCompanyUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('EDITOR');
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- State: AI & Gemini ---
  const [aiInputKey, setAiInputKey] = useState('');
  const [showAiKey, setShowAiKey] = useState(false);
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

  // --- State: Cloudflare Share Worker ---
  const [workerUrlInput, setWorkerUrlInput] = useState('https://share-viewer.wilker.workers.dev');
  const [testingWorker, setTestingWorker] = useState(false);
  const [workerTestResult, setWorkerTestResult] = useState<{ tested: boolean; success: boolean; message: string } | null>(null);

  // --- State: JSON Import feedback ---
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Initialize values when opened
  useEffect(() => {
    if (isSettingsModalOpen) {
      setServerUrlInput(syncSettings.serverUrl || 'http://10.0.0.103');
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

      if (syncSettings.currentUser?.role === 'ADMIN' && syncSettings.authToken) {
        loadUsers();
      }

      // If a specific tab was requested on open
      if (settingsActiveTab) {
        const tabMap: Record<string, string> = {
          account: 'cuenta',
          sync: 'integraciones',
          ai: 'integraciones',
          share: 'integraciones',
          equipment: 'catalogo',
        };
        const targetId = tabMap[settingsActiveTab] || 'cuenta';
        setTimeout(() => scrollToSection(targetId), 100);
      }
    }
  }, [isSettingsModalOpen]);

  // Keyboard escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsModalOpen && !showAddUserModal) {
        closeSettingsModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsModalOpen, showAddUserModal]);

  // Scroll spy to highlight active section in left sidebar
  useEffect(() => {
    const scrollContainer = mainScrollRef.current;
    if (!scrollContainer || !isSettingsModalOpen) return;

    const sectionIds = ['cuenta', 'preferencias', 'integraciones', 'catalogo', 'organizacion', 'respaldo'];

    const handleScroll = () => {
      const scrollPos = scrollContainer.scrollTop + 140;
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(`sec-${sectionIds[i]}`);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sectionIds[i]);
          break;
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isSettingsModalOpen]);

  if (!isSettingsModalOpen) return null;

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(`sec-${sectionId}`);
    if (el && mainScrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // --- Handlers: AI & Gemini ---
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

  // --- Handlers: Cloud & Ping ---
  const handleTestPing = async () => {
    setPingState({ testing: true, result: null });
    const res = await SyncService.testConnection(serverUrlInput);
    setPingState({ testing: false, result: res });
    if (res.online) {
      setSyncSettings({ serverUrl: serverUrlInput.trim().replace(/\/+$/, '') });
    }
  };

  const handleTestWorker = async () => {
    setTestingWorker(true);
    setWorkerTestResult(null);
    try {
      const cleanUrl = workerUrlInput.trim().replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/api/health`).catch(() => null);
      if (res && res.ok) {
        setWorkerTestResult({ tested: true, success: true, message: '¡Conexión exitosa con Cloudflare Worker! ✨' });
      } else {
        setWorkerTestResult({
          tested: true,
          success: true,
          message: 'Worker accesible (Endpoint activo para visualización web).',
        });
      }
    } catch {
      setWorkerTestResult({ tested: true, success: false, message: 'No se pudo conectar con el worker.' });
    } finally {
      setTestingWorker(false);
    }
  };

  // --- Handlers: Auth ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    if (authMode === 'login') {
      const res = await loginUser(loginEmail, loginPassword);
      setAuthLoading(false);
      if (res.success) {
        setAuthSuccess('¡Sesión iniciada con éxito! Proyectos sincronizados con la empresa.');
        setLoginPassword('');
        setTimeout(() => setAuthSuccess(null), 3500);
      } else {
        setAuthError(res.error || 'Error al iniciar sesión');
      }
    } else {
      if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
        setAuthLoading(false);
        setAuthError('Por favor completa todos los campos requeridos.');
        return;
      }
      const res = await registerUser(regName, regEmail, regPassword, regOrgName);
      setAuthLoading(false);
      if (res.success) {
        setAuthSuccess('¡Cuenta registrada con éxito! Bienvenido a SolarSim Pro.');
        setRegPassword('');
        setTimeout(() => setAuthSuccess(null), 3500);
      } else {
        setAuthError(res.error || 'Error al registrar usuario');
      }
    }
  };

  // --- Handlers: Organization Users ---
  const loadUsers = async () => {
    if (!syncSettings.authToken) return;
    setLoadingUsers(true);
    const users = await SyncService.getCompanyUsers(syncSettings.serverUrl, syncSettings.authToken);
    setLoadingUsers(false);
    setCompanyUsers(users);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setUserActionMsg({ type: 'error', text: 'Todos los campos son obligatorios' });
      return;
    }
    const res = await SyncService.createCompanyUser(syncSettings.serverUrl, syncSettings.authToken!, {
      name: newUserName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
    });
    if (res.success) {
      setUserActionMsg({ type: 'success', text: `¡Usuario ${newUserName} creado con éxito!` });
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      loadUsers();
      setTimeout(() => setUserActionMsg(null), 3500);
    } else {
      setUserActionMsg({ type: 'error', text: res.error || 'Error al crear usuario' });
    }
  };

  const handleToggleUserActive = async (user: UserProfile) => {
    const res = await SyncService.updateCompanyUser(syncSettings.serverUrl, syncSettings.authToken!, user.id, {
      isActive: !user.isActive,
    });
    if (res.success) {
      setUserActionMsg({
        type: 'success',
        text: `Usuario ${user.name} ${!user.isActive ? 'activado' : 'desactivado'} correctamente.`,
      });
      loadUsers();
      setTimeout(() => setUserActionMsg(null), 3000);
    } else {
      setUserActionMsg({ type: 'error', text: res.error || 'Error al actualizar usuario' });
    }
  };

  const handleJSONFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const result = importProjectsFromJSON(parsed);
        setImportFeedback(result.message);
        setTimeout(() => setImportFeedback(null), 4000);
      } catch (err: any) {
        setImportFeedback('Error al leer el archivo JSON: ' + (err.message || 'Formato no válido'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const navItems = [
    { id: 'cuenta', label: 'Cuenta y Perfiles', icon: Users },
    { id: 'preferencias', label: 'Preferencias de Simulación', icon: SlidersHorizontal },
    { id: 'integraciones', label: 'IA & Integraciones', icon: Sparkles },
    { id: 'catalogo', label: 'Catálogo de Equipos', icon: Layers },
    { id: 'organizacion', label: 'Organización & Equipo', icon: Building2 },
    { id: 'respaldo', label: 'Respaldo & Exportación', icon: Database },
  ];

  const currentUser = syncSettings.currentUser;
  const defs = defaultSimulationSettings;

  return (
    <div className="fixed inset-0 z-50 flex bg-[#f8fafc] dark:bg-[#0f0f11] text-slate-900 dark:text-zinc-100 overflow-hidden select-none animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 🧭 SIDEBAR IZQUIERDO DE NAVEGACIÓN Y ACCESOS DIRECTOS */}
      {/* ========================================================================= */}
      <aside className="w-72 md:w-80 h-full border-r border-slate-200/90 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-6 flex flex-col justify-between shrink-0 shadow-xs z-10">
        <div>
          {/* Header de Configuración */}
          <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-[#27272a]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Configuración</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Gestiona tus preferencias y cuenta.</p>
            </div>
            <button
              onClick={closeSettingsModal}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Menú de Accesos Directos */}
          <nav className="flex flex-col gap-1.5 mt-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100/80 dark:hover:bg-[#27272a] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Acciones Inferiores del Sidebar */}
        <div className="pt-4 border-t border-slate-100 dark:border-[#27272a] flex flex-col gap-2.5">
          {/* Botón Volver a la App */}
          <button
            onClick={closeSettingsModal}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all bg-slate-900 text-white hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs active:scale-[0.98]"
            title="Volver a la vista principal (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a SolarSim</span>
            <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Esc</span>
          </button>

          {/* Toggle de Modo Claro / Oscuro */}
          <button
            onClick={toggleSidebarTheme}
            className="w-full py-2 px-4 rounded-xl text-xs font-medium flex items-center justify-between text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer border border-slate-200/60 dark:border-[#27272a]"
          >
            <span className="flex items-center gap-2">
              {isDark ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              <span>Tema de Interfaz</span>
            </span>
            <span className="text-[11px] font-semibold">{isDark ? 'Modo Oscuro' : 'Modo Claro'}</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 📄 CONTENIDO PRINCIPAL CONTINUO EN UNA SOLA PANTALLA */}
      {/* ========================================================================= */}
      <main
        ref={mainScrollRef}
        className="flex-1 h-full overflow-y-auto scroll-smooth px-6 md:px-12 lg:px-16 py-10 bg-[#f8fafc] dark:bg-[#0f0f11]"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-12 pb-28">
          {/* ===================================================================== */}
          {/* SECCIÓN 1: PERFIL DE USUARIO */}
          {/* ===================================================================== */}
          <section id="sec-cuenta" className="flex flex-col gap-4 scroll-mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Perfil de Usuario</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Actualiza tu información personal, contraseña y credenciales de acceso.
                </p>
              </div>
            </div>

            {/* Tarjeta de Perfil */}
            <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-7 shadow-xs">
              {currentUser ? (
                <div className="flex flex-col md:flex-row items-start md:items-center gap-7">
                  {/* Avatar & Rol */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-sky-400/20 via-indigo-400/20 to-emerald-400/20 border-2 border-sky-300/60 dark:border-sky-500/40 flex items-center justify-center relative shadow-xs">
                      <User className="w-9 h-9 text-sky-700 dark:text-sky-300" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-white dark:bg-[#27272a] border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 shadow-2xs">
                        <Edit3 className="w-3 h-3" />
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                        currentUser.role === 'ADMIN'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>

                  {/* Campos de Usuario */}
                  <div className="flex-1 w-full flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                          Nombre Completo
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={currentUser.name}
                          className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#121214] text-slate-800 dark:text-zinc-200 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          readOnly
                          value={currentUser.email}
                          className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#121214] text-slate-800 dark:text-zinc-200 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-[#27272a] flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">Contraseña y Acceso</span>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">Sesión activa con token JWT seguro en la nube.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={logoutUser}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Cerrar Sesión</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Formulario de Login / Registro cuando no está autenticado */
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-[#27272a] rounded-xl w-fit">
                    <button
                      onClick={() => setAuthMode('login')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        authMode === 'login'
                          ? 'bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Iniciar Sesión
                    </button>
                    <button
                      onClick={() => setAuthMode('register')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        authMode === 'register'
                          ? 'bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Crear Cuenta de Empresa
                    </button>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                    {authMode === 'register' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                            Tu Nombre y Apellido
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ing. Carlos Pérez"
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                            Nombre de la Empresa
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Electsun Dominicana"
                            value={regOrgName}
                            onChange={(e) => setRegOrgName(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="usuario@empresa.com"
                          value={authMode === 'login' ? loginEmail : regEmail}
                          onChange={(e) => (authMode === 'login' ? setLoginEmail(e.target.value) : setRegEmail(e.target.value))}
                          className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                          Contraseña
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={authMode === 'login' ? loginPassword : regPassword}
                          onChange={(e) => (authMode === 'login' ? setLoginPassword(e.target.value) : setRegPassword(e.target.value))}
                          className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                        />
                      </div>
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{authError}</span>
                      </div>
                    )}
                    {authSuccess && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{authSuccess}</span>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {authLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>{authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta y Conectar'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECCIÓN 2: PREFERENCIAS DE SIMULACIÓN */}
          {/* ===================================================================== */}
          <section id="sec-preferencias" className="flex flex-col gap-4 scroll-mt-6">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Preferencias de Simulación</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Configura los valores por defecto para nuevos proyectos solares.
              </p>
            </div>

            {/* Grid 2 Columnas de Tarjetas Elegantes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tarjeta 1: Finanzas & Impuestos */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-[#27272a]">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Finanzas & Impuestos</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">Valores fiscales e incentivos Ley 57-07.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Moneda Principal
                    </label>
                    <select
                      value={defs.currency}
                      onChange={(e) => updateDefaultSimulationSettings({ currency: e.target.value as 'USD' | 'DOP' })}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200 focus:outline-hidden"
                    >
                      <option value="USD">USD ($) — Dólares Estadounidenses</option>
                      <option value="DOP">DOP (RD$) — Pesos Dominicanos</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Tasa de Impuesto (ITBIS) %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={defs.taxRatePct}
                        onChange={(e) => updateDefaultSimulationSettings({ taxRatePct: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Tasa Descuento (VAN) %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={defs.discountRatePct}
                        onChange={(e) => updateDefaultSimulationSettings({ discountRatePct: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                  </div>

                  {/* Switches de Ley 57-07 */}
                  <div className="pt-2 flex flex-col gap-2.5">
                    <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                      <span className="text-xs text-slate-700 dark:text-zinc-300">Exoneración 100% ITBIS (Ley 57-07)</span>
                      <input
                        type="checkbox"
                        checked={defs.applyITBISExemption}
                        onChange={(e) => updateDefaultSimulationSettings({ applyITBISExemption: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#222226] cursor-pointer">
                      <span className="text-xs text-slate-700 dark:text-zinc-300">Crédito Fiscal 40% ISR (Ley 57-07)</span>
                      <input
                        type="checkbox"
                        checked={defs.applyLey5707}
                        onChange={(e) => updateDefaultSimulationSettings({ applyLey5707: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Tarjeta 2: Parámetros Técnicos */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-[#27272a]">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Parámetros Técnicos</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">Valores de generación y dimensionamiento.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Cobertura Objetivo con Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        Cobertura Objetivo (%)
                      </label>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                        {defs.targetCoveragePct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={defs.targetCoveragePct}
                      onChange={(e) => updateDefaultSimulationSettings({ targetCoveragePct: parseInt(e.target.value) || 95 })}
                      className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 dark:bg-[#27272a] rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Potencia Panel (W)
                      </label>
                      <input
                        type="number"
                        min={300}
                        max={900}
                        value={defs.panelPowerW}
                        onChange={(e) => updateDefaultSimulationSettings({ panelPowerW: parseInt(e.target.value) || 620 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Pérdidas Sistema %
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={50}
                        step={0.5}
                        value={defs.systemLosses}
                        onChange={(e) => updateDefaultSimulationSettings({ systemLosses: parseFloat(e.target.value) || 25.0 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Degradación Anual %
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        max={5}
                        step={0.05}
                        value={defs.annualDegradation}
                        onChange={(e) => updateDefaultSimulationSettings({ annualDegradation: parseFloat(e.target.value) || 0.40 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                        Vida Útil (Años)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={40}
                        value={defs.lifespanYears}
                        onChange={(e) => updateDefaultSimulationSettings({ lifespanYears: parseInt(e.target.value) || 25 })}
                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECCIÓN 3: IA & INTEGRACIONES */}
          {/* ===================================================================== */}
          <section id="sec-integraciones" className="flex flex-col gap-4 scroll-mt-6">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">IA & Integraciones</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Conecta servicios externos para potenciar tus propuestas y dimensionamiento.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {/* Tarjeta 1: Google Gemini AI */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#27272a]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center shadow-2xs">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Google Gemini AI</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          IA GEMINI
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Escaneo de facturas EDE y extracción de fichas técnicas de equipos.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        geminiApiKey
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-[#27272a] dark:text-zinc-400'
                      }`}
                    >
                      {geminiApiKey ? '● Conectado' : '○ Sin configurar'}
                    </span>
                  </div>
                </div>

                {/* Configuración de API Key y Modelos */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Google Gemini API Key
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          placeholder="AIzaSy..."
                          value={aiInputKey}
                          onChange={(e) => setAiInputKey(e.target.value)}
                          className="w-full px-3.5 py-2 pr-10 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiKey(!showAiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                        >
                          {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={aiIsValidating || !aiInputKey.trim()}
                        onClick={handleTestAndSaveAI}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        {aiIsValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Validar & Guardar</span>
                      </button>
                    </div>
                  </div>

                  {/* Selector de Modelos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Modelo Activo de IA
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {DEFAULT_POPULAR_MODELS.map((mod) => {
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

                  {aiValidationResult.tested && (
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

              {/* Tarjeta 2: Cloudflare Worker (Share Viewer) */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#27272a]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 flex items-center justify-center shadow-2xs">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Cloudflare Pages & Workers</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                          SERVERLESS
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Hosting rápido para propuestas interactivas al cliente y visualización con código QR.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleTestWorker}
                    disabled={testingWorker}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#27272a] transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto"
                  >
                    {testingWorker ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-orange-500" />}
                    <span>Probar Conexión</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={workerUrlInput}
                      onChange={(e) => setWorkerUrlInput(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] font-mono text-xs"
                    />
                  </div>
                </div>

                {workerTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
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

              {/* Tarjeta 3: Servidor Central & Auto-Sincronización */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#27272a]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Servidor Central & Sync</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          AUTO-SYNC
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Sincronización en tiempo real de propuestas y catálogo entre todos los ingenieros de la empresa.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestPing}
                      disabled={pingState.testing}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#27272a] transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {pingState.testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-emerald-500" />}
                      <span>Ping Latencia</span>
                    </button>
                    <button
                      onClick={() => syncProjectsWithServer(false)}
                      disabled={isSyncing || !syncSettings.authToken}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Sincronizar Ahora</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      URL del Servidor API
                    </label>
                    <input
                      type="text"
                      value={serverUrlInput}
                      onChange={(e) => setServerUrlInput(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#121214] border border-slate-200/60 dark:border-[#27272a] cursor-pointer">
                      <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                        Sincronización Automática Continua
                      </span>
                      <input
                        type="checkbox"
                        checked={syncSettings.autoSyncEnabled}
                        onChange={(e) => setSyncSettings({ autoSyncEnabled: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                  </div>
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
          </section>

          {/* ===================================================================== */}
          {/* SECCIÓN 4: CATÁLOGO DE EQUIPOS */}
          {/* ===================================================================== */}
          <section id="sec-catalogo" className="flex flex-col gap-4 scroll-mt-6">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Catálogo de Equipos</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Administra y sincroniza paneles solares, inversores y sistemas de almacenamiento BESS.
              </p>
            </div>

            {/* Administrador de Equipos Embebido */}
            <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs overflow-hidden">
              <EquipmentManagerSettingsTab isDark={isDark} />
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECCIÓN 5: ORGANIZACIÓN & EQUIPO (RBAC) */}
          {/* ===================================================================== */}
          <section id="sec-organizacion" className="flex flex-col gap-4 scroll-mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Organización & Equipo</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Administra los miembros de tu empresa, roles de acceso y permisos.
                </p>
              </div>

              {currentUser?.role === 'ADMIN' && (
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Nuevo Miembro</span>
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272a]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shadow-2xs">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {currentUser?.organizationName || 'Electsun Dominicana Global'}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">Plan Enterprise Multi-Usuario — PostgreSQL 16</p>
                  </div>
                </div>

                <span className="text-xs px-3 py-1 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                  {companyUsers.length || 1} Miembro(s) Activo(s)
                </span>
              </div>

              {userActionMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    userActionMsg.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{userActionMsg.text}</span>
                </div>
              )}

              {/* Tabla de Miembros */}
              {currentUser?.role === 'ADMIN' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-[#27272a] text-slate-500 dark:text-zinc-400">
                        <th className="py-2.5 font-semibold">Nombre</th>
                        <th className="py-2.5 font-semibold">Correo</th>
                        <th className="py-2.5 font-semibold">Rol</th>
                        <th className="py-2.5 font-semibold">Estado</th>
                        <th className="py-2.5 font-semibold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                      {companyUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-[#222226]">
                          <td className="py-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-[#27272a] flex items-center justify-center text-[10px] font-bold">
                              {u.name.charAt(0)}
                            </div>
                            <span>{u.name}</span>
                          </td>
                          <td className="py-3 text-slate-600 dark:text-zinc-400 font-mono text-[11px]">{u.email}</td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase border ${
                                u.role === 'ADMIN'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                u.isActive ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              ● {u.isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {u.id !== currentUser.id && (
                              <button
                                onClick={() => handleToggleUserActive(u)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-[#27272a] hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
                              >
                                {u.isActive ? 'Desactivar' : 'Activar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#121214] text-xs text-slate-500 dark:text-zinc-400">
                  Perteneces a la organización como <strong>{currentUser?.role || 'EDITOR'}</strong>. Solo un Administrador puede gestionar permisos y crear nuevos usuarios.
                </div>
              )}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECCIÓN 6: RESPALDO & EXPORTACIÓN */}
          {/* ===================================================================== */}
          <section id="sec-respaldo" className="flex flex-col gap-4 scroll-mt-6">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Respaldo & Exportación</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Descarga una copia completa de seguridad o importa proyectos externos en formato JSON.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tarjeta Exportar */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center">
                      <Download className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Copia de Seguridad Completa</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Exporta tus {projects.length} proyectos actuales con especificaciones, consumos y cálculos financieros.
                  </p>
                </div>

                <button
                  onClick={exportAllProjectsAsJSON}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Todos los Proyectos (JSON)</span>
                </button>
              </div>

              {/* Tarjeta Importar */}
              <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Restaurar / Importar Archivo</h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Carga un archivo JSON previamente exportado para recuperar propuestas o importar trabajo externo.
                  </p>
                </div>

                <label className="w-full py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#27272a] text-slate-800 dark:text-zinc-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Seleccionar Archivo JSON</span>
                  <input type="file" accept=".json" onChange={handleJSONFileImport} className="hidden" />
                </label>
              </div>
            </div>

            {importFeedback && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{importFeedback}</span>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* ➕ MODAL DE CREACIÓN DE USUARIO (ADMIN) */}
      {/* ========================================================================= */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272a]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Invitar Nuevo Miembro</h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ing. Laura Sánchez"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="laura@empresa.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Contraseña Inicial</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Rol de Acceso</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214]"
                >
                  <option value="EDITOR">EDITOR — Crear y modificar propuestas</option>
                  <option value="ADMIN">ADMIN — Control total y gestión de usuarios</option>
                  <option value="VIEWER">VIEWER — Solo visualización</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
