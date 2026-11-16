import React from 'react';
import { EditableText } from '../../editor/EditableText';
import type { ExecutiveSummaryModel } from './executiveSummaryModel';

interface SummaryEnergyRowProps {
  model: ExecutiveSummaryModel;
}

const kwh = (value: number) => value.toLocaleString('en-US');

/**
 * Fila 06 de un sistema aislado sin comparación de ahorro (o con el generador sin costo): en lugar del payback,
 * presenta la energía que entregará el sistema, la que queda sin servir y la autonomía de las baterías.
 */
export const SummaryEnergyRow: React.FC<SummaryEnergyRowProps> = ({ model }) => {
  const { savingsBasis, annualServedKWh, annualUnservedKWh, autonomyHours, hasBattery } = model;
  return (
    <article
      data-savings-basis={savingsBasis}
      className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5"
    >
      <div className="flex items-center gap-3.5 min-w-[220px]">
        <div className="w-10 h-10 bg-amber-500 text-white flex items-center justify-center font-mono font-black text-sm shrink-0">
          06
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
            <EditableText k="executiveSummary.row6.energyTitle" />
          </h3>
        </div>
      </div>

      <div className="flex-1 border-l border-slate-200 pl-4 grid grid-cols-3 gap-4">
        <div>
          <span className="text-[10.5px] text-slate-500 font-bold block"><EditableText k="executiveSummary.row6.served" /></span>
          <span className="text-lg font-black text-amber-600 font-mono block whitespace-nowrap">{kwh(annualServedKWh)} kWh/año</span>
        </div>
        <div>
          <span className="text-[10.5px] text-slate-500 font-bold block"><EditableText k="executiveSummary.row6.unserved" /></span>
          <span className="text-lg font-black text-slate-900 font-mono block whitespace-nowrap">{kwh(annualUnservedKWh)} kWh/año</span>
        </div>
        <div>
          <span className="text-[10.5px] text-slate-500 font-bold block"><EditableText k="executiveSummary.row6.autonomy" /></span>
          <span className="text-lg font-black text-slate-900 font-mono block whitespace-nowrap">
            {hasBattery ? `${autonomyHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} h` : 'Sin baterías'}
          </span>
        </div>
      </div>
    </article>
  );
};
