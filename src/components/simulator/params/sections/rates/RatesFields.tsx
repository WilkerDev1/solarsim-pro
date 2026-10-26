import React from 'react';
import { getTariffDisplayName } from '../../../../../../shared/proposalPresentation';
import type { ProjectSimulation, SystemSpecs, UtilityRates } from '../../../../../types';
import { getDistributorTariffOptions, type UtilityDistributor } from '../../../../../types/tariffs';
import { Field, FieldAction, InfoTip, ParamRow, SelectField, ToggleGroup, WarnChip } from '../../ui';
import { resolveAssumptions } from '../../../../../../shared/assumptions';
import { SelfConsumptionPanel } from './SelfConsumptionPanel';
import {
  averageMonthlyConsumption,
  currentDistributor,
  currentTariffCode,
  exportFeeValue,
  isMatchingReference,
  planDistributorChange,
  planTariffChange,
  referenceRate,
  type ChangeContext,
  type TariffChangePlan,
} from './ratesLogic';

export interface RatesFieldsProps {
  project: ProjectSimulation;
  /** Matriz de tarifas del store; sin ella se usa la oficial por defecto. */
  tariffMatrix?: Parameters<typeof referenceRate>[0]['matrix'];
  /** Resultado de `useSelfConsumptionProjection()`. */
  projectionEnabled: boolean;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateSpecs?: (specs: Partial<SystemSpecs>) => void;
}

const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].map(value => ({ value, label: value }));
const YES_NO = [
  { value: true, label: 'Sí' },
  { value: false, label: 'No' },
];

const parseNumber = (raw: string) => parseFloat(raw) || 0;

export const RatesFields: React.FC<RatesFieldsProps> = ({ project, tariffMatrix, projectionEnabled, updateRates, updateSpecs }) => {
  const { rates } = project;
  // El valor que se muestra es el que usa el cálculo: supuestos efectivos del proyecto completo (ADR 0003).
  const assumptions = resolveAssumptions(project);
  const avgMonthlyConsumption = averageMonthlyConsumption(project);
  const distributor = currentDistributor(rates);
  const tariffCode = currentTariffCode(rates);
  const context: ChangeContext = {
    matrix: tariffMatrix,
    avgMonthlyConsumption,
    dopExchangeRate: assumptions.dopExchangeRate,
    rates,
    loadProfilePreset: project.specs?.loadProfilePreset,
    canWriteSpecs: !!updateSpecs,
  };
  const reference = referenceRate(context, distributor, tariffCode);
  const matches = isMatchingReference(rates.energyCostPerKWh, reference);
  const zeroExport = !!rates.isZeroExport;

  const apply = (plan: TariffChangePlan) => {
    updateRates(plan.rates);
    if (plan.specs) updateSpecs?.(plan.specs);
  };

  const tariffOptions = getDistributorTariffOptions(distributor).map(option => ({ value: option.value, label: option.label }));
  if (rates.tariffCode && !tariffOptions.some(option => option.value === rates.tariffCode)) {
    tariffOptions.push({ value: rates.tariffCode, label: rates.tariffCode });
  }

  const referenceText = reference.toFixed(3);
  const exportTip = zeroExport
    ? 'Inyección cero activa: el sistema no vuelca excedentes a la red pública, por lo que no aplica retención ni cargo por uso de red.'
    : `Medición neta (${getTariffDisplayName(distributor, rates.tariffCode || '')}): retención del ${assumptions.gridExportFeePct}% por derecho de uso de red bajo la Res. SIE-007-2026-REG sobre los kWh excedentes exportados a la red de ${distributor}.`;

  return (
    <div className="space-y-2.5">
      <ParamRow label="Distribuidora" htmlFor="pd-rates-distributor">
        <SelectField
          id="pd-rates-distributor"
          value={distributor}
          options={DISTRIBUTORS}
          onChange={value => apply(planDistributorChange(context, value as UtilityDistributor))}
        />
      </ParamRow>
      <ParamRow label="Tarifa" htmlFor="pd-rates-tariff">
        <SelectField
          id="pd-rates-tariff"
          value={tariffCode}
          options={tariffOptions}
          onChange={value => apply(planTariffChange(context, value))}
        />
      </ParamRow>
      <ParamRow label="Precio kWh" htmlFor="pd-rates-kwh">
        <Field
          id="pd-rates-kwh"
          type="number"
          step="0.001"
          prefix="$"
          mono
          value={rates.energyCostPerKWh}
          onChange={value => updateRates({ energyCostPerKWh: parseNumber(value) })}
          right={
            matches ? (
              <FieldAction title="Tarifa oficial aplicada" onClick={() => updateRates({ energyCostPerKWh: reference })}>Oficial</FieldAction>
            ) : (
              <WarnChip title={`Aplicar la tarifa oficial de referencia ($${referenceText}/kWh) según la resolución vigente`} aria-label={`Aplicar la tarifa oficial de referencia, $${referenceText} por kWh`} onClick={() => updateRates({ energyCostPerKWh: reference })}>
                {referenceText}
              </WarnChip>
            )
          }
        />
      </ParamRow>
      <ParamRow label="Cobertura objetivo" htmlFor="pd-rates-coverage">
        <Field
          id="pd-rates-coverage"
          type="number"
          step="1"
          mono
          suffix="%"
          value={assumptions.targetCoveragePct}
          onChange={value => updateRates({ targetCoveragePct: parseNumber(value) })}
        />
      </ParamRow>
      <ParamRow label="Inyección cero" labelId="pd-rates-zero-label">
        <ToggleGroup ariaLabel="Inyección cero" options={YES_NO} value={zeroExport} onChange={value => updateRates({ isZeroExport: value })} />
      </ParamRow>
      <ParamRow label="Cargo exportación" htmlFor="pd-rates-export">
        <Field
          id="pd-rates-export"
          type="number"
          step="1"
          mono
          suffix="%"
          disabled={zeroExport}
          value={exportFeeValue(rates, assumptions.gridExportFeePct)}
          onChange={value => updateRates({ gridExportFeePct: parseNumber(value) })}
          right={<InfoTip text={exportTip} />}
        />
      </ParamRow>
      {projectionEnabled && (
        <SelfConsumptionPanel project={project} tariffCode={tariffCode} avgMonthlyConsumption={avgMonthlyConsumption} updateSpecs={updateSpecs} />
      )}
    </div>
  );
};
