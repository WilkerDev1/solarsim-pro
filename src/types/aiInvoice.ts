export interface InvoiceTierBlock {
  kwh: number;
  rateDOP: number;
}

export interface ExtractedInvoiceData {
  // Client & Company Identity
  clientName: string;
  companyName?: string;
  nic?: string;
  nis?: string;
  rnc?: string;
  contractNumber?: string;
  circuit?: string;             // e.g. "INVI03"
  eNCF?: string;
  address?: string;
  province?: string;
  municipality?: string;
  phone?: string;
  email?: string;

  // Utility & Tariff Data (Dominican Republic EDES: Edesur, Edeeste, Edenorte, CEPM)
  distributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode: 'BTS1' | 'BTS2' | 'MTD' | 'BTD' | string;
  energyCostPerKWhDOP?: number; // e.g. 10.35 DOP/kWh (Effective average or top tier)
  marginalRateDOP?: number;     // e.g. 13.04 DOP/kWh (Top tier for BTS1 escalonado)
  energyTiers?: InvoiceTierBlock[];
  fixedChargeDOP?: number;      // e.g. 127.83 DOP or 210.15 DOP
  peakDemandKW?: number;        // e.g. 6.266 kW
  demandCostPerKWDOP?: number;  // e.g. 1189.16 DOP/kW
  meterNumber?: string;
  voltagePhase?: string;        // e.g. "Baja 120/240 Doble Monofasica", "Baja 120/208 Trifásica"
  powerFactor?: number;         // e.g. 0.97
  billingDays?: number;         // e.g. 31 días
  totalBilledAmountDOP?: number;// e.g. 7096.75 DOP or 17394.01 DOP
  totalWithoutSubsidyDOP?: number;// e.g. 10833.44 DOP
  governmentSubsidyDOP?: number;// e.g. 3736.69 DOP

  // 12-Month Consumption Vector (Jan to Dec in kWh)
  monthlyConsumptionKWh: number[];
  annualConsumptionKWh: number;
  averageMonthlyKWh: number;
  currentBilledKWh?: number;

  // Automatic Solar Dimensioning & Smart Proposal Matching
  recommendedCapacityKWp?: number;
  recommendedPanelCount?: number;
  targetCoveragePct?: number;
  selectedPanelId?: string;
  selectedPanelModel?: string;
  selectedPanelWatts?: number;
  selectedPanelUnitPriceUSD?: number;

  // Smart Inverter Matching
  selectedInverterId?: string;
  selectedInverterModel?: string;
  selectedInverterPowerKW?: number; // Potencia unitaria nominal
  selectedInverterCount?: number;
  selectedInverterUnitPriceUSD?: number;

  // Smart BESS Battery Storage Matching
  hasBattery?: boolean;
  selectedBatteryId?: string;
  selectedBatteryModel?: string;
  selectedBatteryCapacityKWh?: number;
  selectedBatteryCount?: number;
  selectedBatteryUnitPriceUSD?: number;

  // Commercial & Financial Strategy
  targetMarginPct?: number; // e.g. 40 for 40% margin
  pricingMode?: 'cost_matrix' | 'direct_watt'; // e.g. 'cost_matrix'
  autoSupplierPricing?: boolean;
  selectedSupplierInfo?: {
    panel?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
    inverter?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
    battery?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
  };

  // AI Inference Metadata & Reasoning
  confidenceScore: number; // 0 - 100%
  extractedFromFileName?: string;
  projectRequirementsPrompt?: string;
  aiReasoningSummary?: string;
  specialTechnicalNotes?: string;
  aiNotes?: string;
}

export interface GeminiModelInfo {
  id: string;          // e.g. "gemini-2.0-flash" or "gemini-3.5-flash-lite"
  name: string;        // e.g. "Gemini 3.5 Flash Lite"
  description?: string;
  isRecommended?: boolean;
  rateLimitNote?: string;
}

export interface AISettings {
  apiKey: string;
  model: string;
  customInstructions?: string;
}
