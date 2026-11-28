/**
 * Escritores del dock de parámetros sobre la transacción de edición (F2a2; ADR 0004). Puro: recibe la función que
 * confirma un lote (`commitProjectEdits` del store, ya atada a la propuesta) y devuelve los mismos escritores que el dock
 * usaba (`updateSpecs`, `updateRates`…), así los componentes no cambian. Cada llamada es UN lote: una escritura, un
 * `triggerAutoSync` y un paso del diario de deshacer, agrupado por ráfaga como antes (`DEFAULT_EDIT_COALESCE_KEY`).
 *
 * Las reglas que el dock arma antes de escribir (perfil de carga al cambiar de tarifa, margen en % ↔ factor, $/W ↔ $/kWp,
 * tarifa oficial, «Mejor proveedor», borrar la radiación propia al cambiar de provincia) siguen en sus constructores de
 * parche: mudarlas al dominio es F2b.
 */
import type { ClientInfo, FinancialParams, SystemSpecs, UtilityRates } from '../../../../types';
import { editsFromPatch, type ProjectFieldEdit } from '../../../../domain/projectEditTransaction';
import { DEFAULT_EDIT_COALESCE_KEY } from '../../../../store/undo/projectUndoJournal';
import type { CommitProjectEditsOptions } from '../../../../store/types';

export type DockCommit = (edits: ProjectFieldEdit[]) => { ok: boolean; errors?: readonly { path: string; message: string }[] } | void;

export interface DockWriters {
  updateClient: (patch: Partial<ClientInfo>) => void;
  updateSpecs: (patch: Partial<SystemSpecs>) => void;
  updateRates: (patch: Partial<UtilityRates>) => void;
  updateFinancials: (patch: Partial<FinancialParams>) => void;
  /** Tarifas y specs de una misma acción (distribuidora o tarifa con su perfil de carga) en un solo lote. */
  updateRatesAndSpecs: (rates: Partial<UtilityRates>, specs?: Partial<SystemSpecs> | null) => void;
}

/**
 * Opciones con que el dock confirma: fuente `dock`, agrupado por ráfaga, validación de tipos (el dock confirma por tecla:
 * un 0 mientras se borra un campo se guarda y se resuelve al leer, como siempre) y sin correr el motor dos veces.
 */
export const DOCK_COMMIT_OPTIONS: CommitProjectEditsOptions = { source: 'dock', coalesceKey: DEFAULT_EDIT_COALESCE_KEY, validation: 'dock', metrics: false };

export function createDockWriters(commit: DockCommit): DockWriters {
  const send = (edits: ProjectFieldEdit[]) => {
    if (!edits.length) return;
    const result = commit(edits);
    // Con la validación del dock solo se rechaza una ruta sin registrar o un tipo equivocado: es un fallo de programación
    // (un constructor de parche nuevo sin entrada en el registro), no del usuario. Se deja constancia en la consola.
    if (result && !result.ok) console.warn('[dock] La transacción rechazó la edición:', result.errors);
  };
  return {
    updateClient: (patch) => send(editsFromPatch('client', patch)),
    updateSpecs: (patch) => send(editsFromPatch('specs', patch)),
    updateRates: (patch) => send(editsFromPatch('rates', patch)),
    updateFinancials: (patch) => send(editsFromPatch('financials', patch)),
    updateRatesAndSpecs: (rates, specs) => send([...editsFromPatch('rates', rates), ...editsFromPatch('specs', specs)]),
  };
}
