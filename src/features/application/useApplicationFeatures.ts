import { useSimulationStore } from '../../store/useSimulationStore';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from './featurePolicy';

export function useEnergyCalculationMode() {
  return useSimulationStore((state) => energyCalculationMode(effectiveFeatureSettings(state)));
}
export function useSelfConsumptionProjection() {
  return useEnergyCalculationMode() === 'self_consumption';
}
