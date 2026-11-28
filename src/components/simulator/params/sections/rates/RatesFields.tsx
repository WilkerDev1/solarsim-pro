import React from 'react';
import { getTariffDisplayName } from '../../../../../../shared/proposalPresentation';
import type { ProjectSimulation, SystemSpecs, UtilityRates } from '../../../../../types';
import { getDistributorTariffOptions, type UtilityDistributor } from '../../../../../types/tariffs';
import { Field, FieldMenu, InfoTip, ParamRow, SelectField } from '../../ui';
import { resolveAssumptions } from '../../../../../../shared/assumptions';
import { gridConnectionFields, isGridConnectionMode, resolveGridConnection, type GridConnectionMode } from '../../../../../../shared/gridConnection';
import {
  generatorCostNotice, NO_COMPARISON_NOTE, SUPPLY_ALTERNATIVE_LABELS, SUPPLY_ALTERNATIVES, isSupplyAlternative,
  resolveSavingsBasis, storedSupplyAlternative,
} from '../../../../../../shared/offGridSupply';
import { AlertTriangle } from 'lucide-react';
import { SelfConsumptionPanel } from './SelfConsumptionPanel';
import { NetMeteringFields } from './NetMeteringFields';
import { TariffValuationPanel } from './TariffValuationPanel';
import type { EnergyCalculationMode } from '../../../../../../shared/applicationFeatures';
import {
  averageMonthlyConsumption,
  currentDistributor,
  currentTariffCode,
  isReferenceApplied,
  planApplyReference,
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
  /** Distribuidora o tarifa con su perfil de carga en un solo lote (dock sobre la transacción); sin él, dos escrituras. */
  updateRatesAndSpecs?: (rates: Partial<UtilityRates>, specs?: Partial<SystemSpecs> | null) => void;
  /** Función de este equipo `netMeteringRegimeSelector` (visible por defecto). */
  showRegimeSelector?: boolean;
}

const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].map(value => ({ value, label: value }));
const CONNECTION_OPTIONS: { value: GridConnectionMode; label: string }[] = [
  { value: 'grid_export', label: 'Red (medición neta)' },
  { value: 'zero_export', label: 'Inyección cero' },
  { value: 'off_grid', label: 'Aislado (modo isla)' },
];

const SUPPLY_OPTIONS = SUPPLY_ALTERNATIVES.map(value => ({ value, label: SUPPLY_ALTERNATIVE_LABELS[value] }));

const parseNumber = (raw: string) => parseFloat(raw) || 0;
/** Costo del generador: vacío (o no numérico) se guarda como «sin dato»; no hay valor por defecto. */
const parseOptionalNumber = (raw: string): number | undefined => {
  const value = parseFloat(raw);
  return raw.trim() === '' || !Number.isFinite(value) ? undefined : value;
};

export const RatesFields: React.FC<RatesFieldsProps> = ({ project, tariffMatrix, projectionEnabled, updateRates, updateSpecs, updateRatesAndSpecs, showRegimeSelector = true }) => {
  // Un solo origen: `projectionEnabled` (modo `self_consumption`) decide también con qué modo se estima la factura.
  const calculationMode: EnergyCalculationMode = projectionEnabled ? 'self_consumption' : 'legacy';
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
  const matches = isReferenceApplied(rates, reference);
  const connection = resolveGridConnection(rates);
  const offGrid = connection === 'off_grid';
  const zeroExport = connection !== 'grid_export';
  // Alternativa de suministro (solo aislado): con qué se compara el ahorro.
  const supply = storedSupplyAlternative(rates);
  const savingsBasis = resolveSavingsBasis(rates);
  // Aviso del costo del generador: falta, no es > 0, fuera del tope técnico (error) o inusualmente alto (advertencia).
  const costNotice = offGrid && supply === 'generator' ? generatorCostNotice(rates.generatorCostPerKWh) : null;

  const apply = (plan: TariffChangePlan) => {
    // El perfil solo se escribe si hay con qué (canWriteSpecs ya lo decidió en el plan).
    if (updateRatesAndSpecs && updateSpecs) return updateRatesAndSpecs(plan.rates, plan.specs);
    updateRates(plan.rates);
    if (plan.specs) updateSpecs?.(plan.specs);
  };

  const tariffOptions = getDistributorTariffOptions(distributor).map(option => ({ value: option.value, label: option.label }));
  if (rates.tariffCode && !tariffOptions.some(option => option.value === rates.tariffCode)) {
    tariffOptions.push({ value: rates.tariffCode, label: rates.tariffCode });
  }

  const referenceText = reference.toFixed(3);
  const exportTip = offGrid
    ? 'Sistema aislado (modo isla): sin acometida de la distribuidora. No exporta ni importa: el excedente se recorta y el consumo que no cubren el sol ni las baterías queda como energía no servida (o lo cubre un respaldo externo, p. ej. una planta). No aplica retención ni cargo por uso de red.'
    : zeroExport
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
      <ParamRow label={offGrid && supply === 'utility_tariff' ? 'Costo evitado kWh' : 'Precio kWh'} htmlFor="pd-rates-kwh">
        <Field
          id="pd-rates-kwh"
          type="number"
          step="0.001"
          prefix="$"
          mono
          value={rates.energyCostPerKWh}
          onChange={value => updateRates({ energyCostPerKWh: parseNumber(value) })}
          right={
            <FieldMenu
              ariaLabel={matches ? 'Opciones de tarifa: tarifa oficial aplicada' : `Opciones de tarifa: el precio difiere de la oficial ($${referenceText}/kWh)`}
              attention={!matches}
              items={[{
                label: matches ? 'Tarifa oficial aplicada' : 'Aplicar tarifa oficial',
                hint: `$${referenceText}`,
                checked: matches,
                onSelect: () => updateRates(planApplyReference(context)),
              }]}
            />
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
      <ParamRow label="Conexión a la red" htmlFor="pd-rates-connection">
        <SelectField
          id="pd-rates-connection"
          value={connection}
          options={CONNECTION_OPTIONS}
          onChange={value => { if (isGridConnectionMode(value)) updateRates(gridConnectionFields(value)); }}
        />
      </ParamRow>
      {/* Sin red no hay campos de exportación (régimen, retención, cargo): la explicación va como nota. */}
      {offGrid && (
        <p role="note" data-grid-connection="off_grid" className="m-0 flex items-center gap-1 text-xs text-pd-muted">
          <span>Sistema aislado: sin exportación a la red</span>
          <InfoTip text={exportTip} />
        </p>
      )}
      {offGrid && (
        <ParamRow label="Alternativa de suministro" htmlFor="pd-rates-supply">
          <SelectField
            id="pd-rates-supply"
            value={supply}
            options={SUPPLY_OPTIONS}
            onChange={value => { if (isSupplyAlternative(value)) updateRates({ supplyAlternative: value }); }}
          />
        </ParamRow>
      )}
      {offGrid && supply === 'generator' && (
        <ParamRow label="Costo generador kWh" htmlFor="pd-rates-generator">
          <Field
            id="pd-rates-generator"
            type="number"
            step="0.001"
            min="0"
            prefix="$"
            mono
            placeholder="Indicar"
            value={rates.generatorCostPerKWh ?? ''}
            aria-invalid={costNotice?.tone === 'error' || undefined}
            aria-describedby={costNotice ? 'pd-rates-generator-notice' : undefined}
            onChange={value => updateRates({ generatorCostPerKWh: parseOptionalNumber(value) })}
            right={<InfoTip text="Costo por kWh de la planta eléctrica que usa hoy el cliente (combustible, mantenimiento…), en la misma moneda que el precio del kWh. El ahorro valora la energía servida a este costo." />}
          />
        </ParamRow>
      )}
      {costNotice && (
        <div
          id="pd-rates-generator-notice"
          role={costNotice.tone === 'error' ? 'alert' : 'status'}
          data-notice-tone={costNotice.tone}
          className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${costNotice.tone === 'error' ? 'border-pd-negative text-pd-negative' : 'border-pd-warn-text bg-pd-warn-bg text-pd-warn-text'}`}
        >
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          <span className="min-w-0 flex-1">{costNotice.text}</span>
        </div>
      )}
      {offGrid && savingsBasis === 'no_comparison' && (
        <p role="note" className="m-0 flex items-center gap-1 text-xs text-pd-muted">
          <span>Sin comparación de ahorro</span>
          <InfoTip text={NO_COMPARISON_NOTE} />
        </p>
      )}
      {/* Sistema aislado: sin inyección no hay régimen, retención ni cargo por uso de la red; no se muestran. */}
      {!offGrid && (
        <NetMeteringFields rates={rates} assumptions={assumptions} showRegimeSelector={showRegimeSelector} exportTip={exportTip} officialReferencePatch={planApplyReference(context)} updateRates={updateRates} />
      )}
      {!offGrid && <TariffValuationPanel project={project} calculationMode={calculationMode} updateRates={updateRates} />}
      {projectionEnabled && (
        <SelfConsumptionPanel project={project} tariffCode={tariffCode} avgMonthlyConsumption={avgMonthlyConsumption} updateSpecs={updateSpecs} />
      )}
    </div>
  );
};
