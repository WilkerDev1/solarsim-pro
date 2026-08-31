import { ProjectSimulation } from '../types';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';

export const INITIAL_PROJECTS: ProjectSimulation[] = [
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

export function generateNextProjectSequence(
  existingProjects: ProjectSimulation[],
  targetYear?: number
): { projectId: string; quoteNumber: string } {
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
