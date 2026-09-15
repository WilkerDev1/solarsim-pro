export interface AIInvoicePayload {
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  apiKey?: string;
  model?: string;
  panelPowerW?: number;
  projectRequirementsText?: string;
  equipmentCatalog?: any[];
  dopExchangeRate?: number;
  includeBattery?: boolean;
}

export interface EquipmentSubstitution {
  type: 'panel' | 'inverter' | 'battery';
  requestedModel: string;
  selectedModel: string;
  reason: string;
}

export interface ExtractedInvoiceResult {
  clientName: string;
  companyName?: string;
  nic?: string;
  nis?: string;
  circuit?: string;
  rnc?: string;
  contractNumber?: string;
  eNCF?: string;
  address?: string;
  province?: string;
  municipality?: string;
  phone?: string;
  email?: string;
  distributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode: string;
  energyCostPerKWhDOP?: number;
  energyCostPerKWhUSD?: number;
  dopExchangeRate?: number;
  marginalRateDOP?: number;
  fixedChargeDOP?: number;
  peakDemandKW?: number;
  demandCostPerKWDOP?: number;
  meterNumber?: string;
  voltagePhase?: string;
  powerFactor?: number;
  billingDays?: number;
  totalBilledAmountDOP?: number;
  totalWithoutSubsidyDOP?: number;
  governmentSubsidyDOP?: number;
  monthlyConsumptionKWh: number[];
  annualConsumptionKWh: number;
  averageMonthlyKWh: number;
  currentBilledKWh?: number;

  // Paneles
  recommendedCapacityKWp?: number;
  recommendedPanelCount?: number;
  selectedPanelId?: string;
  selectedPanelModel?: string;
  selectedPanelWatts?: number;
  selectedPanelUnitPriceUSD?: number;

  // Inversor
  selectedInverterId?: string;
  selectedInverterModel?: string;
  selectedInverterPowerKW?: number;
  selectedInverterCount?: number;
  selectedInverterUnitPriceUSD?: number;

  // Baterías
  hasBattery?: boolean;
  selectedBatteryId?: string;
  selectedBatteryModel?: string;
  selectedBatteryCapacityKWh?: number;
  selectedBatteryCount?: number;
  selectedBatteryUnitPriceUSD?: number;

  // Estrategia Comercial & Finanzas
  targetMarginPct?: number;
  pricingMode?: 'cost_matrix' | 'direct_watt';
  autoSupplierPricing?: boolean;
  selectedSupplierInfo?: {
    panel?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
    inverter?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
    battery?: { supplierName: string; priceUSD: number; updatedAt?: string; supplierPriceId?: string };
  };

  // Metadatos y Razonamiento
  targetCoveragePct?: number;
  confidenceScore: number;
  extractedFromFileName?: string;
  projectRequirementsPrompt?: string;
  aiReasoningSummary?: string;
  specialTechnicalNotes?: string;
  aiNotes?: string;
  equipmentSubstitutions?: EquipmentSubstitution[];

  // Información de modelo y advertencia por fallback en 503 / sin capacidad
  modelUsed?: string;
  requestedModel?: string;
  modelWarning?: string;
}
