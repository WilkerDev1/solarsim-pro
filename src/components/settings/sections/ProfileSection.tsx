import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { User, Edit3, LogOut, RefreshCw, CheckCircle2, AlertCircle, Key } from 'lucide-react';

export const ProfileSection: React.FC = () => {
  const { syncSettings, loginUser, registerUser, logoutUser } = useSimulationStore();
  const currentUser = syncSettings.currentUser;

  // Local state for Auth Form
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

  return (
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
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authMode === 'login' ? loginPassword : regPassword}
                    onChange={(e) => (authMode === 'login' ? setLoginPassword(e.target.value) : setRegPassword(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100"
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
  );
};
