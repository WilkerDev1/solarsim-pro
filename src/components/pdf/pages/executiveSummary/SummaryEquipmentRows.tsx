import React from 'react';
import { EditableText } from '../../editor/EditableText';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../../types';
import type { PDFColorTheme } from '../../../../constants/pdfThemes';
import { formatShortEquipmentLabel, type ExecutiveSummaryModel } from './executiveSummaryModel';

interface RowsProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  model: ExecutiveSummaryModel;
}

export const SummaryEquipmentRows: React.FC<RowsProps> = ({ project, summary, activeTheme, model }) => {
  const { panels, primaryPanel, totalPanels, systemCapacityKWp, performanceRatio, inverters, totalInverterPowerKW, isZeroExport, hasBattery, batteries, totalBatteryKWh } = model;
  return (
    <>
          {/* FILA 01: GENERADOR FOTOVOLTAICO */}
          <article
            className="bg-white border border-slate-200 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 border-l-4"
            style={{ borderLeftColor: activeTheme.primary }}
          >
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div
                className="w-10 h-10 flex items-center justify-center font-mono font-black text-sm shrink-0 border"
                style={{
                  backgroundColor: `${activeTheme.primary}15`,
                  borderColor: `${activeTheme.primary}35`,
                  color: activeTheme.primary,
                }}
              >
                01
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row1.title" />
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 flex-1 border-l border-slate-200 pl-4 items-stretch">
              <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                    <EditableText k="executiveSummary.row1.panelPower" />
                  </span>
                </div>
                <span className="text-sm font-black text-slate-900 font-mono block my-0.5">
                  {primaryPanel.powerW} Wp
                </span>
                {panels.length > 1 ? (
                  <div className="space-y-0.5">
                    {panels.map((p, idx) => (
                      <span
                        key={p.id || idx}
                        className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                        title={`${p.count} ${p.brandModel}`}
                      >
                        {formatShortEquipmentLabel(p.brandModel || `${p.powerW} Wp`, p.count, 19)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span
                    className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                    title={primaryPanel.brandModel}
                  >
                    {formatShortEquipmentLabel(primaryPanel.brandModel, undefined, 19) || 'Tier-1 Monocristalino'}
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                    <EditableText k="executiveSummary.row1.panelCount" />
                  </span>
                </div>
                <span className="text-sm font-black text-slate-900 font-mono block my-0.5">
                  {totalPanels} Unidades
                </span>
                <span className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap">
                  <EditableText k="executiveSummary.row1.panelCountNote" />
                </span>
              </div>

              <div
                className="p-2 border flex flex-col justify-between min-h-[68px] h-full"
                style={{
                  backgroundColor: `${activeTheme.primary}10`,
                  borderColor: `${activeTheme.primary}35`,
                }}
              >
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] font-bold block uppercase tracking-tight leading-tight" style={{ color: activeTheme.primary }}>
                    <EditableText k="executiveSummary.row1.capacity" />
                  </span>
                </div>
                <span className="text-sm font-black font-mono block my-0.5" style={{ color: activeTheme.primary }}>
                  {systemCapacityKWp.toFixed(3)}
                </span>
                <span className="text-[9.5px] font-extrabold block leading-normal pb-0.5 whitespace-nowrap" style={{ color: activeTheme.primary }}>
                  <EditableText k="executiveSummary.row1.capacityNote" />
                </span>
              </div>

              <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                    <EditableText k="executiveSummary.row1.performance" />
                  </span>
                </div>
                <span className="text-sm font-black text-slate-900 font-mono block my-0.5">
                  {performanceRatio}%
                </span>
                <span className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap">
                  <EditableText k="executiveSummary.row1.performanceNote" />
                </span>
              </div>
            </div>
          </article>

          {/* FILA 02: CONVERSIÓN Y POTENCIA AC */}
          <article
            className="bg-white border border-slate-200 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 border-l-4"
            style={{ borderLeftColor: activeTheme.secondary || activeTheme.primary }}
          >
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div
                className="w-10 h-10 flex items-center justify-center font-mono font-black text-sm shrink-0 border"
                style={{
                  backgroundColor: `${activeTheme.secondary || activeTheme.primary}15`,
                  borderColor: `${activeTheme.secondary || activeTheme.primary}35`,
                  color: activeTheme.secondary || activeTheme.primary,
                }}
              >
                02
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  <EditableText k="executiveSummary.row2.title" />
                </h3>
              </div>
            </div>

            <div className={`grid ${hasBattery ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5 flex-1 border-l border-slate-200 pl-4 items-stretch`}>
              <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                    <EditableText k="executiveSummary.row2.inverters" />
                  </span>
                </div>
                <span className="text-sm font-black text-slate-900 font-mono block my-0.5 whitespace-nowrap">
                  {totalInverterPowerKW > 0 ? `${totalInverterPowerKW} kW AC` : `${systemCapacityKWp.toFixed(1)} kW AC`}
                </span>
                {inverters.length > 1 ? (
                  <div className="space-y-0.5">
                    {inverters.map((inv, idx) => (
                      <span
                        key={inv.id || idx}
                        className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                        title={`${inv.count} ${inv.brandModel}`}
                      >
                        {formatShortEquipmentLabel(inv.brandModel || `${inv.powerKW} kW`, inv.count, 22)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span
                    className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                    title={inverters[0]?.brandModel}
                  >
                    {inverters[0]
                      ? formatShortEquipmentLabel(inverters[0].brandModel || `${inverters[0].powerKW} kW`, inverters[0].count, 22)
                      : 'Potencia nominal AC'}
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                <div className="min-h-[24px] flex items-start">
                  <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                    <EditableText k="executiveSummary.row2.injection" />
                  </span>
                </div>
                <span className="text-sm font-black text-slate-900 font-mono block my-0.5 whitespace-nowrap">
                  {isZeroExport ? 'Inyección Cero' : 'Bidireccional'}
                </span>
                <span className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap">
                  {project.rates.distributor || 'Distribuidora'} • Norma SIE
                </span>
              </div>

              {hasBattery && (
                <div className="bg-slate-50 p-2 border border-slate-200 flex flex-col justify-between min-h-[68px] h-full">
                  <div className="min-h-[24px] flex items-start">
                    <span className="text-[9.5px] text-slate-500 font-bold block uppercase tracking-tight leading-tight">
                      <EditableText k="executiveSummary.row2.storage" />
                    </span>
                  </div>
                  <span className="text-sm font-black text-emerald-700 font-mono block my-0.5 whitespace-nowrap">
                    {totalBatteryKWh} kWh LiFePO4
                  </span>
                  {batteries.length > 1 ? (
                    <div className="space-y-0.5">
                      {batteries.map((b, idx) => (
                        <span
                          key={b.id || idx}
                          className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                          title={`${b.count} ${b.brandModel}`}
                        >
                          {formatShortEquipmentLabel(b.brandModel || `${b.capacityKWh} kWh`, b.count, 22)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span
                      className="text-[9.5px] text-slate-500 font-medium block leading-normal pb-0.5 whitespace-nowrap"
                      title={batteries[0]?.brandModel}
                    >
                      {batteries[0]
                        ? formatShortEquipmentLabel(batteries[0].brandModel || `${batteries[0].capacityKWh} kWh`, batteries[0].count, 22)
                        : 'Baterías LiFePO4'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </article>
    </>
  );
};
