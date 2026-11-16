import type { EnergyCalculationMode } from '../../../shared/applicationFeatures';
import type { NetMeteringRegime } from '../../../shared/netMetering';
import type { ProjectSimulation, FinancialSummaryResult } from '../../../src/types';
export interface CalculationSnapshot {
  mode: EnergyCalculationMode;
  capturedAt: string;
  organizationId: string;
  policyVersion: number;
  /** Régimen de medición neta del cálculo publicado. Opcional: los enlaces anteriores no lo traen (régimen anterior). */
  netMeteringRegime?: NetMeteringRegime;
}
export interface ShareProposalPayload {
  project: Pick<ProjectSimulation, 'id' | 'client' | 'specs' | 'rates' | 'financials' | 'monthlyConsumption' | 'customization'>;
  summary: FinancialSummaryResult;
  validityDays: number;
  calculationSnapshot: CalculationSnapshot;
}
export interface StoredProposal {
  id: string;
  createdAt: string;
  expiresAt: string;
  validityDays: number;
  project: ShareProposalPayload['project'];
  summary: FinancialSummaryResult | null;
  calculationSnapshot?: CalculationSnapshot;
  publishedBy?: { userId: string; userName?: string; organizationId: string };
}
