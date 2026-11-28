/**
 * Acciones de prueba manual del feedback del asistente (F5a), sin DOM: aplican un lote CON ORIGEN «asistente» por la
 * transacción real (`commitProjectEdits`), que es lo que destaca el dock, y devuelven la entrada de la tarjeta de cambio.
 * Las usa el gancho solo de desarrollo (`devHook.ts`); cómo verlo a mano: docs/QA.md.
 */
import { useSimulationStore } from '../../store/useSimulationStore';
import type { ProjectFieldEdit } from '../../domain/projectEditTransaction';
import { engineResults } from '../../domain/proposalSnapshot';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../application/featurePolicy';
import type { CommitProjectEditsResult } from '../../store/types';
import type { ChangeCardInput } from './changeCardModel';

export interface QaEditOutcome {
  result: CommitProjectEditsResult;
  /** La tarjeta de lo que pasó; `null` si el lote no cambió nada. */
  input: ChangeCardInput | null;
}

/** Aplica `edits` a la propuesta abierta como si los hubiera hecho el asistente: destaca el dock y deja un paso de deshacer. */
export function assistantEditForQa(edits: readonly ProjectFieldEdit[], title = 'Cambio de prueba (QA)'): QaEditOutcome {
  const state = useSimulationStore.getState();
  const project = state.getActiveProject();
  const mode = energyCalculationMode(effectiveFeatureSettings(state));
  const before = engineResults(project, mode);
  const result = state.commitProjectEdits(project.id, edits, { source: 'assistant', coalesceKey: `qa-${Date.now()}`, validation: 'strict' });
  if (!result.ok) {
    return { result, input: { status: 'error', title, changes: [], error: { code: 'rejected', message: result.errors.map((error) => error.message).join(' ') } } };
  }
  if (!result.changes.length) return { result, input: null };
  const after = engineResults(result.project, mode);
  return {
    result,
    input: { status: 'applied', title, proposalId: project.id, changes: result.changes, results: { before, after }, warnings: result.warnings, ...(result.undoRecorded ? { activityId: `qa-${project.id}` } : {}) },
  };
}
