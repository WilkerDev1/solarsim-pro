export interface ExtractedInvoiceData {
  // Client & Company Identity
  clientName: string;
  companyName?: string;
  nic?: string;
  rnc?: string;
  contractNumber?: string;
  address?: string;
  province?: string;
  phone?: string;
  email?: string;

  // Utility & Tariff Data (Dominican Republic EDES)
  distributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode: 'BTS1' | 'BTS2' | 'MTD' | 'BTD' | string;
  energyCostPerKWhDOP?: number;
  meterNumber?: string;

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
