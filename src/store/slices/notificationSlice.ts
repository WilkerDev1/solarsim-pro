import { SimulationSlice, NotificationSlice } from '../types';
import { TeamNotification } from '../../types';

export const createNotificationSlice: SimulationSlice<NotificationSlice> = (set, get) => ({
  notifications: [],
  unreadNotificationsCount: 0,

  addNotification: (notifData) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: TeamNotification = {
      ...notifData,
      id,
      timestamp: new Date().toISOString(),
      read: false,
    };

    set((state) => {
      const updated = [newNotif, ...state.notifications].slice(0, 100); // Keep max 100
      const unreadCount = updated.filter((n) => !n.read).length;
      return {
        notifications: updated,
        unreadNotificationsCount: unreadCount,
      };
    });
  },

  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      const unreadCount = updated.filter((n) => !n.read).length;
      return {
        notifications: updated,
        unreadNotificationsCount: unreadCount,
      };
    });
  },

  markAllAsRead: () => {
    set((state) => {
      const updated = state.notifications.map((n) => ({ ...n, read: true }));
      return {
        notifications: updated,
        unreadNotificationsCount: 0,
      };
    });
  },

  clearNotifications: () => {
    set({
      notifications: [],
      unreadNotificationsCount: 0,
    });
  },
});
