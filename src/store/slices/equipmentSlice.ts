import { SimulationSlice, EquipmentSlice } from '../types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../data/defaultEquipmentCatalog';
import { SolarEquipmentItem } from '../../types/equipment';
import { SyncService } from '../../services/syncService';

export const createEquipmentSlice: SimulationSlice<EquipmentSlice> = (set, get) => ({
  equipmentCatalog: DEFAULT_EQUIPMENT_CATALOG,

  addEquipmentItem: (item) => {
    set((state) => {
      const exists = state.equipmentCatalog.some((e) => e.id === item.id || e.displayName === item.displayName);
      const updated = exists
        ? state.equipmentCatalog.map((e) =>
            e.id === item.id || e.displayName === item.displayName ? { ...item, updatedAt: new Date().toISOString() } : e
          )
        : [item, ...state.equipmentCatalog];
      return {
        equipmentCatalog: updated,
        saveFeedbackMessage: `¡Equipo "${item.displayName}" guardado en el catálogo! ✨`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  addEquipmentBatch: (items) => {
    set((state) => {
      const catalogMap = new Map<string, SolarEquipmentItem>();
      state.equipmentCatalog.forEach((e) => catalogMap.set(e.displayName.toLowerCase(), e));
      items.forEach((item) => catalogMap.set(item.displayName.toLowerCase(), item));
      return {
        equipmentCatalog: Array.from(catalogMap.values()),
        saveFeedbackMessage: `¡${items.length} variantes agregadas exitosamente al catálogo! ⚡`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  updateEquipmentItem: (id, updates) => {
    set((state) => ({
      equipmentCatalog: state.equipmentCatalog.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
      ),
      saveFeedbackMessage: '¡Equipo actualizado con éxito! ✨',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  removeEquipmentItem: (id) => {
    set((state) => ({
      equipmentCatalog: state.equipmentCatalog.filter((e) => e.id !== id),
      saveFeedbackMessage: 'Equipo eliminado del catálogo',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  resetEquipmentCatalogToDefaults: () => {
    set({
      equipmentCatalog: DEFAULT_EQUIPMENT_CATALOG,
      saveFeedbackMessage: 'Catálogo restablecido a modelos verificados oficiales',
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  syncEquipmentWithServer: async () => {
    const { serverUrl, authToken } = get().syncSettings;
    if (!authToken) {
      return { success: false, message: 'No autenticado. Inicia sesión en "Cuenta & Permisos".' };
    }

    try {
      // 1. Push lote local de equipos hacia el servidor
      const pushRes = await SyncService.pushEquipmentBatch(serverUrl, authToken, get().equipmentCatalog);
      if (!pushRes.success) {
        return { success: false, message: pushRes.error || 'Error al subir catálogo al servidor' };
      }

      // 2. Pull de equipos desde el servidor para incorporar nuevos modelos del equipo
      const pullRes = await SyncService.pullEquipment(serverUrl, authToken);
      if (pullRes.success && pullRes.items && pullRes.items.length > 0) {
        const localMap = new Map(get().equipmentCatalog.map((item) => [item.id, item]));
        let hasNew = false;
        for (const serverItem of pullRes.items) {
          if (!localMap.has(serverItem.id)) {
            localMap.set(serverItem.id, serverItem);
            hasNew = true;
          }
        }
        if (hasNew) {
          set({ equipmentCatalog: Array.from(localMap.values()) });
        }
      }

      return {
        success: true,
        message: `¡${get().equipmentCatalog.length} equipos sincronizados exitosamente con la nube!`,
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de conexión con el servidor' };
    }
  },
});
