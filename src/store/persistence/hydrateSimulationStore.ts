import type { SimulationStore } from '../types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../../data/defaultEquipmentCatalog';
import { DEFAULT_RD_TARIFF_MATRIX } from '../../data/rdTariffs';
import { normalizeBrandName, inferBrandFromText } from '../../utils/equipmentBrandUtils';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';
import { normalizeFeatureSettings, featureScope, isFeatureSettings } from '../../../shared/applicationFeatures';

export function hydrateSimulationStore(state: SimulationStore | undefined): void {
  if (state && state.projects && Array.isArray(state.projects)) {
    // Remove legacy hardcoded mock projects and purge expired trash projects (>30 days)
    const mockProjectIds = new Set(['benchmark-centro-medico', 'proj-logistics-hub', 'proj-residential-42']);
    const CUTOFF_30_DAYS = 30 * 24 * 60 * 60 * 1000;
    const isExpiredTrash = (p: any) => {
      if (!p.isDeleted) return false;
      if (!p.deletedAt && !p.updatedAt) return false;
      const raw = p.deletedAt || p.updatedAt;
      const t = new Date(raw).getTime();
      if (isNaN(t) || t <= 0) return false;
      return Date.now() - t > CUTOFF_30_DAYS;
    };
    state.projects = state.projects.filter((p) => !mockProjectIds.has(p.id) && !isExpiredTrash(p));

    // Clean legacy projects that had '(Copia)' embedded in client.name
    let hasChanges = false;
    const cleaned = state.projects.map((p) => {
      let updated = p;
      if (p.client?.name && /\((?:Copia|Copia Importada|COPIA)\)/i.test(p.client.name)) {
        hasChanges = true;
        const clean = p.client.name.replace(/\s*\((?:Copia|Copia Importada|COPIA)\)\s*/gi, '').trim();
        const baseProjId = (p.client.projectId || 'SP-2026-001').replace(/-(?:V|C)\d+$/i, '');
        const newProjId = p.client.projectId && (p.client.projectId.includes('-V') || p.client.projectId.includes('-C'))
          ? p.client.projectId
          : `${baseProjId}-V2`;
        updated = {
          ...updated,
          client: {
            ...updated.client,
            name: clean,
            projectId: newProjId,
          },
        };
      }
      if (updated.specs?.installationServicesDesc && updated.specs.installationServicesDesc.includes('Notas del Sistema:')) {
        hasChanges = true;
        const cleanDesc = updated.specs.installationServicesDesc.split('Notas del Sistema:')[0].trim().replace(/\.\s*$/, '') + '.';
        updated = {
          ...updated,
          specs: {
            ...updated.specs,
            installationServicesDesc: cleanDesc,
          },
        };
      }
      if (
        updated.specs?.batteryBrandModel &&
        (updated.specs.batteryBrandModel.toLowerCase().includes('hinaess') ||
          updated.specs.batteryBrandModel.toLowerCase().includes('powergem') ||
          updated.specs.batteryBrandModel.toLowerCase().includes('banco de baterías de litio')) &&
        updated.specs.batteryBrandModel !== 'Batería Hinaess 16 KwH-48 vdc.'
      ) {
        hasChanges = true;
        updated = {
          ...updated,
          specs: {
            ...updated.specs,
            batteryBrandModel: 'Batería Hinaess 16 KwH-48 vdc.',
            batteryCapacityKWh: updated.specs.batteryCapacityKWh || 16.08,
          },
        };
      }
      // Sanitize legacy ghost overrides from all stored projects to guarantee 100% dynamic calculation
      if (updated.financials && updated.id !== 'benchmark-centro-medico') {
        if (
          updated.financials.customITBISSavedUSD !== undefined ||
          updated.financials.customLey5707CreditUSD !== undefined ||
          updated.financials.customCostUSD !== undefined
        ) {
          hasChanges = true;
          const nextFin = { ...updated.financials };
          delete nextFin.customITBISSavedUSD;
          delete nextFin.customLey5707CreditUSD;
          delete nextFin.customCostUSD;
          updated = {
            ...updated,
            financials: nextFin,
          };
        }
      }
      return updated;
    });
    if (hasChanges) {
      state.projects = cleaned;
    }
    const activeProjects = state.projects.filter((p) => !p.isDeleted);
    if (activeProjects.length > 0 && (!state.activeProjectId || !activeProjects.some((p) => p.id === state.activeProjectId))) {
      state.activeProjectId = activeProjects[0].id;
    }
  }
  if (state) {
    if (!state.equipmentCatalog || !Array.isArray(state.equipmentCatalog) || state.equipmentCatalog.length === 0) {
      state.equipmentCatalog = DEFAULT_EQUIPMENT_CATALOG.filter((equipment) => !(state.deletedEquipmentIds || []).includes(equipment.id));
    } else {
      const legacyDefaultIdsToRemove = new Set([
        'eq-bat-hinaess-powergem-max', // Duplicado de eq-bat-hinaess-16k
        'eq-mod-ja-550', 'eq-mod-ja-545', 'eq-mod-ja-570', 'eq-mod-jinko-575', 'eq-mod-trina-580', 'eq-mod-longi-585',
        'eq-inv-solis-5k', 'eq-inv-solis-6k', 'eq-inv-solis-10k-3p', 'eq-inv-deye-8k-us', 'eq-inv-deye-12k-3p',
        'eq-inv-growatt-6k', 'eq-inv-growatt-10k', 'eq-inv-sungrow-50k', 'eq-inv-huawei-10k',
        'eq-bat-hinaess-14k', 'eq-bat-hinaess-5k', 'eq-bat-dyness-10k', 'eq-bat-felicity-10k', 'eq-bat-felicity-5k',
        'eq-bat-pylontech-5k', 'eq-bat-pylontech-3.5k', 'eq-bat-deye-5k', 'eq-bat-deye-6k', 'eq-bat-byd-4k', 'eq-bat-huawei-5k',
      ]);
      const deletedIds = new Set(state.deletedEquipmentIds || []);
      state.equipmentCatalog = state.equipmentCatalog.filter(
        (e) => !legacyDefaultIdsToRemove.has(e.id) && !deletedIds.has(e.id)
      );
      DEFAULT_EQUIPMENT_CATALOG.forEach((def) => {
        if (
          !legacyDefaultIdsToRemove.has(def.id) &&
          !deletedIds.has(def.id) &&
          !state.equipmentCatalog.some((e) => e.id === def.id || e.displayName === def.displayName)
        ) {
          state.equipmentCatalog.push(def);
        }
      });

      // Sanitización y normalización proactiva de Marcas (Brand) para todos los items
      state.equipmentCatalog = state.equipmentCatalog.map((item) => {
        const currentBrand = (item.brand || '').trim();
        if (!currentBrand || currentBrand.toLowerCase() === 'fabricante' || currentBrand.toLowerCase() === 'desconocido') {
          const inferred = inferBrandFromText(item.displayName, item.modelSeries);
          return { ...item, brand: inferred };
        }
        const normalized = normalizeBrandName(currentBrand);
        return normalized !== currentBrand ? { ...item, brand: normalized } : item;
      });
    }
    // Clean legacy mock test folders
    if (state.folders && Array.isArray(state.folders)) {
      const mockFolderIds = new Set(['folder-commercial', 'folder-electsun', 'folder-solarta']);
      state.folders = state.folders.filter((f) => !mockFolderIds.has(f.id));
    }

    // Auto-migrate legacy serverUrl to official Cloudflare domain
    if (state.syncSettings && (state.syncSettings.serverUrl === 'http://10.0.0.103' || state.syncSettings.serverUrl === 'https://api.electsun.com' || !state.syncSettings.serverUrl)) {
      state.syncSettings.serverUrl = 'https://solarsim.electsun.net';
    }

    // Ensure tariffMatrix is present and auto-migrate legacy CEPM schedules
    if (!state.tariffMatrix || !state.tariffMatrix.schedules) {
      state.tariffMatrix = DEFAULT_RD_TARIFF_MATRIX;
    } else {
      const cepmSchedule = state.tariffMatrix.schedules.CEPM;
      if (!cepmSchedule || !cepmSchedule.tariffs || !cepmSchedule.tariffs['RBT-1']) {
        state.tariffMatrix = {
          ...state.tariffMatrix,
          resolutionCode: 'SIE-176-2025-TF',
          schedules: {
            ...state.tariffMatrix.schedules,
            CEPM: DEFAULT_RD_TARIFF_MATRIX.schedules.CEPM,
            EDEESTE: DEFAULT_RD_TARIFF_MATRIX.schedules.EDEESTE,
          },
        };
      }
    }

    if (!state.defaultDocumentCustomization) {
      state.defaultDocumentCustomization = DEFAULT_DOCUMENT_CUSTOMIZATION;
    } else {
      state.defaultDocumentCustomization = {
        ...DEFAULT_DOCUMENT_CUSTOMIZATION,
        ...state.defaultDocumentCustomization,
      };
    }

    // Validación y auto-renovación silenciosa de sesión en segundo plano al iniciar la app
    if (state.syncSettings?.authToken && typeof window !== 'undefined') {
      setTimeout(() => {
        state.validateSession().then((result) => { if (result.valid) return state.loadOrganizationFeaturePolicy(); }).catch(() => {});
      }, 1200);
    }
  }

}
