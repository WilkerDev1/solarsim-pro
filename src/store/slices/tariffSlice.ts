import { GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../../types/tariffs';
import { DEFAULT_RD_TARIFF_MATRIX } from '../../data/rdTariffs';
import { SimulationSlice } from '../types';
import { SyncService } from '../../services/syncService';

export interface TariffSlice {
  tariffMatrix: GlobalTariffMatrix;
  tariffSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  tariffSyncError: string | null;

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
      } as UtilityTariffDetails;

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
        ...matrix,
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

    set({ tariffSyncStatus: 'syncing', tariffSyncError: null });

    try {
      const res = await SyncService.syncTariffMatrix(
        syncSettings.serverUrl,
        syncSettings.authToken,
        tariffMatrix
      );

      if (!res.success) {
        set({ tariffSyncStatus: 'error', tariffSyncError: res.error || 'Error al sincronizar tarifas' });
        return { success: false, message: res.error || 'Error al guardar tarifas' };
      }

      set({ tariffSyncStatus: 'synced', tariffSyncError: null });
      return { success: true, message: 'Pliego tarifario sincronizado en la nube' };
    } catch (err: any) {
      set({ tariffSyncStatus: 'error', tariffSyncError: err.message });
      return { success: false, message: err.message || 'Error de conexión' };
    }
  },

  fetchTariffsFromServer: async () => {
    const { syncSettings } = get();
    if (!syncSettings.authToken) {
      return { success: false, message: 'Inicia sesión para descargar pliegos tarifarios de la nube' };
    }

    set({ tariffSyncStatus: 'syncing', tariffSyncError: null });

    try {
      const res = await SyncService.fetchTariffMatrix(syncSettings.serverUrl, syncSettings.authToken);

      if (!res.success) {
        set({ tariffSyncStatus: 'error', tariffSyncError: res.error || 'Error al consultar tarifas' });
        return { success: false, message: res.error || 'Error al consultar tarifas' };
      }


      if (res.matrix) {
        set({
          tariffMatrix: res.matrix,
          tariffSyncStatus: 'synced',
          tariffSyncError: null,
        });
        return { success: true, message: 'Pliego tarifario actualizado desde la nube' };
      } else {
        set({ tariffSyncStatus: 'synced', tariffSyncError: null });
        return { success: true, message: 'La nube usa el pliego base oficial' };
      }
    } catch (err: any) {
      set({ tariffSyncStatus: 'error', tariffSyncError: err.message });
      return { success: false, message: err.message || 'Error de conexión' };
    }
  },
});
