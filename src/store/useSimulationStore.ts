import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ProjectSimulation, ClientInfo, SystemSpecs, UtilityRates, FinancialParams, FinancialSummaryResult, UpdateInfo, DocumentCustomization, ExtractedInvoiceData } from '../types';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../engine/financeEngine';

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
  isAIInvoiceModalOpen: boolean;
  isAISettingsModalOpen: boolean;
  isShareModalOpen: boolean;
  updateInfo: UpdateInfo;
  saveFeedbackMessage: string | null;

  // AI Configuration
  geminiApiKey: string;
  geminiModel: string;

  // Actions
  setActiveView: (view: 'dashboard' | 'simulator' | 'pdf-preview') => void;
  setActiveProject: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  
  openNewProjectModal: () => void;
  closeNewProjectModal: () => void;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
  openAIInvoiceModal: () => void;
  closeAIInvoiceModal: () => void;
  openAISettingsModal: () => void;
  closeAISettingsModal: () => void;
  openShareModal: () => void;
  closeShareModal: () => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setUpdateInfo: (info: UpdateInfo) => void;
  
  updateClient: (client: Partial<ClientInfo>) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
  updateMonthlyConsumption: (index: number, value: number) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  applyExtractedInvoice: (data: ExtractedInvoiceData, createNewProject?: boolean) => void;
  
  createNewProject: (payload?: string | NewProjectPayload) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  setProjectStatus: (id: string, status: 'Draft' | 'Final' | 'Archived') => void;
  saveActiveProject: () => void;

  // JSON Import & Export (Database Sharing)
  exportProjectAsJSON: (id?: string) => void;
  exportAllProjectsAsJSON: () => void;
  importProjectsFromJSON: (jsonData: any) => { success: boolean; message: string; count: number };
  pendingImportConflict: {
    incomingProject: ProjectSimulation;
    conflictingProject: ProjectSimulation;
    reason: string;
  } | null;
  resolveImportConflict: (strategy: 'next_sequence' | 'overwrite' | 'copy_version') => void;
  cancelImportConflict: () => void;

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

export function generateNextProjectSequence(existingProjects: ProjectSimulation[], targetYear?: number): { projectId: string; quoteNumber: string } {
  const currentYear = targetYear || new Date().getFullYear();
  let maxSeq = 0;

  for (const p of existingProjects) {
    if (!p.client) continue;

    if (p.client.projectId) {
      const match = p.client.projectId.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }

    if (p.client.quoteNumber) {
      const match = p.client.quoteNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  const nextNum = maxSeq + 1;
  const formattedProj = `SP-${currentYear}-${nextNum.toString().padStart(3, '0')}`;
  const formattedQuote = `C-${nextNum.toString().padStart(4, '0')}`;

  return {
    projectId: formattedProj,
    quoteNumber: formattedQuote,
  };
}

export function generateDuplicateProjectIdentifiers(
  target: ProjectSimulation,
  existingProjects: ProjectSimulation[]
): { cleanName: string; projectId: string; quoteNumber: string; versionSuffix: string } {
  const rawName = target.client?.name || 'Cliente';
  const cleanName = rawName.replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();

  const rawProjId = target.client?.projectId || 'SP-2026-001';
  const baseProjId = rawProjId.replace(/-(?:V|C)\d+$/i, '').trim();

  const rawQuote = target.client?.quoteNumber || 'C-0001';
  const baseQuote = rawQuote.replace(/-(?:V|C)\d+$/i, '').trim();

  let maxVersion = 1;
  for (const p of existingProjects) {
    if (!p.client?.projectId) continue;
    if (p.client.projectId.startsWith(baseProjId)) {
      const match = p.client.projectId.match(/-(?:V|C)(\d+)$/i);
      if (match) {
        const v = parseInt(match[1], 10);
        if (!isNaN(v) && v > maxVersion) {
          maxVersion = v;
        }
      }
    }
    if (p.client?.quoteNumber && p.client.quoteNumber.startsWith(baseQuote)) {
      const matchQ = p.client.quoteNumber.match(/-(?:V|C)(\d+)$/i);
      if (matchQ) {
        const vq = parseInt(matchQ[1], 10);
        if (!isNaN(vq) && vq > maxVersion) {
          maxVersion = vq;
        }
      }
    }
  }

  const nextVersion = maxVersion + 1;
  const versionSuffix = `-V${nextVersion}`;
  const newProjectId = `${baseProjId}${versionSuffix}`;
  const newQuoteNumber = `${baseQuote}${versionSuffix}`;

  return {
    cleanName,
    projectId: newProjectId,
    quoteNumber: newQuoteNumber,
    versionSuffix,
  };
}

export function findDuplicateProjectInfo(
  projectId: string,
  quoteNumber: string,
  currentInternalId: string,
  projects: ProjectSimulation[]
): { isProjectIdDuplicate: boolean; isQuoteDuplicate: boolean; duplicateProjectName?: string } {
  const normalizedProjId = projectId?.trim().toLowerCase();
  const normalizedQuote = quoteNumber?.trim().toLowerCase();

  let isProjectIdDuplicate = false;
  let isQuoteDuplicate = false;
  let duplicateProjectName: string | undefined;

  for (const p of projects) {
    if (p.id === currentInternalId) continue;

    if (normalizedProjId && p.client?.projectId?.trim().toLowerCase() === normalizedProjId) {
      isProjectIdDuplicate = true;
      duplicateProjectName = p.client.name;
    }
    if (normalizedQuote && p.client?.quoteNumber?.trim().toLowerCase() === normalizedQuote) {
      isQuoteDuplicate = true;
      if (!duplicateProjectName) duplicateProjectName = p.client.name;
    }
  }

  return { isProjectIdDuplicate, isQuoteDuplicate, duplicateProjectName };
}

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
      isAIInvoiceModalOpen: false,
      isAISettingsModalOpen: false,
      isShareModalOpen: false,
      updateInfo: { state: 'idle' },
      saveFeedbackMessage: null,
      pendingImportConflict: null,

      geminiApiKey: '',
      geminiModel: 'gemini-3.5-flash-lite',

      setActiveView: (view) => set({ activeView: view }),
      setActiveProject: (id) => set({ activeProjectId: id, activeView: 'simulator' }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setStatusFilter: (filter) => set({ statusFilter: filter }),

      openNewProjectModal: () => set({ isNewProjectModalOpen: true }),
      closeNewProjectModal: () => set({ isNewProjectModalOpen: false }),
      openUpdateModal: () => set({ isUpdateModalOpen: true }),
      closeUpdateModal: () => set({ isUpdateModalOpen: false }),
      openAIInvoiceModal: () => set({ isAIInvoiceModalOpen: true }),
      closeAIInvoiceModal: () => set({ isAIInvoiceModalOpen: false }),
      openAISettingsModal: () => set({ isAISettingsModalOpen: true }),
      closeAISettingsModal: () => set({ isAISettingsModalOpen: false }),
      openShareModal: () => set({ isShareModalOpen: true }),
      closeShareModal: () => set({ isShareModalOpen: false }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      setGeminiModel: (model) => set({ geminiModel: model }),
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

              // Sync pricePerWattUSD and pricePerKWpUSD bidirectionally
              let updatedFinancials = { ...p.financials };
              if (specsPartial.pricePerKWpUSD !== undefined && specsPartial.pricePerKWpUSD > 0) {
                const wPrice = Math.round((specsPartial.pricePerKWpUSD / 1000) * 1000) / 1000;
                updatedSpecs.pricePerWattUSD = wPrice;
                updatedFinancials.pricePerWattUSD = wPrice;
              } else if (specsPartial.pricePerWattUSD !== undefined) {
                updatedSpecs.pricePerKWpUSD = Math.round(specsPartial.pricePerWattUSD * 1000 * 100) / 100;
                updatedFinancials.pricePerWattUSD = specsPartial.pricePerWattUSD;
              }

              // Clear hardcoded cost overrides on spec change to allow dynamic recalculation
              if (
                specsPartial.hasBattery !== undefined ||
                specsPartial.batteryCount !== undefined ||
                specsPartial.batteryCapacityKWh !== undefined ||
                specsPartial.panelCount !== undefined ||
                specsPartial.panelPowerW !== undefined ||
                specsPartial.inverterCount !== undefined ||
                specsPartial.panelUnitPriceUSD !== undefined ||
                specsPartial.inverterUnitPriceUSD !== undefined ||
                specsPartial.batteryUnitPriceUSD !== undefined ||
                specsPartial.installationUnitPriceUSD !== undefined ||
                specsPartial.saleMarginMultiplier !== undefined ||
                specsPartial.dopExchangeRate !== undefined
              ) {
                delete updatedFinancials.customCostUSD;
                delete updatedFinancials.customLey5707CreditUSD;
                delete updatedFinancials.customITBISSavedUSD;

                // If in 'cost_matrix' mode (default) and user didn't explicitly customize pricePerWattUSD in this change, auto-sync from cost matrix
                if (updatedSpecs.pricingMode !== 'direct_watt' && specsPartial.pricePerWattUSD === undefined && specsPartial.pricePerKWpUSD === undefined) {
                  const dcKWp = (updatedSpecs.panelPowerW * updatedSpecs.panelCount) / 1000;
                  const cm = calculateCostMatrixSummary(updatedSpecs, dcKWp);
                  const autoPrice = Math.round(cm.salePricePerWattUSD * 100) / 100;
                  if (autoPrice > 0) {
                    updatedSpecs.pricePerWattUSD = autoPrice;
                    updatedSpecs.pricePerKWpUSD = Math.round(autoPrice * 1000 * 100) / 100;
                    updatedFinancials.pricePerWattUSD = autoPrice;
                  }
                }
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

      applyExtractedInvoice: (data: ExtractedInvoiceData, createNewProject = false) => {
        const normalizeProvinceName = (raw?: string): string => {
          if (!raw) return 'Santo Domingo / Distrito Nacional';
          const lower = raw.toLowerCase();
          if (lower.includes('distrito') || lower.includes('nacional') || lower.includes('santo domingo')) {
            return 'Santo Domingo / Distrito Nacional';
          }
          if (lower.includes('santiago')) return 'Santiago';
          if (lower.includes('altagracia') || lower.includes('punta cana') || lower.includes('higüey')) return 'La Altagracia (Punta Cana / Higüey)';
          if (lower.includes('puerto plata')) return 'Puerto Plata';
          if (lower.includes('cristóbal') || lower.includes('cristobal')) return 'San Cristóbal';
          if (lower.includes('vega')) return 'La Vega';
          if (lower.includes('duarte') || lower.includes('francisco')) return 'Duarte (San Fco. de Macorís)';
          if (lower.includes('romana')) return 'La Romana';
          if (lower.includes('san pedro')) return 'San Pedro de Macorís';
          if (lower.includes('monseñor') || lower.includes('bonao')) return 'Monseñor Nouel (Bonao)';
          if (lower.includes('peravia') || lower.includes('baní') || lower.includes('bani')) return 'Peravia (Baní)';
          if (lower.includes('azua')) return 'Azua';
          if (lower.includes('barahona')) return 'Barahona';
          if (lower.includes('samana') || lower.includes('samaná')) return 'Samaná';
          if (lower.includes('monte cristi')) return 'Monte Cristi';
          return 'Santo Domingo / Distrito Nacional';
        };

        const resolvedProvince = normalizeProvinceName(data.province || data.municipality);

        set((state) => {
          let targetProjectId = state.activeProjectId;
          let projects = [...state.projects];

          if (createNewProject) {
            targetProjectId = `proj-${Date.now()}`;
            const panelW = BENCHMARK_PROJECT.specs.panelPowerW || 620;
            const count = data.recommendedPanelCount || Math.max(1, Math.ceil(((data.recommendedCapacityKWp || 10) * 1000) / panelW));
            const seq = generateNextProjectSequence(projects);
            
            const newProj: ProjectSimulation = {
              ...BENCHMARK_PROJECT,
              id: targetProjectId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'Draft',
              client: {
                ...BENCHMARK_PROJECT.client,
                name: data.clientName || 'Cliente Factura EDE',
                company: data.companyName || '',
                location: data.address || `${resolvedProvince}, RD`,
                province: resolvedProvince,
                address: data.address || '',
                distributor: data.distributor,
                tariffCode: data.tariffCode,
                contactPhone: data.phone || '',
                contactEmail: data.email || '',
                projectId: seq.projectId,
                quoteNumber: seq.quoteNumber,
                quoteValidityDays: 7,
              },
              specs: {
                ...BENCHMARK_PROJECT.specs,
                panelCount: count,
              },
              rates: {
                ...BENCHMARK_PROJECT.rates,
                distributor: data.distributor,
                tariffCode: data.tariffCode,
                ...(data.energyCostPerKWhDOP ? { energyCostPerKWh: Math.round((data.energyCostPerKWhDOP / 60) * 100) / 100 } : {}),
              },
              monthlyConsumption: data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
                ? [...data.monthlyConsumptionKWh]
                : [...BENCHMARK_PROJECT.monthlyConsumption],
            };

            projects = [newProj, ...projects];
            return {
              projects,
              activeProjectId: targetProjectId,
              activeView: 'simulator',
              isAIInvoiceModalOpen: false,
              saveFeedbackMessage: '¡Proyecto creado y dimensionado con IA desde la factura EDE! ✨',
            };
          }

          // Update active project
          projects = projects.map((p) => {
            if (p.id === targetProjectId) {
              const panelW = p.specs.panelPowerW || 620;
              const count = data.recommendedPanelCount || Math.max(1, Math.ceil(((data.recommendedCapacityKWp || 10) * 1000) / panelW));
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                client: {
                  ...p.client,
                  name: data.clientName || p.client.name,
                  company: data.companyName || p.client.company,
                  location: data.address || p.client.location,
                  province: resolvedProvince,
                  address: data.address || p.client.address,
                  distributor: data.distributor || p.client.distributor,
                  tariffCode: data.tariffCode || p.client.tariffCode,
                  contactPhone: data.phone || p.client.contactPhone,
                  contactEmail: data.email || p.client.contactEmail,
                },
                specs: {
                  ...p.specs,
                  panelCount: count,
                },
                rates: {
                  ...p.rates,
                  distributor: data.distributor || p.rates.distributor,
                  tariffCode: data.tariffCode || p.rates.tariffCode,
                  ...(data.energyCostPerKWhDOP ? { energyCostPerKWh: Math.round((data.energyCostPerKWhDOP / p.rates.usdExchangeRate) * 100) / 100 } : {}),
                },
                monthlyConsumption: data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
                  ? [...data.monthlyConsumptionKWh]
                  : p.monthlyConsumption,
              };
            }
            return p;
          });

          return {
            projects,
            isAIInvoiceModalOpen: false,
            saveFeedbackMessage: '¡Datos de consumo y cliente aplicados con IA exitosamente! ✨',
          };
        });

        setTimeout(() => {
          set({ saveFeedbackMessage: null });
        }, 4000);
      },

      createNewProject: (payload) => {
        const id = `proj-${Date.now()}`;
        const name = typeof payload === 'string' ? payload : (payload?.name || 'Nuevo Proyecto Solar');
        const company = typeof payload === 'object' && payload?.company ? payload.company : 'Cliente Comercial';
        const province = typeof payload === 'object' && payload?.province ? payload.province : 'Santo Domingo / Distrito Nacional';
        const distributor = typeof payload === 'object' && payload?.distributor ? payload.distributor : 'EDEESTE';
        const tariffCode = typeof payload === 'object' && payload?.tariffCode ? payload.tariffCode : 'BTS2';
        const address = typeof payload === 'object' && payload?.address ? payload.address : `${province}, República Dominicana`;
        const seq = generateNextProjectSequence(get().projects);

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
            projectId: seq.projectId,
            quoteNumber: seq.quoteNumber,
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
          saveFeedbackMessage: `¡Proyecto "${name}" (${seq.projectId}) creado con éxito!`,
        }));

        setTimeout(() => {
          set({ saveFeedbackMessage: null });
        }, 3500);
      },

      duplicateProject: (id) => {
        const target = get().projects.find((p) => p.id === id);
        if (!target) return;

        const newId = `proj-${Date.now()}`;
        const dupIdentifiers = generateDuplicateProjectIdentifiers(target, get().projects);
        const cloned: ProjectSimulation = {
          ...target,
          id: newId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'Draft',
          client: {
            ...target.client,
            name: dupIdentifiers.cleanName,
            projectId: dupIdentifiers.projectId,
            quoteNumber: dupIdentifiers.quoteNumber,
          },
        };

        set((state) => ({
          projects: [cloned, ...state.projects],
          activeProjectId: newId,
          activeView: 'simulator',
          saveFeedbackMessage: `¡Versión ${dupIdentifiers.projectId} creada con éxito!`,
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

      exportProjectAsJSON: (id?: string) => {
        const targetId = id || get().activeProjectId;
        const project = get().projects.find((p) => p.id === targetId) || get().getActiveProject();
        if (!project) return;

        const exportPayload = {
          app: 'SolarSim Pro',
          version: '1.4.0',
          exportedAt: new Date().toISOString(),
          type: 'single_project',
          project,
        };

        const clientNameSanitized = (project.client.name || 'Proyecto')
          .replace(/[^a-zA-Z0-9_\-]/g, '_')
          .substring(0, 40);
        const projId = project.client.projectId || 'SP-2026';
        const filename = `SolarSim_${clientNameSanitized}_${projId}.json`;

        const jsonStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        set({ saveFeedbackMessage: `¡Proyecto "${project.client.name}" exportado como JSON!` });
        setTimeout(() => set({ saveFeedbackMessage: null }), 3500);
      },

      exportAllProjectsAsJSON: () => {
        const { projects } = get();
        const exportPayload = {
          app: 'SolarSim Pro',
          version: '1.4.0',
          exportedAt: new Date().toISOString(),
          type: 'projects_backup',
          totalProjects: projects.length,
          projects,
        };

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `SolarSim_Pro_Backup_Proyectos_${dateStr}.json`;

        const jsonStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        set({ saveFeedbackMessage: `¡Respaldo de ${projects.length} proyectos exportado!` });
        setTimeout(() => set({ saveFeedbackMessage: null }), 3500);
      },

      importProjectsFromJSON: (jsonData: any) => {
        try {
          let importedList: ProjectSimulation[] = [];

          // Case 1: Direct single project object
          if (jsonData && typeof jsonData === 'object' && jsonData.client && jsonData.specs && jsonData.rates) {
            importedList = [jsonData as ProjectSimulation];
          }
          // Case 2: Wrapped single project { project: { ... } }
          else if (jsonData && typeof jsonData === 'object' && jsonData.project && jsonData.project.client) {
            importedList = [jsonData.project as ProjectSimulation];
          }
          // Case 3: Array of projects
          else if (Array.isArray(jsonData)) {
            importedList = jsonData.filter((p) => p && typeof p === 'object' && p.client && p.specs && p.rates);
          }
          // Case 4: Backup object { projects: [ ... ] }
          else if (jsonData && typeof jsonData === 'object' && Array.isArray(jsonData.projects)) {
            importedList = jsonData.projects.filter((p: any) => p && typeof p === 'object' && p.client && p.specs && p.rates);
          }

          if (importedList.length === 0) {
            return {
              success: false,
              message: 'El archivo JSON no contiene una estructura de proyecto válida de SolarSim Pro.',
              count: 0,
            };
          }

          // Sanitize each project to guarantee complete numeric integrity and valid defaults
          importedList = importedList.map((raw) => ({
            ...BENCHMARK_PROJECT,
            ...raw,
            id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `proj-${Date.now()}`,
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: raw.status || 'Draft',
            client: {
              ...BENCHMARK_PROJECT.client,
              ...(raw.client || {}),
              name: typeof raw.client?.name === 'string' ? raw.client.name.trim() : 'Cliente Importado',
              projectId: raw.client?.projectId || 'SP-2026-001',
              quoteNumber: raw.client?.quoteNumber || 'C-0001',
            },
            specs: {
              ...BENCHMARK_PROJECT.specs,
              ...(raw.specs || {}),
              panelCount: typeof raw.specs?.panelCount === 'number' && raw.specs.panelCount > 0 ? raw.specs.panelCount : 10,
              panelPowerW: typeof raw.specs?.panelPowerW === 'number' && raw.specs.panelPowerW > 0 ? raw.specs.panelPowerW : 620,
            },
            rates: {
              ...BENCHMARK_PROJECT.rates,
              ...(raw.rates || {}),
              energyCostPerKWh: typeof raw.rates?.energyCostPerKWh === 'number' && raw.rates.energyCostPerKWh > 0 ? raw.rates.energyCostPerKWh : 0.20,
            },
            financials: {
              ...BENCHMARK_PROJECT.financials,
              ...(raw.financials || {}),
            },
            monthlyConsumption: Array.isArray(raw.monthlyConsumption) && raw.monthlyConsumption.length === 12
              ? raw.monthlyConsumption.map((v: any) => typeof v === 'number' && !isNaN(v) && v >= 0 ? v : 1000)
              : [...BENCHMARK_PROJECT.monthlyConsumption],
            customization: {
              ...BENCHMARK_PROJECT.customization,
              ...(raw.customization || {}),
            },
          }));

          const currentProjects = get().projects;

          // If a SINGLE project is imported, check for ID / quote conflict to offer Option C modal
          if (importedList.length === 1) {
            const incoming = importedList[0];
            const conflicting = currentProjects.find(
              (p) =>
                p.id === incoming.id ||
                (p.client?.projectId && incoming.client?.projectId && p.client.projectId.trim().toLowerCase() === incoming.client.projectId.trim().toLowerCase()) ||
                (p.client?.quoteNumber && incoming.client?.quoteNumber && p.client.quoteNumber.trim().toLowerCase() === incoming.client.quoteNumber.trim().toLowerCase())
            );

            if (conflicting) {
              let reason = '';
              if (conflicting.client?.projectId?.trim().toLowerCase() === incoming.client?.projectId?.trim().toLowerCase()) {
                reason = `El ID de Proyecto "${incoming.client.projectId}" ya está registrado por "${conflicting.client.name}".`;
              } else if (conflicting.client?.quoteNumber?.trim().toLowerCase() === incoming.client?.quoteNumber?.trim().toLowerCase()) {
                reason = `El N° de Cotización "${incoming.client.quoteNumber}" ya está registrado por "${conflicting.client.name}".`;
              } else {
                reason = `El proyecto ya existe en tu catálogo ("${conflicting.client.name}").`;
              }

              set({
                pendingImportConflict: {
                  incomingProject: incoming,
                  conflictingProject: conflicting,
                  reason,
                },
              });

              return {
                success: true,
                message: 'Se detectó un conflicto de ID. Selecciona cómo deseas importarlo.',
                count: 1,
              };
            }
          }

          // If no conflict or multiple projects in backup, process directly with unique IDs
          const existingIds = new Set(currentProjects.map((p) => p.id));
          const processedProjects: ProjectSimulation[] = [];

          for (const proj of importedList) {
            let finalId = proj.id;
            if (!finalId || existingIds.has(finalId)) {
              finalId = `proj-imported-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
            }
            existingIds.add(finalId);

            processedProjects.push({
              ...proj,
              id: finalId,
              updatedAt: new Date().toISOString(),
            });
          }

          const newProjectsList = [...processedProjects, ...currentProjects];
          const firstImportedId = processedProjects[0].id;

          set({
            projects: newProjectsList,
            activeProjectId: firstImportedId,
            activeView: 'simulator',
            saveFeedbackMessage: `¡${processedProjects.length} ${
              processedProjects.length === 1 ? 'proyecto importado' : 'proyectos importados'
            } con éxito!`,
          });

          setTimeout(() => set({ saveFeedbackMessage: null }), 4000);

          return {
            success: true,
            message: `Se importaron ${processedProjects.length} proyecto(s) correctamente.`,
            count: processedProjects.length,
          };
        } catch (err: any) {
          console.error('Error importing project JSON:', err);
          return {
            success: false,
            message: `Error al procesar el archivo: ${err?.message || 'Formato inválido'}`,
            count: 0,
          };
        }
      },

      resolveImportConflict: (strategy) => {
        const conflict = get().pendingImportConflict;
        if (!conflict) return;

        const { incomingProject, conflictingProject } = conflict;
        const currentProjects = get().projects;
        let updatedProjects: ProjectSimulation[] = [];
        let targetActiveId = '';
        let toastMsg = '';

        if (strategy === 'next_sequence') {
          const nextSeq = generateNextProjectSequence(currentProjects);
          const newId = `proj-imported-${Date.now()}`;
          const newProj: ProjectSimulation = {
            ...incomingProject,
            id: newId,
            updatedAt: new Date().toISOString(),
            client: {
              ...incomingProject.client,
              projectId: nextSeq.projectId,
              quoteNumber: nextSeq.quoteNumber,
            },
          };
          updatedProjects = [newProj, ...currentProjects];
          targetActiveId = newId;
          toastMsg = `¡Proyecto importado con nuevo ID asignado (${nextSeq.projectId})!`;
        } else if (strategy === 'overwrite') {
          const updatedProj: ProjectSimulation = {
            ...incomingProject,
            id: conflictingProject.id,
            updatedAt: new Date().toISOString(),
          };
          updatedProjects = currentProjects.map((p) => (p.id === conflictingProject.id ? updatedProj : p));
          targetActiveId = conflictingProject.id;
          toastMsg = `¡Proyecto "${incomingProject.client.name}" sobrescrito con éxito!`;
        } else if (strategy === 'copy_version') {
          const newId = `proj-imported-${Date.now()}`;
          const dupIdentifiers = generateDuplicateProjectIdentifiers(incomingProject, currentProjects);
          const newProj: ProjectSimulation = {
            ...incomingProject,
            id: newId,
            updatedAt: new Date().toISOString(),
            client: {
              ...incomingProject.client,
              name: dupIdentifiers.cleanName,
              projectId: dupIdentifiers.projectId,
              quoteNumber: dupIdentifiers.quoteNumber,
            },
          };
          updatedProjects = [newProj, ...currentProjects];
          targetActiveId = newId;
          toastMsg = `¡Proyecto importado como versión (${newProj.client.projectId})!`;
        }

        set({
          projects: updatedProjects,
          activeProjectId: targetActiveId,
          activeView: 'simulator',
          pendingImportConflict: null,
          saveFeedbackMessage: toastMsg,
        });

        setTimeout(() => set({ saveFeedbackMessage: null }), 4000);
      },

      cancelImportConflict: () => {
        set({ pendingImportConflict: null });
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
      onRehydrateStorage: () => (state) => {
        if (state && state.projects && Array.isArray(state.projects)) {
          // Clean legacy projects that had '(Copia)' embedded in client.name
          let hasChanges = false;
          const cleaned = state.projects.map((p) => {
            if (p.client?.name && /\((?:Copia|Copia Importada|COPIA)\)/i.test(p.client.name)) {
              hasChanges = true;
              const clean = p.client.name.replace(/\s*\((?:Copia|Copia Importada|COPIA)\)\s*/gi, '').trim();
              const baseProjId = (p.client.projectId || 'SP-2026-001').replace(/-(?:V|C)\d+$/i, '');
              const newProjId = p.client.projectId && (p.client.projectId.includes('-V') || p.client.projectId.includes('-C'))
                ? p.client.projectId
                : `${baseProjId}-V2`;
              return {
                ...p,
                client: {
                  ...p.client,
                  name: clean,
                  projectId: newProjId,
                },
              };
            }
            return p;
          });
          if (hasChanges) {
            state.projects = cleaned;
          }
        }
      },
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeView: state.activeView,
        searchQuery: state.searchQuery,
        sidebarTheme: state.sidebarTheme,
        sidebarWidth: state.sidebarWidth,
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
      }),
    }
  )
);
