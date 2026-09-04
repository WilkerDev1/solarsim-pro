import { SimulationSlice, EquipmentSlice } from '../types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../data/defaultEquipmentCatalog';
import { SolarEquipmentItem } from '../../types/equipment';
import { SyncService } from '../../services/syncService';

export const createEquipmentSlice: SimulationSlice<EquipmentSlice> = (set, get) => ({
  equipmentCatalog: DEFAULT_EQUIPMENT_CATALOG,
  deletedEquipmentIds: [],

  addEquipmentItem: (item) => {
    set((state) => {
      const exists = state.equipmentCatalog.some((e) => e.id === item.id || e.displayName === item.displayName);
      const updated = exists
        ? state.equipmentCatalog.map((e) =>
            e.id === item.id || e.displayName === item.displayName ? { ...item, updatedAt: new Date().toISOString() } : e
          )
        : [item, ...state.equipmentCatalog];
      const updatedDeleted = (state.deletedEquipmentIds || []).filter((delId) => delId !== item.id);
      return {
        equipmentCatalog: updated,
        deletedEquipmentIds: updatedDeleted,
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
      const itemIds = new Set(items.map((i) => i.id));
      const updatedDeleted = (state.deletedEquipmentIds || []).filter((delId) => !itemIds.has(delId));
      return {
        equipmentCatalog: Array.from(catalogMap.values()),
        deletedEquipmentIds: updatedDeleted,
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
    const currentDeleted = get().deletedEquipmentIds || [];
    const updatedDeleted = currentDeleted.includes(id) ? currentDeleted : [...currentDeleted, id];
    set((state) => ({
      equipmentCatalog: state.equipmentCatalog.filter((e) => e.id !== id),
      deletedEquipmentIds: updatedDeleted,
      saveFeedbackMessage: 'Equipo eliminado del catálogo',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    const { serverUrl, authToken, autoSyncEnabled } = get().syncSettings;
    if (authToken) {
      SyncService.deleteEquipment(serverUrl, authToken, id).catch((err) => {
        console.warn('Error al sincronizar eliminación de equipo en servidor:', err);
      });
    }

    if (autoSyncEnabled && authToken) {
      get().syncEquipmentWithServer();
    }
  },

  resetEquipmentCatalogToDefaults: () => {
    set({
      equipmentCatalog: DEFAULT_EQUIPMENT_CATALOG,
      deletedEquipmentIds: [],
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
        const deletedIds = new Set(get().deletedEquipmentIds || []);
        const localMap = new Map(get().equipmentCatalog.map((item) => [item.id, item]));
        let hasUpdated = false;

        for (const serverItem of pullRes.items) {
          if (deletedIds.has(serverItem.id)) continue;
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

  renameSupplier: (oldName, newName) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedOld || !trimmedNew || trimmedOld.toLowerCase() === trimmedNew.toLowerCase()) return;

    set((state) => {
      const nowIso = new Date().toISOString();
      let updatedCount = 0;

      const updatedCatalog = state.equipmentCatalog.map((item) => {
        if (!item.supplierPrices || item.supplierPrices.length === 0) return item;

        let hasChanges = false;
        const newPricesMap = new Map<string, import('../../types/equipment').EquipmentSupplierPrice>();

        item.supplierPrices.forEach((sp) => {
          if (sp.supplierName.toLowerCase().trim() === trimmedOld.toLowerCase()) {
            hasChanges = true;
            updatedCount++;
            const updatedSp = {
              ...sp,
              supplierName: trimmedNew,
              updatedAt: nowIso,
            };
            const existing = newPricesMap.get(trimmedNew.toLowerCase());
            if (!existing || updatedSp.priceUSD < existing.priceUSD) {
              newPricesMap.set(trimmedNew.toLowerCase(), updatedSp);
            }
          } else {
            const key = sp.supplierName.toLowerCase().trim();
            if (!newPricesMap.has(key)) {
              newPricesMap.set(key, sp);
            }
          }
        });

        if (!hasChanges) return item;

        return {
          ...item,
          supplierPrices: Array.from(newPricesMap.values()),
          updatedAt: nowIso,
        };
      });

      return {
        equipmentCatalog: updatedCatalog,
        saveFeedbackMessage: `Proveedor "${trimmedOld}" renombrado a "${trimmedNew}" en ${updatedCount} ofertas.`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },

  deleteSupplier: (supplierName) => {
    const cleanName = supplierName.toLowerCase().trim();
    if (!cleanName) return;

    set((state) => {
      const nowIso = new Date().toISOString();
      let deletedCount = 0;

      const updatedCatalog = state.equipmentCatalog.map((item) => {
        if (!item.supplierPrices || item.supplierPrices.length === 0) return item;

        const filtered = item.supplierPrices.filter((sp) => {
          const matches = sp.supplierName.toLowerCase().trim() === cleanName;
          if (matches) deletedCount++;
          return !matches;
        });

        if (filtered.length === item.supplierPrices.length) return item;

        return {
          ...item,
          supplierPrices: filtered,
          preferredSupplierId:
            item.preferredSupplierId &&
            item.supplierPrices.find((sp) => sp.id === item.preferredSupplierId)?.supplierName.toLowerCase().trim() === cleanName
              ? undefined
              : item.preferredSupplierId,
          updatedAt: nowIso,
        };
      });

      return {
        equipmentCatalog: updatedCatalog,
        saveFeedbackMessage: `Proveedor "${supplierName}" y sus ${deletedCount} ofertas eliminadas del catálogo.`,
      };
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().syncEquipmentWithServer();
    }
  },
});
