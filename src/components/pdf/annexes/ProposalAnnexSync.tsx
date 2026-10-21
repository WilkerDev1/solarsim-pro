import React from 'react';
import type { ProjectSimulation } from '../../../types';

export interface ProposalAnnexSyncProps {
  project: ProjectSimulation;
}

/**
 * Keeps the catalog datasheets of the proposal's equipment attached as PDF annexes.
 * Extension point: the automatic annex policy is implemented by the catalog track; today it renders nothing.
 */
export const ProposalAnnexSync: React.FC<ProposalAnnexSyncProps> = () => null;
