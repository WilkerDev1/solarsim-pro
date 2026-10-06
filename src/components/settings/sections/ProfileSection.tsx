import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { User, Edit3, LogOut, RefreshCw, CheckCircle2, AlertCircle, Shield, Building2, Eye, EyeOff } from 'lucide-react';

export const ProfileSection: React.FC = () => {
  const { syncSettings, loginUser, registerUser, logoutUser, validateSession } = useSimulationStore();
  const currentUser = syncSettings.currentUser;

  // Local state for Auth Form
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regOrgName, setRegOrgName] = useState('Electsun Dominicana');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Session verification state
  const [validatingSession, setValidatingSession] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleVerifySession = async () => {
    setValidatingSession(true);
    setSessionFeedback(null);
    const res = await validateSession();
    setValidatingSession(false);
    if (res.valid) {
      setSessionFeedback({
        type: 'success',
        message: '¡Sesión activa y verificada con el servidor! Token renovado correctamente.',
      });
      setTimeout(() => setSessionFeedback(null), 4000);
    } else {
      setSessionFeedback({
        type: 'error',
        message: res.error || 'La sesión no pudo ser verificada. Por favor vuelve a iniciar sesión.',
      });
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    if (authMode === 'login') {
      const res = await loginUser(loginEmail.trim(), loginPassword.trim());
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

  const isAuthenticated = !!syncSettings.authToken;
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const handleReauthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.email || !reauthPassword.trim()) return;
    setReauthLoading(true);
    setReauthError(null);
    const res = await loginUser(currentUser.email, reauthPassword.trim());
    setReauthLoading(false);
    if (res.success) {
      setReauthPassword('');
      setSessionFeedback({
        type: 'success',
        message: '¡Sesión reanudada con éxito! Sincronización activa.',
      });
      setTimeout(() => setSessionFeedback(null), 3500);
    } else {
      setReauthError(res.error || 'Contraseña incorrecta o fallo al reanudar sesión');
    }
  };

  const displayRole = currentUser?.role === 'VIEWER' ? 'LECTOR' : currentUser?.role;

  return (
    <section id="sec-cuenta" className="flex flex-col gap-4 scroll-mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Perfil de Usuario</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Información de cuenta, credenciales de acceso y estado de sesión RBAC.
          </p>
        </div>
      </div>

      {/* Tarjeta de Perfil */}
      <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-7 shadow-xs">
        {currentUser ? (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-7">
            {/* Avatar & Rol */}
            <div className="flex flex-col items-center gap-2.5 shrink-0">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-sky-400/20 via-indigo-400/20 to-emerald-400/20 border-2 border-sky-300/60 dark:border-sky-500/40 flex items-center justify-center relative shadow-xs">
                <User className="w-9 h-9 text-sky-700 dark:text-sky-300" />
                <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-white dark:bg-[#27272a] border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 shadow-2xs">
                  <Shield className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                  !isAuthenticated
                    ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                    : currentUser.role === 'ADMIN'
                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                    : currentUser.role === 'LECTOR' || currentUser.role === 'VIEWER'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                }`}
              >
                {!isAuthenticated ? 'Reautenticación Requerida' : displayRole}
              </span>
            </div>

            {/* Campos de Usuario */}
            <div className="flex-1 w-full flex flex-col gap-4">
              {!isAuthenticated && (
                <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Sesión inactiva o expirada en el servidor</span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Tus proyectos y archivos locales de <strong>{currentUser.organizationName || 'tu organización'}</strong> se encuentran protegidos. Ingresa tu contraseña para reanudar la sincronización.
                  </p>
                </div>
              )}

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

              {/* Empresa y Servidor */}
              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-[#121214] border border-slate-200/60 dark:border-[#27272a] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                  <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Empresa: <strong>{currentUser.organizationName || 'Electsun Dominicana'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
                  <span className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>Servidor: <span className="font-mono text-[11px]">{syncSettings.serverUrl}</span></span>
                </div>
              </div>

              {reauthError && (
                <div className="p-3 rounded-xl text-xs flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reauthError}</span>
                </div>
              )}

              {sessionFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    sessionFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
                  }`}
                >
                  {sessionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium">{sessionFeedback.message}</span>
                </div>
              )}

              {!isAuthenticated ? (
                /* Formulario de Reautenticación In-situ */
                <form onSubmit={handleReauthSubmit} className="pt-2 border-t border-slate-100 dark:border-[#27272a] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <input
                    type="password"
                    placeholder="Contraseña de tu cuenta"
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    required
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={reauthLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {reauthLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Reanudar Sesión</span>
                  </button>
                  <button
                    type="button"
                    onClick={logoutUser}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer shrink-0"
                  >
                    Iniciar con otra cuenta
                  </button>
                </form>
              ) : (
                <div className="pt-3 border-t border-slate-100 dark:border-[#27272a] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">Seguridad & Sesión</span>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Token activo con auto-renovación continua y permisos vigentes ({displayRole}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleVerifySession}
                      disabled={validatingSession}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222226] text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${validatingSession ? 'animate-spin' : ''}`} />
                      <span>Verificar Conexión</span>
                    </button>
                    <button
                      onClick={logoutUser}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
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
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100"
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
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100"
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
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={authMode === 'login' ? loginPassword : regPassword}
                      onChange={(e) => (authMode === 'login' ? setLoginPassword(e.target.value) : setRegPassword(e.target.value))}
                      className="w-full pl-3.5 pr-10 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword(!showAuthPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
  );
};
