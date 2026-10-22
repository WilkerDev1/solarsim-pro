import React from 'react';
import type { ProjectSimulation, SystemSpecs } from '../../../../../types';
import { computeLoadProfilePreview } from '../../logic/loadProfilePreview';
import { EnergyLegend, InfoTip, ParamRow, SelectField, StatStrip, SubHeader, ToggleGroup } from '../../ui';
import type { EnergySegment } from '../../ui';
import { activeLoadPreset, DAYTIME_MAX, DAYTIME_MIN, daytimeSliderChange, loadProfileChange } from './ratesLogic';

export interface SelfConsumptionPanelProps {
  project: ProjectSimulation;
  tariffCode: string;
  avgMonthlyConsumption: number;
  updateSpecs?: (specs: Partial<SystemSpecs>) => void;
}

const PROFILE_OPTIONS = [
  { value: 'residential', label: 'Residencial 35%' },
  { value: 'commercial', label: 'Comercial 75%' },
  { value: 'industrial', label: 'Industrial 90%' },
  { value: 'custom', label: 'Manual' },
];

const SHOW_OPTIONS = [
  { value: true, label: 'Mostrar' },
  { value: false, label: 'Ocultar' },
];

const kwh = (value: number) => `${value.toFixed(1)} kWh/d`;

/** Proyección de autoconsumo: perfil de carga, consumo diurno y leyenda de energía. Solo se monta con `useSelfConsumptionProjection()`. */
export const SelfConsumptionPanel: React.FC<SelfConsumptionPanelProps> = ({ project, tariffCode, avgMonthlyConsumption, updateSpecs }) => {
  const preview = computeLoadProfilePreview(project, tariffCode, avgMonthlyConsumption);
  const { hasBattery, currentDaytimeRatio, currentPreset, avgDailyCons, avgDailyProd, solarDirectPct, bessDischargePct, gridImportPct, totalSelfPct, totalSelfDaily } = preview;
  const showBreakdown = project.specs.showSelfConsumptionBreakdown !== false;
  const write = (patch: Partial<SystemSpecs>) => updateSpecs?.(patch);

  const segments: EnergySegment[] = [
    { kind: 'solar', label: 'Solar', percent: Math.round(solarDirectPct) },
    ...(hasBattery ? [{ kind: 'bess' as const, label: 'Batería', percent: Math.round(bessDischargePct) }] : []),
    { kind: 'grid', label: 'Red', percent: Math.round(gridImportPct) },
  ];
  const generationTip =
    `Consumo diurno (8am–5pm) frente a nocturno (5pm–8am). Producción FV ~${avgDailyProd.toFixed(1)} kWh/d: ` +
    `${preview.genDirectPct}% directo${hasBattery ? `, ${preview.genBessPct}% batería` : ''}, ${preview.genExportPct}% inyección a la red.`;

  return (
    <>
      <SubHeader title="Autoconsumo" action={<InfoTip text={generationTip} />} />
      <ParamRow label="Perfil de carga" htmlFor="pd-rates-profile">
        <SelectField
          id="pd-rates-profile"
          value={activeLoadPreset(currentPreset, currentDaytimeRatio)}
          options={PROFILE_OPTIONS}
          onChange={value => write(loadProfileChange(value as 'residential' | 'commercial' | 'industrial' | 'custom'))}
        />
      </ParamRow>
      <ParamRow label="Consumo diurno" htmlFor="pd-rates-daytime">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <input
            id="pd-rates-daytime"
            type="range"
            min={DAYTIME_MIN}
            max={DAYTIME_MAX}
            step={1}
            value={currentDaytimeRatio}
            onChange={event => write(daytimeSliderChange(parseFloat(event.target.value) || 35))}
            className="h-1.5 w-full min-w-0 cursor-pointer accent-pd-accent"
          />
          <output htmlFor="pd-rates-daytime" className="font-mono text-[13px] font-medium text-pd-text">{currentDaytimeRatio}%</output>
        </div>
      </ParamRow>
      <ParamRow label="Autoconsumo en gráficos" labelId="pd-rates-show-label">
        <ToggleGroup
          ariaLabel="Autoconsumo en gráficos"
          options={SHOW_OPTIONS}
          value={showBreakdown}
          onChange={value => write({ showSelfConsumptionBreakdown: value })}
        />
      </ParamRow>
      <EnergyLegend segments={segments} total={kwh(avgDailyCons)} />
      <StatStrip
        items={[
          { label: 'Autoconsumo total', value: `${totalSelfPct.toFixed(1)}% · ${kwh(totalSelfDaily)}` },
          { label: 'Generación diaria', value: `~${kwh(avgDailyProd)}` },
        ]}
      />
    </>
  );
};
