import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { resolveDocumentText, type DocumentTextContext, type ResolvedDocumentText } from '../../../../shared/documentTexts';
import type { CompanyProfile, FinancialSummaryResult, ProjectSimulation } from '../../../types';
import { buildDocumentTextContext } from '../../../utils/documentTextContext';
import type { DocumentEditorMode } from './documentEditorState';
import type { RichTextEditorHandle } from './RichTextEditor';

export interface DocumentEditorActions {
  setText: (key: string, value: string) => void;
  resetText: (key: string) => void;
  /** Guarda el texto en la plantilla de la empresa; devuelve si se guardó. */
  saveToTemplate: (key: string) => boolean;
}

export interface DocumentEditorValue extends DocumentEditorActions {
  project: ProjectSimulation;
  ctx: DocumentTextContext;
  mode: DocumentEditorMode;
  /** Edición activa y permitida (escritor, sin papelera ni conflicto). */
  canEdit: boolean;
  resolve: (key: string) => ResolvedDocumentText;
  activeKey: string | null;
  /** Instancia concreta en edición (un mismo texto puede aparecer en varias páginas). */
  activeInstance: string | null;
  setActiveKey: (key: string | null, instance?: string) => void;
  /** Editor del campo activo (la barra superior le pide negrita, cursiva, lista o su valor). */
  editorRef: React.MutableRefObject<RichTextEditorHandle | null>;
}

const DocumentEditorReactContext = createContext<DocumentEditorValue | null>(null);

const NO_ACTIONS: DocumentEditorActions = { setText: () => {}, resetText: () => {}, saveToTemplate: () => false };

interface ProviderProps {
  project: ProjectSimulation;
  summary: Pick<FinancialSummaryResult, 'annualConsumptionKWh' | 'annualProductionKWh' | 'systemCapacityKWp' | 'energyCoveragePct'>;
  currentDateStr: string;
  company?: CompanyProfile;
  mode?: DocumentEditorMode;
  /** Permiso de escritura ya evaluado (`canEditDocument`). */
  writable?: boolean;
  actions?: DocumentEditorActions;
  children: React.ReactNode;
}

/** Fuente única de los textos del documento para todas las páginas de la propuesta. */
export const DocumentEditorProvider: React.FC<ProviderProps> = ({ project, summary, currentDateStr, company, mode = 'view', writable = false, actions = NO_ACTIONS, children }) => {
  const [active, setActive] = useState<{ key: string; instance: string | null } | null>(null);
  const setActiveKey = useCallback((key: string | null, instance?: string) => setActive(key ? { key, instance: instance ?? null } : null), []);
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const ctx = useMemo(
    () => buildDocumentTextContext(project, summary, { currentDateStr, company }),
    [project, summary, currentDateStr, company],
  );
  const resolve = useCallback((key: string) => resolveDocumentText(key, project, ctx), [project, ctx]);
  const canEdit = mode === 'edit' && writable;
  const value = useMemo<DocumentEditorValue>(
    () => ({ project, ctx, mode, canEdit, resolve, activeKey: canEdit ? active?.key ?? null : null, activeInstance: canEdit ? active?.instance ?? null : null, setActiveKey, editorRef, ...actions }),
    [project, ctx, mode, canEdit, resolve, active, setActiveKey, actions],
  );
  return <DocumentEditorReactContext.Provider value={value}>{children}</DocumentEditorReactContext.Provider>;
};

export function useDocumentEditor(): DocumentEditorValue {
  const value = useContext(DocumentEditorReactContext);
  if (!value) throw new Error('EditableText necesita un DocumentEditorProvider (o EnsureDocumentEditor en la página).');
  return value;
}

/** Las páginas también se renderizan sueltas (pruebas, visor): sin proveedor, crean uno de solo lectura. */
export const EnsureDocumentEditor: React.FC<Omit<ProviderProps, 'mode' | 'writable' | 'actions'>> = ({ children, ...props }) => {
  const existing = useContext(DocumentEditorReactContext);
  if (existing) return <>{children}</>;
  return <DocumentEditorProvider {...props}>{children}</DocumentEditorProvider>;
};
