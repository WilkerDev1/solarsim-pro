import {
  applyDocumentTextPatch, documentTextsPatch, getDocumentTextDefinition, isDocumentSectionId, listDocumentTexts,
} from '../../../shared/documentTexts';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { PDF_COLOR_THEMES } from '../../constants/pdfThemes';
import { documentTextContextFor } from '../../utils/documentTextContext';
import { effectiveFeatureSettings } from '../application/featurePolicy';
import type { ProjectSimulation } from '../../types';
import { findVisibleProject, fingerprint, pickFields, requireEditableProject, store, type NativeHandler } from './nativeTools';

const TEXT_FIELDS = ['customization', 'client'] as const;
const contextFor = (project: ProjectSimulation) => {
  const s = store();
  return documentTextContextFor(s, project, energyCalculationMode(effectiveFeatureSettings(s)));
};

/** Writes document texts on any proposal by id (not only the open one), with the same rules as the inline editor. */
function textsPlan(proposalId: string, values: Record<string, string | null>, title: string) {
  const project = requireEditableProject(proposalId);
  for (const key of Object.keys(values)) if (!getDocumentTextDefinition(key)) throw new Error(`Texto del documento desconocido: ${key}. Usa list_document_texts.`);
  documentTextsPatch(values, project, contextFor(project)); // validates before queueing
  return {
    data: { status: 'ready' },
    plan: {
      title, targetType: 'project' as const,
      changes: Object.entries(values).map(([key, value]) => ({ label: getDocumentTextDefinition(key)!.label, value: value === null ? '(predeterminado)' : value.slice(0, 200) })),
      execute() {
        const current = requireEditableProject(proposalId);
        const before = pickFields(current, TEXT_FIELDS);
        const ok = store().updateProjectById(current.id, (p) => {
          const next = applyDocumentTextPatch({ customization: p.customization || {}, client: p.client }, documentTextsPatch(values, p, contextFor(p)));
          return { customization: next.customization as ProjectSimulation['customization'], client: next.client as ProjectSimulation['client'] };
        });
        if (!ok) throw new Error('La propuesta no admite cambios.');
        const after = store().projects.find((p) => p.id === current.id)!;
        return { targetId: current.id, undo: { before, fields: [...TEXT_FIELDS], afterFingerprint: fingerprint(pickFields(after, TEXT_FIELDS)) } };
      },
    },
  };
}

const listTexts: NativeHandler = (args) => {
  const project = findVisibleProject(args.proposalId);
  const texts = listDocumentTexts(project, contextFor(project), args.section ? { section: args.section } : {}).map((t) => ({
    key: t.key, label: t.label, section: t.section, text: t.text.slice(0, 2000), isCustomized: t.isCustomized, templatable: t.templatable, format: t.format,
  }));
  return { data: { proposalId: project.id, texts } };
};

const setText: NativeHandler = (args) =>
  textsPlan(args.proposalId, { [args.key]: String(args.text) }, `Texto «${getDocumentTextDefinition(args.key)?.label ?? args.key}»`);

const resetText: NativeHandler = (args) =>
  textsPlan(args.proposalId, { [args.key]: null }, `Restablecer «${getDocumentTextDefinition(args.key)?.label ?? args.key}»`);

const setLayout: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  if (args.hiddenSections && !args.hiddenSections.every(isDocumentSectionId)) throw new Error('Sección desconocida en hiddenSections.');
  if (args.themeId && !PDF_COLOR_THEMES.some((t) => t.id === args.themeId)) throw new Error(`Tema desconocido. Usa: ${PDF_COLOR_THEMES.map((t) => t.id).join(', ')}.`);
  const patch = {
    ...(args.hiddenSections ? { hiddenSections: [...args.hiddenSections] } : {}),
    ...(args.themeId ? { themeId: args.themeId } : {}),
    ...(typeof args.showHeadersFooters === 'boolean' ? { showHeadersFooters: args.showHeadersFooters } : {}),
  };
  if (!Object.keys(patch).length) throw new Error('Indica hiddenSections, themeId o showHeadersFooters.');
  return {
    data: { status: 'ready' },
    plan: {
      title: `Diseño del documento: ${project.client.name}`, targetType: 'project',
      changes: Object.entries(patch).map(([k, v]) => ({ label: k, value: Array.isArray(v) ? v.join(', ') || '(ninguna)' : String(v) })),
      execute() {
        const current = requireEditableProject(args.proposalId);
        const before = pickFields(current, ['customization']);
        store().updateProjectById(current.id, (p) => ({ customization: { ...p.customization, layout: { ...p.customization?.layout, ...patch } } }));
        const after = store().projects.find((p) => p.id === current.id)!;
        return { targetId: current.id, undo: { before, fields: ['customization'], afterFingerprint: fingerprint(pickFields(after, ['customization'])) } };
      },
    },
  };
};

const saveToTemplate: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  if (store().activeProjectId !== project.id) throw new Error('Abre la propuesta (open_proposal) antes de guardar sus textos en la plantilla de la empresa.');
  const keys: string[] = args.keys;
  const unknown = keys.filter((k) => !getDocumentTextDefinition(k));
  if (unknown.length) throw new Error(`Textos desconocidos: ${unknown.join(', ')}.`);
  const clientOnly = keys.filter((k) => !getDocumentTextDefinition(k)!.templatable);
  if (clientOnly.length) throw new Error(`Estos textos son del cliente y no van a la plantilla: ${clientOnly.join(', ')}.`);
  return {
    data: { status: 'ready' },
    plan: {
      title: 'Guardar textos en la plantilla de la empresa', targetType: 'project',
      changes: keys.map((k) => ({ label: getDocumentTextDefinition(k)!.label, value: 'Plantilla de la empresa' })),
      execute() {
        const current = requireEditableProject(args.proposalId);
        if (store().activeProjectId !== current.id) throw new Error('La propuesta ya no está abierta.');
        const result = store().saveDocumentTextsToCompanyTemplate(keys);
        if (!result.saved.length) throw new Error(store().saveFeedbackMessage || 'No se guardó ningún texto en la plantilla.');
        // Company templates are device data outside the proposal: not undoable from the activity log.
        return { targetId: current.id, data: result };
      },
    },
  };
};

export const DOCUMENT_TOOL_HANDLERS: Record<string, NativeHandler> = {
  list_document_texts: listTexts,
  set_document_text: setText,
  reset_document_text: resetText,
  set_document_layout: setLayout,
  save_document_text_to_company_template: saveToTemplate,
};
