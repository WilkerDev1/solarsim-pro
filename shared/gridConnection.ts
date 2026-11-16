/**
 * Tipo de conexión del sistema con la red de la distribuidora: un solo concepto para el motor,
 * el dock, el documento, las herramientas de agente y el visor web.
 *
 * - `grid_export`: conectado a la red con exportación de excedentes (medición neta, con retención).
 * - `zero_export`: conectado a la red con limitador antivertido (inyección cero): se importa de la
 *   red para cubrir el déficit, pero el excedente se recorta y no se exporta.
 * - `off_grid`: sistema aislado («modo isla»), sin acometida: nunca importa ni exporta. El excedente
 *   se recorta y el déficit que no cubren el sol ni la batería es energía no servida (o la cubre un
 *   respaldo externo, p. ej. una planta).
 *
 * Compatibilidad: hasta 2.7.x solo existía `rates.isZeroExport`. Toda escritura guarda ambos campos
 * coherentes (`isZeroExport` = no exporta), de modo que una versión anterior que solo lee
 * `isZeroExport` trata una propuesta aislada como inyección cero (no exporta). Al leer, un
 * `gridConnection` que contradice `isZeroExport` (lo escribió una versión anterior al cambiar solo
 * `isZeroExport`) se descarta y manda `isZeroExport`.
 */
export type GridConnectionMode = 'grid_export' | 'zero_export' | 'off_grid';

export const GRID_CONNECTION_MODES: readonly GridConnectionMode[] = ['grid_export', 'zero_export', 'off_grid'];

export const GRID_CONNECTION_LABELS: Readonly<Record<GridConnectionMode, string>> = {
  grid_export: 'Conectado a red',
  zero_export: 'Inyección cero',
  off_grid: 'Aislado (modo isla)',
};

export interface GridConnectionFields {
  gridConnection?: unknown;
  isZeroExport?: unknown;
}

export const isGridConnectionMode = (value: unknown): value is GridConnectionMode =>
  typeof value === 'string' && (GRID_CONNECTION_MODES as readonly string[]).includes(value);

/** Tipo de conexión efectivo de unas tarifas guardadas (propuesta, importación, historial o snapshot publicado). */
export function resolveGridConnection(rates: GridConnectionFields | null | undefined): GridConnectionMode {
  const legacyNoExport = rates?.isZeroExport === true;
  const mode = rates?.gridConnection;
  if (isGridConnectionMode(mode) && (mode !== 'grid_export') === legacyNoExport) return mode;
  return legacyNoExport ? 'zero_export' : 'grid_export';
}

/** Campos a escribir para fijar un tipo de conexión (ambos, siempre coherentes). */
export function gridConnectionFields(mode: GridConnectionMode): { gridConnection: GridConnectionMode; isZeroExport: boolean } {
  return { gridConnection: mode, isZeroExport: mode !== 'grid_export' };
}

/**
 * Normaliza un parche de tarifas contra las tarifas actuales: si el parche fija `gridConnection`, se
 * deriva `isZeroExport`; si solo trae `isZeroExport` (versión anterior, asistente, preferencias), se
 * deriva `gridConnection` conservando «aislado» cuando el parche sigue sin exportar.
 */
export function normalizeGridConnectionPatch<T extends GridConnectionFields>(current: GridConnectionFields | null | undefined, patch: T): T {
  if (isGridConnectionMode(patch.gridConnection)) return { ...patch, ...gridConnectionFields(patch.gridConnection) } as T;
  if (patch.gridConnection !== undefined) {
    // Valor desconocido: no se guarda; el tipo efectivo sale del resto.
    const rest: T = { ...patch };
    delete rest.gridConnection;
    return normalizeGridConnectionPatch(current, rest);
  }
  if (typeof patch.isZeroExport !== 'boolean') {
    // Lo guardado es contradictorio o desconocido (p. ej. una versión anterior cambió solo `isZeroExport`): una
    // edición de tarifas lo deja coherente con lo que ya se lee (manda `isZeroExport`), así que el resultado no cambia.
    // Sin `gridConnection` guardado no se escribe nada. Hidratar, importar o restaurar no escriben (mirar no escribe).
    const stored = current?.gridConnection;
    if (stored === undefined) return patch;
    const effective = resolveGridConnection(current);
    return stored === effective ? patch : ({ ...patch, ...gridConnectionFields(effective) } as T);
  }
  const previous = resolveGridConnection(current);
  const mode: GridConnectionMode = !patch.isZeroExport ? 'grid_export' : previous === 'off_grid' ? 'off_grid' : 'zero_export';
  return { ...patch, ...gridConnectionFields(mode) } as T;
}

/** El sistema puede exportar excedentes a la red (solo medición neta). */
export const exportsToGrid = (mode: GridConnectionMode): boolean => mode === 'grid_export';

/** El sistema tiene acometida: la red cubre el déficit (no aplica a un sistema aislado). */
export const hasGridSupply = (mode: GridConnectionMode): boolean => mode !== 'off_grid';
