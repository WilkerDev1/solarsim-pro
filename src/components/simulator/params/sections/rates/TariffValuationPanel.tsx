import React from 'react';
import type { ProjectSimulation, UtilityRates } from '../../../../../types';
import type { EnergyCalculationMode } from '../../../../../../shared/applicationFeatures';
import { MAX_SETTLEMENT_DOP_PER_KWH, resolveAnnualCreditSettlementDOPPerKWh } from '../../../../../../shared/tariffBilling';
import { CommitNumberField, InfoTip, ParamRow } from '../../ui';
import {
  UNVERIFIED_ESTIMATE_LABEL,
  buildBillBreakdown,
  describeValuationMethod,
  formatDOP,
  unverifiedAssumptions,
} from './tariffPresentation';

export interface TariffValuationPanelProps {
  project: ProjectSimulation;
  calculationMode: EnergyCalculationMode;
  updateRates: (rates: Partial<UtilityRates>) => void;
}

/**
 * Cómo se valora la energía evitada (bloques o precio escalar), la factura mensual estimada sin y con sistema y los
 * supuestos tarifarios que ninguna factura confirmó. Solo presenta: las cifras salen de `tariffPresentation.ts` y de las
 * funciones puras de `shared/`.
 */
export const TariffValuationPanel: React.FC<TariffValuationPanelProps> = ({ project, calculationMode, updateRates }) => {
  const { rates } = project;
  const method = describeValuationMethod(rates);
  // El desglose recorre el motor completo: se recalcula solo cuando cambia algo que lo afecta.
  const breakdown = React.useMemo(() => buildBillBreakdown(project, calculationMode), [project, calculationMode]);
  const assumptions = unverifiedAssumptions(rates);
  const settlement = assumptions.find((item) => item.id === 'annual_settlement_price');
  const assumptionsTip = [
    `${UNVERIFIED_ESTIMATE_LABEL}:`,
    ...assumptions.map((item) => `• ${item.title}: ${item.valueText}. ${item.note}`),
  ].join('\n');
  const settlementValue = resolveAnnualCreditSettlementDOPPerKWh(rates);

  return (
    <div className="space-y-2" data-tariff-valuation={method.method}>
      <p role="note" className="m-0 flex items-center gap-1 text-xs text-pd-muted">
        <span className="font-semibold text-pd-strong">{method.label}</span>
        <InfoTip text={method.detail} />
      </p>

      {breakdown && (
        <table data-tariff-bill-breakdown className="w-full border-collapse text-xs text-pd-strong">
          <caption className="pb-1 text-left text-[11px] font-semibold text-pd-muted">Factura mensual estimada (promedio del año)</caption>
          <thead>
            <tr className="text-pd-muted">
              <th scope="col" className="py-0.5 text-left font-medium">Concepto</th>
              <th scope="col" className="py-0.5 text-right font-medium">Sin sistema</th>
              <th scope="col" className="py-0.5 text-right font-medium">Con sistema</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {breakdown.lines.map((line) => (
              <tr key={line.id}>
                <th scope="row" className="py-0.5 text-left font-sans font-normal">{line.label}</th>
                <td className="py-0.5 text-right">{formatDOP(line.beforeDOP)}</td>
                <td className="py-0.5 text-right">{formatDOP(line.afterDOP)}</td>
              </tr>
            ))}
            <tr className="border-t border-pd-field-ro-border font-semibold">
              <th scope="row" className="py-0.5 text-left font-sans font-semibold">Total</th>
              <td className="py-0.5 text-right">{formatDOP(breakdown.totalBeforeDOP)}</td>
              <td className="py-0.5 text-right">{formatDOP(breakdown.totalAfterDOP)}</td>
            </tr>
            {breakdown.settlementPerMonthDOP > 0 && (
              <tr>
                <th scope="row" className="py-0.5 text-left font-sans font-normal">Liquidación anual (por mes)</th>
                <td className="py-0.5 text-right">—</td>
                <td className="py-0.5 text-right">−{formatDOP(breakdown.settlementPerMonthDOP)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {settlement && (
        <ParamRow label="Liquidación anual" htmlFor="pd-rates-settlement">
          <CommitNumberField
            id="pd-rates-settlement"
            step="0.01"
            prefix="RD$"
            suffix="/kWh"
            min={0}
            max={MAX_SETTLEMENT_DOP_PER_KWH}
            value={settlementValue}
            onCommit={(price) => updateRates({ annualCreditSettlementDOPPerKWh: price })}
            right={<InfoTip text={settlement.note} />}
          />
        </ParamRow>
      )}

      {assumptions.length > 0 && (
        <p data-tariff-unverified className="m-0 flex items-center gap-1 text-[11px] text-pd-muted">
          <span>Supuestos estimados, no verificados con facturas</span>
          <InfoTip text={assumptionsTip} />
        </p>
      )}
    </div>
  );
};
