import { featureScope } from '../../../shared/applicationFeatures';
import { SimulationSlice, EquipmentSlice } from '../types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../data/defaultEquipmentCatalog';
import { SolarEquipmentItem } from '../../types/equipment';
import { SyncService } from '../../services/syncService';

export const createEquipmentSlice: SimulationSlice<EquipmentSlice> = (baseSet, get) => {
  let inFlight: { generation: number; promise: Promise<{ success: boolean; message: string }> } | null = null;
  const set: typeof baseSet = (update, replace) => baseSet((state) => {
    const patch = typeof update === 'function' ? update(state) : update;
    if (!patch.equipmentCatalog || patch.equipmentCatalog === state.equipmentCatalog) return patch;
    const user = state.syncSettings.currentUser;
    if (user && user.role !== 'ADMIN' && user.role !== 'EDITOR') return { equipmentSyncFeedback: 'Tu cuenta solo puede consultar el catálogo.' };
    const scope = user ? featureScope(state.syncSettings.serverUrl, user.organizationId) : 'local';
    const prior = new Map(state.equipmentCatalog.map((item) => [item.id, item]));
    const changes = { ...state.equipmentChanges };
    const deleted = [...state.equipmentDeletionQueue];
    let next = patch.equipmentCatalog.map((item) => {
      const old = prior.get(item.id);
      if (old && JSON.stringify(old) === JSON.stringify(item)) return item;
      if (user && old && ((old.organizationId && old.organizationId !== user.organizationId) || (old.syncServerUrl && old.syncServerUrl.trim().replace(/\/+$/, '') !== state.syncSettings.serverUrl.trim().replace(/\/+$/, '')))) return old;
      const baseVersion = changes[item.id]?.baseVersion ?? old?.baseVersion ?? old?.version ?? 0;
      changes[item.id] = { scope, baseVersion, revision: crypto.randomUUID() };
      return { ...item, organizationId: user?.organizationId, syncServerUrl: user ? state.syncSettings.serverUrl : undefined, baseVersion };
    });
    // A tenant cannot remove another tenant's cached document or route its deletion to the active server.
    const protectedItems = state.equipmentCatalog.filter((item) => !!user && (
      (!!item.organizationId && item.organizationId !== user.organizationId && item.organizationId !== 'org-electsun-default') ||
      (!!item.syncServerUrl && item.syncServerUrl.trim().replace(/\/+$/, '') !== state.syncSettings.serverUrl.trim().replace(/\/+$/, ''))));
    for (const item of protectedItems) if (!next.some((entry) => entry.id === item.id)) next = [...next, item];
    const remaining = new Set(next.map((item) => item.id));
    for (const item of state.equipmentCatalog) if (!remaining.has(item.id)) {
      if (user) {
        deleted.push({ scope, id: item.id, baseVersion: item.baseVersion ?? item.version ?? 0, item: structuredClone(item) });
      }
      delete changes[item.id];
    }
    return { ...patch, deletedEquipmentIds: patch.deletedEquipmentIds?.filter((id) => !protectedItems.some((item) => item.id === id)) ?? state.deletedEquipmentIds, equipmentCatalog: next, equipmentChanges: changes, equipmentDeletionQueue: deleted };
  }, replace);
  return {
  equipmentChanges: {}, equipmentDeletionQueue: [], equipmentSyncFeedback: null, equipmentConflicts: {},
  resolveEquipmentConflict: (id, resolution) => {
    const state = get();
    const conflict = state.equipmentConflicts[id];
    const local = state.equipmentCatalog.find((item) => item.id === id);
    if (!conflict || !local) return;
    const user = state.syncSettings.currentUser;
    if (!user || (user.role !== 'ADMIN' && user.role !== 'EDITOR')) return;
    const scope = featureScope(state.syncSettings.serverUrl, user.organizationId);
    const conflicts = { ...state.equipmentConflicts };
    delete conflicts[id];
    const changes = { ...state.equipmentChanges };
    let catalog = state.equipmentCatalog;
    if (resolution === 'accept_server' && conflict.serverItem) {
      catalog = catalog.map((item) => item.id === id ? { ...conflict.serverItem!, baseVersion: conflict.serverVersion, syncServerUrl: state.syncSettings.serverUrl } : item);
      delete changes[id];
    } else if (resolution === 'keep_local' && conflict.serverItem?.organizationId === user.organizationId && conflict.serverVersion) {
      changes[id] = { scope, baseVersion: conflict.serverVersion, revision: crypto.randomUUID() };
      catalog = catalog.map((item) => item.id === id ? { ...item, baseVersion: conflict.serverVersion, version: conflict.serverVersion } : item);
    } else if (resolution === 'fork') {
      const forkId = `eq-${crypto.randomUUID()}`;
      const fork = { ...local, id: forkId, organizationId: user.organizationId, baseVersion: 0, version: 1, displayName: `${local.displayName} (copia local)` };
      changes[forkId] = { scope, baseVersion: 0, revision: crypto.randomUUID() };
      delete changes[id];
      catalog = [...catalog.filter((item) => item.id !== id), ...(conflict.serverItem ? [conflict.serverItem] : []), fork];
    } else return;
    baseSet({ equipmentCatalog: catalog, equipmentChanges: changes, equipmentConflicts: conflicts });
    if (state.syncSettings.autoSyncEnabled) void get().syncEquipmentWithServer();
  },
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

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) void get().syncEquipmentWithServer();
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
    const generation = get().sessionGeneration;
    if (inFlight?.generation === generation) return inFlight.promise;
    const session = get().syncSettings;
    const { serverUrl, authToken, currentUser } = session;
    if (!authToken || !currentUser) return { success: false, message: 'Inicia sesión para sincronizar el catálogo.' };
    const scope = featureScope(serverUrl, currentUser.organizationId);
    const canWrite = currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR';
    const ensureSession = () => {
      const fresh = get().syncSettings;
      if (generation !== get().sessionGeneration || !fresh.authToken || fresh.currentUser?.id !== currentUser.id || fresh.currentUser.organizationId !== currentUser.organizationId || fresh.serverUrl !== serverUrl) throw new Error('La sesión cambió durante la sincronización del catálogo.');
    };
    const run = async () => {
      let deletionErrors = 0;
      let conflictCount = 0;
      const releaseDeletion = (id: string) => baseSet((state) => ({ equipmentDeletionQueue: state.equipmentDeletionQueue.filter((item) => item.scope !== scope || item.id !== id) }));
      const recoverDeletion = (deletion: EquipmentSlice['equipmentDeletionQueue'][number], serverItem?: SolarEquipmentItem) => {
        conflictCount++;
        baseSet((state) => ({
          equipmentDeletionQueue: state.equipmentDeletionQueue.filter((item) => item.scope !== scope || item.id !== deletion.id),
          deletedEquipmentIds: (state.deletedEquipmentIds || []).filter((id) => id !== deletion.id),
          equipmentCatalog: deletion.item ? [...state.equipmentCatalog.filter((item) => item.id !== deletion.id), deletion.item] : state.equipmentCatalog,
          equipmentChanges: deletion.item ? { ...state.equipmentChanges, [deletion.id]: { scope, baseVersion: deletion.baseVersion, revision: crypto.randomUUID() } } : state.equipmentChanges,
          equipmentConflicts: { ...state.equipmentConflicts, [deletion.id]: { reason: 'deletion_version_conflict', serverItem, serverVersion: serverItem?.version } },
        }));
      };
      try {
        const pulled = await SyncService.pullEquipment(serverUrl, get().syncSettings.authToken!);
        ensureSession();
        if (!pulled.success || !pulled.items) throw new Error(pulled.error || 'No se pudo descargar el catálogo.');
        baseSet((state) => {
          const queued = new Set(state.equipmentDeletionQueue.filter((item) => item.scope === scope).map((item) => item.id));
          const deleted = new Set([...(state.deletedEquipmentIds || []), ...(pulled.deletedIds || []), ...queued]);
          const conflicts = { ...state.equipmentConflicts };
          const local = new Map(state.equipmentCatalog.filter((item) => {
            if (!deleted.has(item.id)) return true;
            // A remote deletion wins, but unsent work remains recoverable as a new fork.
            if (!queued.has(item.id) && state.equipmentChanges[item.id]?.scope === scope && item.organizationId === currentUser.organizationId) {
              if (!conflicts[item.id]) conflictCount++;
              conflicts[item.id] = { reason: 'deleted' };
              return true;
            }
            return false;
          }).map((item) => [item.id, item]));
          for (const item of pulled.items!) if (!deleted.has(item.id) && !state.equipmentChanges[item.id]) local.set(item.id, { ...item, syncServerUrl: serverUrl, baseVersion: item.version ?? 1 });
          const recoverable = new Set([...local.values()].filter((item) => conflicts[item.id]?.reason === 'deleted' && state.equipmentChanges[item.id]?.scope === scope).map((item) => item.id));
          return { equipmentCatalog: Array.from(local.values()), equipmentConflicts: conflicts, deletedEquipmentIds: [...deleted].filter((id) => !recoverable.has(id)) };
        });
        if (canWrite) for (const captured of get().equipmentDeletionQueue.filter((item) => item.scope === scope)) {
          let deletion = captured;
          if (pulled.deletedIds?.includes(deletion.id)) { releaseDeletion(deletion.id); continue; }
          const serverItem = pulled.items.find((item) => item.id === deletion.id);
          if (!deletion.item && serverItem) {
            deletion = { ...deletion, item: structuredClone(serverItem) };
            baseSet((state) => ({ equipmentDeletionQueue: state.equipmentDeletionQueue.map((item) => item === captured ? deletion : item) }));
          }
          if (serverItem?.organizationId === currentUser.organizationId && serverItem.version !== deletion.baseVersion) { recoverDeletion(deletion, serverItem); continue; }
          // DELETE creates a tenant-scoped tombstone even for an ID never uploaded.
          const success = await SyncService.deleteEquipment(serverUrl, get().syncSettings.authToken!, deletion.id, deletion.baseVersion);
          ensureSession();
          if (success) { releaseDeletion(deletion.id); continue; }
          const latest = await SyncService.pullEquipment(serverUrl, get().syncSettings.authToken!);
          ensureSession();
          if (latest.success && latest.deletedIds?.includes(deletion.id)) { releaseDeletion(deletion.id); continue; }
          const changed = latest.items?.find((item) => item.id === deletion.id);
          if (changed?.organizationId === currentUser.organizationId && changed.version !== deletion.baseVersion) recoverDeletion(deletion, changed);
          else deletionErrors++;
        }
        const capturedChanges = get().equipmentChanges;
        const sent = canWrite ? get().equipmentCatalog.filter((item) => capturedChanges[item.id]?.scope === scope && item.organizationId === currentUser.organizationId && !get().equipmentConflicts[item.id]) : [];
        if (sent.length) {
          const pushed = await SyncService.pushEquipmentBatch(serverUrl, get().syncSettings.authToken!, sent);
          ensureSession();
          if (!pushed.success || !pushed.results) throw new Error(pushed.error || 'El servidor no confirmó los cambios del catálogo.');
          // A create/update response must acknowledge deletion intent even when its row disappeared.
          const recoveredDeletionIds = new Set<string>();
          for (const result of pushed.results) if (result.status === 'conflict') {
            const deletion = get().equipmentDeletionQueue.find((item) => item.scope === scope && item.id === result.id);
            if (deletion) {
              if (result.reason === 'deleted') releaseDeletion(deletion.id);
              else { recoverDeletion(deletion, result.serverItem); recoveredDeletionIds.add(result.id); }
            }
          }
          baseSet((state) => {
            const results = new Map(pushed.results!.map((result) => [result.id, result]));
            const changes = { ...state.equipmentChanges };
            const conflicts = { ...state.equipmentConflicts };
            const equipmentCatalog = state.equipmentCatalog.map((item) => {
              const result = results.get(item.id);
              if (!result) return item;
              if (recoveredDeletionIds.has(item.id)) return item;
              if (result.status === 'conflict') { conflictCount++; conflicts[item.id] = { serverItem: result.serverItem, serverVersion: result.serverVersion, reason: result.reason }; return item; }
              if (changes[item.id]?.revision !== capturedChanges[item.id]?.revision) {
                if (changes[item.id]) changes[item.id] = { ...changes[item.id], baseVersion: result.version };
                return { ...item, baseVersion: result.version, version: result.version };
              }
              delete changes[item.id];
              delete conflicts[item.id];
              return { ...result.item, syncServerUrl: serverUrl, baseVersion: result.version };
            });
            const equipmentDeletionQueue = state.equipmentDeletionQueue.map((deletion) => {
              const result = results.get(deletion.id);
              if (deletion.scope !== scope || !result || result.status === 'conflict') return deletion;
              return { ...deletion, baseVersion: result.version, item: deletion.item ? { ...deletion.item, version: result.version, baseVersion: result.version } : undefined };
            });
            return { equipmentCatalog, equipmentChanges: changes, equipmentConflicts: conflicts, equipmentDeletionQueue };
          });
          if (pushed.results.length !== sent.length) throw new Error('Hay cambios del catálogo sin confirmar.');
        }
        const message = deletionErrors ? `${deletionErrors} eliminación(es) pendientes; otros equipos procesados.` : conflictCount ? `${conflictCount} equipo(s) tienen cambios remotos. Los cambios locales se conservaron; revisa las ofertas antes de reemplazarlas.` : 'Catálogo sincronizado.';
        baseSet({ equipmentSyncFeedback: message });
        return { success: !deletionErrors && !conflictCount, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo sincronizar el catálogo.';
        if (generation === get().sessionGeneration) baseSet({ equipmentSyncFeedback: message });
        return { success: false, message };
      }
    };
    const promise = run();
    inFlight = { generation, promise };
    try {
      const result = await promise;
      if (result.success && generation === get().sessionGeneration && get().syncSettings.autoSyncEnabled && canWrite &&
        (get().equipmentDeletionQueue.some((item) => item.scope === scope) || get().equipmentCatalog.some((item) => get().equipmentChanges[item.id]?.scope === scope && !get().equipmentConflicts[item.id]))) {
        setTimeout(() => { if (generation === get().sessionGeneration && get().syncSettings.autoSyncEnabled) void get().syncEquipmentWithServer(); }, 0);
      }
      return result;
    } finally { if (inFlight?.promise === promise) inFlight = null; }
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
};
};
