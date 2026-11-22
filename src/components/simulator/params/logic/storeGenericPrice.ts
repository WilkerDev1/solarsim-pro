import { useSimulationStore } from '../../../../store/useSimulationStore';
import { effectiveGenericPrice, priceFeatureActive } from '../../../../store/slices/equipmentPriceSlice';
import type { GenericPriceInfo } from '../../../../../shared/equipmentPrices';

/**
 * Precio genérico efectivo de un equipo en el momento de elegirlo (ADR 0006 §5). Se llama desde una acción del usuario,
 * nunca al dibujar; sin sesión (modo local) la función está apagada y devuelve `null`.
 */
export function storeGenericPriceFor(equipmentId: string): GenericPriceInfo | null {
  const state = useSimulationStore.getState();
  return priceFeatureActive(state) ? effectiveGenericPrice(state, equipmentId) : null;
}
