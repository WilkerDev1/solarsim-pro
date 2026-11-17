import { useSimulationStore } from '../../store/useSimulationStore';
import { energyCalculationMode, netMeteringRegimeSelectorVisible } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from './featurePolicy';

export function useEnergyCalculationMode() {
  return useSimulationStore((state) => energyCalculationMode(effectiveFeatureSettings(state)));
}
export function useSelfConsumptionProjection() {
  return useEnergyCalculationMode() === 'self_consumption';
}
/** Selector temporal de régimen de medición neta: política de la organización (local sin sesión), visible por defecto. */
export function useNetMeteringRegimeSelector() {
  return useSimulationStore((state) => netMeteringRegimeSelectorVisible(effectiveFeatureSettings(state)));
}
