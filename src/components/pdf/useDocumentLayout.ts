import { useCallback, useMemo } from 'react';
import { PDF_COLOR_THEMES, type PDFColorTheme } from '../../constants/pdfThemes';
import type { PDFSectionId } from '../../constants/pdfSections';
import { resolveSectionVisibility, sectionVisibilityPatch, showHeadersFooters, type SectionVisibility } from '../../../shared/documentLayout';
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

/** Visibilidad de secciones, tema y cabecera/pie de la propuesta, guardados en `customization.layout`. */
export function useDocumentLayout(project: ProjectSimulation): DocumentLayoutState {
  const setDocumentLayout = useSimulationStore((state) => state.setDocumentLayout);
  const layout = project.customization?.layout;
  const visibility = useMemo(() => resolveSectionVisibility(layout), [layout]);
  const theme = useMemo(() => PDF_COLOR_THEMES.find((item) => item.id === layout?.themeId) ?? PDF_COLOR_THEMES[0], [layout?.themeId]);
  const setSectionVisible = useCallback(
    (id: PDFSectionId, visible: boolean) => setDocumentLayout(sectionVisibilityPatch(layout, id, visible)),
    [layout, setDocumentLayout],
  );
  const setTheme = useCallback((next: PDFColorTheme) => setDocumentLayout({ themeId: next.id }), [setDocumentLayout]);
  const setShowHeadersFooters = useCallback((show: boolean) => setDocumentLayout({ showHeadersFooters: show }), [setDocumentLayout]);
  return { visibility, theme, showHeadersFooters: showHeadersFooters(layout), setSectionVisible, setTheme, setShowHeadersFooters };
}
