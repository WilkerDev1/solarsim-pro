import { assumptionFields } from '../../../shared/assumptions';
import type { EnergyCalculationMode } from '../../../shared/applicationFeatures';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { SimulationStore } from '../../store/types';
import { localIsoDate } from '../../utils/localDate';
import { newDocumentCompany } from './issuer';
import { createAndOpenQuotation } from './newQuotation';
import { convertProposalToQuotation, type ConversionBlocks, type OmittedDocument, type ProposalSourceContext } from './proposalSource';

type ContextState = Pick<SimulationStore, 'clients' | 'companies' | 'activeCompanyId' | 'defaultSimulationSettings' | 'syncSettings' | 'localUserProfile'>;

/**
 * Contexto de la conversión desde el store: clientes del directorio, membrete (el de la propuesta, si no el de las
 * propuestas nuevas), tasa de las cotizaciones nuevas (la misma que usa `createQuotationRecord`) y vendedor por defecto.
 */
export function proposalConversionContext(
  state: ContextState, companyProfileId: string | undefined, today = localIsoDate(), calculationMode?: EnergyCalculationMode,
): ProposalSourceContext {
  const user = state.syncSettings.currentUser;
  return {
    today,
    clients: state.clients,
    company: (companyProfileId && state.companies.find((c) => c.id === companyProfileId)) || newDocumentCompany(state),
    defaultExchangeRate: assumptionFields(undefined, state.defaultSimulationSettings).specs.dopExchangeRate,
    defaultSeller: user ? user.name : state.localUserProfile?.name ?? '',
    ...(calculationMode ? { calculationMode } : {}),
  };
}

export type CreateFromProposalResult =
  | { ok: true; id: string; notices: string[]; omittedDocuments: OmittedDocument[] }
  | { ok: false; error: string };

/**
 * «Crear borrador» del diálogo: arma el contenido con los bloques elegidos, lo crea con `createAndOpenQuotation`
 * (permisos, validación y enlaces del store) y lo abre en el editor. La propuesta no se modifica.
 */
export function createQuotationFromProposal(projectId: string, blocks: ConversionBlocks, calculationMode?: EnergyCalculationMode): CreateFromProposalResult {
  const state = useSimulationStore.getState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return { ok: false, error: 'La propuesta ya no está disponible.' };
  if (project.isDeleted) return { ok: false, error: 'La propuesta está en la papelera: restáurala para convertirla.' };
  const conversion = convertProposalToQuotation(project, blocks, proposalConversionContext(state, project.companyProfileId, localIsoDate(), calculationMode), () => `line-${crypto.randomUUID()}`);
  if (!conversion.ok) return { ok: false, error: conversion.error };
  const created = createAndOpenQuotation(conversion.value);
  if (!created.ok) return created;
  return { ok: true, id: created.id, notices: conversion.build.notices, omittedDocuments: conversion.build.omittedDocuments };
}
