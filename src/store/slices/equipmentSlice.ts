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

      // 2. Pull de equipos desde el servidor para incorporar nuevos modelos y precios actualizados
      const pullRes = await SyncService.pullEquipment(serverUrl, authToken);
      if (pullRes.success && pullRes.items && pullRes.items.length > 0) {
        const localMap = new Map(get().equipmentCatalog.map((item) => [item.id, item]));
        let hasUpdated = false;

        for (const serverItem of pullRes.items) {
          const localItem = localMap.get(serverItem.id);
          if (!localItem) {
            localMap.set(serverItem.id, serverItem);
            hasUpdated = true;
          } else {
            const serverUpdated = new Date(serverItem.updatedAt || 0).getTime();
            const localUpdated = new Date(localItem.updatedAt || 0).getTime();
            const serverPrices = serverItem.supplierPrices || [];
            const localPrices = localItem.supplierPrices || [];

            // Si el servidor tiene fecha más reciente o tiene ofertas que localmente faltan
            if (serverUpdated > localUpdated || (serverPrices.length > 0 && localPrices.length === 0)) {
              localMap.set(serverItem.id, {
                ...localItem,
                ...serverItem,
                supplierPrices: serverPrices.length >= localPrices.length ? serverPrices : localPrices,
              });
              hasUpdated = true;
            }
          }
        }

        if (hasUpdated) {
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

  addOrUpdateSupplierPrice: (equipmentId, supplierPrice) => {
    set((state) => {
      const target = state.equipmentCatalog.find((e) => e.id === equipmentId);
      if (!target) return state;

      const currentPrices = Array.isArray(target.supplierPrices) ? [...target.supplierPrices] : [];
      const priceId = supplierPrice.id || `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const cleanName = supplierPrice.supplierName.toLowerCase().trim();

      // Consolidar: eliminar cualquier otra entrada con el mismo ID o el mismo nombre normalizado
      const otherPrices = currentPrices.filter(
        (sp) => sp.id !== priceId && sp.supplierName.toLowerCase().trim() !== cleanName
      );

      const updatedPriceEntry = {
        ...supplierPrice,
        id: priceId,
        updatedAt: nowIso,
      };

      otherPrices.push(updatedPriceEntry);

      const updatedCatalog = state.equipmentCatalog.map((e) =>
        e.id === equipmentId
          ? {
              ...e,
              supplierPrices: otherPrices,
              updatedAt: nowIso,
            }
          : e
      );

      return {
        equipmentCatalog: updatedCatalog,
        saveFeedbackMessage: `¡Precio de ${supplierPrice.supplierName} ($${supplierPrice.priceUSD} USD) guardado! 💰`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  removeSupplierPrice: (equipmentId, supplierPriceId) => {
    set((state) => {
      const target = state.equipmentCatalog.find((e) => e.id === equipmentId);
      if (!target || !target.supplierPrices) return state;

      const filtered = target.supplierPrices.filter((sp) => sp.id !== supplierPriceId);
      const updatedCatalog = state.equipmentCatalog.map((e) =>
        e.id === equipmentId
          ? {
              ...e,
              supplierPrices: filtered,
              preferredSupplierId: e.preferredSupplierId === supplierPriceId ? undefined : e.preferredSupplierId,
              updatedAt: new Date().toISOString(),
            }
          : e
      );

      return {
        equipmentCatalog: updatedCatalog,
        saveFeedbackMessage: 'Oferta de proveedor eliminada',
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  batchUpdateSupplierPrices: (updates) => {
    set((state) => {
      const catalogMap = new Map(state.equipmentCatalog.map((item) => [item.id, { ...item }]));
      const nowIso = new Date().toISOString();

      updates.forEach(({ equipmentId, supplierPrice }) => {
        const item = catalogMap.get(equipmentId);
        if (item) {
          const prices = Array.isArray(item.supplierPrices) ? [...item.supplierPrices] : [];
          const priceId = supplierPrice.id || `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const cleanName = supplierPrice.supplierName.toLowerCase().trim();

          // Consolidar: eliminar cualquier duplicado previo del mismo proveedor o ID
          const otherPrices = prices.filter(
            (sp) => sp.id !== priceId && sp.supplierName.toLowerCase().trim() !== cleanName
          );

          const fullEntry = {
            ...supplierPrice,
            id: priceId,
            updatedAt: supplierPrice.updatedAt || nowIso,
          };

          otherPrices.push(fullEntry);

          catalogMap.set(equipmentId, {
            ...item,
            supplierPrices: otherPrices,
            updatedAt: nowIso,
          });
        }
      });

      return {
        equipmentCatalog: Array.from(catalogMap.values()),
        saveFeedbackMessage: `¡${updates.length} precios de proveedores actualizados en el catálogo! 🏷️`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 4000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  setPreferredSupplier: (equipmentId, supplierPriceId) => {
    set((state) => ({
      equipmentCatalog: state.equipmentCatalog.map((e) =>
        e.id === equipmentId ? { ...e, preferredSupplierId: supplierPriceId, updatedAt: new Date().toISOString() } : e
      ),
    }));

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },
});
