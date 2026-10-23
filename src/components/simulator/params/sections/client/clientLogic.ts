import type { ClientInfo, ProjectSimulation } from '../../../../../types';
import { SAMPLE_PHONE_MARKER, SAMPLE_QUOTE_NUMBER } from '../../logic/dockDefaults';


export type SolarSourceMode = 'province' | 'gps';

export const solarSourceMode = (client: Pick<ClientInfo, 'solarSourceMode'>): SolarSourceMode =>
  client.solarSourceMode === 'gps' ? 'gps' : 'province';

export const displayPhone = (client: Pick<ClientInfo, 'contactPhone'>): string =>
  client.contactPhone && !client.contactPhone.includes(SAMPLE_PHONE_MARKER) ? client.contactPhone : '';

export const displayContactPerson = (project: Pick<ProjectSimulation, 'client' | 'customization'>): string =>
  project.client.contactPerson ?? project.customization?.contactName ?? project.client.company ?? '';

export const displayQuoteNumber = (client: Pick<ClientInfo, 'quoteNumber'>): string => client.quoteNumber || SAMPLE_QUOTE_NUMBER;

export interface DuplicateCheck {
  isProjectIdDuplicate: boolean;
  isQuoteDuplicate: boolean;
  duplicateProjectName?: string;
}

/** Texto del aviso de duplicado; null cuando no hay duplicado. */
export function duplicateMessage(check: DuplicateCheck, client: Pick<ClientInfo, 'projectId' | 'quoteNumber'>): string | null {
  if (check.isProjectIdDuplicate && check.isQuoteDuplicate) return `ID y cotización ya pertenecen a «${check.duplicateProjectName}».`;
  if (check.isProjectIdDuplicate) return `El ID «${client.projectId}» ya está en «${check.duplicateProjectName}».`;
  if (check.isQuoteDuplicate) return `La cotización «${client.quoteNumber}» ya está en «${check.duplicateProjectName}».`;
  return null;
}
