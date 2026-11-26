/** Texto por defecto de la fila de instalación de la página de cotización de la propuesta. */
export const DEFAULT_INSTALLATION_DESCRIPTION = 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).';

/**
 * Descripción de la fila de instalación tal como la imprime la propuesta: el texto del proyecto sin las «Notas del
 * Sistema:» que se le añaden al final; vacío, el texto por defecto. La usan la página de cotización y la conversión
 * a cotización (`src/features/quotations/proposalSource.ts`).
 */
export function cleanInstallationDesc(desc?: string): string {
  if (!desc || typeof desc !== 'string' || !desc.trim()) return DEFAULT_INSTALLATION_DESCRIPTION;
  if (desc.includes('Notas del Sistema:')) {
    const base = desc.split('Notas del Sistema:')[0].trim().replace(/\.\s*$/, '');
    return base ? `${base}.` : DEFAULT_INSTALLATION_DESCRIPTION;
  }
  return desc;
}
