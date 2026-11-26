import { quotationsFeatureEnabled } from '../../../shared/applicationFeatures';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { AppView } from '../../store/types';
import { effectiveFeatureSettings } from './featurePolicy';

/** Vistas que pertenecen al módulo de cotizaciones. */
export const isQuotationsView = (view: AppView): boolean => view === 'quotations-hub' || view === 'quotation-editor';

/** Función `quotations` en la política efectiva (organización con sesión; preferencia local sin ella). */
export function useQuotationsFeature(): boolean {
  return useSimulationStore((state) => quotationsFeatureEnabled(effectiveFeatureSettings(state)));
}

/**
 * Con la función apagada, el catálogo y el editor de cotizaciones no se muestran: si la vista activa es una de ellas,
 * vuelve a Inicio. Solo cambia la vista; no toca cotizaciones, cambios pendientes ni la cotización abierta.
 */
export function enforceQuotationsFeature(): void {
  const state = useSimulationStore.getState();
  if (isQuotationsView(state.activeView) && !quotationsFeatureEnabled(effectiveFeatureSettings(state))) state.setActiveView('dashboard');
}
