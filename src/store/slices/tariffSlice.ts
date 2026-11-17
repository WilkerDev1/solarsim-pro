import { GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../../types/tariffs';
import { DEFAULT_RD_TARIFF_MATRIX } from '../../data/rdTariffs';
import { SimulationSlice } from '../types';
import { normalizeStoredTariffMatrix } from '../../utils/tariffExtraction';
import { SyncService } from '../../services/syncService';
import { classifyTariffMatrix } from '../../data/factoryTariffMatrixVersions';

/** La matriz que guarda la organización en el servidor es una de fábrica anterior sin tocar (no se persiste). */
export interface OrganizationTariffOutdated {
  resolutionCode: string;
  effectiveDate: string;
}

export interface TariffSlice {
  tariffMatrix: GlobalTariffMatrix;
  tariffSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  tariffSyncError: string | null;
  /** Última descarga: la organización guarda una matriz de fábrica anterior; el cliente calcula con la vigente. */
  organizationTariffOutdated: OrganizationTariffOutdated | null;

  updateTariffMatrixHeader: (
    updates: Partial<Pick<GlobalTariffMatrix, 'resolutionCode' | 'effectiveDate' | 'publishedBy' | 'notes'>>
  ) => void;
  updateDistributorTariff: (
    distributor: UtilityDistributor,
    tariffCode: string,
    updates: Partial<UtilityTariffDetails>
  ) => void;
  setTariffMatrix: (matrix: GlobalTariffMatrix) => void;
  resetToDefaultTariffs: () => void;
  syncTariffsWithServer: () => Promise<{ success: boolean; message: string }>;
  fetchTariffsFromServer: () => Promise<{ success: boolean; message: string }>;
}

export const createTariffSlice: SimulationSlice<TariffSlice> = (set, get) => ({
  tariffMatrix: DEFAULT_RD_TARIFF_MATRIX,
  tariffSyncStatus: 'idle',
  tariffSyncError: null,
  organizationTariffOutdated: null,

  updateTariffMatrixHeader: (updates) => {
    set((state) => ({
      tariffMatrix: {
        ...state.tariffMatrix,
        ...updates,
        lastUpdatedAt: new Date().toISOString(),
      },
    }));
  },

  updateDistributorTariff: (distributor, tariffCode, updates) => {
    set((state) => {
      const currentMatrix = state.tariffMatrix || DEFAULT_RD_TARIFF_MATRIX;
      const currentSchedule = currentMatrix.schedules[distributor] || DEFAULT_RD_TARIFF_MATRIX.schedules[distributor];
      const currentTariff = currentSchedule.tariffs[tariffCode] || {};

      const updatedTariff: UtilityTariffDetails = {
        ...currentTariff,
        ...updates,
        code: tariffCode,
      } as UtilityTariffDetails;
      // Cambiar el cargo fijo sin traer rangos: el último rango (abierto) sigue siendo ese cargo.
      const tiers = currentTariff.fixedChargeTiersDOP;
      if (updates.fixedChargeDOP !== undefined && updates.fixedChargeTiersDOP === undefined && tiers?.length) {
        updatedTariff.fixedChargeTiersDOP = tiers.map((tier, index) => (index === tiers.length - 1 ? { ...tier, chargeDOP: updates.fixedChargeDOP as number } : tier));
      }

      const updatedSchedule = {
        ...currentSchedule,
        tariffs: {
          ...currentSchedule.tariffs,
          [tariffCode]: updatedTariff,
        },
      };

      return {
        tariffMatrix: {
          ...currentMatrix,
          lastUpdatedAt: new Date().toISOString(),
          schedules: {
            ...currentMatrix.schedules,
            [distributor]: updatedSchedule,
          },
        },
      };
    });
  },

  setTariffMatrix: (matrix) => {
    set({
      tariffMatrix: {
        ...normalizeStoredTariffMatrix(matrix),
        lastUpdatedAt: new Date().toISOString(),
      },
    });
  },

  resetToDefaultTariffs: () => {
    set({
      tariffMatrix: DEFAULT_RD_TARIFF_MATRIX,
      tariffSyncStatus: 'idle',
      tariffSyncError: null,
    });
  },

  syncTariffsWithServer: async () => {
    const { syncSettings, tariffMatrix } = get();
    if (!syncSettings.authToken) {
      return { success: false, message: 'Inicia sesión para sincronizar pliegos tarifarios en la nube' };
    }

    const generation = get().sessionGeneration;
    const isCurrent = () => generation === get().sessionGeneration && get().syncSettings.serverUrl === syncSettings.serverUrl && get().syncSettings.currentUser?.organizationId === syncSettings.currentUser?.organizationId;
    set({ tariffSyncStatus: 'syncing', tariffSyncError: null });

    try {
      const res = await SyncService.syncTariffMatrix(
        syncSettings.serverUrl,
        syncSettings.authToken,
        tariffMatrix
      );

      if (!isCurrent()) return { success: false, message: 'La sesión cambió durante la consulta.' };
      if (!res.success) {
        set({ tariffSyncStatus: 'error', tariffSyncError: res.error || 'Error al sincronizar tarifas' });
        return { success: false, message: res.error || 'Error al guardar tarifas' };
      }

      if (get().tariffMatrix !== tariffMatrix) {
        set({ tariffSyncStatus: 'idle', tariffSyncError: null, organizationTariffOutdated: null });
        return { success: true, message: 'Se guardó el pliego enviado. Hay cambios locales posteriores pendientes de sincronizar.' };
      }
      set({ tariffSyncStatus: 'synced', tariffSyncError: null, organizationTariffOutdated: null });
      return { success: true, message: 'Pliego tarifario sincronizado en la nube' };
    } catch (err: any) {
      if (!isCurrent()) return { success: false, message: 'La sesión cambió durante la consulta.' };
      set({ tariffSyncStatus: 'error', tariffSyncError: err.message });
      return { success: false, message: err.message || 'Error de conexión' };
    }
  },

  fetchTariffsFromServer: async () => {
    const { syncSettings, tariffMatrix: initialMatrix } = get();
    if (!syncSettings.authToken) {
      return { success: false, message: 'Inicia sesión para descargar pliegos tarifarios de la nube' };
    }

    const generation = get().sessionGeneration;
    const isCurrent = () => generation === get().sessionGeneration && get().syncSettings.serverUrl === syncSettings.serverUrl && get().syncSettings.currentUser?.organizationId === syncSettings.currentUser?.organizationId;
    set({ tariffSyncStatus: 'syncing', tariffSyncError: null });

    try {
      const res = await SyncService.fetchTariffMatrix(syncSettings.serverUrl, syncSettings.authToken);

      if (!isCurrent()) return { success: false, message: 'La sesión cambió durante la consulta.' };
      if (!res.success) {
        set({ tariffSyncStatus: 'error', tariffSyncError: res.error || 'Error al consultar tarifas' });
        return { success: false, message: res.error || 'Error al consultar tarifas' };
      }


      if (get().tariffMatrix !== initialMatrix) {
        set({ tariffSyncStatus: 'idle', tariffSyncError: null });
        return { success: false, message: 'El pliego cambió localmente durante la descarga. Reintenta para revisar la versión de la nube.' };
      }
      if (res.matrix && classifyTariffMatrix(res.matrix) === 'retired_factory') {
        // La organización guarda una matriz de fábrica anterior sin tocar: se calcula con la vigente y no se escribe
        // en el servidor; Ajustes → Tarifas ofrece subirla con una acción explícita.
        const outdated = { resolutionCode: res.matrix.resolutionCode, effectiveDate: res.matrix.effectiveDate };
        set({ tariffMatrix: DEFAULT_RD_TARIFF_MATRIX, tariffSyncStatus: 'synced', tariffSyncError: null, organizationTariffOutdated: outdated });
        return {
          success: true,
          message: `La organización guarda el pliego de fábrica anterior (${outdated.resolutionCode}). Se usa el vigente (${DEFAULT_RD_TARIFF_MATRIX.resolutionCode}); súbelo a la nube para actualizar el de la organización.`,
        };
      }
      if (res.matrix) {
        set({
          tariffMatrix: normalizeStoredTariffMatrix(res.matrix),
          tariffSyncStatus: 'synced',
          tariffSyncError: null,
          organizationTariffOutdated: null,
        });
        return { success: true, message: 'Pliego tarifario actualizado desde la nube' };
      } else {
        set({ tariffMatrix: DEFAULT_RD_TARIFF_MATRIX, tariffSyncStatus: 'synced', tariffSyncError: null, organizationTariffOutdated: null });
        return { success: true, message: 'La nube no tiene un pliego personalizado. Se usa el pliego base de referencia; confirma su vigencia.' };
      }
    } catch (err: any) {
      if (!isCurrent()) return { success: false, message: 'La sesión cambió durante la consulta.' };
      set({ tariffSyncStatus: 'error', tariffSyncError: err.message });
      return { success: false, message: err.message || 'Error de conexión' };
    }
  },
});
