import type { ClientInfo, ProjectSimulation } from '../../../../../types';

/** Teléfono de muestra que el sistema ya no muestra en el campo. */
const PLACEHOLDER_PHONE_MARK = '555-0199';
/** Cotización por defecto que la vista muestra cuando el proyecto no tiene número. */
export const FALLBACK_QUOTE_NUMBER = 'C-0030';
export const DEFAULT_GPS_COORDINATES = '18.4861, -69.9312';

export type SolarSourceMode = 'province' | 'gps';

export const solarSourceMode = (client: Pick<ClientInfo, 'solarSourceMode'>): SolarSourceMode =>
  client.solarSourceMode === 'gps' ? 'gps' : 'province';

export const displayPhone = (client: Pick<ClientInfo, 'contactPhone'>): string =>
  client.contactPhone && !client.contactPhone.includes(PLACEHOLDER_PHONE_MARK) ? client.contactPhone : '';

export const displayContactPerson = (project: Pick<ProjectSimulation, 'client' | 'customization'>): string =>
  project.client.contactPerson ?? project.customization?.contactName ?? project.client.company ?? '';

export const displayQuoteNumber = (client: Pick<ClientInfo, 'quoteNumber'>): string => client.quoteNumber || FALLBACK_QUOTE_NUMBER;

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
