import type { ExtractedInvoiceData, GeminiModelInfo } from './aiInvoice';

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
  pricingMode?: 'cost_matrix' | 'direct_watt'; // 'cost_matrix' (default) or 'direct_watt' (manual $/W or $/kW)
  panelPowerW: number;
  autoCalculatePanels?: boolean;
  panelCount: number;
  pricePerWattUSD: number;       // USD per Wp e.g. 1.13
  pricePerKWpUSD?: number;       // USD per kWp e.g. 1130.00
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
  directPriceSurplusTarget?: 'margin' | 'labor'; // Where excess direct price goes: profit margin (default) or installation labor
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
  tariffCode: 'BTS1' | 'BTS2' | 'BTD' | 'BTH' | 'MTD1' | 'MTD2' | 'MTD' | 'MTH' | 'ATD' | string;
  currency: 'USD' | 'DOP';
  usdExchangeRate: number;      // RD$ per USD e.g. 60.0
  gridExportFeePct: number;     // SIE-007-2026-REG fee (e.g. 25%)
  isZeroExport?: boolean;       // Inyección Cero / Antivertido (Zero-Export)
  annualEnergyInflationPct: number; // e.g. 3.5%
}

export interface CustomQuotationItem {
  id: string;
  description: string;
  quantity: number;
  unit?: string;           // e.g. 'UD', 'GL', 'M', 'PZA' (Default: 'UD')
  unitPriceUSD: number;
  exonerateITBIS: boolean; // true = Exonerar ITBIS (18%) por Ley 57-07 | false = Cobrar ITBIS (18%) en la cotización final
  applyITBIS?: boolean;    // Backwards compatibility alias
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
  customItems?: CustomQuotationItem[]; // Custom additional items/services with individual ITBIS toggle
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
  marginOnSalePct?: number;      // % Profit Margin on Sales (e.g. 38.65%)
  markupOnCostPct?: number;      // % Markup on Costs (e.g. 63.00%)
  costPerWattUSD: number;        // Cost/W USD (e.g. $0.90)
  salePricePerWattUSD: number;   // Total System Sale/W USD (with batteries)
  solarSalePricePerWattUSD?: number; // Solar Only Sale/W USD (e.g. $1.13)
  solarOnlyVentaUSD?: number;    // Solar Only Sale USD
  equipmentCostUSD?: number;     // Equipment Cost USD (Panels + Inverters + Batteries)
  equipmentTotalUSD?: number;    // Equipment Total USD (with ITBIS)
  equipmentVentaUSD?: number;    // Equipment Sale USD (Base for Ley 57-07)
  laborCostUSD?: number;         // Labor Cost USD
  laborTotalUSD?: number;        // Labor Total USD (with ITBIS)
  laborVentaUSD?: number;        // Labor Sale USD
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
  equipmentPortionUSD: number;   // Base de Equipos para Ley 57-07 (sin mano de obra)
  laborPortionUSD: number;       // Porción de Mano de Obra y Materiales
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
  customItemsTotalUSD?: number;
  customItemsITBISUSD?: number;
  customItemsList?: CustomQuotationItem[];
}

export interface DocumentCustomization {
  // Company / Issuer Info
  companyName?: string;            // Default: 'electsun'
  companySlogan?: string;          // Default: 'El sol a tu favor'
  companyFooterText?: string;      // Default: 'Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do'
  companyPhone?: string;          // e.g. '+1 (809) 378-6590'
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
  coverLogoBase64?: string;       // Custom cover page logo (overrides default)
  headerLogoBase64?: string;      // Custom header logo (overrides default)
  watermarkLogoBase64?: string;   // Custom watermark image (overrides default)

  // Institutional Presentation & About Us
  companyWebsite?: string;        // Default: 'electsun.com.do'
  companyInstagram?: string;      // Default: 'Electsunrd'
  aboutUsIntroText?: string;      // Default: 'En ELECTSUN, transformamos la energía solar en una solución inteligente...'
  aboutUsTransitionText?: string; // Default: 'Descubre cómo nuestros productos y servicios pueden ayudarte a aprovechar al máximo la energía del sol.'
  whyChooseUsText?: string;       // Default: 'En ELECTSUN, nuestra misión es brindarte soluciones solares...'
  regulatoryNote?: string;        // Default: Resolucion SIE-007-2026-REG & BTS1/BTS2 net metering notes

  // Solar Benefits & Technical Intro (Pages 4 & 5)
  ley5707ObjectivesIntroText?: string;       // Default: 'La **Ley 57-07 sobre Incentivo al Desarrollo...'
  techIntroWhatIsText?: string;              // Default: 'Un sistema fotovoltaico es el conjunto integrado...'
  techIntroHowItWorksParagraph1?: string;    // Default: 'La cantidad de energía eléctrica producida...'
  techIntroHowItWorksParagraph2?: string;    // Default: 'Las celdas fotovoltaicas absorben la radiación...'

  // Project Description & Technical Proposal (Page 6)
  projectSummarySubtitle?: string;           // Default: 'Criterios de dimensionamiento técnico para {client}'
  projectEngineeringScopeText?: string;      // Default: 'junto con todos los componentes de ingeniería complementarios...'
  customProjectSummaryParagraph1?: string;   // Optional full override for paragraph 1
  customProjectSummaryParagraph2?: string;   // Optional full override for paragraph 2

  // Custom Extra Table of Contents Items (Appended Annexes / Extra Pages)
  extraTocItems?: ExtraTOCItem[];
}

export interface ExtraTOCItem {
  id: string;
  title: string;
  subtitle?: string;
  pageCount?: number; // Number of pages this extra section occupies (default: 1)
}

export type UserRole = 'ADMIN' | 'EDITOR' | 'LECTOR';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName?: string;
  isActive?: boolean;
}

export interface SyncSettings {
  serverUrl: string; // e.g. 'http://10.0.0.103' or 'https://api.solarsim.electsun.com'
  autoSyncEnabled: boolean;
  lastSyncTimestamp: string | null;
  authToken: string | null;
  currentUser: UserProfile | null;
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
  // Enterprise Sync & Authorship Metadata
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  version?: number;
  syncStatus?: 'synced' | 'pending' | 'local_only' | 'conflict';
  isDeleted?: boolean;
}

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error';

export interface PlatformInfo {
  platform: 'win32' | 'linux' | 'darwin' | string;
  isAppImage: boolean;
  isArchLinux: boolean;
  isDebian: boolean;
}

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

export * from './aiInvoice';

declare global {
  interface Window {
    electronAPI?: {
      printToPDF: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
      checkForUpdates: () => Promise<{ success: boolean; message?: string; error?: string; updateInfo?: UpdateInfo }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      quitAndInstall: () => Promise<void>;
      onUpdateStatus: (callback: (info: UpdateInfo) => void) => () => void;
      getAppVersion: () => Promise<string>;
      getPlatformInfo: () => Promise<PlatformInfo>;
      openExternalUrl: (url: string) => Promise<void>;
      installLinuxPackage: (packageType: 'pacman' | 'deb', version: string) => Promise<{ success: boolean; error?: string }>;
      parseInvoiceWithAI?: (payload: { fileBase64: string; mimeType: string; fileName: string; apiKey?: string; model?: string; panelPowerW?: number }) => Promise<{ success: boolean; data?: ExtractedInvoiceData; error?: string }>;
      validateGeminiApiKey?: (apiKey: string, model?: string) => Promise<{ success: boolean; error?: string; modelName?: string; models?: GeminiModelInfo[] }>;
      listGeminiModels?: (apiKey: string) => Promise<{ success: boolean; error?: string; models?: GeminiModelInfo[] }>;
    };
  }
}

