import { PDF_COLOR_THEMES, type PDFColorTheme } from '../../constants/pdfThemes';
import { resolveSectionVisibility, savingsSectionsVisibility, showHeadersFooters, type SectionVisibility } from '../../../shared/documentLayout';
import { resolveSavingsBasis } from '../../../shared/offGridSupply';
import type { ProjectSimulation } from '../../types';

/**
 * Lo que se ve del documento según `customization.layout`, sin escritores ni store: lo usan `useDocumentLayout` y el
 * visor de solo lectura de la cotización. Sin comparación de ahorro (sistema aislado) las páginas de retorno y flujo de
 * caja no se muestran (no se guarda nada).
 */
export function documentLayoutView(project: ProjectSimulation): { visibility: SectionVisibility; theme: PDFColorTheme; showHeadersFooters: boolean } {
  const layout = project.customization?.layout;
  return {
    visibility: savingsSectionsVisibility(resolveSectionVisibility(layout), resolveSavingsBasis(project.rates)),
    theme: PDF_COLOR_THEMES.find((item) => item.id === layout?.themeId) ?? PDF_COLOR_THEMES[0],
    showHeadersFooters: showHeadersFooters(layout),
  };
}
