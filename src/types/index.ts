export interface ClientInfo {
  name: string;
  company?: string;
  location: string;
  province: string;
  coordinates?: string; // e.g. "18.4861, -69.9312"
  projectId: string;
  distributor?: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface SystemSpecs {
  isDetailed: boolean;
  panelPowerW: number;
  autoCalculatePanels?: boolean;
  panelCount: number;
  pricePerWattUSD: number;       // USD per Wp e.g. 1.13
  panelBrandModel?: string;
  inverterPowerKW: number;
  inverterBrandModel?: string;
  hasBattery: boolean;
  batteryCapacityKWh: number;
  batteryBrandModel?: string;
  // Detailed params
  panelEfficiency: number;      // % e.g. 21.8
  tempCoeff: number;            // %/°C e.g. -0.35
  systemLosses: number;         // % e.g. 14
  annualDegradation: number;    // % e.g. 0.5
  batteryDOD: number;           // % e.g. 80
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
  discountRatePct: number;       // % e.g. 10.0
  projectLifespanYears: number;  // e.g. 25
  co2FactorKgPerKWh: number;     // kg CO2 per kWh e.g. 0.481
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
  itbisSavedUSD: number;
  ley5707CreditUSD: number;
  netInvestmentUSD: number;
  year1SavingsUSD: number;
  paybackYears: number;
  irrPct: number;
  npvUSD: number;
  roi25YrPct: number;
  co2AvoidedTonsPerYear: number;
  monthlyBreakdown: MonthlyEnergyResult[];
  cashFlow25Years: CashFlowYear[];
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
}
