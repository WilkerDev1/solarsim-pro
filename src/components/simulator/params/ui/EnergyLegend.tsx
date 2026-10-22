import React from 'react';

export type EnergyKind = 'solar' | 'bess' | 'grid';

export interface EnergySegment {
  kind: EnergyKind;
  label: string;
  percent: number;
}

export interface EnergyLegendProps {
  segments: EnergySegment[];
  /** Texto de la derecha, p. ej. «29.6 kWh/d». */
  total?: string;
}

const swatch: Record<EnergyKind, string> = { solar: 'bg-pd-solar', bess: 'bg-pd-bess', grid: 'bg-pd-grid' };

/** Los únicos colores de energía del dock: solar, batería y red. */
export const EnergyLegend: React.FC<EnergyLegendProps> = ({ segments, total }) => (
  <div className="flex items-center justify-between gap-2 rounded-md bg-pd-item px-2.5 py-2 text-xs text-pd-strong">
    <span className="flex flex-wrap gap-x-2.5 gap-y-1">
      {segments.map(segment => (
        <span key={segment.kind} className="flex items-center gap-[5px]">
          <span aria-hidden="true" className={`h-2 w-2 rounded-sm ${swatch[segment.kind]}`} />
          {segment.label} <b className="font-mono font-semibold">{segment.percent}%</b>
        </span>
      ))}
    </span>
    {total && <span className="whitespace-nowrap font-mono text-pd-muted">{total}</span>}
  </div>
);
