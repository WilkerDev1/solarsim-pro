import { useCallback, useMemo } from 'react';
import { PDF_COLOR_THEMES, type PDFColorTheme } from '../../constants/pdfThemes';
import type { PDFSectionId } from '../../constants/pdfSections';
import { resolveSectionVisibility, savingsSectionsVisibility, sectionVisibilityPatch, showHeadersFooters, type SectionVisibility } from '../../../shared/documentLayout';
import { resolveSavingsBasis } from '../../../shared/offGridSupply';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { ProjectSimulation } from '../../types';

export interface DocumentLayoutState {
  visibility: SectionVisibility;
  theme: PDFColorTheme;
  showHeadersFooters: boolean;
  setSectionVisible: (id: PDFSectionId, visible: boolean) => void;
  setTheme: (theme: PDFColorTheme) => void;
  setShowHeadersFooters: (show: boolean) => void;
}

/**
 * Lo que se ve del documento según `customization.layout`, sin escritores: también lo usa el visor de solo lectura de
 * la cotización. Sin comparación de ahorro (sistema aislado) las páginas de retorno y flujo de caja no se muestran (no
 * se guarda nada).
 */
export function documentLayoutView(project: ProjectSimulation): Pick<DocumentLayoutState, 'visibility' | 'theme' | 'showHeadersFooters'> {
  const layout = project.customization?.layout;
  return {
    visibility: savingsSectionsVisibility(resolveSectionVisibility(layout), resolveSavingsBasis(project.rates)),
    theme: PDF_COLOR_THEMES.find((item) => item.id === layout?.themeId) ?? PDF_COLOR_THEMES[0],
    showHeadersFooters: showHeadersFooters(layout),
  };
}

/** Visibilidad de secciones, tema y cabecera/pie de la propuesta, guardados en `customization.layout`. */
export function useDocumentLayout(project: ProjectSimulation): DocumentLayoutState {
  const setDocumentLayout = useSimulationStore((state) => state.setDocumentLayout);
  const layout = project.customization?.layout;
  const savingsBasis = resolveSavingsBasis(project.rates);
  const visibility = useMemo(() => savingsSectionsVisibility(resolveSectionVisibility(layout), savingsBasis), [layout, savingsBasis]);
  const theme = useMemo(() => PDF_COLOR_THEMES.find((item) => item.id === layout?.themeId) ?? PDF_COLOR_THEMES[0], [layout?.themeId]);
  const setSectionVisible = useCallback(
    (id: PDFSectionId, visible: boolean) => setDocumentLayout(sectionVisibilityPatch(layout, id, visible)),
    [layout, setDocumentLayout],
  );
  const setTheme = useCallback((next: PDFColorTheme) => setDocumentLayout({ themeId: next.id }), [setDocumentLayout]);
  const setShowHeadersFooters = useCallback((show: boolean) => setDocumentLayout({ showHeadersFooters: show }), [setDocumentLayout]);
  return { visibility, theme, showHeadersFooters: showHeadersFooters(layout), setSectionVisible, setTheme, setShowHeadersFooters };
}
