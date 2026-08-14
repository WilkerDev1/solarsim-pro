export interface ExtractedInvoiceData {
  // Client & Company Identity
  clientName: string;
  companyName?: string;
  nic?: string;
  nis?: string;
  rnc?: string;
  contractNumber?: string;
  eNCF?: string;
  address?: string;
  province?: string;
  municipality?: string;
  phone?: string;
  email?: string;

  // Utility & Tariff Data (Dominican Republic EDES: Edesur, Edeeste, Edenorte, CEPM)
  distributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode: 'BTS1' | 'BTS2' | 'MTD' | 'BTD' | string;
  energyCostPerKWhDOP?: number; // e.g. 9.02 DOP/kWh
  fixedChargeDOP?: number;      // e.g. 210.15 DOP
  peakDemandKW?: number;        // e.g. 6.266 kW
  demandCostPerKWDOP?: number;  // e.g. 1189.16 DOP/kW
  meterNumber?: string;
  voltagePhase?: string;        // e.g. "Baja 120/208 Trifásica"
  powerFactor?: number;         // e.g. 0.97 (Eficiencia)
  billingDays?: number;         // e.g. 31 días
  totalBilledAmountDOP?: number;// e.g. 17394.01 DOP
  totalWithoutSubsidyDOP?: number;// e.g. 31680.19 DOP
  governmentSubsidyDOP?: number;// e.g. 14286.18 DOP

  // 12-Month Consumption Vector (Jan to Dec in kWh)
  monthlyConsumptionKWh: number[];
  annualConsumptionKWh: number;
  averageMonthlyKWh: number;
  currentBilledKWh?: number;

  // Automatic Solar Dimensioning Suggestion
  recommendedCapacityKWp?: number;
  recommendedPanelCount?: number;
  targetCoveragePct?: number;

  // AI Inference Metadata
  confidenceScore: number; // 0 - 100%
  extractedFromFileName?: string;
  aiNotes?: string;
}

export interface AISettings {
  apiKey: string;
  model: 'gemini-2.0-flash' | 'gemini-1.5-flash' | 'gemini-1.5-pro';
  customInstructions?: string;
}
