import { SimulationSlice, EquipmentSlice } from '../types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../data/defaultEquipmentCatalog';
import { SolarEquipmentItem } from '../../types/equipment';

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
    if (!authToken) return { success: false, message: 'No autenticado' };

    try {
      const res = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/equipment/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ items: get().equipmentCatalog }),
      });

      if (res.ok) {
        return { success: true, message: 'Catálogo de equipos sincronizado con la nube' };
      }
      return { success: false, message: 'Error al sincronizar equipos' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de red' };
    }
  },
});
