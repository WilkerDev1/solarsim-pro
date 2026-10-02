import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Bell,
  CheckCheck,
  Trash2,
  Sparkles,
  RefreshCw,
  GitCommit,
  AlertTriangle,
  FolderKanban,
  Clock,
} from 'lucide-react';
import { TeamNotification } from '../../types';

export const NotificationDropdown: React.FC = () => {
  const {
    notifications,
    unreadNotificationsCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    setActiveProject,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const formatRelativeTime = (timestamp: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (diff < 60) return 'Ahora mismo';
      if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
      return new Date(timestamp).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const getActionIcon = (action: TeamNotification['action']) => {
    switch (action) {
      case 'CREATE':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
      case 'SNAPSHOT':
        return <GitCommit className="w-3.5 h-3.5 text-blue-400" />;
      case 'CONFLICT':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'UPDATE':
      default:
        return <RefreshCw className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  const handleNotificationClick = (notif: TeamNotification) => {
    markAsRead(notif.id);
    if (notif.projectId) {
      setActiveProject(notif.projectId, 'project-hub');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* 🔔 Bell Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative p-2 rounded-xl transition-all duration-150 cursor-pointer ${
          isOpen
            ? isDark
              ? 'bg-[#27272a] text-white'
              : 'bg-slate-200 text-slate-900'
            : isDark
            ? 'text-zinc-400 hover:text-white hover:bg-[#27272a]'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        title="Notificaciones de la organización"
      >
        <Bell className="w-4 h-4" />
        {unreadNotificationsCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
        )}
      </button>

      {/* 🪟 Notification Popover Dropdown */}
      {isOpen && (
        <div
          className={`absolute right-0 top-12 w-80 sm:w-96 rounded-2xl shadow-2xl border z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            isDark
              ? 'bg-[#18181b] border-[#27272a] text-zinc-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${
              isDark ? 'border-[#27272a] bg-[#121214]' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider">Actividad de Equipo</span>
              {unreadNotificationsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {unreadNotificationsCount} nueva{unreadNotificationsCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadNotificationsCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1 rounded text-zinc-400 hover:text-emerald-400 transition-colors text-[11px] font-medium flex items-center gap-1"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Leídas</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors"
                  title="Vaciar notificaciones"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/40">
            {notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-zinc-400">
                <Bell className="w-8 h-8 text-zinc-600 mb-2 opacity-50" />
                <p className="text-xs font-semibold">Sin notificaciones pendientes</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Los cambios de tu equipo y avisos de versión aparecerán aquí.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                    notif.read
                      ? isDark
                        ? 'opacity-65 hover:bg-[#202023]'
                        : 'opacity-70 hover:bg-slate-50'
                      : isDark
                      ? 'bg-amber-500/5 hover:bg-amber-500/10'
                      : 'bg-amber-50/60 hover:bg-amber-50'
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-[#27272a] shrink-0 mt-0.5">
                    {getActionIcon(notif.action)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold truncate">
                        {notif.authorName}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {formatRelativeTime(notif.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 line-clamp-2 leading-snug">
                      {notif.message}
                    </p>

                    {(notif.clientName || notif.projectCode) && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono text-zinc-400">
                        <FolderKanban className="w-3 h-3 text-zinc-500" />
                        <span className="truncate">
                          {notif.projectCode && `[${notif.projectCode}] `}
                          {notif.clientName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
