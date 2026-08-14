import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ProjectSimulation, ClientInfo, SystemSpecs, UtilityRates, FinancialParams, FinancialSummaryResult, UpdateInfo, DocumentCustomization } from '../types';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary } from '../engine/financeEngine';

export interface NewProjectPayload {
  name: string;
  company?: string;
  province?: string;
  distributor?: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode?: string;
  address?: string;
}

interface SimulationState {
  projects: ProjectSimulation[];
  activeProjectId: string;
  activeView: 'dashboard' | 'simulator' | 'pdf-preview';
  searchQuery: string;
  statusFilter: string;

  // Modals & Notifications
  isNewProjectModalOpen: boolean;
  isUpdateModalOpen: boolean;
  updateInfo: UpdateInfo;
  saveFeedbackMessage: string | null;

  // Actions
  setActiveView: (view: 'dashboard' | 'simulator' | 'pdf-preview') => void;
  setActiveProject: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  
  openNewProjectModal: () => void;
  closeNewProjectModal: () => void;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
  setUpdateInfo: (info: UpdateInfo) => void;
  
  updateClient: (client: Partial<ClientInfo>) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
  updateMonthlyConsumption: (index: number, value: number) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  
  createNewProject: (payload?: string | NewProjectPayload) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  setProjectStatus: (id: string, status: 'Draft' | 'Final' | 'Archived') => void;
  saveActiveProject: () => void;

  // Theme & Appearance
  sidebarTheme: 'dark' | 'light';
  toggleSidebarTheme: () => void;
  setSidebarTheme: (theme: 'dark' | 'light') => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  // Computed helper
  getActiveProject: () => ProjectSimulation;
  getFinancialSummary: () => FinancialSummaryResult;
}

const INITIAL_PROJECTS: ProjectSimulation[] = [
  BENCHMARK_PROJECT,
  {
    id: 'proj-logistics-hub',
    createdAt: '2026-08-02T14:20:00Z',
    updatedAt: '2026-08-05T11:00:00Z',
    status: 'Draft',
    client: {
      name: 'Logistics Hub Alpha',
      company: 'Global Freight Inc.',
      location: 'Santiago, RD',
      province: 'Santiago',
      coordinates: '19.4517, -70.6970',
      projectId: 'SP-2024-092',
      distributor: 'EDENORTE',
      tariffCode: 'MTD',
      quoteNumber: 'C-0031',
      quoteValidityDays: 7,
    },
    specs: {
      isDetailed: true,
      panelPowerW: 550,
      autoCalculatePanels: false,
      panelCount: 320, // 176 kWp
      pricePerWattUSD: 1.05,
      panelBrandModel: 'Trina Solar 550W Vertex',
      inverterPowerKW: 150,
      inverterBrandModel: 'Sungrow 150kW HV',
      hasBattery: true,
      batteryCapacityKWh: 100,
      panelEfficiency: 21.3,
      tempCoeff: -0.34,
      systemLosses: 13.5,
      annualDegradation: 0.50,
      batteryDOD: 85,
    },
    rates: {
      energyCostPerKWh: 0.20,
      distributor: 'EDENORTE',
      targetCoveragePct: 95,
      tariffCode: 'MTD',
      currency: 'USD',
      usdExchangeRate: 60.0,
      gridExportFeePct: 25.0,
      annualEnergyInflationPct: 3.5,
    },
    financials: {
      applyLey5707: true,
      applyITBISExemption: true,
      pricePerWattUSD: 1.05,
      discountRatePct: 10.0,
      projectLifespanYears: 25,
      co2FactorKgPerKWh: 0.65,
    },
    monthlyConsumption: Array(12).fill(25000),
  },
  {
    id: 'proj-residential-42',
    createdAt: '2026-08-03T09:15:00Z',
    updatedAt: '2026-08-04T16:45:00Z',
    status: 'Final',
    client: {
      name: 'Residential Array 42',
      company: 'Familia Smith',
      location: 'Punta Cana, RD',
      province: 'La Altagracia (Punta Cana / Higüey)',
      coordinates: '18.5601, -68.3725',
      projectId: 'SP-2024-095',
      distributor: 'CEPM',
      tariffCode: 'BTS1',
      quoteNumber: 'C-0032',
      quoteValidityDays: 7,
    },
    specs: {
      isDetailed: false,
      panelPowerW: 560,
      autoCalculatePanels: false,
      panelCount: 21, // 11.76 kWp
      pricePerWattUSD: 1.25,
      panelBrandModel: 'Canadian Solar 560W',
      inverterPowerKW: 10,
      inverterBrandModel: 'Solis 10kW Hybrid',
      hasBattery: true,
      batteryCapacityKWh: 15,
      panelEfficiency: 21.5,
      tempCoeff: -0.35,
      systemLosses: 14.0,
      annualDegradation: 0.55,
      batteryDOD: 80,
    },
    rates: {
      energyCostPerKWh: 0.25,
      distributor: 'CEPM',
      targetCoveragePct: 95,
      tariffCode: 'BTS1',
      currency: 'USD',
      usdExchangeRate: 60.0,
      gridExportFeePct: 25.0,
      annualEnergyInflationPct: 4.0,
    },
    financials: {
      applyLey5707: true,
      applyITBISExemption: true,
      pricePerWattUSD: 1.25,
      discountRatePct: 10.0,
      projectLifespanYears: 25,
      co2FactorKgPerKWh: 0.65,
    },
    monthlyConsumption: Array(12).fill(1600),
  },
];

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
      projects: INITIAL_PROJECTS,
      activeProjectId: BENCHMARK_PROJECT.id,
      activeView: 'simulator',
      searchQuery: '',
      statusFilter: 'All Projects',

      isNewProjectModalOpen: false,
      isUpdateModalOpen: false,
      updateInfo: { state: 'idle' },
      saveFeedbackMessage: null,

      setActiveView: (view) => set({ activeView: view }),
      setActiveProject: (id) => set({ activeProjectId: id, activeView: 'simulator' }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setStatusFilter: (filter) => set({ statusFilter: filter }),

      openNewProjectModal: () => set({ isNewProjectModalOpen: true }),
      closeNewProjectModal: () => set({ isNewProjectModalOpen: false }),
      openUpdateModal: () => set({ isUpdateModalOpen: true }),
      closeUpdateModal: () => set({ isUpdateModalOpen: false }),
      setUpdateInfo: (info) => set({ updateInfo: info }),

      updateClient: (clientPartial) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                client: { ...p.client, ...clientPartial },
              };
            }
            return p;
          });
          return { projects };
        });
      },

      updateSpecs: (specsPartial) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              const updatedSpecs = { ...p.specs, ...specsPartial };

              // Sync pricePerWattUSD between specs and financials if updated
              let updatedFinancials = { ...p.financials };
              if (specsPartial.pricePerWattUSD !== undefined) {
                updatedFinancials.pricePerWattUSD = specsPartial.pricePerWattUSD;
              }

              return {
                ...p,
                updatedAt: new Date().toISOString(),
                specs: updatedSpecs,
                financials: updatedFinancials,
              };
            }
            return p;
          });
          return { projects };
        });
      },

      updateRates: (ratesPartial) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                rates: { ...p.rates, ...ratesPartial },
              };
            }
            return p;
          });
          return { projects };
        });
      },

      updateFinancials: (finPartial) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              const updatedFinancials = { ...p.financials, ...finPartial };
              let updatedSpecs = { ...p.specs };
              if (finPartial.pricePerWattUSD !== undefined) {
                updatedSpecs.pricePerWattUSD = finPartial.pricePerWattUSD;
              }
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                financials: updatedFinancials,
                specs: updatedSpecs,
              };
            }
            return p;
          });
          return { projects };
        });
      },

      updateMonthlyConsumption: (index, value) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              const newCons = [...p.monthlyConsumption];
              newCons[index] = Math.max(0, value);
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                monthlyConsumption: newCons,
              };
            }
            return p;
          });
          return { projects };
        });
      },

      updateDocumentCustomization: (customizationPartial) => {
        set((state) => {
          const projects = state.projects.map((p) => {
            if (p.id === state.activeProjectId) {
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                customization: { ...(p.customization || {}), ...customizationPartial },
              };
            }
            return p;
          });
          return { projects };
        });
      },

      createNewProject: (payload) => {
        const id = `proj-${Date.now()}`;
        const name = typeof payload === 'string' ? payload : (payload?.name || 'Nuevo Proyecto Solar');
        const company = typeof payload === 'object' && payload?.company ? payload.company : 'Cliente Comercial';
        const province = typeof payload === 'object' && payload?.province ? payload.province : 'Santo Domingo / Distrito Nacional';
        const distributor = typeof payload === 'object' && payload?.distributor ? payload.distributor : 'EDEESTE';
        const tariffCode = typeof payload === 'object' && payload?.tariffCode ? payload.tariffCode : 'BTS2';
        const address = typeof payload === 'object' && payload?.address ? payload.address : `${province}, República Dominicana`;

        const newProj: ProjectSimulation = {
          ...BENCHMARK_PROJECT,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'Draft',
          client: {
            ...BENCHMARK_PROJECT.client,
            name,
            company,
            province,
            location: province,
            address,
            distributor,
            tariffCode,
            projectId: `SP-2026-${Math.floor(100 + Math.random() * 900)}`,
            quoteNumber: `C-${Math.floor(1000 + Math.random() * 9000)}`,
            quoteValidityDays: 7,
          },
          rates: {
            ...BENCHMARK_PROJECT.rates,
            distributor,
            tariffCode,
          },
        };

        set((state) => ({
          projects: [newProj, ...state.projects],
          activeProjectId: id,
          activeView: 'simulator',
          isNewProjectModalOpen: false,
          saveFeedbackMessage: `¡Proyecto "${name}" creado con éxito!`,
        }));

        setTimeout(() => {
          set({ saveFeedbackMessage: null });
        }, 3500);
      },

      duplicateProject: (id) => {
        const target = get().projects.find((p) => p.id === id);
        if (!target) return;

        const newId = `proj-${Date.now()}`;
        const cloned: ProjectSimulation = {
          ...target,
          id: newId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'Draft',
          client: {
            ...target.client,
            name: `${target.client.name} (Copia)`,
            projectId: `SP-2026-${Math.floor(100 + Math.random() * 900)}`,
            quoteNumber: `C-${Math.floor(1000 + Math.random() * 9000)}`,
          },
        };

        set((state) => ({
          projects: [cloned, ...state.projects],
          activeProjectId: newId,
          activeView: 'simulator',
          saveFeedbackMessage: `¡Copia creada con éxito!`,
        }));

        setTimeout(() => {
          set({ saveFeedbackMessage: null });
        }, 3500);
      },

      deleteProject: (id) => {
        set((state) => {
          const projects = state.projects.filter((p) => p.id !== id);
          const activeProjectId = projects.length > 0 ? projects[0].id : '';
          return { projects, activeProjectId };
        });
      },

      setProjectStatus: (id, status) => {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p)),
        }));
      },

      sidebarTheme: 'dark',
      toggleSidebarTheme: () => set((state) => ({ sidebarTheme: state.sidebarTheme === 'dark' ? 'light' : 'dark' })),
      setSidebarTheme: (theme) => set({ sidebarTheme: theme }),
      sidebarWidth: 350,
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(280, Math.min(650, width)) }),

      saveActiveProject: () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === state.activeProjectId ? { ...p, updatedAt: now.toISOString() } : p
          ),
          saveFeedbackMessage: `Guardado a las ${timeStr}`,
        }));

        setTimeout(() => {
          set({ saveFeedbackMessage: null });
        }, 3000);
      },

      getActiveProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((p) => p.id === activeProjectId) || projects[0] || BENCHMARK_PROJECT;
      },

      getFinancialSummary: () => {
        const project = get().getActiveProject();
        return calculateFinancialSummary(
          project.client.province,
          project.specs,
          project.rates,
          project.financials,
          project.monthlyConsumption,
          project.client.customMonthlyHSP
        );
      },
    }),
    {
      name: 'solarsim_pro_projects_store_v1',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }
        // In-memory fallback for non-browser/test environments
        const memStore: Record<string, string> = {};
        return {
          getItem: (key: string) => memStore[key] ?? null,
          setItem: (key: string, value: string) => {
            memStore[key] = value;
          },
          removeItem: (key: string) => {
            delete memStore[key];
          },
        };
      }),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeView: state.activeView,
        searchQuery: state.searchQuery,
        sidebarTheme: state.sidebarTheme,
        sidebarWidth: state.sidebarWidth,
      }),
    }
  )
);
