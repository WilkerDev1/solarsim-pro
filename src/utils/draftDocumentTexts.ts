import { applyDocumentTextPatch, documentTextsPatch } from '../../shared/documentTexts';
import { draftDocumentTextValues, type DraftDocumentText } from '../../shared/documentTexts/aiDraft';
import { energyCalculationMode } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings, type FeaturePolicyState } from '../features/application/featurePolicy';
import { applyDocumentClientEdit } from '../domain/projectEdit';
import { buildDocumentTextContext } from './documentTextContext';
import { formatProposalDate } from './formatDateUtils';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import type { CompanyProfile, ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

type DraftTextState = FeaturePolicyState & { companies: CompanyProfile[]; equipmentCatalog: SolarEquipmentItem[] };

/**
 * Aplica los textos del documento de un borrador de IA con los mismos escritores que el editor y
 * `set_document_text`: `documentTextsPatch` (registro, saneo, «igual al predeterminado = restablecer»)
 * y `applyDocumentClientEdit` para los espejos del cliente (ADR 0004).
 */
export function withDraftDocumentTexts(state: DraftTextState, project: ProjectSimulation, texts: readonly DraftDocumentText[] | undefined): ProjectSimulation {
  if (!texts?.length) return project;
  // Contexto del proyecto ya construido, con su propio resumen (no el de la propuesta abierta antes del borrador).
  const ctx = buildDocumentTextContext(project, calculateProjectFinancialSummary(project, energyCalculationMode(effectiveFeatureSettings(state))), {
    currentDateStr: formatProposalDate(project.client?.quoteDate || project.customization?.quoteDate),
    company: state.companies.find((company) => company.id === project.companyProfileId),
  });
  const next = applyDocumentTextPatch({ customization: project.customization || {}, client: project.client }, documentTextsPatch(draftDocumentTextValues(texts), project, ctx));
  return {
    ...project,
    ...applyDocumentClientEdit(project, { customization: next.customization as ProjectSimulation['customization'], client: next.client as ProjectSimulation['client'] }, { equipmentCatalog: state.equipmentCatalog }),
  };
}
