// Card payloads returned by agent tools. Rendered as React in the app and as MCP Apps views for external hosts.

export type AgentCardType =
  | 'proposal' | 'equipment' | 'catalog-audit' | 'pending-action' | 'client' | 'attachment' | 'document-text';

export interface AgentCardBase<T extends AgentCardType> {
  type: T;
  id: string;
  title: string;
  detail?: string;
}

export interface ProposalCard extends AgentCardBase<'proposal'> {
  status?: string;
  commercialStatus?: string;
  systemKWp?: number;
  priceUSD?: number;
}
export interface EquipmentCard extends AgentCardBase<'equipment'> {
  equipmentType?: 'panel' | 'inverter' | 'battery';
  hasDatasheet?: boolean;
  imageCount?: number;
  bestPriceUSD?: number;
}
export interface CatalogAuditCard extends AgentCardBase<'catalog-audit'> {
  findings: { code: string; severity: 'info' | 'warning' | 'error'; equipmentId?: string; message: string }[];
}
export interface PendingActionCard extends AgentCardBase<'pending-action'> {
  actionId: string;
  changes: { label: string; before?: string; after: string }[];
}
export interface ClientCard extends AgentCardBase<'client'> {
  proposalCount?: number;
}
export interface AttachmentCard extends AgentCardBase<'attachment'> {
  proposalId: string;
  enabled: boolean;
  origin?: 'manual' | 'catalog';
}
export interface DocumentTextCard extends AgentCardBase<'document-text'> {
  proposalId: string;
  key: string;
  before?: string;
  after: string;
}

export type AgentCard =
  | ProposalCard | EquipmentCard | CatalogAuditCard | PendingActionCard | ClientCard | AttachmentCard | DocumentTextCard;
