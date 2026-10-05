import { ProjectSimulation } from './index';

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  versionNumber: number;
  label: string;
  notes?: string;
  type: 'auto' | 'manual'; // auto-checkpoint vs commit/hito manual
  authorName: string;
  authorEmail?: string;
  createdAt: string;
  systemCapacityKWp: number;
  netInvestmentUSD: number;
  panelCount: number;
  data: ProjectSimulation;
}

export interface DiffFieldChange {
  field: string;
  section: string;
  oldValue: any;
  newValue: any;
  formattedOld: string;
  formattedNew: string;
}

export interface ProjectConflictInfo {
  scope?: string;
  reason?: string;
  projectId: string;
  localVersion: number;
  serverVersion: number;
  localProject: ProjectSimulation;
  serverProject: ProjectSimulation;
  lastModifiedByName: string;
  lastModifiedAt: string;
  diffs: DiffFieldChange[];
}
