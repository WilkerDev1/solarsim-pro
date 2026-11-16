import { applyDocumentTextPatch, documentTextsPatch } from '../../shared/documentTexts';
import { aiDocumentTextCatalog, draftDocumentTextValues, type AIDocumentTextEntry, type DraftDocumentText } from '../../shared/documentTexts/aiDraft';
import { energyCalculationMode } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings, type FeaturePolicyState } from '../features/application/featurePolicy';
import { applyDocumentClientEdit } from '../domain/projectEdit';
import { documentTextContextFor } from './documentTextContext';
import { companyDocumentCustomization } from './companyDocumentTemplate';
import { createAIProposalBase } from './proposalDraftProject';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import type { SimulationStore } from '../store/types';
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
  // Contexto del proyecto ya construido (no del abierto antes del borrador): sin atajo por propuesta activa.
  const ctx = documentTextContextFor({ companies: state.companies, activeProjectId: '', getFinancialSummary: () => { throw new Error('unreachable'); } },
    project, energyCalculationMode(effectiveFeatureSettings(state)));
  const next = applyDocumentTextPatch({ customization: project.customization || {}, client: project.client }, documentTextsPatch(draftDocumentTextValues(texts), project, ctx));
  return {
    ...project,
    ...applyDocumentClientEdit(project, { customization: next.customization as ProjectSimulation['customization'], client: next.client as ProjectSimulation['client'] }, { equipmentCatalog: state.equipmentCatalog }),
  };
}

/**
 * Contexto mínimo para el borrador (clave, etiqueta, valor actual): de la propuesta abierta o, para
 * una nueva, de la plantilla de la empresa activa sobre la base del asistente.
 */
export function draftDocumentTextCatalog(state: SimulationStore, target: ProjectSimulation | undefined, province: string): AIDocumentTextEntry[] {
  const mode = energyCalculationMode(effectiveFeatureSettings(state));
  if (target) return aiDocumentTextCatalog(target, documentTextContextFor(state, target, mode));
  const company = state.getActiveCompany();
  const base: ProjectSimulation = {
    ...createAIProposalBase(BENCHMARK_PROJECT, state.defaultSimulationSettings, province),
    companyProfileId: state.activeCompanyId,
    customization: companyDocumentCustomization(company, state.defaultDocumentCustomization, state.documentTemplatesByCompany),
  };
  return aiDocumentTextCatalog(base, documentTextContextFor({ ...state, activeProjectId: '' }, base, mode));
}
