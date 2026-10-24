import type { LegacyProjectSpecs, SystemSpecs } from '../types';

/**
 * Fixtures de datos VIEJOS (espejo de un solo modelo, hasta 2.7.0). `SystemSpecs` ya no declara esos campos, así que
 * una prueba que necesita simular un cliente 2.6.x, un archivo importado o un parche del asistente los declara aquí.
 * Solo vale para caracterizar compatibilidad; el resto de pruebas usa grupos.
 */
export const legacySpecs = (specs: LegacyProjectSpecs): SystemSpecs => specs;

/** Parche de `updateSpecs`/`applyLegacyEquipmentPatch` escrito con campos sueltos del espejo. */
export const legacyPatch = (patch: Partial<LegacyProjectSpecs>): Partial<SystemSpecs> => patch;
