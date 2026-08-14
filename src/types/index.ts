export interface ClientInfo {
  name: string;
  company?: string;
  location: string;
  province: string;
  address?: string; // e.g. "Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD."
  solarSourceMode?: 'province' | 'gps'; // Selection mode for solar radiation
  coordinates?: string; // e.g. "18.4861, -69.9312"
  customMonthlyHSP?: number[]; // Dynamic 12-month solar radiation vector from GPS satellite API
  projectId: string;
  distributor?: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  quoteNumber?: string; // e.g. "C-0030"
  quoteValidityDays?: number; // e.g. 7
}

export interface SystemSpecs {
  isDetailed: boolean;
  panelPowerW: number;
  autoCalculatePanels?: boolean;
  panelCount: number;
  pricePerWattUSD: number;       // USD per Wp e.g. 1.13
  panelBrandModel?: string;      // e.g. "CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)"
  inverterPowerKW: number;
  inverterBrandModel?: string;   // e.g. "Lux Power LXP-LB-US 8K (8.0Kw)"
  inverterCount?: number;        // e.g. 2
  hasBattery: boolean;
  batteryCapacityKWh: number;
  batteryCount?: number;         // e.g. 3
  batteryCostUSD?: number;       // Total battery cost in USD
  batteryBrandModel?: string;    // e.g. "Hinaess 16 KwH-48 vdc"
  installationServicesDesc?: string;
  // Cost & Profit Matrix params matching Excel sheet
  dopExchangeRate?: number;          // RD$ per USD e.g. 60.0
  saleMarginMultiplier?: number;     // Sales Factor e.g. 1.25 (25% margin)
  panelUnitPriceUSD?: number;        // e.g. 103.32 USD
  panelWeightKilos?: number;         // e.g. 30.75
  inverterUnitPriceUSD?: number;     // e.g. 2300.00 USD
  inverterWeightKilos?: number;      // e.g. 12
  batteryUnitPriceUSD?: number;      // e.g. 1990.00 USD
  batteryWeightKilos?: number;       // e.g. 32
  installationUnitPriceUSD?: number; // e.g. 170.00 USD per kWp
  // Detailed params
  panelEfficiency: number;      // % e.g. 21.8
  tempCoeff: number;            // %/°C e.g. -0.35
  systemLosses: number;         // % e.g. 14
  annualDegradation: number;    // % e.g. 0.5
  batteryDOD: number;           // % e.g. 80
  batteryEfficiencyPct?: number;       // % e.g. 92
  batteryNightLoadSharePct?: number;   // % e.g. 50
  batteryLifespanYears?: number;       // e.g. 10
  batteryReplacementCostUSD?: number;  // e.g. 3500 (Optional replacement cost at Year 10)
  daytimeSelfConsumptionRatio?: number; // % e.g. 75
}

export interface UtilityRates {
  energyCostPerKWh: number;     // USD per kWh e.g. 0.18
  distributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  targetCoveragePct: number;    // Target Coverage (%) e.g. 95%
  tariffCode: 'BTS1' | 'BTS2' | 'MTD' | 'BTD' | string;
  currency: 'USD' | 'DOP';
  usdExchangeRate: number;      // RD$ per USD e.g. 60.0
  gridExportFeePct: number;     // SIE-007-2026-REG fee (e.g. 25%)
  annualEnergyInflationPct: number; // e.g. 3.5%
}

export interface FinancialParams {
  applyLey5707: boolean;         // 40% ISR credit over 3 years
  applyITBISExemption: boolean; // 100% ITBIS exoneration
  pricePerWattUSD: number;       // USD per Wp e.g. 1.13
  customCostUSD?: number;        // Direct cost override
  customLey5707CreditUSD?: number; // Explicit override for DGII 40% credit (e.g. 7322.11)
  customITBISSavedUSD?: number;    // Explicit override for ITBIS 18% saved (e.g. 1866.11)
  discountRatePct: number;       // % e.g. 10.0
  projectLifespanYears: number;  // e.g. 25
  co2FactorKgPerKWh: number;     // kg CO2 per kWh e.g. 0.481
}

export interface CostMatrixItem {
  name: string;
  kilos: number;
  quantity: number;
  unitPriceUSD: number;
  unitPriceDOP: number;
  totalPriceDOP: number;
  totalPriceUSD: number;
  itbisDOP: number;
  itbisUSD: number;
}

export interface CostMatrixSummary {
  dopExchangeRate: number;
  saleMarginMultiplier: number;
  items: CostMatrixItem[];
  precioNetoDOP: number;
  precioNetoUSD: number;
  itbisDOP: number;
  itbisUSD: number;
  totalNetoDOP: number;          // Total Cost DOP
  totalNetoUSD: number;          // Total Cost USD
  porcentajeVentaDOP: number;    // Sale Total DOP
  porcentajeVentaUSD: number;    // Sale Total USD
  precioKilosCostoDOP: number;
  precioKilosCostoUSD: number;   // Cost/kWp USD
  precioKilosVentasDOP: number;
  precioKilosVentasUSD: number;  // Sale/kWp USD
  gananciaDOP: number;           // Net Profit DOP
  gananciaUSD: number;           // Net Profit USD
  costPerWattUSD: number;        // Cost/W USD (e.g. $0.90)
  salePricePerWattUSD: number;   // Sale/W USD (e.g. $1.13)
}

export interface MonthlyEnergyResult {
  month: string;
  monthIndex: number;
  days: number;
  hsp: number; // Peak Sun Hours per day
  consumptionKWh: number;
  productionKWh: number;
  solarSelfConsumedKWh: number;
  gridExportedKWh: number;
  savingsUSD: number;
  netBillUSD: number;
  originalBillUSD: number;
}

export interface CashFlowYear {
  year: number;
  productionKWh: number;
  savingsUSD: number;
  taxCreditUSD: number;
  netCashFlowUSD: number;
  cumulativeCashFlowUSD: number;
}

export interface FinancialSummaryResult {
  systemCapacityKWp: number;
  annualConsumptionKWh: number;
  annualProductionKWh: number;
  energyCoveragePct: number;
  grossInvestmentUSD: number;
  solarInvestmentUSD: number;
  batteryInvestmentUSD: number;
  itbisSavedUSD: number;
  ley5707CreditUSD: number;
  netInvestmentUSD: number;
  year1SavingsUSD: number;
  total25YearSavingsUSD: number;
  paybackYears: number;
  irrPct: number;
  npvUSD: number;
  roi25YrPct: number;
  co2AvoidedTonsPerYear: number;
  monthlyBreakdown: MonthlyEnergyResult[];
  cashFlow25Years: CashFlowYear[];
  costMatrix: CostMatrixSummary;
  batteryUsableKWh: number;
  batteryBackupAutonomyHours: number;
}

export interface DocumentCustomization {
  // Company / Issuer Info
  companyName?: string;            // Default: 'electsun'
  companySlogan?: string;          // Default: 'El sol a tu favor'
  companyFooterText?: string;      // Default: 'Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do'
  companyPhone?: string;          // e.g. '+1 (809) 555-0199'
  companyEmail?: string;          // e.g. 'info@electsun.com.do'
  companyRnc?: string;            // e.g. '1-31-12345-6'
  
  // Client & Proposal Presentation
  contactName?: string;           // Default: project.client.name
  clientPhone?: string;           // Default: project.client.contactPhone
  clientEmail?: string;           // Default: project.client.contactEmail
  validityNote?: string;          // Default: 'Precios sujetos a disponibilidad de inventario. Cotización válida por 7 días laborables.'
  
  // Warranties & Guarantees
  panelWarrantyText?: string;     // Default: '25 Años de Producción Lineal'
  inverterWarrantyText?: string;  // Default: '5 a 10 Años de Fábrica'
  batteryWarrantyText?: string;   // Default: '5 a 10 Años (según fabricante)'
  workmanshipWarrantyText?: string; // Default: '1 Año en Instalación y Soporte'
  
  // Management & Turnkey Services ("Nos encargamos de gestionar")
  servicesIncludedText?: string;  // Default: 'Permisos y Tramitación ante CNE y Distribuidora, Medición Neta, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.'
  
  // Watermark Settings
  watermarkOpacity?: number;      // Default: 0.15 (15% opacity)
  
  // Custom Images (Base64 data URLs)
  headerLogoBase64?: string;      // Custom header logo (overrides default)
  watermarkLogoBase64?: string;   // Custom watermark image (overrides default)
}

export interface ProjectSimulation {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'Draft' | 'Final' | 'Archived';
  client: ClientInfo;
  specs: SystemSpecs;
  rates: UtilityRates;
  financials: FinancialParams;
  monthlyConsumption: number[]; // 12 months in kWh
  customization?: DocumentCustomization;
}

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateInfo {
  state: UpdateState;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string | null;
  progressPct?: number;
  transferredBytes?: number;
  totalBytes?: number;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      printToPDF: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
      checkForUpdates: () => Promise<{ success: boolean; message?: string; error?: string; updateInfo?: any }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      quitAndInstall: () => Promise<void>;
      onUpdateStatus: (callback: (info: UpdateInfo) => void) => () => void;
      getAppVersion: () => Promise<string>;
    };
  }
}

