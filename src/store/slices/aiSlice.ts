import { SimulationSlice, AISlice } from '../types';
import { ProjectSimulation } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { generateNextProjectSequence } from '../initialData';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';

const normalizeProvinceName = (raw?: string): string => {
  if (!raw) return 'Santo Domingo / Distrito Nacional';
  const lower = raw.toLowerCase();
  if (lower.includes('distrito') || lower.includes('nacional') || lower.includes('santo domingo')) {
    return 'Santo Domingo / Distrito Nacional';
  }
  if (lower.includes('santiago')) return 'Santiago';
  if (lower.includes('altagracia') || lower.includes('punta cana') || lower.includes('higüey')) {
    return 'La Altagracia (Punta Cana / Higüey)';
  }
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

export const createAISlice: SimulationSlice<AISlice> = (set, get) => ({
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',

  setGeminiApiKey: (key) => set({ geminiApiKey: key }),
  setGeminiModel: (model) => set({ geminiModel: model }),

  applyExtractedInvoice: (data, createNewProject = false) => {
    const resolvedProvince = normalizeProvinceName(data.province || data.municipality);

    set((state) => {
      let targetProjectId = state.activeProjectId;
      let projects = [...state.projects];

      if (createNewProject) {
        targetProjectId = `proj-${Date.now()}`;
        const panelW = data.selectedPanelWatts || BENCHMARK_PROJECT.specs.panelPowerW || 620;
        const panelModel = data.selectedPanelModel || BENCHMARK_PROJECT.specs.panelBrandModel;
        const targetCov = 95;
        const sysLosses = 25.0;
        const rec = calculateRecommendedPanelCount(
          resolvedProvince,
          data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
            ? data.monthlyConsumptionKWh
            : BENCHMARK_PROJECT.monthlyConsumption,
          panelW,
          targetCov,
          sysLosses
        );
        const count = data.recommendedPanelCount || rec.recommendedPanelCount;
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
            panelPowerW: panelW,
            panelBrandModel: panelModel,
            systemLosses: 25.0,
            autoCalculatePanels: false,
          },
          rates: {
            ...BENCHMARK_PROJECT.rates,
            targetCoveragePct: 95,
            distributor: data.distributor,
            tariffCode: data.tariffCode,
            ...(data.energyCostPerKWhDOP
              ? { energyCostPerKWh: Math.round((data.energyCostPerKWhDOP / 60) * 100) / 100 }
              : {}),
          },
          monthlyConsumption:
            data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
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
          const panelW = data.selectedPanelWatts || p.specs.panelPowerW || 620;
          const panelModel = data.selectedPanelModel || p.specs.panelBrandModel;
          const targetCov = p.rates.targetCoveragePct ?? 95;
          const sysLosses = p.specs.systemLosses ?? 25.0;
          const rec = calculateRecommendedPanelCount(
            resolvedProvince,
            data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
              ? data.monthlyConsumptionKWh
              : p.monthlyConsumption,
            panelW,
            targetCov,
            sysLosses,
            p.client.customMonthlyHSP
          );
          const count = data.recommendedPanelCount || rec.recommendedPanelCount;
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
              panelPowerW: panelW,
              panelBrandModel: panelModel,
            },
            rates: {
              ...p.rates,
              distributor: data.distributor || p.rates.distributor,
              tariffCode: data.tariffCode || p.rates.tariffCode,
              ...(data.energyCostPerKWhDOP
                ? { energyCostPerKWh: Math.round((data.energyCostPerKWhDOP / p.rates.usdExchangeRate) * 100) / 100 }
                : {}),
            },
            monthlyConsumption:
              data.monthlyConsumptionKWh && data.monthlyConsumptionKWh.length === 12
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
});
