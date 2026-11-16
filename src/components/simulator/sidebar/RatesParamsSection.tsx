import React from 'react';
import { useNetMeteringRegimeSelector, useSelfConsumptionProjection } from '../../../features/application/useApplicationFeatures';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { ProjectSimulation, SystemSpecs, UtilityRates } from '../../../types';
import { RatesFields } from '../params/sections/rates/RatesFields';

interface RatesParamsSectionProps {
  project: ProjectSimulation;
  /** El dock ya no pinta según el tema: los tokens pd-* cambian solos. Se acepta para no romper al contenedor. */
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateSpecs?: (specs: Partial<SystemSpecs>) => void;
}

/** Cuerpo de «Tarifas y distribuidora»: conecta el store con `RatesFields`. */
export const RatesParamsSection: React.FC<RatesParamsSectionProps> = ({ project, updateRates, updateSpecs }) => {
  const projectionEnabled = useSelfConsumptionProjection();
  const tariffMatrix = useSimulationStore(state => state.tariffMatrix);
  // Política de la organización (o local sin sesión): visible por defecto.
  const showRegimeSelector = useNetMeteringRegimeSelector();
  return (
    <RatesFields
      project={project}
      tariffMatrix={tariffMatrix}
      projectionEnabled={projectionEnabled}
      updateRates={updateRates}
      updateSpecs={updateSpecs}
      showRegimeSelector={showRegimeSelector}
    />
  );
};
