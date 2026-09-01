import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { SyncService } from '../../../services/syncService';
import { UserProfile, UserRole } from '../../../types';
import {
  Building2,
  Users,
  Shield,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  UserCheck,
  UserX,
} from 'lucide-react';

export const OrganizationSection: React.FC = () => {
  const { syncSettings } = useSimulationStore();
  const currentUser = syncSettings.currentUser;
  const isAdmin = currentUser?.role === 'ADMIN';

  // Member list state
  const [companyUsers, setCompanyUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('EDITOR');
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = async () => {
    if (!syncSettings.authToken) return;
    setLoadingUsers(true);
    const users = await SyncService.getCompanyUsers(syncSettings.serverUrl, syncSettings.authToken);
    setLoadingUsers(false);
    setCompanyUsers(users);
  };

  useEffect(() => {
    if (syncSettings.authToken && isAdmin) {
      loadUsers();
    }
  }, [syncSettings.authToken, isAdmin]);

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

  return (
    <section id="sec-organizacion" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Organización & Equipo</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Gestión de roles de acceso (RBAC), miembros colaboradores y datos de la empresa.
        </p>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-6">
        {/* Identidad de la Empresa */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-[#27272a]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shadow-2xs font-bold text-lg">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {currentUser?.organizationName || 'Electsun Dominicana'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Plan Empresarial Multi-Usuario • Licencia Activa
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invitar Miembro</span>
            </button>
          )}
        </div>

        {userActionMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              userActionMsg.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
            }`}
          >
            {userActionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{userActionMsg.text}</span>
          </div>
        )}

        {/* Tabla de Usuarios */}
        {isAdmin ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Miembros de la Organización ({companyUsers.length})
              </span>
              <button
                onClick={loadUsers}
                disabled={loadingUsers}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingUsers ? 'animate-spin' : ''}`} />
                <span>Actualizar Lista</span>
              </button>
            </div>

            {loadingUsers && companyUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Cargando miembros...</div>
            ) : companyUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Inicia sesión en el servidor para ver el equipo.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-[#27272a]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#222226] text-slate-600 dark:text-zinc-400 font-semibold border-b border-slate-200/80 dark:border-[#27272a]">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                    {companyUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-[#222226]/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200">{u.name}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-mono text-[11px]">{u.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              u.role === 'ADMIN'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                u.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'
                              }`}
                            />
                            <span>{u.isActive !== false ? 'Activo' : 'Inactivo'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => handleToggleUserActive(u)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-[#27272a] hover:bg-slate-100 dark:hover:bg-[#27272a] text-slate-700 dark:text-zinc-300 cursor-pointer"
                            >
                              {u.isActive !== false ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#121214] border border-slate-200/60 dark:border-[#27272a] text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-400" />
            <span>
              La administración de usuarios y permisos RBAC está reservada para cuentas con rol de <strong>ADMIN</strong>.
            </span>
          </div>
        )}
      </div>

      {/* Modal para Crear Usuario */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272a]">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Invitar Nuevo Miembro</h4>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ing. Miguel Rodríguez"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="miguel@electsun.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white"
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
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Rol de Acceso</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white"
                >
                  <option value="EDITOR">EDITOR (Crear y modificar proyectos)</option>
                  <option value="VIEWER">VIEWER (Solo lectura de propuestas)</option>
                  <option value="ADMIN">ADMIN (Control total y gestión de usuarios)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-[#27272a] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
