/**
 * Presentación de la sección de tarifas del dock. Las reglas (distribuidora, tarifa, tarifa oficial, perfil de carga) viven
 * en el dominio desde F2b (`src/domain/rules/tariffRules.ts`) y se re-exportan aquí para los componentes.
 */
import type { LoadProfilePreset } from '../../logic/loadProfilePreview';
import { detectLoadProfilePreset } from '../../logic/loadProfilePreview';
import { resolveAssumption } from '../../../../../../shared/assumptions';
import { exportsToGrid, resolveGridConnection, type GridConnectionFields } from '../../../../../../shared/gridConnection';

export {
  averageMonthlyConsumption, currentDistributor, currentTariffCode, daytimeSliderChange, isMatchingReference, isReferenceApplied,
  loadProfileChange, planApplyReference, planDistributorChange, planTariffChange, referenceRate, referenceRatesPatch,
  type ChangeContext, type TariffChangePlan,
} from '../../../../../domain/rules/tariffRules';

/** Rango del consumo diurno: vive en el registro de campos (el mismo que valida la transacción). */
export { DAYTIME_MIN, DAYTIME_MAX } from '../../../../../domain/projectFields';

/** Valor del cargo de exportación que muestra el campo: 0 si el sistema no exporta (inyección cero o aislado). */
export const exportFeeValue = (rates: GridConnectionFields & { gridExportFeePct?: number }, effectiveFeePct?: number): number =>
  !exportsToGrid(resolveGridConnection(rates)) ? 0 : (effectiveFeePct ?? resolveAssumption('gridExportFeePct', rates.gridExportFeePct));

/** Perfil de carga activo: el preset explícito manda (incluido «Manual»); solo sin preset se infiere del porcentaje (35/75/90). */
export function activeLoadPreset(preset: string | undefined, daytimeRatio: number): LoadProfilePreset {
  if (preset === 'residential' || preset === 'commercial' || preset === 'industrial' || preset === 'custom') return preset;
  return detectLoadProfilePreset(daytimeRatio);
}
